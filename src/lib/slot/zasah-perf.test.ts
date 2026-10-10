import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FX_MIN_FPS,
  FX_STILL_FPS,
  FX_WINDOW_MS,
  isFxStill,
  isPerfLite,
  newFpsWindow,
  reportFxFps,
  reportSpinFrames,
  resetPerfGuard,
  stepFpsWindow,
  subscribePerfLite,
} from "./perf-guard.ts";
import { advanceSmogClock, alternate, easeInOut, maskAlpha, newSmogClock, sideAlpha, smogCanvasSize, smogFrame, smogLevels } from "./police-smog.ts";

/**
 * ZÁSAH on desktop dropped to ~16 fps (8–10 fps without GPU) because the police lights were eight
 * full-screen rotating / masked GPU layers. They are one small canvas now, and ZÁSAH watches its own
 * frame rate to step down to lite FX. These pin the pieces so the heavy setup does not come back.
 */
const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

/** Feed `secs` of frames at `fps`; returns every finished window's median. */
function feed(fps: number, secs: number, t0 = 1000) {
  const w = newFpsWindow();
  const out: number[] = [];
  const dt = 1000 / fps;
  for (let t = t0; t <= t0 + secs * 1000; t += dt) {
    const m = stepFpsWindow(w, t);
    if (m !== null) out.push(m);
  }
  return out;
}

describe("ZÁSAH frame-rate watch", () => {
  beforeEach(() => resetPerfGuard());

  it("reports a median once per 2 s window", () => {
    const got = feed(60, 4.1);
    assert.equal(got.length, 2);
    for (const m of got) assert.ok(Math.abs(m - 60) < 0.5, String(m));
    assert.equal(FX_WINDOW_MS, 2000);
  });

  it("counts very slow frames (2–4 fps) instead of treating them as gaps", () => {
    const got = feed(3, 6);
    assert.ok(got.length >= 2);
    assert.ok(got[0] < 4);
  });

  it("a hidden-tab gap restarts the window", () => {
    const w = newFpsWindow();
    for (let t = 0; t < 1500; t += 16) stepFpsWindow(w, t);
    assert.equal(stepFpsWindow(w, 5000), null); // 3.5 s gap
    let m: number | null = null;
    for (let t = 5016; t < 6900; t += 16) m = stepFpsWindow(w, t) ?? m;
    assert.equal(m, null, "window must start again after the gap");
  });

  it("median below 40 fps → lite; already lite and below 30 → haze freezes", () => {
    let calls = 0;
    const off = subscribePerfLite(() => calls++);
    reportFxFps(55);
    assert.equal(isPerfLite(), false);
    reportFxFps(FX_MIN_FPS - 1);
    assert.equal(isPerfLite(), true);
    assert.equal(isFxStill(), false);
    reportFxFps(35); // lite is enough at 35
    assert.equal(isFxStill(), false);
    reportFxFps(FX_STILL_FPS - 1);
    assert.equal(isFxStill(), true);
    assert.equal(calls, 2);
    off();
  });

  it("the spin guard turning lite off also unfreezes the haze", () => {
    reportFxFps(20);
    reportFxFps(20);
    assert.equal(isFxStill(), true);
    for (let i = 0; i < 20; i++) reportSpinFrames(16, 60);
    assert.equal(isPerfLite(), false);
    assert.equal(isFxStill(), false);
  });
});

describe("police lights geometry (same look as the old CSS)", () => {
  it("ease-in-out matches the CSS curve at the ends and the middle", () => {
    assert.equal(easeInOut(0), 0);
    assert.equal(easeInOut(1), 1);
    assert.ok(Math.abs(easeInOut(0.5) - 0.5) < 1e-6);
    assert.ok(easeInOut(0.25) < 0.25 && easeInOut(0.75) > 0.75);
  });

  it("alternate / alternate-reverse", () => {
    assert.equal(alternate(0.25), 0.25);
    assert.equal(alternate(1.25), 0.75);
    assert.equal(alternate(0.25, true), 0.75);
  });

  it("red and blue peak half a cycle apart, between the old opacity levels", () => {
    const lv = smogLevels(false, false, false);
    assert.deepEqual(lv, { lo: 0.12, hi: 0.42, beam: 0.18 });
    assert.ok(Math.abs(sideAlpha(0, lv) - lv.lo) < 1e-9);
    assert.ok(Math.abs(sideAlpha(0.5, lv) - lv.hi) < 1e-9);
    const f = smogFrame(newSmogClock(), 1920, 1080, { phone: false, full: false, danger: false, statik: false });
    assert.ok(Math.abs(f.sides[0].alpha - lv.lo) < 1e-9);
    assert.ok(Math.abs(f.sides[1].alpha - lv.hi) < 1e-9);
  });

  it("desktop: 4 fogs at max(720px, 92vmax), beams pivot in the top corners", () => {
    const f = smogFrame(newSmogClock(), 2560, 1440, { phone: false, full: true, danger: false, statik: false });
    const fogs = f.sides.flatMap((s) => s.fogs);
    assert.equal(fogs.length, 4);
    for (const g of fogs) assert.ok(Math.abs(g.size - 0.92 * 2560) < 1e-6);
    assert.deepEqual([f.sides[0].beam?.px, f.sides[0].beam?.py, f.sides[1].beam?.px], [0, 0, 2560]);
    assert.equal(f.sides[0].beam?.rot, 14);
    assert.equal(f.sides[1].beam?.rot, 166);
    assert.equal(f.sides[0].beam?.alpha, 0.42);
  });

  it("danger speeds the alternation up without a jump", () => {
    let c = newSmogClock();
    c = advanceSmogClock(c, 900, false);
    const a = c.alt;
    c = advanceSmogClock(c, 0, true);
    assert.equal(c.alt, a);
    c = advanceSmogClock(c, 90, true);
    assert.ok(Math.abs(c.alt - a - 0.1) < 1e-9);
  });

  it("reduced motion: no beams, one fog per side, fixed opacity", () => {
    const f = smogFrame(newSmogClock(), 1920, 1080, { phone: false, full: false, danger: false, statik: true });
    assert.equal(f.sides[0].beam, null);
    assert.equal(f.sides[0].fogs.length, 1);
    assert.equal(f.sides[0].alpha, 0.26);
  });

  it("the centre stays thinned out (old radial mask)", () => {
    assert.ok(Math.abs(maskAlpha(960, 0.46 * 1080, 1920, 1080) - 0.1) < 1e-9);
    assert.equal(maskAlpha(0, 0, 1920, 1080), 1);
  });

  it("the canvas is a fraction of the window, smaller again in lite", () => {
    const full = smogCanvasSize(2560, 1440, "full");
    const lite = smogCanvasSize(2560, 1440, "lite");
    assert.ok(full.cw <= 900 && full.ch <= 900);
    assert.ok(lite.cw <= 420);
    assert.ok(lite.cw * lite.ch < full.cw * full.ch / 3);
  });
});

describe("ZÁSAH CSS stays compositor-friendly", () => {
  const smog = src("../../components/slot/police-smog.css");
  const smogTsx = src("../../components/slot/PoliceSmog.tsx");
  const styles = src("../../styles.css");
  const bat = src("../../components/slot/zasah-battery.css");

  it("no full-screen mask, rotating layers or blend in the police lights", () => {
    assert.doesNotMatch(smog, /mask-image/);
    assert.doesNotMatch(smog, /rotate\(/);
    assert.doesNotMatch(smog, /mix-blend-mode/);
    assert.match(smogTsx, /<canvas/);
  });

  it("the target glow fades in once and does not stay a GPU layer", () => {
    assert.match(styles, /\.cell \.aim-lock \{[^}]*animation: aim-in 0\.22s ease-out backwards;/);
  });

  it("phones and lite hold the target glow still", () => {
    assert.match(styles, /@media \(max-width: 720px\) \{\s*\.cell \.aim-lock::after \{\s*animation: none;/);
    assert.match(styles, /\.stage\.perf-lite \.cell \.aim-lock::after \{\s*animation: none;/);
  });

  it("ZÁSAH drops the per-frame full-screen filter and blend under the dim", () => {
    assert.match(styles, /\.stage\.in-chase:not\(\.in-fs\) \.stage-bg \{\s*filter: none;/);
    assert.match(styles, /\.stage\.in-chase \.park-lines \{\s*mix-blend-mode: normal;/);
  });

  it("battery scanline moves with transform, no blend, no background-position animation", () => {
    const scan = /@keyframes zbat-scan \{([^}]*\}){2}/.exec(bat)?.[0] ?? "";
    assert.match(scan, /transform/);
    assert.doesNotMatch(scan, /background-position/);
    const after = /\.zbat::after \{[^}]*\}/.exec(bat)?.[0] ?? "";
    assert.doesNotMatch(after, /mix-blend-mode/);
  });
});
