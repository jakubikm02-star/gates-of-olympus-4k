/**
 * PARKVOLT SPEKTRUM art pack v1.1 (public/spektrum, WebP). Nothing here loads at startup:
 * the files are requested only once the colour layer is on (NEKONEČNO), see SpektrumDock.
 * Bump SPEK_ART_V when a file changes; vercel.json caches /spektrum/*?v= as immutable.
 */
export const SPEK_ART_V = 1;

const url = (name: string) => `/spektrum/${name}.webp?v=${SPEK_ART_V}`;

/** Index = colour id from spectrum.ts COLORS (0–6), 7 ŽIVÁ VODA (white), 8 ČIERNA DIERA (black). */
const CAN_NAMES = ["red", "orange", "yellow", "green", "blue", "indigo", "violet", "white", "black"] as const;
export const SPEK_CAN: readonly string[] = CAN_NAMES.map((c) => url(`can-${c}`));

export function spekCanSrc(color: number | null | undefined): string | null {
  return color != null && color >= 0 && color < SPEK_CAN.length ? SPEK_CAN[color] : null;
}

export const SPEK_RING = {
  base: url("ring-base"),
  center: url("ring-center"),
  /** Index = colour id 0–6 (red first, clockwise). */
  segs: [1, 2, 3, 4, 5, 6, 7].map((k) => url(`ring-seg-${k}`)),
} as const;

/** Index = weather 0 calm, 1 normal, 2 storm. */
export const SPEK_WEATHER: readonly string[] = ["pokojny", "bezny", "burka"].map((w) => url(`weather-${w}`));

export const SPEK_FX = { white: url("fx-ziva-voda"), black: url("fx-cierna-diera") } as const;

/** Files worth warming once the layer is on: today's three cans plus the two rare events. */
export function spekWarmList(colorIds: readonly number[]): string[] {
  const cans = [...new Set(colorIds)].map((id) => spekCanSrc(id)).filter((s): s is string => Boolean(s));
  return [...cans, SPEK_CAN[7], SPEK_CAN[8], SPEK_FX.white, SPEK_FX.black];
}
