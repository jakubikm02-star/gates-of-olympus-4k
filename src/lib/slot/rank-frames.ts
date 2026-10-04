/** Rank frame assets: public/ranks/*.svg (scripts/gen-rank-frames.mjs). */
import { MACHINE_AI, MACHINE_AI_V as MACHINE_AI_V_ } from "./machine-ai-frames.ts";

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

export const MACHINE_FRAME_V = 2;

/** Reel-cabinet hero corner for a rank tier (public/machine/*.svg, scripts/gen-machine-frames.mjs). */
export function machineFrameSrc(id: string, division = 0): string {
  const known = id in TIER ? id : "kredit";
  if (known === "fiveg" || known === "nekonecno") return `/machine/${known}.svg?v=${MACHINE_FRAME_V}`;
  const d = Math.min(4, Math.max(1, division || 4));
  return `/machine/${known}-${ROMAN[d]}.svg?v=${MACHINE_FRAME_V}`;
}

/** Repeating side tile of the cabinet; tiers II/I (and the master ranks) get the richer tile. */
export function machineTileSrc(id: string, division = 0, axis: "h" | "v" = "h"): string {
  const known = id in TIER ? id : "kredit";
  const master = known === "fiveg" || known === "nekonecno";
  const rich = !master && division > 0 && division <= 2 ? "2" : "";
  return `/machine/${known}-${axis}${rich}.svg?v=${MACHINE_FRAME_V}`;
}

/* ---------- AI raster cabinet (public/machine-ai, scripts/gen-machine-ai-frames.py) ----------
   One 9-slice sheet per rank family; divisions IV…I are told apart in code (frameDivisionLook).
   The SVG cabinet above stays as the fallback until / unless the sheet loads. */

export { MACHINE_AI_V } from "./machine-ai-frames.ts";

/** Same query as the CSS that swaps in the half-size sheet (phones, small tablets). */
export const MACHINE_AI_MOBILE_Q = "(max-width: 820px)";

/** Full-res (PC) or half-size (`m`, phones) 9-slice sheet of the rank family's reel frame. */
export function machineAiSrc(id: string, size: "hi" | "m" = "hi"): string {
  const known = id in MACHINE_AI ? id : "kredit";
  return `/machine-ai/${known}${size === "m" ? "-m" : ""}.webp?v=${MACHINE_AI_V_}`;
}

export interface FrameLook {
  /** CSS saturate() */
  sat: number;
  /** CSS brightness() */
  bri: number;
  /** 0…1 strength of the accent glow around the frame */
  glow: number;
}

const DIV_LOOK: Record<number, FrameLook> = {
  4: { sat: 0.78, bri: 0.86, glow: 0 },
  3: { sat: 0.9, bri: 0.93, glow: 0 },
  2: { sat: 1, bri: 1, glow: 0.3 },
  1: { sat: 1.12, bri: 1.05, glow: 0.65 },
};

/** IV is the dullest, I the brightest; master ranks (single division) get the strongest look. */
export function frameDivisionLook(id: string, division = 0): FrameLook {
  const known = id in TIER ? id : "kredit";
  if (known === "fiveg" || known === "nekonecno" || !division) return { sat: 1.18, bri: 1.08, glow: 1 };
  return DIV_LOOK[Math.min(4, Math.max(1, division))];
}
