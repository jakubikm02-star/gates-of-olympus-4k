export type DuelMode = "spins" | "live";
export type DuelPhase = "play" | "swap" | "done";

export interface DuelSeat {
  name: string;
  score: number;
}

export interface Duel {
  mode: DuelMode;
  need: number;
  have: number;
  turn: 0 | 1;
  seats: [DuelSeat, DuelSeat];
  phase: DuelPhase;
  bet: number;
}

export function startDuel(opts: {
  mode: DuelMode;
  a: string;
  b: string;
  bet: number;
}): Duel {
  const a = opts.a.trim().slice(0, 16) || "HRÁČ 1";
  const b = opts.b.trim().slice(0, 16) || "HRÁČ 2";
  return {
    mode: opts.mode,
    need: opts.mode === "live" ? 1 : 10,
    have: 0,
    turn: 0,
    seats: [
      { name: a, score: 0 },
      { name: b, score: 0 },
    ],
    phase: "play",
    bet: Math.max(0.01, opts.bet),
  };
}

export function tickDuel(d: Duel, cash: number): Duel {
  if (d.phase !== "play") return d;
  const seats: [DuelSeat, DuelSeat] = [
    { ...d.seats[0] },
    { ...d.seats[1] },
  ];
  seats[d.turn] = {
    ...seats[d.turn],
    score: +(seats[d.turn].score + Math.max(0, cash)).toFixed(2),
  };
  const have = d.have + 1;
  if (have < d.need) return { ...d, seats, have };
  if (d.turn === 0) return { ...d, seats, have, phase: "swap" };
  return { ...d, seats, have, phase: "done" };
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

export function duelLeft(d: Duel): number {
  return Math.max(0, d.need - d.have);
}
