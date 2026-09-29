export const HEAT_MAX = 100;
export const PURSUIT_SPINS = 10;

/** Only a win adds a segment. A dead spin adds nothing, whatever the stake. */
export function heatFromSpin(winX: number, _bet: number): number {
  if (winX > 0) return 1;
  return 0;
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
