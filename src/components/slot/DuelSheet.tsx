import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/slot/format";
import { duelCreate, duelForfeitIf, duelJoinSeat, duelLeave, duelPoll, duelStart, duelTick, roomFull, type DuelSnap } from "@/lib/slot/duel-api";
import {
  canDuelSpin,
  duelCreditDelta,
  duelLeaders,
  duelPot,
  nextSeat,
  versusMode,
  VERSUS_MODES,
  type VersusSize,
  duelView,
  type Duel,
  type DuelLink,
  type DuelMode,
} from "@/lib/slot/duel";
import { BETS } from "@/lib/slot/symbols";
import { DUEL_DEPOSIT_MULT, depositAmount, duelEntryCost, type DepositSettlement } from "@/lib/slot/duel-deposit";
import { cleanRoomCode, duelSummary } from "@/lib/slot/duel-setup";
import { ROOM_NET_FAIL_MS, newRoomSyncState, peerTicksFromSnap, startRoomSync, type RoomSyncState } from "@/lib/slot/duel-sync";
import artDuel from "@/assets/versus/duel.webp";
import artTriple from "@/assets/versus/triple.webp";
import artFour from "@/assets/versus/four.webp";

/** VERSUS option art (more players = bigger arcade chaos). */
const VERSUS_ART: Record<VersusSize, string> = { 2: artDuel, 3: artTriple, 4: artFour };
const VERSUS_SUB: Record<VersusSize, string> = { 2: "1 na 1", 3: "traja proti sebe", 4: "každý proti každému" };

interface Props {
  open: boolean;
  duel: Duel | null;
  link: DuelLink | null;
  peerName: string;
  bet: number;
  credit: number;
  onClose: () => void;
  /** Hot-seat: 2-4 names, all on this phone. */
  onStart: (mode: DuelMode, names: string[], bet: number, need: number, ante: boolean) => string;
  onHost: (mode: DuelMode, name: string, bet: number, need: number, ante: boolean, players: number) => string;
  onJoin: (mode: DuelMode, name: string, code: string, bet: number, need: number, ante: boolean) => string;
  onSwap: () => void;
  onEnd: () => void;
  /** Last kaucia settlement (shown on the result card). */
  depositNote?: DepositSettlement | null;
  /** Saved leaderboard nick: the default name in the setup (empty = none saved). */
  nick?: string;
  /** This player's ante multiplier (rank perk): the stake shown in the summary when ANTE is on. */
  anteMul?: number;
  /** A ticket is running: it pauses for the duel and keeps this much credit for its locked bet (0 = no ticket). */
  ticketReserve?: number;
  /** The ticket is paused by the running duel (result card chip). */
  ticketPaused?: boolean;
}

function modeLabel(need: number): string {
  return `${need} TOČENÍ`;
}

/** Min. credit per seat: stakes reserve (1.2 x bet x spins) + kaucia (DUEL_DEPOSIT_MULT x bet). */
function seatCost(need: number, bet: number): number {
  return duelEntryCost({ bet, need }).perSeat;
}

/** Kaucia rules, one line each: shown behind the (i) button instead of a wall of small print. */
const DEPOSIT_RULES = [
  `Kaucia = ${DUEL_DEPOSIT_MULT}× stávka na točenie, platí každý hráč.`,
  "Vráti sa po dohraní (aj pri remíze), keď odídu všetci súperi, alebo keď zlyhá hra / spojenie.",
  "Prepadne, keď odídeš, dáš VZDAŤ alebo prestaneš hrať (neaktivita).",
  "Min. kredit = rezerva na stávky (1,2× stávka × točenia) + kaucia.",
  "Vo VERSUS je zamknutá stávka, Ante aj Buy. KONTROLA ani ZÁSAH sa nespúšťajú.",
];

/** (i) button + popover with the kaucia rules. */
function DepositInfo({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="duel-info">
      <button
        type="button"
        className={`duel-info-btn ${open ? "is-open" : ""}`}
        aria-expanded={open}
        aria-controls={id}
        aria-label="Pravidlá kaucie"
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>
      {open ? (
        <span className="duel-info-pop" id={id} role="note" onClick={() => setOpen(false)}>
          <b>Kaucia</b>
          {DEPOSIT_RULES.map((r) => (
            <span key={r}>{r}</span>
          ))}
        </span>
      ) : null}
    </span>
  );
}

/** Seat colours, the same in lobby, panel, dots and result: seat 0 (host / HRÁČ 1) gold, 1 cyan, 2 red, 3 green. */
export const SEAT_CLASS = ["p1", "p2", "p3", "p4"] as const;

/** One dot per spin: filled = played, ring = the spin this seat is on now. */
export function DuelPips({ have, need, live }: { have: number; need: number; live?: boolean }) {
  const n = Math.max(1, Math.min(20, need));
  const k = Math.max(0, Math.min(n, have));
  return (
    <span className={`duel-pips ${n > 10 ? "is-dense" : ""}`} aria-label={`${k} z ${n} točení`}>
      {Array.from({ length: n }, (_, i) => (
        <i key={i} className={i < k ? "on" : i === k && live ? "now" : ""} />
      ))}
    </span>
  );
}

export function DuelSeatRow({
  seat,
  name,
  have,
  need,
  score,
  you,
  live,
  status,
  win,
}: {
  seat: number;
  name: string;
  have: number;
  need: number;
  /** null = not known yet (empty lobby seat). */
  score: number | null;
  you?: boolean;
  /** This seat is on its turn (ring on the next dot). */
  live?: boolean;
  status?: string;
  win?: boolean;
}) {
  return (
    <div className={`duel-seat ${SEAT_CLASS[seat] ?? "p1"} ${you ? "is-you" : ""} ${win ? "is-win" : ""}`}>
      <span className="duel-seat-name">
        <i className="duel-chip" aria-hidden="true" />
        <span className="duel-seat-label">{name || "…"}</span>
        {you ? <small className="duel-you">TY</small> : null}
        {win ? <small className="duel-crown">VÍŤAZ</small> : null}
      </span>
      <span className="duel-seat-track">
        <DuelPips have={have} need={need} live={live} />
        <span className="duel-seat-count">
          {Math.min(have, need)}/{need}
        </span>
      </span>
      <b className="duel-seat-score">{score == null ? "—" : formatMoney(score)}</b>
      {status ? <em className={`duel-seat-status ${status === "4KA TV / TOČÍ" ? "is-busy" : ""}`}>{status}</em> : null}
    </div>
  );
}

/** Small chip in the duel UI: the running ticket waits while the duel plays. */
/** Phone strip seat: name + score on top, a segmented progress bar + count + status below. p2 is mirrored. */
function DuelStripSeat({
  seat,
  name,
  have,
  need,
  score,
  you,
  live,
  out,
  status,
}: {
  seat: number;
  name: string;
  have: number;
  need: number;
  score: number;
  you?: boolean;
  live?: boolean;
  out?: boolean;
  status?: string;
}) {
  const n = Math.max(1, need);
  const k = Math.max(0, Math.min(n, have));
  return (
    <div className={`duel-sseat ${SEAT_CLASS[seat] ?? "p1"} ${you ? "is-you" : ""} ${live ? "is-live" : ""} ${out ? "is-out" : k >= n ? "is-done" : ""}`}>
      <span className="duel-sseat-top">
        <i className="duel-chip" aria-hidden="true" />
        <span className="duel-seat-label">{name || "…"}</span>
        {you ? <small className="duel-you">TY</small> : null}
        <b className="duel-seat-score">{formatMoney(score)}</b>
      </span>
      <span className="duel-sseat-bot">
        <span
          className="duel-sbar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={n}
          aria-valuenow={k}
          aria-label={`${k} z ${n} točení`}
          style={{ ["--n" as string]: String(n), ["--k" as string]: `${(k / n) * 100}%` }}
        >
          <i />
        </span>
        <span className="duel-seat-count">
          {k}/{n}
        </span>
        {status ? <em className={`duel-seat-status ${status === "4KA TV / TOČÍ" ? "is-busy" : ""}`}>{status}</em> : null}
      </span>
    </div>
  );
}

export function TicketPausedChip({ text = "TIKET POZASTAVENÝ · počas VERSUS" }: { text?: string }) {
  return (
    <span className="duel-ticket-chip" role="status">
      <i aria-hidden="true">❚❚</i>
      {text}
    </span>
  );
}

function depositLine(st: DepositSettlement | null | undefined): string {
  if (!st) return "";
  if (st.burned > 0 && st.refund > 0) return `Kaucia: prepadlo ${formatMoney(st.burned)} · vrátené ${formatMoney(st.refund)}`;
  if (st.burned > 0) return `Kaucia prepadla: ${formatMoney(st.burned)}`;
  return `Kaucia vrátená: ${formatMoney(st.refund)}`;
}

export function DuelLink({
  link,
  duel,
  bet,
  onPeerName,
  onGo,
  onTick,
  onForfeit,
  onPeerNet,
  onEnd,
  onRoomFail,
  inFs,
  peerName = "",
  ticketPaused = false,
}: {
  /** A ticket is paused for this duel: chip in the lobby. */
  ticketPaused?: boolean;
  link: DuelLink;
  duel: Duel | null;
  bet: number;
  /** This seat is busy (spin, 4KA TV, banner, KONTROLA): sent as the `net` heartbeat flag. */
  inFs: boolean;
  onPeerName: (name: string) => void;
  /** The room started: every seat's name (seat 0 = host) and my seat. */
  onGo: (info: { names: string[]; you: number; bet: number; mode: DuelMode; need: number; ante: boolean }) => void;
  /** A peer seat's progress (2 seats: seat omitted = the other seat). */
  onTick: (have: number, score: number, seat?: number) => void;
  onForfeit: (who: number) => void;
  onPeerNet: (net: boolean, seat?: number) => void;
  onEnd: () => void;
  /** Room vanished mid-duel / polls+writes failing / all seats were away: the game's fault (kaucia back). */
  onRoomFail?: (kind: "gone" | "net" | "both") => void;
  /** Opponent name as far as known (host name for a guest). */
  peerName?: string;
}) {
  const [status, setStatus] = useState("Pálim miestnosť…");
  /** Lobby: names per seat as the room shows them (seat 0 = host). */
  const [names, setNames] = useState<string[]>(() => Array.from({ length: link.players ?? 2 }, (_, i) => (i === 0 && link.role === "host" ? link.name : "")));
  const [err, setErr] = useState("");
  /** Boot + poll state for the whole life of this seat (survives a restart of the sync effect). */
  const sync = useRef<RoomSyncState | null>(null);
  if (!sync.current) sync.current = newRoomSyncState(link);
  const st = sync.current;
  const lastHave = useRef(-1);
  const onPeerNameRef = useRef(onPeerName);
  const onGoRef = useRef(onGo);
  const onTickRef = useRef(onTick);
  const onForfeitRef = useRef(onForfeit);
  const onPeerNetRef = useRef(onPeerNet);
  const inFsRef = useRef(inFs);
  const onRoomFailRef = useRef(onRoomFail);
  const tickOk = useRef(0);
  // Link fields and the bet are read through refs: a link rewrite (beginOnline adds seat + players at the
  // start) must not restart the room sync (it used to re-run the join and kill the guest's poll).
  const linkRef = useRef(link);
  const betRef = useRef(bet);
  linkRef.current = link;
  betRef.current = bet;
  onRoomFailRef.current = onRoomFail;
  onPeerNameRef.current = onPeerName;
  onGoRef.current = onGo;
  onTickRef.current = onTick;
  onForfeitRef.current = onForfeit;
  onPeerNetRef.current = onPeerNet;
  inFsRef.current = inFs;

  useEffect(() => {
    return startRoomSync({
      api: {
        create: duelCreate,
        joinSeat: duelJoinSeat,
        poll: duelPoll,
        start: duelStart,
        forfeitIf: (code, out, need, by, final, players) => duelForfeitIf(code, out, need, by, final, players),
        leave: (code, role, players) => duelLeave(code, role, players),
      },
      state: st,
      hooks: {
        getLink: () => linkRef.current,
        getBet: () => betRef.current,
        onGo: (info) => onGoRef.current(info),
        onTick: (have, score, seat) => onTickRef.current(have, score, seat),
        onForfeit: (who) => onForfeitRef.current(who),
        onPeerNet: (net, seat) => onPeerNetRef.current(net, seat),
        onPeerName: (name) => onPeerNameRef.current(name),
        onRoomFail: (kind) => onRoomFailRef.current?.(kind),
        setErr,
        setStatus,
        setNames,
      },
    });
    // Only the room and the role restart the sync (see lib/slot/duel-sync roomSyncKey).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link.room, link.role]);

  useEffect(() => {
    if (!duel || duel.kind !== "online") return;
    if (duel.phase !== "play" && duel.phase !== "done") return;
    const send = () => {
      const have = duel.seats[duel.you]!.have;
      const score = Math.max(0, +(duel.seats[duel.you]!.score - (duel.held || 0)).toFixed(2));
      lastHave.current = have;
      void duelTick(link.room, st.seat, have, score, {
        name: link.name,
        ante: Boolean(link.ante),
        net: inFsRef.current,
      })
        .then((snap) => {
          tickOk.current = Date.now();
          // Safety net: the PATCH returns the room row, so a peer's progress lands even if the poll stalls.
          // Only real changes go on (an unchanged tick would re-render and re-run this effect in a loop).
          if (duel.phase !== "play" || !st.started) return;
          for (const t of peerTicksFromSnap(snap, st.seat)) {
            const cur = duel.seats[t.seat ?? (duel.you === 0 ? 1 : 0)];
            if (!cur || (t.have <= cur.have && t.score === cur.score)) continue;
            onTickRef.current(t.have, t.score, t.seat);
          }
        })
        .catch(() => {
          // Heartbeat writes failing for a long time mid-duel: the room/network is at fault.
          if (duel.phase !== "play" || st.netFlagged) return;
          if (tickOk.current > 0 && Date.now() - tickOk.current > ROOM_NET_FAIL_MS) {
            st.netFlagged = true;
            onRoomFailRef.current?.("net");
          }
        });
    };
    if (tickOk.current === 0) tickOk.current = Date.now();
    send();
    if (duel.phase !== "play") return;
    const id = window.setInterval(send, 1500);
    // Back from the background: beat at once instead of waiting for the next interval.
    const onShow = () => {
      if (document.visibilityState === "visible") send();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [duel, link.room, link.role, link.name, link.ante, st]);

  const full = names.length >= 2 && names.every(Boolean);
  const launch = () => {
    if (st.started || link.role !== "host" || !full) return;
    void (async () => {
      try {
        const snap = await duelStart(link.room);
        if (st.started) return;
        st.started = true;
        onGo({
          names: snap.seats.map((x, i) => x.name || (i === 0 ? "HOSŤ" : `HRÁČ ${i + 1}`)),
          you: 0,
          bet: snap.bet,
          mode: snap.mode,
          need: snap.need,
          ante: snap.ante,
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Štart zlyhal");
      }
    })();
  };

  const leave = () => {
    void duelLeave(link.room, link.role === "host" ? "host" : st.seat, st.players);
    onEnd();
  };

  const copy = () => {
    void navigator.clipboard?.writeText(link.room).catch(() => {});
  };

  if (duel) return null;

  const need = link.need || 10;
  const stake = link.bet || bet;
  const me = st.seat;
  const players = Math.max(names.length, 2);
  const vm = versusMode(players);
  const shownNames = names.map((n, i) => (i === me ? link.name : i === 0 ? n || peerName || "HOSŤ" : n));
  const joined = shownNames.filter(Boolean).length;
  return (
    <div className="modal-back" role="presentation">
      <div className={`modal-card spend-card duel-card duel-lobby is-${vm.id}`} role="dialog" aria-labelledby="duel-title">
        <header className="modal-head">
          <h2 id="duel-title">
            {vm.label} · {link.role === "host" ? "LOBBY" : "PRIPÁJAM"}
          </h2>
          <button type="button" className="icon-btn" onClick={leave} aria-label="Odísť">
            ×
          </button>
        </header>
        {ticketPaused ? <TicketPausedChip /> : null}
        <p className="duel-kicker">KÓD MIESTNOSTI · ťukni pre kopírovanie</p>
        <button type="button" className="duel-code" onClick={copy} aria-label="Skopírovať kód">
          {link.room}
        </button>
        <div className={`duel-seats ${players > 2 ? "is-multi" : ""}`}>
          {shownNames.map((n, i) => (
            <DuelSeatRow
              key={i}
              seat={i}
              name={n || "čaká sa…"}
              have={0}
              need={need}
              score={null}
              you={i === me}
              status={i === 0 && link.role !== "host" ? "HOSŤ" : n ? "PRIPRAVENÝ" : "VOĽNÉ"}
            />
          ))}
        </div>
        <dl className="duel-facts">
          <div>
            <dt>Režim</dt>
            <dd>{modeLabel(need)}</dd>
          </div>
          <div>
            <dt>Stávka</dt>
            <dd>
              {formatMoney(stake)}
              {link.ante ? " · ANTE" : ""}
            </dd>
          </div>
          <div className="is-deposit">
            <dt>Kaucia</dt>
            <dd>{formatMoney(depositAmount(stake))}</dd>
          </div>
          <div>
            <dt>Min. kredit</dt>
            <dd>{formatMoney(seatCost(need, stake))}</dd>
          </div>
        </dl>
        <p className={`duel-status ${err ? "is-err" : ""}`}>
          {err || status} <DepositInfo id="duel-lobby-info" />
        </p>
        <div className={`duel-actions ${link.role === "host" ? "" : "is-guest"}`}>
          {link.role === "host" ? (
            <button type="button" className="chip-btn gold duel-go" disabled={!full} onClick={launch}>
              {full ? "ŠTART" : players > 2 ? `ČAKÁM HRÁČOV · ${joined}/${players}` : "ČAKÁM SÚPERA…"}
            </button>
          ) : null}
          <button type="button" className="chip-btn duel-leave" onClick={leave}>
            ODÍSŤ · kaucia späť
          </button>
        </div>
      </div>
    </div>
  );
}

/** Stake presets offered under the stepper (all are BETS values); only the affordable ones show. */
const STAKE_PRESETS = [1, 5, 20, 100, 500, 1000] as const;

function nearestBetIndex(value: number): number {
  return BETS.reduce((best, v, idx) => (Math.abs(v - value) < Math.abs(BETS[best] - value) ? idx : best), 0);
}

function stepBet(value: number, dir: -1 | 1): number {
  const i = nearestBetIndex(value);
  return BETS[Math.min(BETS.length - 1, Math.max(0, i + dir))] ?? value;
}

function Seg<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { v: T; label: string; sub?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="duel-seg2" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          className={value === o.v ? "is-on" : ""}
          onClick={() => onChange(o.v)}
        >
          <b>{o.label}</b>
          {o.sub ? <small>{o.sub}</small> : null}
        </button>
      ))}
    </div>
  );
}

type JoinState =
  | { kind: "idle" }
  | { kind: "loading"; code: string }
  | { kind: "error"; code: string; msg: string }
  | { kind: "ok"; snap: DuelSnap };

export function DuelSheet({
  open,
  duel,
  link,
  onClose,
  onStart,
  onHost,
  onJoin,
  onSwap,
  onEnd,
  credit,
  bet,
  depositNote,
  nick = "",
  anteMul = 1,
  ticketReserve = 0,
  ticketPaused = false,
}: Props) {
  const [a, setA] = useState(nick || "HRÁČ 1");
  /** Hot-seat names of seats 2-4 (seat 1 = `a`). */
  const [others, setOthers] = useState<string[]>(["HRÁČ 2", "HRÁČ 3", "HRÁČ 4"]);
  const [players, setPlayers] = useState<VersusSize>(2);
  const nameTouched = useRef(false);
  const [need, setNeed] = useState(10);
  const [anteOn, setAnteOn] = useState(false);
  const [tab, setTab] = useState<"create" | "join">("create");
  const [where, setWhere] = useState<"online" | "hotseat">("online");
  const [code, setCode] = useState("");
  const [stake, setStake] = useState(bet);
  const [join, setJoin] = useState<JoinState>({ kind: "idle" });
  const lookupId = useRef(0);
  const [block, setBlock] = useState("");
  useEffect(() => {
    if (!open) {
      setJoin({ kind: "idle" });
      setBlock("");
    }
  }, [open]);
  useEffect(() => {
    setStake(bet);
  }, [bet]);
  // The saved leaderboard nick is the default name, until the player edits the field.
  useEffect(() => {
    if (nick && !nameTouched.current) setA(nick);
  }, [nick, open]);

  const lookup = (raw: string) => {
    const room = cleanRoomCode(raw);
    if (room.length < 4) return;
    const id = ++lookupId.current;
    setJoin({ kind: "loading", code: room });
    void (async () => {
      try {
        const snap = await duelPoll(room);
        if (id !== lookupId.current) return;
        if (snap.phase !== "wait") {
          setJoin({ kind: "error", code: room, msg: "Táto hra už beží." });
          return;
        }
        if (roomFull(snap)) {
          setJoin({ kind: "error", code: room, msg: "Miestnosť je plná." });
          return;
        }
        setJoin({ kind: "ok", snap });
      } catch (e) {
        if (id !== lookupId.current) return;
        setJoin({ kind: "error", code: room, msg: e instanceof Error ? e.message : "Kód neexistuje" });
      }
    })();
  };

  if (duel?.phase === "swap") {
    const cur = duel.seats[duel.turn]!;
    const nx = nextSeat(duel);
    const up = nx == null ? null : duel.seats[nx]!;
    return (
      <div className="modal-back" role="presentation">
        <div className={`modal-card spend-card duel-card duel-swap ${nx == null ? "" : `to-${SEAT_CLASS[nx]}`}`} role="dialog" aria-labelledby="duel-title">
          <header className="modal-head">
            <h2 id="duel-title">PREDÁŠ TELEFÓN</h2>
          </header>
          <p className="modal-lead">
            {cur.name} {cur.out ? "sa vzdal" : `má ${formatMoney(cur.score)}`}. Teraz točí {up?.name ?? "…"} — rovnaká stávka{" "}
            {formatMoney(duel.bet)}.
          </p>
          {duel.seats.length > 2 ? (
            <div className="duel-seats is-multi">
              {duel.seats.map((x, i) => (
                <DuelSeatRow key={i} seat={i} name={x.name} have={x.have} need={duel.need} score={x.have > 0 || x.out ? x.score : null} live={i === nx} status={x.out ? "VZDAL" : i === nx ? "NA RADE" : x.have >= duel.need ? "HOTOVO" : "ČAKÁ"} />
              ))}
            </div>
          ) : null}
          <button type="button" className="chip-btn gold" onClick={onSwap}>
            HRAJ {up?.name ?? ""}
          </button>
        </div>
      </div>
    );
  }

  if (duel?.phase === "done") {
    const many = duel.seats.length > 2;
    const gain = duel.kind === "hotseat" ? duelPot(duel) : duelCreditDelta(duel, duel.you);
    const leaders = duel.aborted ? [] : duelLeaders(duel);
    const w = leaders.length === 1 ? leaders[0]! : null;
    const meOut = duel.kind === "online" && Boolean(duel.seats[duel.you]?.out);
    const vm = versusMode(duel.seats.length);
    const title = duel.aborted
      ? "ZRUŠENÝ"
      : meOut || (!many && duel.forfeit != null)
        ? "VZDANIE"
        : w === null
          ? "REMÍZA"
          : vm.label;
    const dep = depositLine(depositNote);
    const verdict = duel.aborted
      ? "Hra zlyhala · každý si necháva svoju výhru"
      : meOut
        ? many
          ? "VZDAL SI SA · tvoj stack ostáva v banku"
          : "PREHRAL SI · bank berie súper"
        : w === null
          ? many
            ? `Remíza na čele · bank sa delí (${leaders.map((i) => duel.seats[i]!.name).join(", ")})`
            : "Remíza · každý si necháva svoju výhru"
          : duel.kind === "online"
            ? w === duel.you
              ? "VYHRAL SI · berieš bank"
              : `PREHRAL SI · bank berie ${duel.seats[w]!.name}`
            : `${duel.seats[w]!.name} berie bank`;
    // Podium order for 3-4 seats (best first, forfeited seats last); 2 seats keep the seat order.
    const order = duel.seats.map((_, i) => i);
    if (many) order.sort((x, y) => Number(Boolean(duel.seats[x]!.out)) - Number(Boolean(duel.seats[y]!.out)) || duel.seats[y]!.score - duel.seats[x]!.score);
    return (
      <div className="modal-back" role="presentation">
        <div className={`modal-card spend-card duel-card duel-slam is-${vm.id} ${w === null ? "" : `win-${SEAT_CLASS[w]}`}`} role="dialog" aria-labelledby="duel-title">
          <header className="modal-head">
            <h2 id="duel-title">{title}</h2>
          </header>
          <p className="duel-verdict">{verdict}</p>
          <div className={`duel-seats ${many ? "is-multi is-podium" : ""}`}>
            {order.map((i, rank) => (
              <DuelSeatRow
                key={i}
                seat={i}
                name={many ? `${duel.seats[i]!.out ? "–" : rank + 1}. ${duel.seats[i]!.name}` : duel.seats[i]!.name}
                have={duel.seats[i]!.have}
                need={duel.need}
                score={duel.seats[i]!.score}
                you={duel.kind === "online" && duel.you === i}
                win={leaders.includes(i)}
                status={duel.seats[i]!.out ? "VZDAL" : undefined}
              />
            ))}
          </div>
          {many ? <p className="duel-pot-line">BANK {formatMoney(duelPot(duel))}</p> : null}
          <p className="duel-take">{gain > 0 ? `+${formatMoney(gain)}` : "0,00"}</p>
          {ticketPaused ? <TicketPausedChip text="TIKET POZASTAVENÝ · pokračuje po zatvorení" /> : null}
          {dep ? <p className={`duel-deposit-note ${depositNote && depositNote.burned > 0 ? "is-burn" : ""}`}>{dep}</p> : null}
          <button type="button" className="chip-btn gold duel-go" onClick={onEnd}>
            PORT
          </button>
        </div>
      </div>
    );
  }

  if (link || !open) return null;

  const seats = where === "hotseat" ? players : 1;
  const sum = duelSummary({ bet: stake, need, ante: anteOn, anteMul, seats });
  // A running ticket keeps credit for its locked bet on top of the duel (same check as the game's).
  const createNeed = +(sum.minCredit + ticketReserve).toFixed(2);
  const createShort = credit < createNeed;
  const presets = STAKE_PRESETS.filter((v) => seatCost(need, v) * seats <= credit);
  const maxed = nearestBetIndex(stake) >= BETS.length - 1;
  const minned = nearestBetIndex(stake) <= 0;

  const invite = join.kind === "ok" ? join.snap : null;
  const inviteSum = invite ? duelSummary({ bet: invite.bet, need: invite.need, ante: invite.ante, anteMul, seats: 1 }) : null;
  const joinNeed = inviteSum ? +(inviteSum.minCredit + ticketReserve).toFixed(2) : 0;
  const joinShort = inviteSum ? credit < joinNeed : false;
  const codeOk = code.length === 4;

  const editName = (v: string) => {
    nameTouched.current = true;
    setA(v);
  };
  const nameInput = (label: string, value: string, set: (v: string) => void, id: string) => (
    <label className="duel-in" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        value={value}
        onChange={(e) => set(e.target.value)}
        maxLength={16}
        autoComplete="nickname"
        autoCapitalize="characters"
        spellCheck={false}
        enterKeyHint="done"
      />
    </label>
  );

  let cta: { label: string; disabled: boolean; run: () => void };
  if (tab === "create") {
    cta =
      where === "online"
        ? { label: "VYTVORIŤ HRU", disabled: createShort, run: () => setBlock(onHost("spins", a, stake, need, anteOn, players)) }
        : {
            label: "ZAČAŤ PRI STOLE",
            disabled: createShort,
            run: () => setBlock(onStart("spins", [a, ...others.slice(0, players - 1)], stake, need, anteOn)),
          };
  } else if (invite) {
    cta = {
      label: "PRIPOJIŤ SA",
      disabled: joinShort,
      run: () => setBlock(onJoin(invite.mode, a, invite.code, invite.bet, invite.need, invite.ante)),
    };
  } else {
    cta = {
      label: join.kind === "loading" ? "HĽADÁM HRU…" : "PRIPOJIŤ SA",
      disabled: !codeOk || join.kind === "loading",
      run: () => lookup(code),
    };
  }

  const note =
    block ||
    (tab === "create" && createShort ? `Málo kreditu · treba ${formatMoney(createNeed)}${ticketReserve > 0 ? " (s rezervou tiketu)" : ""}` : "") ||
    (tab === "join" && joinShort && inviteSum ? `Málo kreditu · treba ${formatMoney(joinNeed)}${ticketReserve > 0 ? " (s rezervou tiketu)" : ""}` : "");

  return (
    <div className="modal-back duel-setup-back" onClick={onClose} role="presentation">
      <div
        className="modal-card spend-card duel-card duel-setup"
        role="dialog"
        aria-labelledby="duel-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="duel-setup-head">
          <div>
            <h2 id="duel-title">VERSUS</h2>
            <p>Rovnaká stávka aj točenia · víťaz berie výhry všetkých</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Zavrieť">
            ×
          </button>
        </header>
        {ticketReserve > 0 ? (
          <p className="duel-ticket-note">
            <TicketPausedChip text="TIKET SA POZASTAVÍ · počas VERSUS" />
            <small>Po VERSUS hre pokračuje so svojou stávkou. Rezerva {formatMoney(ticketReserve)} ostáva v kredite.</small>
          </p>
        ) : null}
        <div className="duel-tabs2" role="tablist" aria-label="Versus">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "create"}
            className={tab === "create" ? "is-on" : ""}
            onClick={() => {
              setTab("create");
              setBlock("");
            }}
          >
            Vytvoriť hru
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "join"}
            className={tab === "join" ? "is-on" : ""}
            onClick={() => {
              setTab("join");
              setBlock("");
            }}
          >
            Pripojiť sa
          </button>
        </div>

        <div className="duel-setup-body">
          {tab === "create" ? (
            <>
              <section className="duel-sec">
                <h3>Počet hráčov</h3>
                <div className="vs-modes" role="radiogroup" aria-label="Počet hráčov">
                  {VERSUS_MODES.map((m) => (
                    <button
                      key={m.n}
                      type="button"
                      role="radio"
                      aria-checked={players === m.n}
                      className={`vs-mode is-${m.id} ${players === m.n ? "is-on" : ""}`}
                      onClick={() => {
                        setPlayers(m.n);
                        setBlock("");
                      }}
                    >
                      <span className="vs-art">
                        <img src={VERSUS_ART[m.n]} alt="" width={384} height={384} loading="eager" decoding="async" draggable={false} />
                        <i className="vs-count">{m.n}</i>
                      </span>
                      <b>{m.label}</b>
                      <small>{VERSUS_SUB[m.n]}</small>
                    </button>
                  ))}
                </div>
              </section>
              <section className="duel-sec">
                <h3>Kde hráte</h3>
                <Seg
                  label="Kde hráte"
                  value={where}
                  onChange={(v) => {
                    setWhere(v);
                    setBlock("");
                  }}
                  options={[
                    { v: "online", label: "Na diaľku", sub: "pošleš kód" },
                    { v: "hotseat", label: "Pri stole", sub: "1 telefón" },
                  ]}
                />
              </section>
              <section className="duel-sec">
                <h3>Točenia na hráča</h3>
                <Seg
                  label="Točenia"
                  value={need}
                  onChange={setNeed}
                  options={[
                    { v: 5, label: "5" },
                    { v: 10, label: "10" },
                    { v: 20, label: "20" },
                  ]}
                />
              </section>
              <section className="duel-sec">
                <h3>Stávka na točenie</h3>
                <div className="duel-stake">
                  <button type="button" disabled={minned} onClick={() => setStake(stepBet(stake, -1))} aria-label="Nižšia stávka">
                    −
                  </button>
                  <b aria-live="polite">{formatMoney(stake)}</b>
                  <button type="button" disabled={maxed} onClick={() => setStake(stepBet(stake, 1))} aria-label="Vyššia stávka">
                    +
                  </button>
                </div>
                {presets.length > 1 ? (
                  <div className="duel-presets">
                    {presets.map((v) => (
                      <button key={v} type="button" className={stake === v ? "is-on" : ""} onClick={() => setStake(v)}>
                        {v >= 1000 ? `${v / 1000}K` : v}
                      </button>
                    ))}
                  </div>
                ) : null}
              </section>
              <button
                type="button"
                role="switch"
                aria-checked={anteOn}
                className={`duel-ante ${anteOn ? "is-on" : ""}`}
                onClick={() => setAnteOn((v) => !v)}
              >
                <span>
                  <b>{players > 2 ? "ANTE pre všetkých" : "ANTE pre oboch"}</b>
                  <small>
                    stávka {anteMul.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}× · 4KA TV častejšie · {players > 2 ? "súperi hrajú" : "súper hrá"} rovnako
                  </small>
                </span>
                <i aria-hidden="true">{anteOn ? "ON" : "OFF"}</i>
              </button>
              <section className="duel-sec">
                {where === "online" ? (
                  nameInput("Tvoje meno", a, editName, "duel-name")
                ) : (
                  <div className={`duel-names ${players > 2 ? "is-multi" : ""}`}>
                    {nameInput("Hráč 1", a, editName, "duel-name")}
                    {others.slice(0, players - 1).map((v, k) =>
                      nameInput(`Hráč ${k + 2}`, v, (nv) => setOthers((o) => o.map((x, j) => (j === k ? nv : x))), `duel-name-${k + 2}`),
                    )}
                  </div>
                )}
              </section>
            </>
          ) : (
            <>
              <section className="duel-sec">
                <label className="duel-in duel-code-in" htmlFor="duel-code">
                  <span>Kód od kamoša</span>
                  <input
                    id="duel-code"
                    value={code}
                    onChange={(e) => {
                      const next = cleanRoomCode(e.target.value);
                      setCode(next);
                      setBlock("");
                      lookupId.current += 1;
                      if (next.length === 4) lookup(next);
                      else setJoin({ kind: "idle" });
                    }}
                    placeholder="A7K2"
                    inputMode="text"
                    autoCapitalize="characters"
                    autoComplete="one-time-code"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="go"
                    aria-describedby="duel-code-hint"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !cta.disabled) cta.run();
                    }}
                  />
                </label>
                <p className={`duel-hint ${join.kind === "error" ? "is-err" : ""}`} id="duel-code-hint">
                  {join.kind === "error"
                    ? join.msg
                    : join.kind === "loading"
                      ? "Hľadám hru…"
                      : invite
                        ? ""
                        : "4 znaky, ktoré ti poslal hosť. Pozvánka sa ukáže hneď."}
                </p>
              </section>
              {invite && inviteSum ? (
                <section className="duel-invite" aria-live="polite">
                  <p className="duel-invite-from">
                    <small>Pozýva ťa · {versusMode(invite.players).label}</small>
                    <b>{invite.hostName}</b>
                  </p>
                  <dl>
                    <div>
                      <dt>Hráči</dt>
                      <dd>
                        {invite.seats.filter((x) => x.name).length}/{invite.players}
                      </dd>
                    </div>
                    <div>
                      <dt>Točenia</dt>
                      <dd>{invite.need}</dd>
                    </div>
                    <div>
                      <dt>Stávka</dt>
                      <dd>{formatMoney(invite.bet)}</dd>
                    </div>
                    <div>
                      <dt>Ante</dt>
                      <dd>{invite.ante ? "ÁNO" : "NIE"}</dd>
                    </div>
                  </dl>
                </section>
              ) : null}
              <section className="duel-sec">{nameInput("Tvoje meno", a, editName, "duel-name-join")}</section>
            </>
          )}
        </div>

        <footer className="duel-setup-foot">
          {tab === "create" || inviteSum ? (
            <div className="duel-sum">
              <span>
                Spolu <b>{formatMoney((tab === "create" ? sum : inviteSum!).total)}</b>
                <small>
                  stávky {formatMoney((tab === "create" ? sum : inviteSum!).stakes)} + kaucia{" "}
                  {formatMoney((tab === "create" ? sum : inviteSum!).deposit)}
                  {tab === "create" && seats > 1 ? (seats === 2 ? " · za oboch" : ` · za ${seats}`) : ""}
                </small>
              </span>
              <span className="duel-sum-min">
                <small>min. kredit</small>
                <b>{formatMoney(tab === "create" ? createNeed : joinNeed)}</b>
              </span>
              <DepositInfo id="duel-setup-info" />
            </div>
          ) : null}
          {note ? <p className="duel-note">{note}</p> : null}
          <button type="button" className="duel-cta" disabled={cta.disabled} onClick={cta.run}>
            {cta.label}
          </button>
        </footer>
      </div>
    </div>
  );
}

export function DuelBar({
  duel,
  onForfeit,
  canFold = true,
  deposit = 0,
  variant = "bar",
  ticketPaused = false,
}: {
  /** A ticket waits for this duel: small chip under the seats. */
  ticketPaused?: boolean;
  duel: Duel;
  onForfeit?: () => void;
  canFold?: boolean;
  /** Kaucia still held for this duel (0 = none / settled). */
  deposit?: number;
  /** bar = full panel above the board, card = side column (desktop, away from the jackpot strip),
   *  strip = phones: a 50px versus strip that takes the place of the KÚPIŤ / ANTE row (both locked in a duel),
   *  so the reels keep exactly the size they have in normal play. */
  variant?: "bar" | "card" | "strip";
}) {
  const view = duelView(duel);
  const online = duel.kind === "online";
  const n = duel.seats.length;
  const many = n > 2;
  const me = online ? duel.you : duel.turn;
  const wait = view.waiting || (online && !canDuelSpin(duel) && duel.phase === "play");
  const left = Math.max(0, duel.need - (duel.seats[me]?.have ?? 0));
  const vm = versusMode(n);
  const seatsIdx = duel.seats.map((_, i) => i);
  const shown = (i: number) => duel.seats[i]!.score;
  const statusOf = (i: number): string | undefined => {
    const x = duel.seats[i]!;
    if (x.out) return "VZDAL";
    if (x.have >= duel.need) return "HOTOVO";
    if (online) {
      if (i === duel.you) return wait ? "ČAKÁŠ" : "NA ŤAHU";
      const busy = many ? duel.nets?.[i] : duel.peerNet;
      return busy ? "4KA TV / TOČÍ" : "TOČÍ";
    }
    return i === duel.turn ? "NA ŤAHU" : "ČAKÁ";
  };
  const liveOf = (i: number) => {
    const x = duel.seats[i]!;
    return duel.phase === "play" && !x.out && x.have < duel.need && (online ? i !== duel.you || !wait : i === duel.turn);
  };
  const fold =
    onForfeit && duel.phase === "play" ? (
      <button
        type="button"
        className="duel-fold"
        onClick={onForfeit}
        disabled={!canFold}
        title={canFold ? (deposit > 0 ? "Vzdaním kaucia prepadne" : undefined) : "VZDAŤ až po dotočení"}
      >
        VZDAŤ{variant === "card" && deposit > 0 ? " · kaucia prepadne" : ""}
      </button>
    ) : null;
  const sr = (
    <span className="duel-sr">
      {seatsIdx.map((i) => `${duel.seats[i]!.name} ${formatMoney(shown(i))}`).join(" vs ")}
    </span>
  );
  if (variant === "strip") {
    const seat = (i: number) => (
      <DuelStripSeat
        key={i}
        seat={i}
        name={duel.seats[i]!.name}
        have={duel.seats[i]!.have}
        need={duel.need}
        score={shown(i)}
        you={online && i === duel.you}
        live={liveOf(i)}
        out={Boolean(duel.seats[i]!.out)}
        status={many ? undefined : statusOf(i)}
      />
    );
    const hub = (
      <div className="duel-strip-hub">
        <span className="duel-strip-head">
          <span className="duel-panel-title">{many ? vm.short : "DUEL"}</span>
          {ticketPaused ? (
            <i className="duel-strip-tiket" role="status" title="TIKET POZASTAVENÝ · počas duelu" aria-label="Tiket pozastavený počas duelu">
              ❚❚
            </i>
          ) : null}
        </span>
        {/* Each seat carries its own count, so the hub line shows what is not visible elsewhere. */}
        {wait ? (
          <span className="duel-panel-left">ČAKÁ SA</span>
        ) : deposit > 0 ? (
          <span className="duel-strip-dep" title={`Zostáva ${left}/${duel.need}`}>
            {many ? "K " : "KAUCIA "}
            {formatMoney(deposit)}
          </span>
        ) : (
          <span className="duel-panel-left">
            {many ? "" : "ZOSTÁVA "}
            {left}/{duel.need}
          </span>
        )}
        {fold}
      </div>
    );
    return (
      <div className={`duel-bar duel-panel is-strip is-n${n} ${wait ? "is-wait" : ""}`} aria-live="polite">
        {many ? (
          <>
            {hub}
            {seatsIdx.map(seat)}
          </>
        ) : (
          <>
            {seat(0)}
            {hub}
            {seat(1)}
          </>
        )}
        {sr}
      </div>
    );
  }
  return (
    <div className={`duel-bar duel-panel is-${variant} is-n${n} ${wait ? "is-wait" : ""}`} aria-live="polite">
      <div className="duel-panel-head">
        <span className="duel-panel-title">{many ? vm.label : "DUEL"}</span>
        <span className="duel-panel-left">{wait ? "HOTOVO · ČAKÁ SA NA SÚPEROV".replace("SÚPEROV", many ? "SÚPEROV" : "SÚPERA") : `ZOSTÁVA ${left}/${duel.need}`}</span>
        {deposit > 0 ? <span className="duel-panel-deposit">KAUCIA {formatMoney(deposit)}</span> : null}
        {variant === "bar" ? fold : null}
      </div>
      <div className="duel-seats">
        {seatsIdx.map((i) => (
          <DuelSeatRow
            key={i}
            seat={i}
            name={duel.seats[i]!.name}
            have={duel.seats[i]!.have}
            need={duel.need}
            score={shown(i)}
            you={online && i === duel.you}
            live={liveOf(i)}
            status={statusOf(i)}
          />
        ))}
      </div>
      {ticketPaused ? <TicketPausedChip /> : null}
      {variant === "card" ? fold : null}
      {sr}
    </div>
  );
}
