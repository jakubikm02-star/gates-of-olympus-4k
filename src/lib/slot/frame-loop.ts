/**
 * One shared requestAnimationFrame loop for the whole game.
 *
 * Every per-frame job (reel driver, timed waits, debug HUD sampler, bed visualizer, count-ups) subscribes
 * here instead of running its own rAF chain, so the browser sees exactly one rAF callback per frame and
 * every job reads the same frame timestamp. The loop only runs while someone is subscribed.
 *
 * Nothing here assumes a refresh rate: jobs get the frame timestamp and the real interval since the last
 * frame and must derive motion from time, so a 60, 90, 120 or 144 Hz display simply gets more, smaller
 * steps. (There is no web API to ask for a refresh rate; the browser picks it.)
 */

/** Return `false` to unsubscribe from inside the callback. */
export type FrameJob = (now: number, dt: number) => void | boolean;

type Raf = (cb: (t: number) => void) => number;
type Caf = (id: number) => void;

export type FrameLoopStats = {
  /** Jobs subscribed right now. */
  jobs: number;
  /** Jobs run in the last frame / the most in one frame since the last reset. */
  ranLast: number;
  ranMax: number;
  /** Frames the loop has run. */
  frames: number;
  /** Median frame interval over the last ~2 s of running frames, and the refresh rate it implies. */
  medianMs: number;
  hz: number;
};

const SAMPLE = 120;

/** Median of the frame intervals → refresh estimate, robust against single long frames. */
export function estimateHz(intervals: readonly number[]): { medianMs: number; hz: number } {
  const xs = intervals.filter((x) => x > 0 && x < 250);
  if (!xs.length) return { medianMs: 0, hz: 0 };
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return { medianMs: m, hz: 1000 / m };
}

/** Nearest common panel rate (30/48/60/72/90/120/144/165/240) within 6 %, else the raw value rounded. */
export function nominalHz(hz: number): number {
  if (!(hz > 0)) return 0;
  for (const r of [30, 48, 60, 72, 90, 120, 144, 165, 240]) if (Math.abs(hz - r) / r < 0.06) return r;
  return Math.round(hz);
}

const rethrowLater = (err: unknown) =>
  setTimeout(() => {
    throw err;
  });

export function createFrameLoop(getRaf: () => { raf: Raf; caf: Caf } | null, report: (err: unknown) => void = rethrowLater) {
  const jobs = new Map<number, FrameJob>();
  let nextId = 1;
  let rafId = 0;
  let last = 0;
  let lastNow = 0;
  let frames = 0;
  let ranLast = 0;
  let ranMax = 0;
  const intervals: number[] = [];

  const tick = (now: number) => {
    rafId = 0;
    const dt = last ? Math.max(0, now - last) : 0;
    // A gap (hidden tab, loop restart) is not a frame interval.
    if (last && dt > 0 && dt < 250) {
      intervals.push(dt);
      if (intervals.length > SAMPLE) intervals.shift();
    }
    last = now;
    lastNow = now;
    frames++;
    let ran = 0;
    // Snapshot: jobs added during this frame start next frame, removed ones stop now.
    for (const [id, job] of [...jobs]) {
      if (!jobs.has(id)) continue;
      ran++;
      let keep: void | boolean = true;
      try {
        keep = job(now, dt);
      } catch (err) {
        // One broken job must not stop the reels or the waits; the error still surfaces.
        report(err);
      }
      if (keep === false) jobs.delete(id);
    }
    ranLast = ran;
    if (ran > ranMax) ranMax = ran;
    if (jobs.size) arm();
    else last = 0;
  };

  const arm = () => {
    if (rafId) return;
    const r = getRaf();
    if (!r) return;
    rafId = r.raf(tick);
  };

  return {
    /** Run `job` every frame until the returned function is called (or the job returns false). */
    onFrame(job: FrameJob): () => void {
      const id = nextId++;
      jobs.set(id, job);
      arm();
      return () => {
        jobs.delete(id);
        if (!jobs.size && rafId) {
          getRaf()?.caf(rafId);
          rafId = 0;
          last = 0;
        }
      };
    },
    /** Run `fn` once on the next frame. */
    nextFrame(fn: (now: number) => void): () => void {
      return this.onFrame((now) => {
        fn(now);
        return false;
      });
    },
    /**
     * Timestamp of the current frame (rAF time base) while the loop runs, so work started from inside a
     * frame job (a wait chained on a wait, a reel landing plan) measures from the same instant the reels
     * use. Outside a running loop, or when the last frame is stale, plain performance.now().
     */
    frameNow(): number {
      const p = typeof performance !== "undefined" ? performance.now() : 0;
      return lastNow && jobs.size && p - lastNow >= 0 && p - lastNow < 50 ? lastNow : p;
    },
    stats(): FrameLoopStats {
      const { medianMs, hz } = estimateHz(intervals);
      return { jobs: jobs.size, ranLast, ranMax, frames, medianMs, hz };
    },
    resetMax(): void {
      ranMax = ranLast;
    },
  };
}

const browserRaf = () =>
  typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
    ? {
        // Looked up per call so a wrapper installed later (debug HUD counter, test shims) still sees it.
        raf: (cb: (t: number) => void) => window.requestAnimationFrame(cb),
        caf: (id: number) => window.cancelAnimationFrame(id),
      }
    : null;

export const frameLoop = createFrameLoop(browserRaf);
export const onFrame = (job: FrameJob) => frameLoop.onFrame(job);
export const nextFrame = (fn: (now: number) => void) => frameLoop.nextFrame(fn);
export const frameNow = () => frameLoop.frameNow();
