export const HEAT_MAX = 100;
export const PURSUIT_SPINS = 10;

/** Same ceiling as KONTROLA: at most +2 per spin, so 100 takes at least 50 spins. */
export function heatFromSpin(winX: number, bet: number): number {
  let n = 0;
  if (bet >= 100) n += 1;
  if (winX >= 3) n += 1;
  return Math.min(2, n);
}

export function rollPursuit(rng: () => number, soft: boolean): "hack" | "tow" | "ride" {
  const x = rng();
  const tow = soft ? 0.1 : 0.18;
  if (x < 0.16) return "hack";
  if (x < 0.16 + tow) return "tow";
  return "ride";
}

export function escapeRp(tows: number, hacks: number): number {
  if (tows <= 0) return 80;
  return Math.min(60, 25 + hacks * 12);
}

export function klientGain(bet: number, perfect: boolean, hacks: number): number {
  return Math.max(1, Math.round(bet * (perfect ? 4 : 1))) + hacks * 20;
}
