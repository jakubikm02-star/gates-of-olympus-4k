/** Shared PARK POOL math — client + server. */

export const POOL_SEED = 2500;
export const POOL_TAKE = 0.012;
export const POOL_CAP = 18000;
export const POOL_ADD_MAX = 12;
const BASE_DROP = 1 / 480;

export interface PoolSnap {
  pool: number;
  hits: number;
  lastHit: number;
  hit: boolean;
  payout: number;
}

export function parseMoney(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.round(n * 100) / 100);
}

export function contribution(stake: number): number {
  const raw = Math.max(0, stake) * POOL_TAKE;
  return Math.min(POOL_ADD_MAX, Math.max(0.01, Math.round(raw * 100) / 100));
}

export function dropChance(tickets: number, bet: number): number {
  const tix = Math.max(1, Math.min(8, tickets));
  const stake = Math.min(2.2, 0.62 + 0.32 * Math.log2(1 + Math.max(0, bet)));
  return Math.min(0.07, BASE_DROP * tix * stake);
}

export function shouldDrop(pool: number, tickets: number, bet: number, rng: () => number): boolean {
  if (pool >= POOL_CAP) return true;
  return rng() < dropChance(tickets, bet);
}

export function applyDrop(pool: number): { payout: number; next: number } {
  const payout = Math.max(0, Math.round(pool * 100) / 100);
  return { payout, next: POOL_SEED };
}

export function emptySnap(): PoolSnap {
  return { pool: POOL_SEED, hits: 0, lastHit: 0, hit: false, payout: 0 };
}
