import { COLS, FS_SYMBOL, PAY_SYMBOLS, SCATTER, type Cell, type PayId } from "./symbols.ts";

/** Chase boost is 2×: every ZÁSAH spin win (tumble/cascade included) pays double. */
export const ZASAH = {
  SPINS: 10,
  COST_X: 1,
  BOOST: 2,
  HITS: 4,
  STRIKES: 3,
  LOCK_P: 0.105,
  WINDOWS: [1, 1, 1, 2, 2, 2, 2, 3, 3, 3] as const,
  MOD_SPINS: 15,
  ESCAPE_MUL: 1.23,
  UNIK_MUL: 0.77,
  RP: { escape: 40, neutral: 10, unik: -30 },
} as const;

/** A symbol Finančná správa takes over for one ZÁSAH: any pay symbol or the 4KA TV scatter. */
export type FsSymId = PayId | "scatter";

/**
 * Draw weights for the FS symbol at chase start. Equal by default; tune here.
 * The strike chance per window follows how often that symbol is on the final board,
 * so the cheap symbols are the most dangerous and 4KA TV (rarest) the safest.
 */
export const FS_DRAW: readonly { id: FsSymId; w: number }[] = [
  ...PAY_SYMBOLS.map((p) => ({ id: p.id as FsSymId, w: 1 })),
  { id: "scatter", w: 1 },
];

export function rollFsSymbol(rng: () => number): FsSymId {
  let total = 0;
  for (const d of FS_DRAW) total += d.w;
  let r = rng() * total;
  for (const d of FS_DRAW) {
    r -= d.w;
    if (r < 0) return d.id;
  }
  return FS_DRAW[FS_DRAW.length - 1].id;
}

export function fsSymName(id: FsSymId): string {
  if (id === "scatter") return SCATTER.name;
  return PAY_SYMBOLS.find((p) => p.id === id)?.name ?? id;
}

export function fsSymSrc(id: FsSymId): string {
  if (id === "scatter") return SCATTER.src;
  return PAY_SYMBOLS.find((p) => p.id === id)?.src ?? FS_SYMBOL.src;
}

/** True when this cell is the symbol Finančná správa holds this ZÁSAH. */
export function isFsCell(cell: Cell | undefined, fsSym: FsSymId | null | undefined): boolean {
  if (!cell || !fsSym) return false;
  if (fsSym === "scatter") return cell.kind === "scatter";
  return cell.kind === "pay" && cell.payId === fsSym;
}

export type ChaseOutcome = "escape" | "unik" | "neutral";
export type ChaseModKind = "bezDane" | "danUrad";

export interface ChaseState {
  spin: number;
  target: PayId | null;
  hits: number;
  strikes: number;
  /** Symbol swapped to Finančná správa for the whole chase. Drawn once at the start. */
  fsSym?: FsSymId | null;
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

/** The target is never the FS symbol: 8 choices when FS holds a pay symbol, 9 when it holds 4KA TV. */
export function rollTarget(rng: () => number, fsSym?: FsSymId | null): PayId {
  const pool = fsSym && fsSym !== "scatter" ? PAY_SYMBOLS.filter((p) => p.id !== fsSym) : PAY_SYMBOLS;
  return pool[Math.floor(rng() * pool.length)].id;
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
    // A window on the FS symbol is a strike. It wins over the lock-on roll.
    if (isFsCell(tile, s.fsSym)) {
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

/**
 * Where a payout or a spin comes from, for the BEZ DANE / DAŇOVÝ ÚNIK period:
 * base = paid base spin, fs = free spin inside 4KA TV (triggered or bought), buy = the bought 4KA TV
 * entry spin, pick = KONTROLA payout, chase = ZÁSAH spin (has its own BOOST), duel = duel spin (escrow).
 */
export type ModScope = "base" | "fs" | "buy" | "pick" | "chase" | "duel";

/** Scope of one spin. Order matters: ZÁSAH first, then a duel round (also its free spins), then fs / buy / base. */
export function roundModScope(r: { chasing: boolean; duel: boolean; free: boolean; buy: boolean }): ModScope {
  if (r.chasing) return "chase";
  if (r.duel) return "duel";
  if (r.free) return "fs";
  if (r.buy) return "buy";
  return "base";
}

/** The ±23 % hits every payout while the period runs, except ZÁSAH chase spins and duel spins. */
export function modApplies(scope: ModScope): boolean {
  return scope !== "chase" && scope !== "duel";
}

/** Every played spin counts the period down, free spins included. KONTROLA is no spin (its trigger spin already counted). */
export function modTicks(scope: ModScope): boolean {
  return scope === "base" || scope === "fs" || scope === "buy";
}

/** Payout after the period modifier, rounded to cents; delta = net − gross (display). */
export function applyMod(gross: number, m: ChaseMod | null, scope: ModScope): { net: number; delta: number } {
  const mul = modApplies(scope) ? modMul(m) : 1;
  const net = +(gross * mul).toFixed(2);
  return { net, delta: +(net - gross).toFixed(2) };
}

/** One spin of the period: the modifier it pays with, and the period left after it. */
export function stepMod(m: ChaseMod | null, scope: ModScope): { mul: number; next: ChaseMod | null } {
  const mul = modApplies(scope) ? modMul(m) : 1;
  return { mul, next: modTicks(scope) ? tickMod(m) : m };
}

function readNum(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** Old saves stored pursuitLeft instead of chaseSpin. An invalid target is dropped. */
export function readChaseFields(raw: Record<string, unknown>): {
  chaseSpin: number;
  chaseTarget: PayId | null;
  chaseHits: number;
  chaseStrikes: number;
  chaseFsSym: FsSymId | null;
} {
  const ids = new Set(PAY_SYMBOLS.map((p) => p.id));
  const hadChase = Object.prototype.hasOwnProperty.call(raw, "chaseSpin");
  let chaseSpin = -1;
  if (hadChase) chaseSpin = Math.min(10, Math.max(-1, Math.floor(readNum(raw.chaseSpin, -1))));
  else if (Math.floor(readNum(raw.pursuitLeft, 0)) > 0) chaseSpin = 0;
  const targetOk = typeof raw.chaseTarget === "string" && ids.has(raw.chaseTarget as PayId);
  const fsOk = raw.chaseFsSym === "scatter" || (typeof raw.chaseFsSym === "string" && ids.has(raw.chaseFsSym as PayId));
  const fsSym = chaseSpin >= 0 && fsOk ? (raw.chaseFsSym as FsSymId) : null;
  return {
    chaseSpin,
    chaseTarget: chaseSpin >= 0 && targetOk && raw.chaseTarget !== fsSym ? (raw.chaseTarget as PayId) : null,
    chaseHits: chaseSpin >= 0 ? Math.min(3, Math.max(0, Math.floor(readNum(raw.chaseHits, 0)))) : 0,
    chaseStrikes: chaseSpin >= 0 ? Math.min(2, Math.max(0, Math.floor(readNum(raw.chaseStrikes, 0)))) : 0,
    chaseFsSym: fsSym,
  };
}

/** 4KA TV triggered by a ZÁSAH spin: every free-spin win of that bonus pays this many times. */
export const ZASAH_FS_MUL = 2;

/**
 * Whether a 4KA TV starting now is a ZÁSAH bonus (×2): the spin that triggered it was a ZÁSAH spin.
 * Never for a bought bonus and never in a duel (ZÁSAH does not run there anyway).
 */
export function fsZasahArmed(r: { triggerChasing: boolean; bought: boolean; duel: boolean }): boolean {
  return r.triggerChasing && !r.bought && !r.duel;
}

/**
 * One free spin's payout in bet multiples. Order (fixed, tested):
 * gross X (clusters × Mbps) → ×2 ZÁSAH → MAX WIN cap → tax period ±23 % (applyMod, on the capped amount).
 * The ×2 is applied once per free spin; the trigger spin keeps its own ZÁSAH BOOST (also 2×) instead.
 */
export function fsSpinX(x: number, zasah: boolean, remainX: number): { paidX: number; hitMax: boolean } {
  let paidX = Math.max(0, x) * (zasah ? ZASAH_FS_MUL : 1);
  let hitMax = false;
  if (paidX >= remainX) {
    paidX = Math.max(0, remainX);
    hitMax = true;
  }
  return { paidX, hitMax };
}
