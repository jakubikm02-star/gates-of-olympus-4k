/**
 * ZÁSAH police lights, drawn into one small canvas instead of eight full-screen GPU layers.
 *
 * The old CSS version (four rotating fog layers ~2700 px wide, two rotating beams, two opacity
 * groups and a radial mask over the whole window) made the compositor blend ~8 screen-sized
 * surfaces every frame. On a PC without hardware acceleration (or a weak iGPU at 1440p) that alone
 * pulled ZÁSAH to 8–16 fps. Here the same textures, the same motion curves and the same mask are
 * painted into a canvas at a fraction of the window resolution (the haze is a blur, nothing is lost)
 * and the browser scales one texture up. Pure geometry/timing lives in this file so it can be tested.
 */

/** full: every frame · lite: smaller canvas, ~20 fps · still: one frozen frame · static: prefers-reduced-motion look. */
export type SmogTier = "full" | "lite" | "still" | "static";

export type SmogLevels = { lo: number; hi: number; beam: number };

/** Side opacity range and beam opacity, same values as the old police-smog.css. */
export function smogLevels(phone: boolean, full: boolean, danger: boolean): SmogLevels {
  if (phone) {
    if (full) return { lo: 0.2, hi: danger ? 1 : 0.72, beam: 0.3 };
    return { lo: 0.09, hi: 0.32, beam: 0.13 };
  }
  if (full) return danger ? { lo: 0.2, hi: 1, beam: 0.42 } : { lo: 0.28, hi: 0.95, beam: 0.42 };
  return { lo: 0.12, hi: 0.42, beam: 0.18 };
}

/** CSS `ease-in-out` = cubic-bezier(0.42, 0, 0.58, 1). */
export function easeInOut(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // Solve bezier x(t) = x by Newton, then return y(t).
  const p1 = 0.42;
  const p2 = 0.58;
  const bx = (t: number) => 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
  const dbx = (t: number) => 3 * (1 - t) * (1 - t) * p1 + 6 * (1 - t) * t * (p2 - p1) + 3 * t * t * (1 - p2);
  let t = x;
  for (let i = 0; i < 6; i++) {
    const d = dbx(t);
    if (Math.abs(d) < 1e-6) break;
    t -= (bx(t) - x) / d;
    t = Math.min(1, Math.max(0, t));
  }
  return 3 * (1 - t) * t * t + t * t * t; // y control points 0, 1
}

/** Directed progress (0..1) of an `alternate` / `alternate-reverse` CSS animation after `phase` iterations. */
export function alternate(phase: number, reverse = false): number {
  const n = Math.floor(phase);
  const u = phase - n;
  const back = (n % 2 === 1) !== reverse;
  return back ? 1 - u : u;
}

/** Old `ps-alt`: lo → hi → lo, ease-in-out per half. `phase` counts cycles. */
export function sideAlpha(phase: number, lv: SmogLevels): number {
  const u = phase - Math.floor(phase);
  return u < 0.5 ? lv.lo + (lv.hi - lv.lo) * easeInOut(u / 0.5) : lv.hi + (lv.lo - lv.hi) * easeInOut((u - 0.5) / 0.5);
}

type Key = { x: number; y: number; r: number; s: number }; // x/y in vmax, r in deg
const DRIFT_A: Key[] = [
  { x: 0, y: 0, r: 0, s: 1 },
  { x: 7, y: 5, r: 48, s: 1.12 },
  { x: 3, y: 11, r: 105, s: 0.95 },
];
const DRIFT_B: Key[] = [
  { x: 0, y: 0, r: 0, s: 1.05 },
  { x: 5, y: -6, r: -40, s: 0.92 },
  { x: 9, y: -2, r: -85, s: 1.1 },
];

/** Old `ps-drift-a/b` keyframes (0 / 50 / 100 %, ease-in-out per interval) at directed progress p. */
export function drift(which: "a" | "b", p: number): Key {
  const k = which === "a" ? DRIFT_A : DRIFT_B;
  const seg = p < 0.5 ? 0 : 1;
  const u = easeInOut(seg === 0 ? p / 0.5 : (p - 0.5) / 0.5);
  const a = k[seg];
  const b = k[seg + 1];
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, r: a.r + (b.r - a.r) * u, s: a.s + (b.s - a.s) * u };
}

export type Fog = { img: 0 | 1 | 2 | 3; cx: number; cy: number; size: number; rot: number; scale: number };
export type Beam = { img: 0 | 1; px: number; py: number; w: number; h: number; rot: number; alpha: number };
export type SmogFrame = { sides: { alpha: number; fogs: Fog[]; beam: Beam | null }[] };

/** Animation clock: every motion is a phase (iterations) advanced by dt / duration, so danger can speed up without a jump. */
export type SmogClock = { alt: number; beamL: number; beamR: number; t: number };
export const newSmogClock = (): SmogClock => ({ alt: 0, beamL: 0, beamR: 0, t: 0 });

export function advanceSmogClock(c: SmogClock, dtMs: number, danger: boolean): SmogClock {
  const dt = Math.max(0, Math.min(dtMs, 100)) / 1000;
  return {
    alt: c.alt + dt / (danger ? 0.9 : 1.8),
    beamL: c.beamL + dt / (danger ? 3.6 : 6.5),
    beamR: c.beamR + dt / (danger ? 3.6 : 7.5),
    t: c.t + dt,
  };
}

/**
 * Geometry of one frame in CSS px of the smog box (w × h). `phone` = the old ≤720 px rules.
 * `statik` = prefers-reduced-motion: no motion, no beams, no second fog, fixed side opacity.
 */
export function smogFrame(c: SmogClock, w: number, h: number, o: { phone: boolean; full: boolean; danger: boolean; statik: boolean }): SmogFrame {
  const vmax = Math.max(w, h) / 100;
  const vh = h / 100;
  const lv = smogLevels(o.phone, o.full, o.danger);
  const fogSize = o.phone ? 92 * vmax : Math.max(720, 92 * vmax);
  const beamW = o.phone ? 125 * vmax : Math.max(960, 125 * vmax);
  const beamH = beamW * (o.phone ? 42 / 125 : 322 / 960);
  const fog = (img: Fog["img"], cx: number, cy: number, k: Key): Fog => ({ img, cx: cx + k.x * vmax, cy: cy + k.y * vmax, size: fogSize, rot: k.r, scale: k.s });
  const still = (which: "a" | "b") => drift(which, 0);
  const red: Fog[] = [fog(0, -4 * vmax, 12 * vmax, o.statik ? still("a") : drift("a", alternate(c.t / 17)))];
  const blue: Fog[] = [fog(2, w + 4 * vmax, h - 12 * vmax, o.statik ? still("a") : drift("a", alternate(c.t / 19, true)))];
  if (!o.statik) {
    red.push(fog(1, 0, 26 * vh + 46 * vmax, drift("b", alternate(c.t / 23))));
    blue.push(fog(3, w, h - 26 * vh - 46 * vmax, drift("b", alternate(c.t / 21, true))));
  }
  const sweep = (from: number, to: number, phase: number) => from + (to - from) * easeInOut(alternate(phase));
  const staticAlpha = o.full ? 0.55 : 0.26;
  return {
    sides: [
      {
        alpha: o.statik ? staticAlpha : sideAlpha(c.alt, lv),
        fogs: red,
        beam: o.statik ? null : { img: 0, px: 0, py: 0, w: beamW, h: beamH, rot: sweep(14, 72, c.beamL), alpha: lv.beam },
      },
      {
        // blue runs half a cycle behind red (animation-delay: -cycle / 2)
        alpha: o.statik ? staticAlpha : sideAlpha(c.alt + 0.5, lv),
        fogs: blue,
        beam: o.statik ? null : { img: 1, px: w, py: 0, w: beamW, h: beamH, rot: sweep(166, 108, c.beamR), alpha: lv.beam },
      },
    ],
  };
}

/**
 * Old mask: radial-gradient(ellipse 52% 44% at 50% 46%, α .1 at 0, .42 at 55 %, 1 at 100 %).
 * Returns the mask alpha at (x, y) of a w × h box (used by tests; the canvas uses a gradient).
 */
export function maskAlpha(x: number, y: number, w: number, h: number): number {
  const dx = (x - 0.5 * w) / (0.52 * w);
  const dy = (y - 0.46 * h) / (0.44 * h);
  const d = Math.hypot(dx, dy);
  if (d >= 1) return 1;
  return d <= 0.55 ? 0.1 + (0.32 * d) / 0.55 : 0.42 + (0.58 * (d - 0.55)) / 0.45;
}

/** Canvas backing size: the haze is a blur, so a fraction of the CSS size is enough. Lite halves it again. */
export function smogCanvasSize(w: number, h: number, tier: SmogTier): { cw: number; ch: number; k: number } {
  const small = tier !== "full";
  const frac = small ? 0.2 : 0.4;
  const cap = small ? 420 : 900;
  const k = Math.min(frac, cap / Math.max(1, w), cap / Math.max(1, h));
  return { cw: Math.max(1, Math.round(w * k)), ch: Math.max(1, Math.round(h * k)), k };
}

/** Lite repaints the haze at ~20 fps (it drifts over 17–23 s cycles, so it still reads as smooth); full follows the display. */
export const SMOG_LITE_FRAME_MS = 48;
