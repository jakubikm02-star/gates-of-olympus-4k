/**
 * Hidden diagnostics HUD (S24 / Samsung Internet PWA stutter hunt).
 *
 * Off by default and free when off: nothing is wrapped and no listener is added until the HUD
 * is enabled (`?debug=1`, or five taps on the build label in Nastavenia). The flag lives in
 * sessionStorage so it survives the in-app version reload but not a fresh PWA launch.
 */

export const DEBUG_KEY = "parkizmus-debug";

export type BrowserInfo = { name: string; version: string };

/** Samsung Internet carries "Chrome/" too, so it must be matched first. */
export function parseBrowser(ua: string): BrowserInfo {
  const pick = (re: RegExp) => re.exec(ua)?.[1] ?? "";
  const rules: [string, RegExp][] = [
    ["Samsung Internet", /SamsungBrowser\/([\d.]+)/],
    ["Edge", /EdgA?\/([\d.]+)/],
    ["Opera", /OPR\/([\d.]+)/],
    ["Firefox", /(?:Firefox|FxiOS)\/([\d.]+)/],
    ["Chrome", /(?:Chrome|CriOS)\/([\d.]+)/],
    ["Safari", /Version\/([\d.]+).*Safari/],
  ];
  for (const [name, re] of rules) {
    const version = pick(re);
    if (version) return { name, version };
  }
  return { name: "?", version: "" };
}

/** True when the URL asks for the HUD: `1` turns it on, `0` off, anything else = no opinion. */
export function debugFromSearch(search: string): boolean | null {
  const v = new URLSearchParams(search).get("debug");
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return null;
}

export type FrameSummary = { hz: number; meanMs: number; minMs: number; maxMs: number; p95Ms: number; over34: number };

/** Summarise rAF intervals (ms). `over34` = share of frames slower than 30 Hz. */
export function summarizeFrames(intervals: readonly number[]): FrameSummary {
  const xs = intervals.filter((x) => x > 0 && x < 1000);
  if (!xs.length) return { hz: 0, meanMs: 0, minMs: 0, maxMs: 0, p95Ms: 0, over34: 0 };
  const sorted = [...xs].sort((a, b) => a - b);
  const sum = xs.reduce((a, b) => a + b, 0);
  const meanMs = sum / xs.length;
  return {
    hz: 1000 / meanMs,
    meanMs,
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
    over34: xs.filter((x) => x > 34).length / xs.length,
  };
}

/** Five taps within `windowMs` toggle the HUD. Returns a tap handler that reports `true` on the 5th. */
export function makeTapCounter(count = 5, windowMs = 3000, clock: () => number = () => Date.now()) {
  let taps: number[] = [];
  return () => {
    const now = clock();
    taps = taps.filter((t) => now - t < windowMs);
    taps.push(now);
    if (taps.length >= count) {
      taps = [];
      return true;
    }
    return false;
  };
}

export const LIFECYCLE_EVENTS = ["visibilitychange", "freeze", "resume", "pageshow", "pagehide", "focus", "blur"] as const;
export type LifecycleName = (typeof LIFECYCLE_EVENTS)[number];

/** One reel run (Grid driver start → last column landed). */
export type ReelSpinStat = { frames: number; meanFrameMs: number; maxFrameMs: number; cellsPerSec: number; reelMs: number };

export type HudState = {
  enabled: boolean;
  lifecycle: Record<LifecycleName, number>;
  /** Distinct rAF callbacks that ran in the last frame / the most seen in one frame. */
  loopsNow: number;
  loopsMax: number;
  lastReel: ReelSpinStat | null;
  spins: number;
  log: string[];
};

const zeroLife = () => Object.fromEntries(LIFECYCLE_EVENTS.map((n) => [n, 0])) as Record<LifecycleName, number>;

const state: HudState = {
  enabled: false,
  lifecycle: zeroLife(),
  loopsNow: 0,
  loopsMax: 0,
  lastReel: null,
  spins: 0,
  log: [],
};

let version = 0;
const subs = new Set<() => void>();
const emit = () => {
  version++;
  for (const fn of subs) fn();
};

export function subscribeHud(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}
export const hudVersion = () => version;
export const hudState = (): Readonly<HudState> => state;

function note(line: string) {
  const t = new Date();
  const hh = `${t.getHours()}`.padStart(2, "0");
  const mm = `${t.getMinutes()}`.padStart(2, "0");
  const ss = `${t.getSeconds()}`.padStart(2, "0");
  state.log.unshift(`${hh}:${mm}:${ss} ${line}`);
  if (state.log.length > 8) state.log.length = 8;
}

export function noteReelSpin(stat: ReelSpinStat): void {
  if (!state.enabled) return;
  state.lastReel = stat;
  state.spins++;
  emit();
}

let installed = false;

/** Wraps rAF to count distinct callbacks per frame — a doubled reel loop shows up as +1. */
function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  for (const name of LIFECYCLE_EVENTS) {
    const target: EventTarget = name === "visibilitychange" || name === "freeze" || name === "resume" ? document : window;
    target.addEventListener(name, () => {
      state.lifecycle[name]++;
      if (name !== "focus" && name !== "blur") note(`${name}${name === "visibilitychange" ? `→${document.visibilityState}` : ""}`);
      emit();
    });
  }
  const native = window.requestAnimationFrame.bind(window);
  let frameCbs = 0;
  let frameAt = -1;
  window.requestAnimationFrame = (cb: FrameRequestCallback) =>
    native((t) => {
      if (t !== frameAt) {
        if (frameAt >= 0) {
          state.loopsNow = frameCbs;
          if (frameCbs > state.loopsMax) state.loopsMax = frameCbs;
        }
        frameAt = t;
        frameCbs = 0;
      }
      frameCbs++;
      cb(t);
    });
}

export function setHudEnabled(on: boolean): void {
  state.enabled = on;
  try {
    if (on) sessionStorage.setItem(DEBUG_KEY, "1");
    else sessionStorage.removeItem(DEBUG_KEY);
  } catch {
    /* private mode */
  }
  if (on) install();
  emit();
}

/** Call once at boot. Reads `?debug=` first, then the session flag. */
export function bootHud(): void {
  if (typeof window === "undefined") return;
  const fromUrl = debugFromSearch(window.location.search);
  let stored = false;
  try {
    stored = sessionStorage.getItem(DEBUG_KEY) === "1";
  } catch {
    /* ignore */
  }
  const on = fromUrl ?? stored;
  if (on || fromUrl === false) setHudEnabled(on);
}

export function resetLoopMax(): void {
  state.loopsMax = state.loopsNow;
  emit();
}

export function displayMode(): string {
  if (typeof window === "undefined" || !window.matchMedia) return "?";
  for (const m of ["fullscreen", "standalone", "minimal-ui", "window-controls-overlay"]) {
    if (window.matchMedia(`(display-mode: ${m})`).matches) return m;
  }
  return "browser";
}
