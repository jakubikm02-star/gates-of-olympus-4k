/** Four operator pots. One table. Hidden threshold, never mystery-on-tumble. */

export const POOL_ELIGIBLE_BET = 100;
export const RESERVE_RATE = 0.003;
export const PARK_COLLECT = 3;

export type TierId = "ulica" | "okres" | "kraj" | "stat";

export interface TierDef {
  id: TierId;
  name: string;
  seed: number;
  cap: number;
  contrib: number;
  winnerShare: number;
}

export const TIERS: readonly TierDef[] = [
  { id: "ulica", name: "ULICA", seed: 500, cap: 1_800, contrib: 0.008, winnerShare: 1 },
  { id: "okres", name: "OKRES", seed: 4_000, cap: 14_000, contrib: 0.006, winnerShare: 1 },
  { id: "kraj", name: "KRAJ", seed: 28_000, cap: 90_000, contrib: 0.005, winnerShare: 1 },
  { id: "stat", name: "ŠTÁT", seed: 120_000, cap: 220_000, contrib: 0.004, winnerShare: 0.7 },
] as const;

export const TIER_BY_ID: Record<TierId, TierDef> = {
  ulica: TIERS[0],
  okres: TIERS[1],
  kraj: TIERS[2],
  stat: TIERS[3],
};

export const POOL_SEED = TIER_BY_ID.stat.seed;

export interface TierSnap {
  id: TierId;
  pool: number;
  hits: number;
  lastHit: number;
  hit: boolean;
  payout: number;
}

export interface JackpotHit {
  id: TierId;
  name: string;
  payout: number;
  table: number;
}

export interface BoardSnap {
  pots: Record<TierId, TierSnap>;
  reserve: number;
  hits: JackpotHit[];
  credit: number;
}

function round2(n: number): number {
  return Math.max(0, Math.round(n * 100) / 100);
}

export function parseMoney(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return round2(n);
}

export function isEligibleBet(bet: number): boolean {
  return bet >= POOL_ELIGIBLE_BET;
}

export function hiddenFloor(tier: TierDef): number {
  return round2(tier.seed + 0.15 * (tier.cap - tier.seed));
}

export function rollHidden(tier: TierDef, rng: () => number): number {
  const lo = hiddenFloor(tier);
  return round2(lo + rng() * (tier.cap - lo));
}

export function isTierHot(tier: TierDef, pool: number): boolean {
  if (tier.id === "stat") return pool >= 140_000;
  const span = tier.cap - tier.seed;
  if (span <= 0) return false;
  return (pool - tier.seed) / span >= 0.7;
}

export function emptyPots(): Record<TierId, TierSnap> {
  return {
    ulica: { id: "ulica", pool: 500, hits: 0, lastHit: 0, hit: false, payout: 0 },
    okres: { id: "okres", pool: 4_000, hits: 0, lastHit: 0, hit: false, payout: 0 },
    kraj: { id: "kraj", pool: 28_000, hits: 0, lastHit: 0, hit: false, payout: 0 },
    stat: { id: "stat", pool: 120_000, hits: 0, lastHit: 0, hit: false, payout: 0 },
  };
}

export function emptyBoard(): BoardSnap {
  return { pots: emptyPots(), reserve: 0, hits: [], credit: 0 };
}

export function contribution(stake: number): number {
  if (stake <= 0) return 0;
  return round2(stake * TIERS.reduce((s, t) => s + t.contrib, 0));
}

export function reserveTake(stake: number): number {
  if (stake <= 0) return 0;
  return round2(stake * RESERVE_RATE);
}

export interface SimPot {
  id: TierId;
  pool: number;
  hidden: number;
  hits: number;
}

/** 3 players × N resolved spins. Hidden threshold, no mystery p. */
export function simulateTable(spins: number, players = 3, bet = 100, rng: () => number = Math.random): SimPot[] {
  const pots: SimPot[] = TIERS.map((t) => ({
    id: t.id,
    pool: t.seed,
    hidden: rollHidden(t, rng),
    hits: 0,
  }));
  for (let s = 0; s < spins; s++) {
    for (let p = 0; p < players; p++) {
      for (let i = 0; i < TIERS.length; i++) {
        const t = TIERS[i];
        const pot = pots[i];
        pot.pool = round2(Math.min(t.cap, pot.pool + bet * t.contrib));
        if (pot.pool >= pot.hidden) {
          pot.hits += 1;
          pot.pool = t.seed;
          pot.hidden = rollHidden(t, rng);
        }
      }
    }
  }
  return pots;
}
