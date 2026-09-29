export const HEAT_MAX = 100;
export const PURSUIT_SPINS = 10;

/** Segments from a win. Dead spins add nothing. Bigger multiples fill faster, one hit never clears the bar. */
export function heatFromWin(winX: number): number {
  if (!(winX > 0)) return 0;
  if (winX >= 200) return 40;
  if (winX >= 100) return 28;
  if (winX >= 50) return 18;
  if (winX >= 25) return 12;
  if (winX >= 10) return 7;
  if (winX >= 5) return 4;
  if (winX >= 2) return 2;
  return 1;
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
