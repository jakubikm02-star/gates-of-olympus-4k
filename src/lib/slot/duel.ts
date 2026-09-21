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
}

export interface DuelLink {
  room: string;
  role: "host" | "guest";
  name: string;
  mode: DuelMode;
  bet: number;
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
}): Duel {
  return {
    kind: opts.kind ?? "hotseat",
    mode: opts.mode,
    need: opts.mode === "live" ? 1 : 10,
    have: 0,
    turn: 0,
    you: opts.you ?? 0,
    seats: [seat(opts.a || "HRÁČ 1"), seat(opts.b || "HRÁČ 2")],
    phase: "play",
    bet: Math.max(0.01, opts.bet),
    room: opts.room,
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
    return { ...d, seats, have: seats[d.you].have, phase: done ? "done" : "play" };
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
  return { ...d, seats, phase: d.phase === "play" && done ? "done" : d.phase };
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

/** Winner already has their own wins in credit; they collect the other seat's score. Loser pays theirs back. */
export function duelCreditDelta(d: Duel, seat: 0 | 1): number {
  const w = duelWinner(d);
  if (w === null) return 0;
  if (seat === w) return d.seats[seat === 0 ? 1 : 0].score;
  return -d.seats[seat].score;
}

export function duelLeft(d: Duel): number {
  const who = d.kind === "online" ? d.you : d.turn;
  return Math.max(0, d.need - d.seats[who].have);
}

export function duelMineDone(d: Duel): boolean {
  return d.seats[d.you].have >= d.need;
}
