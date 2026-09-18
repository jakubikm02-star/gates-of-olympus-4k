/** Local operator PARK POOL — one currency, one pot. */

export const POOL_SEED = 500;
export const POOL_CAP = 10_000;
export const POOL_MUST = 8_000;
export const POOL_HOT = 7_000;
export const POOL_ELIGIBLE_BET = 100;
export const POOL_TAKE_BASE = 0.015;
export const POOL_TAKE_ANTE = 0.02;
export const POOL_TAKE_FEED = 0.005;
export const POOL_RESERVE = 0.003;
export const PARK_COLLECT = 3;

export interface PoolSnap {
  pool: number;
  hits: number;
  lastHit: number;
  hit: boolean;
  payout: number;
  reserve: number;
}

export interface PoolFeed {
  stake: number;
  ante: boolean;
  eligible: boolean;
  force: boolean;
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

export function contribution(stake: number, opts: { ante?: boolean; reduced?: boolean } = {}): number {
  if (stake <= 0) return 0;
  const rate = opts.reduced ? POOL_TAKE_FEED : opts.ante ? POOL_TAKE_ANTE : POOL_TAKE_BASE;
  return round2(stake * rate);
}

export function reserveTake(stake: number): number {
  if (stake <= 0) return 0;
  return round2(stake * POOL_RESERVE);
}

/** Mystery p after resolve. RTP-neutral: contribution / pot. ~1/1667 at 2500/100. */
export function mysteryChance(
  pool: number,
  opts: { eligible: boolean; ante?: boolean; stake?: number },
): number {
  if (!opts.eligible) return 0;
  if (pool >= POOL_CAP) return 1;
  if (pool >= POOL_MUST) {
    const t = (pool - POOL_MUST) / (POOL_CAP - POOL_MUST);
    return Math.min(1, 0.002 + 0.998 * t);
  }
  const stake = opts.stake && opts.stake > 0 ? opts.stake : POOL_ELIGIBLE_BET;
  const add = contribution(stake, { ante: opts.ante });
  if (pool <= 0 || add <= 0) return 0;
  let p = add / pool;
  if (opts.ante) p *= 1.35;
  return Math.min(0.004, p);
}

export function shouldDrop(
  pool: number,
  opts: { eligible: boolean; ante?: boolean; force?: boolean; skip?: boolean; stake?: number },
  rng: () => number,
): boolean {
  if (opts.force) return pool > 0;
  if (opts.skip) return false;
  if (pool >= POOL_CAP && opts.eligible) return true;
  return rng() < mysteryChance(pool, opts);
}

export function applyDrop(pool: number, reserve = 0): { payout: number; next: number; reserve: number } {
  const payout = round2(pool);
  const drip = round2(Math.max(0, reserve));
  return { payout, next: round2(Math.max(POOL_SEED, POOL_SEED + drip)), reserve: 0 };
}

export function emptySnap(): PoolSnap {
  return { pool: POOL_SEED, hits: 0, lastHit: 0, hit: false, payout: 0, reserve: 0 };
}

export function isPoolHot(pool: number): boolean {
  return pool >= POOL_HOT;
}
