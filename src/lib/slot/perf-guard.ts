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
const subs = new Set<() => void>();

/** One finished reel spin: mean interval of its animation frames (ms) and how many frames it had. */
export function reportSpinFrames(meanFrameMs: number, frames: number): void {
  const next = stepPerfGuard(state, meanFrameMs, frames);
  const flip = next.lite !== state.lite;
  state = next;
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

/** Tests only. */
export function resetPerfGuard(): void {
  state = initialPerfGuard;
}
