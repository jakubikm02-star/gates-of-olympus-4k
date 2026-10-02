/** Rank frame assets: public/ranks/*.svg (scripts/gen-rank-frames.mjs). */

const ROMAN = ["", "i", "ii", "iii", "iv"] as const;
export const RANK_FRAME_V = 1;

/** base = still metal · rich = still gold/glass · lux = shimmer · elite = glow + signal · apex = halo + embers. */
export type FrameTier = "base" | "rich" | "lux" | "elite" | "apex";

const TIER: Record<string, FrameTier> = {
  kredit: "base",
  sloboda: "base",
  smart: "base",
  telka: "rich",
  optika: "rich",
  duo: "lux",
  fiveg: "elite",
  nekonecno: "apex",
};

export function frameTier(id: string): FrameTier {
  return TIER[id] ?? "base";
}

export function frameMoves(id: string): boolean {
  const t = frameTier(id);
  return t === "lux" || t === "elite" || t === "apex";
}

/** `division` 4…1 for IV…I; 0 for single-division ranks. */
export function rankFrameSrc(id: string, division = 0): string {
  const known = id in TIER ? id : "kredit";
  if (known === "fiveg" || known === "nekonecno") return `/ranks/${known}.svg?v=${RANK_FRAME_V}`;
  const d = Math.min(4, Math.max(1, division || 4));
  return `/ranks/${known}-${ROMAN[d]}.svg?v=${RANK_FRAME_V}`;
}

export const RANK_HALO_SRC = `/ranks/nekonecno-halo.svg?v=${RANK_FRAME_V}`;
