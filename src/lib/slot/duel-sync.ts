/**
 * Room sync of an online VERSUS seat (lobby + running duel): the join/create boot and the 400 ms room poll.
 *
 * Framework-free so it can be tested without a DOM. DuelLink (components/slot/DuelSheet) starts it once per
 * room + role and keeps one RoomSyncState for the whole life of the seat.
 *
 * Hotfix (Oct 4 2026): the poll used to restart whenever any link field changed. beginOnline rewrites the link
 * at the duel start (seat + players), so the guest's poll restarted, its boot re-ran the join, the join threw
 * "už beží" (the room was already playing) and the poll never became ready again: the guest kept sending its
 * own spins but never saw the host's progress or the end of the duel. Now:
 * - the sync restarts only on a room / role change (everything else is read through getLink / getBet);
 * - a boot after the duel started skips the join / create and goes straight to polling;
 * - peerTicksFromSnap lets the heartbeat PATCH response (the same row) refresh the peers too.
 */
import { roomFull, type DuelSnap, type SeatVote } from "./duel-api.ts";
import { peerFrozen, type DuelLink, type DuelMode } from "./duel.ts";

/** No heartbeat from the peer for this long while it still owes spins: the peer is out. */
export const PEER_SILENT_MS = 90_000;
/** Room polls failing this long mid-duel: the network/room is at fault (a later timeout refunds the kaucia). */
export const ROOM_NET_FAIL_MS = 30_000;
/** Consecutive "room not found" polls mid-duel before the duel is aborted as a room failure. */
export const ROOM_GONE_POLLS = 3;
export const ROOM_POLL_MS = 400;

export interface RoomSyncApi {
  create: (input: {
    code: string;
    name: string;
    mode: DuelMode;
    bet: number;
    need?: number;
    ante?: boolean;
    players?: number;
  }) => Promise<DuelSnap>;
  joinSeat: (code: string, name: string) => Promise<{ snap: DuelSnap; seat: number }>;
  poll: (code: string) => Promise<DuelSnap>;
  start: (code: string) => Promise<DuelSnap>;
  forfeitIf: (
    code: string,
    out: number,
    need: number,
    by: "self" | "peer",
    final: { have: number; score: number } | undefined,
    players: number,
  ) => Promise<boolean>;
  leave: (code: string, role: "host" | number, players?: number) => Promise<void>;
}

export interface GoInfo {
  names: string[];
  you: number;
  bet: number;
  mode: DuelMode;
  need: number;
  ante: boolean;
  /** Room match number. Odveta calls onRematch with the next one instead of onGo. */
  round?: number;
}

export interface RoomSyncHooks {
  getLink: () => DuelLink;
  getBet: () => number;
  onGo: (info: GoInfo) => void;
  onTick: (have: number, score: number, seat?: number) => void;
  onForfeit: (who: number) => void;
  onPeerNet: (net: boolean, seat?: number) => void;
  onPeerName: (name: string) => void;
  onRoomFail?: (kind: "gone" | "net" | "both") => void;
  /** The room started another match on the same code (odveta). */
  onRematch?: (info: GoInfo) => void;
  /** Votes on the finished match. Called on each poll until the next match or the room closes. */
  onVotes?: (votes: SeatVote[]) => void;
  setErr: (msg: string) => void;
  setStatus: (msg: string) => void;
  setNames: (names: string[]) => void;
}

/** Everything that must survive a restart of the sync (it lives as long as the seat). */
export interface RoomSyncState {
  started: boolean;
  /** Room-level give-up (2 seats: forfeit / both away; any size: room failure). */
  gaveUp: boolean;
  /** 3-4 seats: seats this client already handled as out (or is declaring out right now). */
  outSeen: Set<number>;
  /** Per seat: when its progress last moved, and the have seen then. */
  peerAt: number[];
  peerHave: number[];
  playSince: number;
  goneRun: number;
  lastOk: number;
  netFlagged: boolean;
  /** My seat (host 0; a guest learns it from the join). */
  seat: number;
  players: number;
  /** Boots that ran the join / create (for tests and diagnostics). */
  joins: number;
  /** Match number this seat is playing. 0 until the first start. */
  round: number;
}

export function newRoomSyncState(link: Pick<DuelLink, "role" | "seat" | "players">): RoomSyncState {
  return {
    started: false,
    gaveUp: false,
    outSeen: new Set(),
    peerAt: [],
    peerHave: [],
    playSince: 0,
    goneRun: 0,
    lastOk: 0,
    netFlagged: false,
    seat: link.seat ?? (link.role === "host" ? 0 : 1),
    players: link.players ?? 2,
    joins: 0,
    round: 0,
  };
}

/** The only link fields that restart the sync (React effect deps). */
export function roomSyncKey(link: Pick<DuelLink, "room" | "role">): string {
  return `${link.room}|${link.role}`;
}

/**
 * Peer progress in a room row, for the seat `me`: one entry per peer (3-4 seats: seats already out are skipped,
 * their forfeit goes through the poll). 2 seats: `seat` is omitted (= the other seat), as onTick expects.
 */
export function peerTicksFromSnap(snap: DuelSnap, me: number): { have: number; score: number; seat?: number }[] {
  const many = snap.players > 2;
  const out: { have: number; score: number; seat?: number }[] = [];
  snap.seats.forEach((x, i) => {
    if (i === me || (many && x.out)) return;
    out.push({ have: x.have, score: x.score, seat: many ? i : undefined });
  });
  return out;
}

export interface RoomSyncOptions {
  api: RoomSyncApi;
  state: RoomSyncState;
  hooks: RoomSyncHooks;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (id: unknown) => void;
  pollMs?: number;
}

/** Boot (join / create unless the duel already started) and the room poll. Returns stop(). */
export function startRoomSync(opts: RoomSyncOptions): () => void {
  const { api, state: st, hooks: h } = opts;
  const now = opts.now ?? (() => Date.now());
  const every = opts.setInterval ?? ((fn: () => void, ms: number) => globalThis.setInterval(fn, ms));
  const clear = opts.clearInterval ?? ((id: unknown) => globalThis.clearInterval(id as ReturnType<typeof setInterval>));
  const room = h.getLink().room;
  const role = h.getLink().role;
  let stop = false;
  let ready = false;

  const go = (snap: DuelSnap) => {
    st.started = true;
    st.round = snap.round || 1;
    h.onGo({
      names: snap.seats.map((x, i) => x.name || (i === 0 ? "HOSŤ" : `HRÁČ ${i + 1}`)),
      you: st.seat,
      bet: snap.bet,
      mode: snap.mode,
      need: snap.need,
      ante: snap.ante,
      round: st.round,
    });
  };

  const boot = async () => {
    // The duel already runs (the sync restarted mid-duel): the seat is ours, a re-join would fail with
    // "už beží" and a re-create would wipe the room. Just keep polling.
    if (st.started) {
      ready = true;
      return;
    }
    const link = h.getLink();
    try {
      st.joins += 1;
      if (role === "host") {
        const snap = await api.create({
          code: room,
          name: link.name,
          mode: link.mode,
          bet: link.bet || h.getBet(),
          need: link.need || 10,
          ante: link.ante,
          players: link.players ?? 2,
        });
        if (stop) return;
        st.players = snap.players;
        ready = true;
        h.setErr("");
        h.setStatus(snap.players > 2 ? `Kód je živý. Pošli ho ${snap.players - 1} kamošom.` : "Kód je živý. Pošli ho kamošovi.");
      } else {
        const { snap, seat } = await api.joinSeat(room, link.name);
        if (stop) return;
        st.seat = seat;
        st.players = snap.players;
        ready = true;
        h.onPeerName(snap.hostName);
        h.setNames(snap.seats.map((x, i) => (i === seat ? link.name : x.name)));
        h.setErr("");
        h.setStatus(snap.players > 2 && !roomFull(snap) ? "Si v miestnosti. Čaká sa, kým sa zaplní." : "Si v miestnosti. Čakám na ŠTART.");
      }
    } catch (e) {
      if (!stop) h.setErr(e instanceof Error ? e.message : "Spojenie zlyhalo");
    }
  };

  const pollOnce = async () => {
    const link = h.getLink();
    try {
      const snap = await api.poll(room);
      if (stop) return;
      // This client itself was away (JS paused in the background) for longer than the silent limit.
      const awayMe = st.lastOk > 0 && now() - st.lastOk > PEER_SILENT_MS;
      st.lastOk = now();
      st.goneRun = 0;
      h.setErr("");
      const me = st.seat;
      const many = snap.players > 2;
      st.players = snap.players;
      if (!st.started) {
        h.setNames(snap.seats.map((x, i) => (i === me ? link.name : x.name)));
        if (role === "host") {
          const firstPeer = snap.seats.find((x, i) => i !== 0 && x.name)?.name;
          if (firstPeer) h.onPeerName(firstPeer);
        }
        if (role !== "host" && many) {
          h.setStatus(roomFull(snap) ? "Miestnosť je plná. Štartuje sa…" : `Čaká sa na hráčov · ${snap.seats.filter((x) => x.name).length}/${snap.players}`);
        }
      }
      // The room starts by itself once every seat has a player.
      if (role === "host" && roomFull(snap) && snap.phase === "wait" && !st.started) {
        void api
          .start(room)
          .then((started2) => {
            if (stop || st.started) return;
            go(started2);
          })
          .catch(() => {});
      }
      // Odveta: same room, next match number, scores already zero. Do not feed those zeros into the
      // finished match; the game starts a new one.
      const round = snap.round || 1;
      if (st.started && st.round > 0 && round > st.round && snap.phase === "play") {
        st.round = round;
        st.gaveUp = false;
        st.outSeen.clear();
        st.playSince = now();
        st.peerAt = [];
        st.peerHave = [];
        st.goneRun = 0;
        h.onRematch?.({
          names: snap.seats.map((x, i) => x.name || (i === 0 ? "HOSŤ" : `HRÁČ ${i + 1}`)),
          you: st.seat,
          bet: snap.bet,
          mode: snap.mode,
          need: snap.need,
          ante: snap.ante,
          round,
        });
        return;
      }
      if (st.started && snap.phase === "done") h.onVotes?.(snap.votes);
      if (!many && snap.forfeit != null && !st.gaveUp) {
        st.gaveUp = true;
        const other = me === 0 ? 1 : 0;
        h.onTick(snap.seats[other]!.have, snap.seats[other]!.score);
        h.onForfeit(snap.forfeit);
        return;
      }
      if (snap.phase === "play" || snap.phase === "done") {
        if (!st.started) go(snap);
        if (snap.phase === "play" && st.playSince === 0) st.playSince = now();
        const need = snap.need;
        const mine = snap.seats[me]?.have ?? 0;
        const peers = snap.seats.map((_, i) => i).filter((i) => i !== me);
        // 3-4 seats: seats the row marks out (VZDAŤ, idle, declared out by another client).
        if (many) {
          for (const i of snap.seats.map((_, k) => k)) {
            const x = snap.seats[i]!;
            if (!x.out || st.outSeen.has(i)) continue;
            st.outSeen.add(i);
            if (i !== me) h.onTick(x.have, x.score, i);
            h.onForfeit(i);
          }
          if (snap.seats[me]?.out) return;
        }
        let busyPeer = false;
        const silentPeers: number[] = [];
        const frozenPeers: number[] = [];
        for (const i of peers) {
          const x = snap.seats[i]!;
          if (many && x.out) continue;
          busyPeer ||= x.net;
          if (many) h.onPeerNet(x.net, i);
          // The no-progress clock restarts on every peer spin and stays at zero while the peer is busy
          // (spin, 4KA TV, a banner still open): modal time never counts toward the 90 s.
          if (x.have !== st.peerHave[i] || x.net) {
            st.peerHave[i] = x.have;
            st.peerAt[i] = now();
          }
          const lastBeat = x.seen > st.playSince ? x.seen : st.playSince;
          const seenAge = st.playSince ? now() - lastBeat : 0;
          // 90 s (was 45 s): a phone that locks or switches apps for a moment pauses JS and the heartbeat.
          if (snap.phase === "play" && x.have < need && seenAge > PEER_SILENT_MS) silentPeers.push(i);
          else if (
            snap.phase === "play" &&
            peerFrozen({ now: now(), idleSince: st.peerAt[i] ?? 0, peerBusy: x.net, mine, theirs: x.have, need })
          )
            frozenPeers.push(i);
          h.onTick(x.have, x.score, many ? i : undefined);
        }
        if (!many) h.onPeerNet(busyPeer);
        const owing = peers.filter((i) => !(many && snap.seats[i]!.out) && snap.seats[i]!.have < need);
        if (awayMe && owing.length && silentPeers.length === owing.length && !st.gaveUp) {
          // Every seat dropped: nobody claims the bank. The host removes the room so the other clients
          // abort too ("room gone"); each seat keeps its own stack and gets its kaucia back.
          st.gaveUp = true;
          if (role === "host") void api.leave(room, "host");
          h.onRoomFail?.("both");
          return;
        }
        for (const who of [...silentPeers, ...frozenPeers]) {
          if (many ? st.outSeen.has(who) : st.gaveUp) continue;
          if (many) st.outSeen.add(who);
          else st.gaveUp = true;
          // Only a forfeit this client actually wrote (peer still short of its spins) is settled locally.
          void api
            .forfeitIf(room, who, need, "peer", undefined, snap.players)
            .then((ok) => {
              if (stop) return;
              if (ok) h.onForfeit(who);
              else if (many) st.outSeen.delete(who);
              else st.gaveUp = false;
            })
            .catch(() => {
              if (many) st.outSeen.delete(who);
              else st.gaveUp = false;
            });
        }
      }
    } catch (e) {
      if (stop) return;
      const msg = e instanceof Error ? e.message : "spojenie padlo";
      if (st.started && !st.gaveUp) {
        if (msg.includes("neexistuje")) {
          st.goneRun += 1;
          if (st.goneRun >= ROOM_GONE_POLLS) h.onRoomFail?.("gone");
        } else if (!st.netFlagged && st.lastOk > 0 && now() - st.lastOk > ROOM_NET_FAIL_MS) {
          st.netFlagged = true;
          h.onRoomFail?.("net");
        }
      }
      if (msg.includes("neexistuje") && st.started) h.setErr("Súper odišiel.");
      else if (!st.started) h.setErr(msg);
    }
  };

  void boot();
  const id = every(() => {
    if (!ready || stop) return;
    void pollOnce();
  }, opts.pollMs ?? ROOM_POLL_MS);

  return () => {
    stop = true;
    clear(id);
  };
}
