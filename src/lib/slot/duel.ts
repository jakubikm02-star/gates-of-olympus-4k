export type DuelMode = "spins" | "live";
export type DuelPhase = "play" | "swap" | "done";
export type DuelKind = "hotseat" | "online";

/** VERSUS sizes: DUEL (2), TRIPLE THREAT (3), FANTASTIC FOUR (4). */
export type VersusSize = 2 | 3 | 4;
export const MAX_SEATS = 4;
export const VERSUS_MODES: readonly { n: VersusSize; id: "duel" | "triple" | "four"; label: string; short: string }[] = [
  { n: 2, id: "duel", label: "DUEL", short: "DUEL" },
  { n: 3, id: "triple", label: "TRIPLE THREAT", short: "TRIPLE" },
  { n: 4, id: "four", label: "FANTASTIC FOUR", short: "FOUR" },
];

export function clampPlayers(n: unknown): VersusSize {
  const v = Math.round(Number(n));
  return v >= 4 ? 4 : v === 3 ? 3 : 2;
}

export function versusMode(n: number) {
  return VERSUS_MODES.find((m) => m.n === clampPlayers(n))!;
}

export interface DuelSeat {
  name: string;
  score: number;
  have: number;
  /** This seat forfeited (VZDAŤ, idle, declared out): it can no longer win, its stack stays in the bank. */
  out?: boolean;
}

export interface Duel {
  kind: DuelKind;
  mode: DuelMode;
  need: number;
  have: number;
  /** Hot-seat: the seat on the phone now. */
  turn: number;
  /** Online: my seat (0 = host). */
  you: number;
  /** 2..4 seats, seat 0 = host / HRÁČ 1. */
  seats: DuelSeat[];
  phase: DuelPhase;
  bet: number;
  room?: string;
  /** My last spin, hidden until the opponent reaches the same k. */
  held: number;
  /** Last seat that forfeited (2 seats: the forfeit that ended the duel). */
  forfeit: number | null;
  /** Opponent is inside PARKNET on the current spin (2 seats). */
  peerNet?: boolean;
  /** Per seat "busy" heartbeat flag (3-4 seats). */
  nets?: boolean[];
  /** The game (not a player) ended the duel early, e.g. the room vanished: each seat keeps its own stack. */
  aborted?: boolean;
}

export interface DuelLink {
  room: string;
  role: "host" | "guest";
  /** Seat in the room (0 = host). Known for a guest once the join claimed a slot. */
  seat?: number;
  /** Room size (2 when missing: rooms of older builds). */
  players?: number;
  name: string;
  mode: DuelMode;
  bet: number;
  need: number;
  ante: boolean;
}

const CODE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeRoomCode(): string {
  let out = "";
  for (let i = 0; i < 4; i++) out += CODE[Math.floor(Math.random() * CODE.length)]!;
  return out;
}

export function rtcRoom(code: string): string {
  return `duel${code.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}`.slice(0, 64);
}

function seat(name: string): DuelSeat {
  return { name: name.trim().slice(0, 16) || "HRÁČ", score: 0, have: 0 };
}

const copySeats = (d: Duel): DuelSeat[] => d.seats.map((s) => ({ ...s }));

export function startDuel(opts: {
  mode: DuelMode;
  a?: string;
  b?: string;
  /** All seat names (3-4 player VERSUS); overrides a/b. */
  names?: string[];
  bet: number;
  kind?: DuelKind;
  you?: number;
  room?: string;
  need?: number;
}): Duel {
  const need = opts.need && opts.need > 0 ? Math.round(opts.need) : opts.mode === "live" ? 1 : 10;
  const list = opts.names && opts.names.length >= 2 ? opts.names.slice(0, MAX_SEATS) : [opts.a ?? "", opts.b ?? ""];
  return {
    kind: opts.kind ?? "hotseat",
    mode: opts.mode,
    need,
    have: 0,
    turn: 0,
    you: opts.you ?? 0,
    seats: list.map((n, i) => seat(n || `HRÁČ ${i + 1}`)),
    phase: "play",
    bet: Math.max(0.01, opts.bet),
    room: opts.room,
    held: 0,
    forfeit: null,
    peerNet: false,
  };
}

function actor(d: Duel, seatN?: number): number {
  if (seatN !== undefined) return seatN;
  return d.kind === "online" ? d.you : d.turn;
}

/** Seats still able to win. */
export function liveSeats(d: Duel): number[] {
  return d.seats.map((_, i) => i).filter((i) => !d.seats[i]!.out);
}

/** Every seat has played its spins (an out seat counts as finished), or only one seat is left standing. */
export function allFinished(d: Pick<Duel, "seats" | "need">): boolean {
  const standing = d.seats.filter((s) => !s.out);
  if (d.seats.length > 2 && standing.length <= 1) return true;
  return d.seats.every((s) => s.out || s.have >= d.need);
}

/** Hot-seat: the next seat (after `from`) that still has to play, or null. */
export function nextSeat(d: Duel, from = d.turn): number | null {
  for (let i = from + 1; i < d.seats.length; i++) {
    const s = d.seats[i]!;
    if (!s.out && s.have < d.need) return i;
  }
  return null;
}

export function tickDuel(d: Duel, cash: number, seatN?: number): Duel {
  if (d.phase !== "play") return d;
  const who = actor(d, seatN);
  const seats = copySeats(d);
  seats[who] = {
    ...seats[who]!,
    score: +(seats[who]!.score + Math.max(0, cash)).toFixed(2),
    have: seats[who]!.have + 1,
  };
  if (d.kind === "online") {
    const done = allFinished({ seats, need: d.need });
    return {
      ...d,
      seats,
      have: seats[d.you]!.have,
      held: 0,
      phase: done ? "done" : "play",
    };
  }
  const have = seats[who]!.have;
  if (have < d.need) return { ...d, seats, have };
  const next = { ...d, seats, have };
  return nextSeat(next, who) == null ? { ...next, phase: "done" } : { ...next, phase: "swap" };
}

/** A peer seat's progress from the room (2 seats: `seatN` defaults to the other seat). */
export function applyPeerTick(d: Duel, have: number, score: number, seatN?: number): Duel {
  if (d.kind !== "online") return d;
  const other = seatN ?? (d.you === 0 ? 1 : 0);
  if (other === d.you || !d.seats[other]) return d;
  const seats = copySeats(d);
  seats[other] = { ...seats[other]!, have: Math.max(seats[other]!.have, have), score };
  const done = allFinished({ seats, need: d.need });
  return {
    ...d,
    seats,
    held: 0,
    phase: d.phase === "play" && done ? "done" : d.phase,
  };
}

export function confirmSwap(d: Duel): Duel {
  if (d.phase !== "swap") return d;
  const next = nextSeat(d);
  if (next == null) return { ...d, phase: "done" };
  return { ...d, turn: next, have: d.seats[next]!.have, phase: "play" };
}

/** Seats with the top score among those still standing (2+ = a tie at the top). Empty before the end. */
export function duelLeaders(d: Duel): number[] {
  if (d.phase !== "done") return [];
  const live = liveSeats(d);
  if (live.length === 0) return [];
  const top = Math.max(...live.map((i) => d.seats[i]!.score));
  return live.filter((i) => d.seats[i]!.score === top);
}

/** The single winner, or null (tie at the top / not finished / aborted). */
export function duelWinner(d: Duel): number | null {
  if (d.aborted) return null;
  const l = duelLeaders(d);
  return l.length === 1 ? l[0]! : null;
}

export function duelPot(d: Duel): number {
  return +d.seats.reduce((a, s) => a + s.score, 0).toFixed(2);
}

/**
 * Wins were not paid into credit. The winner takes the whole bank (every seat's wins). A tie at the top
 * splits the bank between the tied seats (2 seats: each gets its own back, as before). A forfeited seat
 * gets nothing, its stack stays in the bank. Aborted by the game: each seat keeps its own.
 */
export function duelCreditDelta(d: Duel, seatN: number): number {
  if (d.aborted) return d.seats[seatN]?.score ?? 0;
  if (d.seats[seatN]?.out) return 0;
  const leaders = duelLeaders(d);
  const k = leaders.indexOf(seatN);
  if (k < 0) return 0;
  const pot = duelPot(d);
  const cents = Math.round(pot * 100);
  const share = Math.floor(cents / leaders.length);
  // Odd cents of a split go to the first tied seat, so the shares always add up to the bank.
  const mine = k === 0 ? cents - share * (leaders.length - 1) : share;
  return +(mine / 100).toFixed(2);
}

/**
 * A seat forfeits. 2 seats: the duel ends, the other seat takes the bank. 3-4 seats: that seat is out
 * (its stack stays in the bank) and the rest play on; the duel ends when one seat is left standing.
 * Online, my own forfeit ends the duel for me (I am out, nothing to collect).
 */
export function forfeitDuel(d: Duel, seatN: number): Duel {
  const n = d.seats.length;
  if (n <= 2) {
    const seats = d.seats.map((s, i) => ({ ...s, have: Math.max(s.have, d.need), ...(i === seatN ? { out: true } : {}) }));
    return { ...d, seats, have: d.need, phase: "done", held: 0, forfeit: seatN, peerNet: false };
  }
  const seats = copySeats(d);
  if (!seats[seatN]) return d;
  seats[seatN] = { ...seats[seatN]!, out: true, have: Math.max(seats[seatN]!.have, d.need) };
  const base: Duel = { ...d, seats, held: 0, forfeit: seatN };
  if (allFinished(base) || (d.kind === "online" && seatN === d.you)) {
    return {
      ...base,
      seats: allFinished(base) ? seats.map((s) => ({ ...s, have: Math.max(s.have, d.need) })) : seats,
      have: d.need,
      phase: "done",
      peerNet: false,
    };
  }
  if (d.kind === "hotseat" && seatN === d.turn && d.phase === "play") {
    const next = nextSeat(base, seatN);
    return next == null ? { ...base, phase: "done" } : { ...base, phase: "swap" };
  }
  return base;
}

export function canDuelSpin(d: Duel): boolean {
  if (d.phase !== "play") return false;
  if (d.kind !== "online") return !d.seats[d.turn]?.out;
  const me = d.seats[d.you];
  return Boolean(me && !me.out && me.have < d.need);
}

/** Your spins, your score, the best other score. Waiting only after you finish and another seat still plays. */
export function duelView(d: Duel): { k: number; mine: number; peer: number; waiting: boolean } {
  const me = d.kind === "online" ? d.you : d.turn;
  const k = d.seats[me]?.have ?? 0;
  const mine = d.seats[me]?.score ?? 0;
  const others = d.seats.filter((_, i) => i !== me);
  const peerScore = others.length ? Math.max(...others.map((s) => s.score)) : 0;
  const waiting =
    d.kind === "online" &&
    d.phase === "play" &&
    (d.seats[d.you]?.have ?? 0) >= d.need &&
    others.some((s) => !s.out && s.have < d.need);
  return { k, mine, peer: peerScore, waiting };
}

export function duelLeft(d: Duel): number {
  const who = d.kind === "online" ? d.you : d.turn;
  return Math.max(0, d.need - (d.seats[who]?.have ?? 0));
}

export function duelMineDone(d: Duel): boolean {
  return (d.seats[d.you]?.have ?? 0) >= d.need;
}

/** Server view of a room, enough to reconcile a local duel (subset of DuelSnap). */
export interface DuelRoomView {
  /** 2-seat rooms: the seat the row marks out (host_out / guest_out). */
  forfeit: number | null;
  hostHave: number;
  hostScore: number;
  guestHave: number;
  guestScore: number;
  /** 3-4 seat rooms: every seat (out = forfeited). */
  seats?: { have: number; score: number; out?: boolean }[];
}

/**
 * Bring a local online duel in line with the room row. A forfeit recorded on the server wins over
 * a local finish (the row is the single place all clients write to), otherwise the peer seats are
 * refreshed from the row. Hot-seat duels are returned unchanged.
 */
export function reconcileDuel(d: Duel, room: DuelRoomView): Duel {
  if (d.kind !== "online") return d;
  if (d.seats.length > 2 && room.seats && room.seats.length >= d.seats.length) {
    let next: Duel = { ...d, seats: copySeats(d) };
    room.seats.slice(0, d.seats.length).forEach((r, i) => {
      if (i === d.you) return;
      next.seats[i] = { ...next.seats[i]!, have: Math.max(next.seats[i]!.have, r.have), score: r.score };
    });
    const mine = room.seats[d.you];
    if (mine?.out && !next.seats[d.you]!.out) next.seats[d.you] = { ...next.seats[d.you]!, score: mine.score };
    for (let i = 0; i < room.seats.length && i < d.seats.length; i++) {
      if (room.seats[i]!.out && !next.seats[i]!.out) next = forfeitDuel({ ...next, phase: next.phase === "done" ? "play" : next.phase }, i);
    }
    if (next.phase === "done" && next.seats[d.you]!.out) return next;
    const done = allFinished(next);
    return { ...next, phase: done ? "done" : next.phase === "done" ? "play" : next.phase, held: 0 };
  }
  const peer = d.you === 0 ? 1 : 0;
  const peerHave = peer === 0 ? room.hostHave : room.guestHave;
  const peerScore = peer === 0 ? room.hostScore : room.guestScore;
  const seats = copySeats(d);
  seats[peer] = { ...seats[peer]!, have: Math.max(seats[peer]!.have, peerHave), score: peerScore };
  const synced: Duel = { ...d, seats };
  if (room.forfeit != null) return forfeitDuel({ ...synced, phase: "play", forfeit: null, seats: seats.map((s) => ({ ...s, out: false })) }, room.forfeit);
  if (d.forfeit != null) return synced;
  const done = seats[0]!.have >= d.need && seats[1]!.have >= d.need;
  return { ...synced, phase: done ? "done" : d.phase === "done" ? "play" : d.phase, held: 0 };
}

/** One id per duel and seat, so a duel is credited at most once per player. */
export function duelSettleKey(d: Duel, startedAt: number): string {
  return `${d.kind}:${d.room ?? "local"}:${d.you}:${startedAt}`;
}

/** Result of a finished duel from the `you` seat (hot-seat: seat 0 = HRÁČ 1). */
export function duelOutcome(d: Duel): {
  result: "win" | "loss" | "draw";
  forfeit: "me" | "peer" | null;
  pot: number;
  credit: number;
} {
  const pot = duelPot(d);
  const meOut = Boolean(d.seats[d.you]?.out);
  const forfeit = d.forfeit == null ? null : meOut ? "me" : "peer";
  const leaders = d.aborted ? [] : duelLeaders(d);
  const result = d.aborted ? "draw" : leaders.length === 1 ? (leaders[0] === d.you ? "win" : "loss") : leaders.includes(d.you) ? "draw" : leaders.length === 0 ? "draw" : "loss";
  // Hot-seat: one wallet, the whole bank comes back to it whoever wins.
  const credit = d.kind === "hotseat" ? pot : duelCreditDelta(d, d.you);
  return { result, forfeit, pot, credit };
}

/** The idle timer: blanks 1..limit-1 score a 0 spin, the limit-th blank forfeits. */
export function blankStep(blanks: number, limit = 3): { blanks: number; forfeit: boolean } {
  const next = Math.max(0, blanks) + 1;
  return { blanks: next, forfeit: next >= limit };
}

/** Peer liveness: the 90 s no-progress clock only runs while the peer is idle (not busy in a round/banner). */
export function peerFrozen(opts: {
  now: number;
  idleSince: number;
  peerBusy: boolean;
  mine: number;
  theirs: number;
  need: number;
  limitMs?: number;
}): boolean {
  if (opts.peerBusy) return false;
  if (opts.theirs >= opts.need) return false;
  if (!(opts.mine > opts.theirs)) return false;
  if (!(opts.idleSince > 0)) return false;
  return opts.now - opts.idleSince > (opts.limitMs ?? 90_000);
}

/** How long a win banner stays inside a duel round. Never "wait for a tap": a duel round must not stall. */
export function duelBannerMs(kind: string | null | undefined): number {
  if (kind === "massive" || kind === "max") return 6000;
  if (kind === "fsTotal") return 4000;
  return 2800;
}

/**
 * The new-build reload must wait for a duel: the duel is not saved, so a reload mid-duel loses the held-back
 * wins and ends in a forfeit. It is held while a duel round runs, while the lobby is open, and until a started
 * duel is finished and paid out on this device.
 */
export function duelHoldsReload(s: { duel: Duel | null; lobby: boolean; paid: boolean; roundRunning: boolean }): boolean {
  if (s.roundRunning) return true;
  if (s.lobby) return true;
  if (!s.duel) return false;
  return !(s.duel.phase === "done" && s.paid);
}

/** The game failed (not a player): end the duel, each seat keeps its own stack (like a tie). */
export function abortDuel(d: Duel): Duel {
  if (d.phase === "done") return d;
  return { ...d, phase: "done", held: 0, forfeit: null, peerNet: false, aborted: true };
}
