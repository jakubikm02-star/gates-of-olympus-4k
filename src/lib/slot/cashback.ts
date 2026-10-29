/**
 * CASHBACK BONUS (Martin, 28. 10. 2026): VERNOSŤ (Spektrum colour 6) collects a multiplier for the next bar bonus
 * (KONTROLA · Ž-BOX · KOLESO, grouped in the game as „Cashback bonus“).
 *
 * - Good face: +0,5× stored, capped at +2,0× (the bonus then pays at most ×3).
 * - Bad face: −0,5× (floor 0). With nothing stored the old streak reset („SÉRIA 0“) applies instead.
 * - Stored in SpectrumState (PlayerSave.spectrum, a JSON blob): survives day change, reloads and save moves.
 * - Consumed by the first natural bar bonus that pays (> 0), applied to the gross after the 30× cap and the gold
 *   uplift, before the tax period (applyMod) and SUCHO. Never in a duel, never on a bought / granted bonus,
 *   only while Spektrum runs (rank NEKONEČNO) — lower ranks keep it stored and untouched.
 * - Tickets („best bonus“) keep counting the bonus x without cashback.
 */

export const CASHBACK_STEP = 0.5;
export const CASHBACK_CAP = 2;

/** Stored bonus multiplier from a save: 0 … CAP in 0,5 steps. Old saves: 0. */
export function sanitizeCashback(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(CASHBACK_CAP, Math.round(n / CASHBACK_STEP) * CASHBACK_STEP);
}

/** Good VERNOSŤ: +STEP up to CAP. Returns the new value and what was actually added (0 at the cap). */
export function addCashback(stored: number): { next: number; delta: number } {
  const cur = sanitizeCashback(stored);
  const next = Math.min(CASHBACK_CAP, cur + CASHBACK_STEP);
  return { next, delta: +(next - cur).toFixed(2) };
}

/** Bad VERNOSŤ: −STEP (floor 0). Nothing stored → `streakReset` (the pre-cashback penalty). */
export function cutCashback(stored: number): { next: number; delta: number; streakReset: boolean } {
  const cur = sanitizeCashback(stored);
  if (cur <= 0) return { next: 0, delta: 0, streakReset: true };
  const next = Math.max(0, cur - CASHBACK_STEP);
  return { next, delta: +(next - cur).toFixed(2), streakReset: false };
}

export interface CashbackGate {
  stored: number;
  /** Rank of the player when the bonus pays. Only NEKONEČNO (Spektrum) uses it. */
  rankId: string;
  /** Spektrum kill switch. */
  enabled: boolean;
  /** VERSUS / duel round (escrow). */
  duel: boolean;
  /** Bonus came from the bar itself (not bought, not granted by admin / test tools). */
  natural: boolean;
}

/** Multiplier this bar bonus pays with (1 = no cashback). */
export function cashbackMulFor(g: CashbackGate): number {
  if (!g.enabled || g.duel || !g.natural || g.rankId !== "nekonecno") return 1;
  const m = sanitizeCashback(g.stored);
  return m > 0 ? 1 + m : 1;
}

/** Gross with cashback. `mul` from cashbackMulFor. Rounded to cents like every other payout. */
export function applyCashback(gross: number, mul: number): { gross: number; extra: number; used: boolean; mul: number } {
  if (!(gross > 0) || !(mul > 1)) return { gross, extra: 0, used: false, mul: 1 };
  const out = +(gross * mul).toFixed(2);
  return { gross: out, extra: +(out - gross).toFixed(2), used: true, mul };
}

/** „×1,5“ — the bonus multiplier for a stored value (1 + stored). */
export function cashbackLabel(stored: number): string {
  const m = 1 + sanitizeCashback(stored);
  return `×${Number.isInteger(m) ? String(m) : m.toFixed(1).replace(".", ",")}`;
}

export const CASHBACK_GROUP = "CASHBACK BONUS";

/**
 * One bar bonus payout against the stored value: the gross it pays and what stays stored.
 * Used → 0 (consumed once). Not used (gate closed or the bonus paid 0) → unchanged.
 */
export function takeCashback(stored: number, gate: Omit<CashbackGate, "stored">, gross: number): { gross: number; extra: number; stored: number } {
  const r = applyCashback(gross, cashbackMulFor({ ...gate, stored }));
  return { gross: r.gross, extra: r.extra, stored: r.used ? 0 : sanitizeCashback(stored) };
}
