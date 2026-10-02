import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BeatDetector, VIZ, bandAmp, bandBins, bandLevel, dbLevel, ringBins } from "./bed-viz.ts";

/** Bass envelope of a kick track: sharp attack, ~120 ms decay, plus a floor. */
function kickTrack(bpm: number, seconds: number, floor = 0.12, peak = 0.85, fps = 60): number[] {
  const out: number[] = [];
  const period = 60000 / bpm;
  const dt = 1000 / fps;
  for (let t = 0; t < seconds * 1000; t += dt) {
    const since = t % period;
    out.push(floor + peak * Math.exp(-since / 120));
  }
  return out;
}

function run(env: number[], fps = 60): number[] {
  const det = new BeatDetector();
  const dt = 1000 / fps;
  const hits: number[] = [];
  env.forEach((e, i) => {
    if (det.step(e, i * dt, dt) > 0) hits.push(i * dt);
  });
  return hits;
}

describe("bed visualizer beat detector", () => {
  it("finds every kick of a 140 BPM loop after warm-up", () => {
    const hits = run(kickTrack(140, 10));
    const expected = Math.floor((10 * 140) / 60);
    assert.ok(hits.length >= expected - 2 && hits.length <= expected + 1, `hits ${hits.length} vs ${expected}`);
  });

  it("works at 30 fps too (time based, not frame based)", () => {
    const hits = run(kickTrack(140, 10, 0.12, 0.85, 30), 30);
    assert.ok(hits.length >= 20, `hits ${hits.length}`);
  });

  it("caps flash rate with the cooldown even on 16th-note bass", () => {
    const hits = run(kickTrack(240 * 4, 6));
    for (let i = 1; i < hits.length; i++) assert.ok(hits[i] - hits[i - 1] >= VIZ.COOLDOWN_MS - 0.001);
    const perSecond = hits.length / 6;
    assert.ok(perSecond <= 1000 / VIZ.COOLDOWN_MS + 0.01 && perSecond <= 4, `rate ${perSecond}`);
  });

  it("stays quiet on steady bass, silence and quiet ripples", () => {
    assert.equal(run(new Array(600).fill(0.6)).length, 0);
    assert.equal(run(new Array(600).fill(0)).length, 0);
    // Ripples under the -50 dBFS floor (paused / near-silent bed) never flash.
    assert.equal(run(kickTrack(140, 8, 0.0002, 0.002)).length, 0);
  });

  it("maps bands to sane FFT bins", () => {
    const [a, b] = bandBins(VIZ.BASS_HZ, 48000, VIZ.FFT_SIZE);
    assert.equal(a, 1);
    assert.equal(b, 7);
    const data = new Float32Array(VIZ.FFT_SIZE / 2).fill(VIZ.MAX_DB);
    assert.equal(bandLevel(data, [a, b]), 1);
    data.fill(-20);
    assert.ok(Math.abs(bandAmp(data, [a, b]) - 0.1) < 1e-9);
    assert.equal(dbLevel(-Infinity), 0);
    data.fill(-Infinity);
    assert.equal(bandAmp(data, [a, b]), 0);
    const ring = ringBins(48, VIZ.RING_HZ, 44100, VIZ.FFT_SIZE);
    for (let i = 0; i < 48; i++) {
      assert.ok(ring[i * 2] >= 1 && ring[i * 2 + 1] >= ring[i * 2] && ring[i * 2 + 1] < VIZ.FFT_SIZE / 2);
      if (i) assert.ok(ring[i * 2] >= ring[(i - 1) * 2]);
    }
  });
});
