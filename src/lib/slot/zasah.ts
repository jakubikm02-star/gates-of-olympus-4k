import { COLS, PAY_SYMBOLS, type Cell, type PayId } from "./symbols.ts";

/** Chase boost is 1.3, not 1.5, so the feature stays under a 98% RTP. */
export const ZASAH = {
  SPINS: 10,
  COST_X: 1,
  BOOST: 1.3,
  HITS: 4,
  STRIKES: 3,
  LOCK_P: 0.105,
  FS_P: 0.067,
  WINDOWS: [1, 1, 1, 2, 2, 2, 2, 3, 3, 3] as const,
  MOD_SPINS: 15,
  ESCAPE_MUL: 1.23,
  UNIK_MUL: 0.77,
  RP: { escape: 40, neutral: 10, unik: -30 },
} as const;

export type ChaseOutcome = "escape" | "unik" | "neutral";
export type ChaseModKind = "bezDane" | "danUrad";

export interface ChaseState {
  spin: number;
  target: PayId | null;
  hits: number;
  strikes: number;
}

export interface ChaseMod {
  kind: ChaseModKind;
  left: number;
}

export interface HackWindow {
  cell: number;
  hover: number;
  result: "hit" | "fs" | "miss";
  lock: boolean;
}

export function rollTarget(rng: () => number): PayId {
  return PAY_SYMBOLS[Math.floor(rng() * PAY_SYMBOLS.length)].id;
}

export function windowCount(spinIdx: number): 1 | 2 | 3 {
  const i = Math.min(ZASAH.WINDOWS.length - 1, Math.max(0, spinIdx));
  return ZASAH.WINDOWS[i];
}

function ortho(cell: number): number[] {
  const r = Math.floor(cell / COLS);
  const c = cell % COLS;
  const out: number[] = [];
  if (r > 0) out.push((r - 1) * COLS + c);
  if (r < 4) out.push((r + 1) * COLS + c);
  if (c > 0) out.push(r * COLS + (c - 1));
  if (c < COLS - 1) out.push(r * COLS + (c + 1));
  return out;
}

export function rollWindows(
  rng: () => number,
  board: Cell[][],
  s: ChaseState,
  n: number,
): { windows: HackWindow[]; next: ChaseState; outcome: "escape" | "unik" | null } {
  const cells = Array.from({ length: 30 }, (_, i) => i);
  const take = Math.min(n, cells.length);
  for (let i = 0; i < take; i += 1) {
    const j = i + Math.floor(rng() * (cells.length - i));
    const swap = cells[i];
    cells[i] = cells[j];
    cells[j] = swap;
  }
  let hits = s.hits;
  let strikes = s.strikes;
  const windows: HackWindow[] = [];
  let outcome: "escape" | "unik" | null = null;
  for (let i = 0; i < take; i += 1) {
    if (outcome) break;
    const cell = cells[i];
    const neighbors = ortho(cell);
    const hover = neighbors[Math.floor(rng() * neighbors.length)];
    const row = board[Math.floor(cell / COLS)];
    const tile = row?.[cell % COLS];
    const natural = tile?.kind === "pay" && tile.payId === s.target;
    if (rng() < ZASAH.FS_P) {
      strikes += 1;
      windows.push({ cell, hover, result: "fs", lock: false });
      if (strikes >= ZASAH.STRIKES) outcome = "unik";
    } else if (rng() < ZASAH.LOCK_P || natural) {
      hits += 1;
      windows.push({ cell, hover, result: "hit", lock: !natural });
      if (hits >= ZASAH.HITS) outcome = "escape";
    } else {
      windows.push({ cell, hover, result: "miss", lock: false });
    }
  }
  return { windows, next: { ...s, hits, strikes }, outcome };
}

export function modMul(m: ChaseMod | null): number {
  if (!m || m.left <= 0) return 1;
  return m.kind === "bezDane" ? ZASAH.ESCAPE_MUL : ZASAH.UNIK_MUL;
}

export function tickMod(m: ChaseMod | null): ChaseMod | null {
  if (!m) return null;
  if (m.left <= 1) return null;
  return { kind: m.kind, left: m.left - 1 };
}
