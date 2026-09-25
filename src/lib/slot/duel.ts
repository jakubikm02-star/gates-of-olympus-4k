export type DuelMode = "spins" | "live";
export type DuelPhase = "play" | "swap" | "done";
export type DuelKind = "hotseat" | "online";

export interface DuelSeat {
  name: string;
  score: number;
  have: number;
}

export interface Duel {
  kind: DuelKind;
  mode: DuelMode;
  need: number;
  have: number;
  turn: 0 | 1;
  you: 0 | 1;
  seats: [DuelSeat, DuelSeat];
  phase: DuelPhase;
  bet: number;
  room?: string;
  /** My last spin, hidden until the opponent reaches the same k. */
  held: number;
  /** Seat that forfeited. Their stack stays, the other takes the pot. */
  forfeit: 0 | 1 | null;
  /** Opponent is inside PARKNET on the current spin. */
  peerNet?: boolean;
}

export interface DuelLink {
  room: string;
  role: "host" | "guest";
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

export function startDuel(opts: {
  mode: DuelMode;
  a: string;
  b: string;
  bet: number;
  kind?: DuelKind;
  you?: 0 | 1;
  room?: string;
  need?: number;
}): Duel {
  const need = opts.need && opts.need > 0 ? Math.round(opts.need) : opts.mode === "live" ? 1 : 10;
  return {
    kind: opts.kind ?? "hotseat",
    mode: opts.mode,
    need,
    have: 0,
    turn: 0,
    you: opts.you ?? 0,
    seats: [seat(opts.a || "HRÁČ 1"), seat(opts.b || "HRÁČ 2")],
    phase: "play",
    bet: Math.max(0.01, opts.bet),
    room: opts.room,
    held: 0,
    forfeit: null,
    peerNet: false,
  };
}

function actor(d: Duel, seatN?: 0 | 1): 0 | 1 {
  if (seatN !== undefined) return seatN;
  return d.kind === "online" ? d.you : d.turn;
}

export function tickDuel(d: Duel, cash: number, seatN?: 0 | 1): Duel {
  if (d.phase !== "play") return d;
  const who = actor(d, seatN);
  const seats: [DuelSeat, DuelSeat] = [{ ...d.seats[0] }, { ...d.seats[1] }];
  seats[who] = {
    ...seats[who],
    score: +(seats[who].score + Math.max(0, cash)).toFixed(2),
    have: seats[who].have + 1,
  };
  if (d.kind === "online") {
    const done = seats[0].have >= d.need && seats[1].have >= d.need;
    return {
      ...d,
      seats,
      have: seats[d.you].have,
      held: 0,
      phase: done ? "done" : "play",
    };
  }
  const have = seats[who].have;
  if (have < d.need) return { ...d, seats, have };
  if (who === 0) return { ...d, seats, have, phase: "swap" };
  return { ...d, seats, have, phase: "done" };
}

export function applyPeerTick(d: Duel, have: number, score: number): Duel {
  if (d.kind !== "online") return d;
  const other: 0 | 1 = d.you === 0 ? 1 : 0;
  const seats: [DuelSeat, DuelSeat] = [{ ...d.seats[0] }, { ...d.seats[1] }];
  seats[other] = { ...seats[other], have: Math.max(seats[other].have, have), score };
  const done = seats[0].have >= d.need && seats[1].have >= d.need;
  return {
    ...d,
    seats,
    held: 0,
    phase: d.phase === "play" && done ? "done" : d.phase,
  };
}

export function confirmSwap(d: Duel): Duel {
  if (d.phase !== "swap") return d;
  return { ...d, turn: 1, have: 0, phase: "play" };
}

export function duelWinner(d: Duel): 0 | 1 | null {
  if (d.phase !== "done") return null;
  if (d.seats[0].score > d.seats[1].score) return 0;
  if (d.seats[1].score > d.seats[0].score) return 1;
  return null;
}

export function duelPot(d: Duel): number {
  return +(d.seats[0].score + d.seats[1].score).toFixed(2);
}

/** Wins were not paid into credit. Winner takes both. Tie returns each their own. Forfeit gives the pot to the other seat. */
export function duelCreditDelta(d: Duel, seat: 0 | 1): number {
  if (d.forfeit != null) return seat === d.forfeit ? 0 : duelPot(d);
  const w = duelWinner(d);
  if (w === null) return d.seats[seat].score;
  return seat === w ? duelPot(d) : 0;
}

export function forfeitDuel(d: Duel, seat: 0 | 1): Duel {
  const seats: [DuelSeat, DuelSeat] = [
    { ...d.seats[0], have: Math.max(d.seats[0].have, d.need) },
    { ...d.seats[1], have: Math.max(d.seats[1].have, d.need) },
  ];
  return { ...d, seats, have: d.need, phase: "done", held: 0, forfeit: seat, peerNet: false };
}

export function canDuelSpin(d: Duel): boolean {
  if (d.phase !== "play") return false;
  if (d.kind !== "online") return true;
  return d.seats[d.you].have < d.need;
}

/** Your spins and both scores. Waiting only after you finish and the other seat is still playing. */
export function duelView(d: Duel): { k: number; mine: number; peer: number; waiting: boolean } {
  const peer: 0 | 1 = d.you === 0 ? 1 : 0;
  const k = d.kind === "online" ? d.seats[d.you].have : d.seats[d.turn].have;
  const mine = d.kind === "online" ? d.seats[d.you].score : d.seats[d.turn].score;
  const peerScore = d.kind === "online" ? d.seats[peer].score : d.seats[d.turn === 0 ? 1 : 0].score;
  const waiting =
    d.kind === "online" && d.phase === "play" && d.seats[d.you].have >= d.need && d.seats[peer].have < d.need;
  return { k, mine, peer: peerScore, waiting };
}

export function duelLeft(d: Duel): number {
  const who = d.kind === "online" ? d.you : d.turn;
  return Math.max(0, d.need - d.seats[who].have);
}

export function duelMineDone(d: Duel): boolean {
  return d.seats[d.you].have >= d.need;
}
