/**
 * SUCHO RTP (sucho2): while SUCHO runs (4KA TV league and up, SUCHO_GRACE paid spins without a shielding ticket),
 * the game pays at SUCHO_RTP ≈ 96 % (Pragmatic standard) instead of its normal ~137–179 % (measured below).
 *
 * Mechanism: one payout multiplier per rank and stake kind, SUCHO_RTP / normal RTP, measured on the production
 * code with scripts/feature-sim/sucho-sim.ts (20 M paid spins × 2 seeds per rank and ante, bought bonuses per
 * free-spin count). It is fixed by the paid spin and applies to everything that spin pays:
 *  - the spin itself (clusters, tumbles, cans, the 4KA TV trigger), ZÁSAH spins and the dead-spin rebate,
 *  - a natural 4KA TV it triggers (every free spin, locked at the trigger, even if SUCHO ends meanwhile),
 *  - the bar bonus it fills (KONTROLA / Ž-BOX / KOLESO, also a golden one).
 * A 4KA TV buy during SUCHO pays with its own multiplier (SUCHO_RTP / buy RTP), the price stays: buying is
 * never a way out of the 96 %. Jackpots, ticket payouts, rank drops and duels are not touched.
 * Gameplay reads the win before SUCHO (heat bar, RP, ticket goals, bonus bar), so outside the credits nothing
 * changes and the RTP during SUCHO is exactly multiplier × normal RTP. Outside SUCHO the multiplier is 1.
 */
import { SUCHO_GRACE, suchoLeague } from "./rp-tickets.ts";

/** Target return while SUCHO runs. */
export const SUCHO_RTP = 0.96;

export type SuchoPayKind = "base" | "ante" | "buy";

/**
 * Normal RTP without SUCHO (jackpots, tickets and the daily ZLATÝ BONUS left out). base / ante: paid game per
 * stake, 3 × 20 M spins (seeds 101, 102, 201); buy: bought 4KA TV per price, 400 k bonuses per free-spin count (15 / 16 / 17).
 * Raw runs: /workspace/sucho2/sim. Ranks below 4KA TV have no SUCHO and no entry.
 */
export const SUCHO_RTP_MEASURED: Readonly<Record<string, Readonly<Record<SuchoPayKind, number>>>> = {
  telka: { base: 1.3666, ante: 1.4957, buy: 0.9901 },
  optika: { base: 1.3894, ante: 1.5212, buy: 0.9901 },
  duo: { base: 1.4198, ante: 1.5703, buy: 0.9732 },
  fiveg: { base: 1.4172, ante: 1.5750, buy: 0.9732 },
  nekonecno: { base: 1.5929, ante: 1.7908, buy: 1.1047 },
};

/** Payout multiplier during SUCHO for this rank and stake kind (≤ 1; 1 where SUCHO does not apply). */
export function suchoPayMul(rankId: string, kind: SuchoPayKind): number {
  const r = SUCHO_RTP_MEASURED[rankId];
  if (!r || !(r[kind] > 0)) return 1;
  return Math.min(1, Math.round((SUCHO_RTP / r[kind]) * 10_000) / 10_000);
}

/** SUCHO is in its penalty phase: league with SUCHO, counter past the grace, no ticket holding it. */
export function suchoActive(s: { rankId: string; idle: number; shielded: boolean }): boolean {
  return suchoLeague(s.rankId) && !s.shielded && Math.max(0, s.idle) >= SUCHO_GRACE;
}

/** Credited amount (cents) of a win `cash` paid with multiplier `mul`; delta ≤ 0 for the display. */
export function suchoCash(cash: number, mul: number): { net: number; delta: number } {
  if (!(cash > 0) || !(mul > 0) || mul >= 1) return { net: cash, delta: 0 };
  const net = +(cash * mul).toFixed(2);
  return { net, delta: +(net - cash).toFixed(2) };
}

/** Multiplier saved with a bonus / free-spin session: anything not a number in (0, 1] is 1. */
export function sanitizeSuchoMul(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 && raw < 1 ? Math.round(raw * 10_000) / 10_000 : 1;
}

/** Normal paid-game RTP span over the SUCHO ranks (base … ante), e.g. "137–179 %". */
export function suchoNormalRange(): string {
  const v = Object.values(SUCHO_RTP_MEASURED).flatMap((r) => [r.base, r.ante]);
  return `${Math.round(Math.min(...v) * 100)}–${Math.round(Math.max(...v) * 100)} %`;
}

/** "RTP 96 %" label. */
export function suchoRtpLabel(): string {
  return `RTP ${Math.round(SUCHO_RTP * 100)} %`;
}
