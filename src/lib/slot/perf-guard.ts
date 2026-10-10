/**
 * Auto "lite" mode for slow / hot phones. The reel driver reports the mean frame interval of every
 * spin; after a few slow spins in a row the heavy decorative effects (reel mask, column filters,
 * breathing glows, visualizer quality) switch off for the rest of the session, so the reels keep
 * their frame rate instead of the decoration. Pure state machine + a tiny store; no timers.
 */
export const LITE_SLOW_MS = 26; // mean frame interval during a spin (≈ 38 fps)
export const LITE_ENTER = 3; // consecutive slow spins → lite on
export const LITE_EXIT_MS = 18; // ≈ 55 fps even with lite on: the device is fine again
export const LITE_EXIT = 20; // consecutive fast spins → lite off
export const MIN_FRAMES = 12; // shorter samples are noise (skip / instant spins)

export type PerfGuardState = { lite: boolean; slow: number; fast: number };

export const initialPerfGuard: PerfGuardState = { lite: false, slow: 0, fast: 0 };

export function stepPerfGuard(s: PerfGuardState, meanFrameMs: number, frames: number): PerfGuardState {
  if (!(frames >= MIN_FRAMES) || !Number.isFinite(meanFrameMs) || meanFrameMs <= 0) return s;
  if (!s.lite) {
    const slow = meanFrameMs >= LITE_SLOW_MS ? s.slow + 1 : 0;
    return slow >= LITE_ENTER ? { lite: true, slow: 0, fast: 0 } : { lite: false, slow, fast: 0 };
  }
  const fast = meanFrameMs <= LITE_EXIT_MS ? s.fast + 1 : 0;
  return fast >= LITE_EXIT ? { lite: false, slow: 0, fast: 0 } : { lite: true, slow: 0, fast };
}

let state: PerfGuardState = initialPerfGuard;
/** Set by `?fx=` (see forceFx): the automatic switches stay off. */
let forced = false;
/** ZÁSAH haze frozen (see reportFxFps). */
let still = false;
const subs = new Set<() => void>();

/** One finished reel spin: mean interval of its animation frames (ms) and how many frames it had. */
export function reportSpinFrames(meanFrameMs: number, frames: number): void {
  if (forced) return;
  const next = stepPerfGuard(state, meanFrameMs, frames);
  const flip = next.lite !== state.lite;
  state = next;
  if (!state.lite) still = false;
  if (flip) for (const fn of subs) fn();
}

export function isPerfLite(): boolean {
  return state.lite;
}

export function subscribePerfLite(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

/* ── ZÁSAH FX watch ──────────────────────────────────────────────────────────────────────────────
 * The spin-based guard above needs three slow spins. ZÁSAH draws its police lights, glows and HUD
 * between spins too, so while it is on screen the effects themselves sample the frame rate: a median
 * below 40 fps over a 2 s window switches to lite right away (same exit rule as above). */
export const FX_WINDOW_MS = 2000;
export const FX_MIN_FPS = 40;
/** The first frames after ZÁSAH mounts (image decode, layout) are not the steady state. */
export const FX_WARMUP_MS = 800;

export type FpsWindow = { start: number; last: number; dts: number[] };
export const newFpsWindow = (): FpsWindow => ({ start: 0, last: 0, dts: [] });

/**
 * Feed one frame timestamp. Returns the window's median fps once `FX_WINDOW_MS` of frames are in
 * (and starts a new window), else null. A gap over 1 s (hidden tab, a paused loop) restarts the window;
 * anything shorter is a real (slow) frame and counts.
 */
export const FX_GAP_MS = 1000;
export function stepFpsWindow(w: FpsWindow, now: number): number | null {
  if (!w.last || now - w.last > FX_GAP_MS || now < w.last) {
    w.start = now;
    w.last = now;
    w.dts = [];
    return null;
  }
  w.dts.push(now - w.last);
  w.last = now;
  if (now - w.start < FX_WINDOW_MS) return null;
  const s = [...w.dts].sort((a, b) => a - b);
  const mid = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  w.start = now;
  w.dts = [];
  return mid > 0 ? 1000 / mid : null;
}

/** Already lite and still under this → the police lights stop moving too (one still frame). */
export const FX_STILL_FPS = 30;

/**
 * A finished FX window (median fps). Below `FX_MIN_FPS` → lite on. Already lite and below
 * `FX_STILL_FPS` → the ZÁSAH haze freezes as well. No-op when forced by `?fx=`.
 */
export function reportFxFps(medianFps: number): void {
  if (forced || !(medianFps > 0)) return;
  if (!state.lite) {
    if (medianFps >= FX_MIN_FPS) return;
    state = { lite: true, slow: 0, fast: 0 };
  } else {
    if (still || medianFps >= FX_STILL_FPS) return;
    still = true;
  }
  for (const fn of subs) fn();
}

/** The ZÁSAH haze is frozen (lowest FX step). Cleared when lite turns off again. */
export function isFxStill(): boolean {
  return still && state.lite;
}

/** `?fx=full|lite|still` (QA, support): pin the mode for this page load; the auto switches stay off. */
export function forceFx(mode: "lite" | "full" | "still" | null): void {
  forced = mode !== null;
  const lite = mode === "lite" || mode === "still";
  still = mode === "still";
  if (forced) {
    state = { lite, slow: 0, fast: 0 };
    for (const fn of subs) fn();
  }
}
if (typeof location !== "undefined") {
  const m = /[?&]fx=(lite|full|still)\b/.exec(location.search);
  if (m) forceFx(m[1] as "lite" | "full" | "still");
}

/** Tests only. */
export function resetPerfGuard(): void {
  state = initialPerfGuard;
  forced = false;
  still = false;
}
