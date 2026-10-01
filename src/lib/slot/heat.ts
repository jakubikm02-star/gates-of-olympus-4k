export const HEAT_MAX = 100;

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
