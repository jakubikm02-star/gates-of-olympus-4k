import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BassNorm,
  BeatDetector,
  BinNorm,
  FlashGate,
  KickMeter,
  LagLine,
  VIZ,
  bandAmp,
  bandBins,
  bandLevel,
  dbLevel,
  FlowDrive,
  edgeErase,
  featherErase,
  flowSpeed,
  fogHue,
  roundRectSd,
  tileNoise,
  follow,
  latencyCompMs,
  ringBins,
  smoothBins,
} from "./bed-viz.ts";

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
    assert.ok(
      hits.length >= expected - 2 && hits.length <= expected + 1,
      `hits ${hits.length} vs ${expected}`,
    );
  });

  it("works at 30 fps too (time based, not frame based)", () => {
    const hits = run(kickTrack(140, 10, 0.12, 0.85, 30), 30);
    assert.ok(hits.length >= 20, `hits ${hits.length}`);
  });

  it("caps flash rate with the cooldown even on 16th-note bass", () => {
    const hits = run(kickTrack(240 * 4, 6));
    for (let i = 1; i < hits.length; i++)
      assert.ok(hits[i] - hits[i - 1] >= VIZ.COOLDOWN_MS - 0.001);
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
    assert.equal(b, Math.ceil(150 / (48000 / VIZ.FFT_SIZE)));
    const data = new Float32Array(VIZ.FFT_SIZE / 2).fill(VIZ.MAX_DB);
    assert.equal(bandLevel(data, [a, b]), 1);
    data.fill(-20);
    assert.ok(Math.abs(bandAmp(data, [a, b]) - 0.1) < 1e-9);
    assert.equal(dbLevel(-Infinity), 0);
    data.fill(-Infinity);
    assert.equal(bandAmp(data, [a, b]), 0);
    const ring = ringBins(48, VIZ.RING_HZ, 44100, VIZ.FFT_SIZE);
    for (let i = 0; i < 48; i++) {
      assert.ok(
        ring[i * 2] >= 1 && ring[i * 2 + 1] >= ring[i * 2] && ring[i * 2 + 1] < VIZ.FFT_SIZE / 2,
      );
      if (i) assert.ok(ring[i * 2] >= ring[(i - 1) * 2]);
    }
  });
});

describe("bed visualizer per-frame envelopes", () => {
  it("attacks instantly and releases in ~RELEASE_MS", () => {
    assert.equal(follow(0.1, 0.9, 16.7, VIZ.RELEASE_MS), 0.9);
    let v = 1;
    for (let t = 0; t < VIZ.RELEASE_MS; t += 1000 / 60) v = follow(v, 0, 1000 / 60, VIZ.RELEASE_MS);
    assert.ok(v > 0.3 && v < 0.42, `after one tau ${v}`);
  });

  it("BassNorm pumps with a kick over a sustained floor, any loudness", () => {
    for (const gain of [0.02, 0.4]) {
      const n = new BassNorm();
      let lo = 1;
      let hi = 0;
      for (let i = 0; i < 600; i++) {
        const t = (i * 1000) / 60;
        const kick = Math.exp(-(t % 428) / 90);
        const v = n.step(gain * (0.2 + kick), 1000 / 60);
        if (i > 120) {
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
      }
      assert.ok(hi > 0.95 && lo < 0.12, `gain ${gain}: ${lo}..${hi}`);
    }
  });

  it("BinNorm keeps never-loud bins flat and normalises each bin to its own peak", () => {
    const n = new BinNorm(2);
    const out = new Float32Array(2);
    n.step(new Float32Array([0.0001, 0.2]), out, 16);
    assert.equal(out[0], 0);
    assert.equal(out[1], 1);
    n.step(new Float32Array([0.0001, 0.05]), out, 16);
    assert.equal(out[1], 0);
  });

  it("smoothBins keeps a flat spectrum flat and spreads a spike", () => {
    const out = new Float32Array(9);
    smoothBins(new Float32Array(9).fill(0.5), out);
    for (const v of out) assert.ok(Math.abs(v - 0.5) < 1e-6);
    const spike = new Float32Array(9);
    spike[4] = 1;
    smoothBins(spike, out);
    assert.ok(Math.abs(out[4] - 3 / 9) < 1e-6 && out[3] > 0 && out[2] > 0 && out[1] === 0);
  });

  it("KickMeter passes the kick band and rejects the 808 sub and the highs", () => {
    const sr = 48000;
    const m = new KickMeter(sr);
    const tone = (f: number) =>
      Float32Array.from({ length: 2048 }, (_, i) => Math.sin((2 * Math.PI * f * i) / sr));
    const sub = m.amp(tone(45));
    const kick = m.amp(tone(140));
    const hat = m.amp(tone(4000));
    assert.ok(kick > 0.6, `kick ${kick}`);
    assert.ok(sub < kick * 0.2, `sub ${sub}`);
    assert.ok(hat < kick * 0.05, `hat ${hat}`);
    assert.equal(m.amp(new Float32Array(2048)), 0);
  });

  it("latency compensation: frame + window already cover small latencies, capped for Bluetooth", () => {
    assert.equal(latencyCompMs(0, 0), 0);
    assert.equal(latencyCompMs(undefined, NaN), 0);
    assert.equal(latencyCompMs(0.032, 0.01), 42 - VIZ.FRAME_MS - VIZ.WINDOW_MS);
    assert.equal(latencyCompMs(1, 0), VIZ.MAX_COMP_MS);
  });

  it("LagLine returns the newest snapshot at least delay old", () => {
    const l = new LagLine(8, 1);
    assert.equal(l.read(0, 10), null);
    for (let i = 0; i < 12; i++) l.push(i * 10)[0] = i;
    assert.equal(l.read(110, 0)![0], 11);
    assert.equal(l.read(110, 30)![0], 8);
    assert.equal(l.read(110, 1000)![0], 4);
  });
});

describe("bed visualizer rainbow fog", () => {
  /** Count brightness rises of more than `step` (local min → next local max). */
  function rises(v: number[], step = 0.2): number {
    let n = 0;
    let lo = v[0];
    let up = false;
    for (let i = 1; i < v.length; i++) {
      if (v[i] < v[i - 1]) {
        if (up) lo = v[i];
        up = false;
        lo = Math.min(lo, v[i]);
      } else if (v[i] > v[i - 1]) {
        if (!up && v[i] - lo > step) {
          n++;
          up = true;
        }
      }
    }
    return n;
  }
  function drive(env: number[], fps = 60): number[] {
    const g = new FlashGate();
    const dt = 1000 / fps;
    return env.map((e, i) => g.step(e, i * dt, dt));
  }

  it("follows a 140 BPM kick with zero attack lag (every kick, same frame)", () => {
    const env = kickTrack(140, 6, 0, 1).map((v) => Math.min(1, v));
    const out = drive(env);
    let kicks = 0;
    for (let i = 1; i < env.length; i++) {
      if (env[i] - env[i - 1] < 0.3) continue;
      kicks++;
      // First frame of each kick: the gated brightness already equals the input (no attack lag).
      assert.ok(out[i] >= env[i] - 1e-9, `kick at frame ${i}: ${out[i]} vs ${env[i]}`);
    }
    assert.ok(kicks >= 13, `kicks ${kicks}`);
  });

  it("is strobe-safe: 16th-note bass at 140 BPM gives ≤ 3 brightness flashes per second", () => {
    const env: number[] = [];
    const period = 60000 / 140 / 4;
    for (let t = 0; t < 10000; t += 1000 / 60) env.push(Math.exp(-(t % period) / 40));
    const n = rises(drive(env));
    assert.ok(n / 10 <= 3, `${n / 10} flashes/s`);
    assert.ok(n / 10 >= 2, `still pumps: ${n / 10}/s`);
  });

  it("releases between kicks and rests at 0 in silence", () => {
    const out = drive([1, ...Array(60).fill(0)]);
    assert.equal(out[0], 1);
    assert.ok(out[12] < 0.35, `200 ms after: ${out[12]}`);
    assert.ok(out[60] < 0.01);
  });

  it("fogHue crossfades neighbouring sprite hues and wraps around the wheel", () => {
    assert.deepEqual(fogHue(0), [0, 1, 0]);
    const [a, b, f] = fogHue(0.5 + 1 / 16);
    assert.deepEqual([a, b], [4, 5]);
    assert.ok(Math.abs(f - 0.5) < 1e-9);
    assert.deepEqual(fogHue(-1 / 8).slice(0, 2), [7, 0]);
    assert.deepEqual(fogHue(3 + 7.5 / 8).slice(0, 2), [7, 0]);
  });
});

describe("bed visualizer fog motion (bass drives speed, not size)", () => {
  it("surges on a kick within two frames and glides back smoothly (no step down)", () => {
    const d = new FlowDrive();
    const dt = 1000 / 60;
    const v1 = d.step(1, dt);
    const v2 = d.step(1, dt);
    assert.ok(v1 > 0.55, `frame 1: ${v1}`);
    assert.ok(v2 > 0.8, `frame 2: ${v2}`);
    const rel: number[] = [];
    for (let i = 0; i < 60; i++) rel.push(d.step(0, dt));
    for (let i = 1; i < rel.length; i++) assert.ok(rel[i] < rel[i - 1] && rel[i - 1] - rel[i] < 0.05, `smooth release at ${i}`);
    assert.ok(rel[12] > 0.3 && rel[12] < 0.6, `200 ms after: ${rel[12]}`);
    assert.ok(rel[59] < 0.1, `1 s after: ${rel[59]}`);
  });

  it("140 BPM kicks pump the speed every beat and it stays within cruising..max", () => {
    const d = new FlowDrive();
    const env = kickTrack(140, 6, 0, 1);
    const sp = env.map((e) => flowSpeed(d.step(e, 1000 / 60)));
    const lo = Math.min(...sp.slice(120));
    const hi = Math.max(...sp.slice(120));
    assert.ok(lo >= 1 && hi <= 1 + 5 + 1e-9, `${lo}..${hi}`);
    assert.ok(hi - lo > 2, `visible surge: ${lo}..${hi}`);
    assert.equal(flowSpeed(0), 1);
    assert.equal(flowSpeed(7), 6);
  });

  it("tileNoise is smooth, in 0..1 and tiles with its period", () => {
    for (let i = 0; i < 200; i++) {
      const x = (i * 0.37) % 4;
      const y = (i * 0.71) % 4;
      const v = tileNoise(x, y, 4, 3);
      assert.ok(v >= 0 && v <= 1);
      assert.ok(Math.abs(v - tileNoise(x + 4, y - 4, 4, 3)) < 1e-9);
      assert.ok(Math.abs(v - tileNoise(x + 0.01, y, 4, 3)) < 0.05);
    }
  });

  it("frame feather: none well outside, full well inside, edge position wanders with noise", () => {
    assert.ok(Math.abs(roundRectSd(0, 0, 100, 50, 12) + 50) < 1e-9);
    assert.ok(Math.abs(roundRectSd(130, 0, 100, 50, 12) - 30) < 1e-9);
    for (const n of [0, 0.5, 1]) {
      assert.equal(featherErase(40, n), 0);
      assert.equal(featherErase(-60, n), 1);
    }
    assert.ok(featherErase(0, 0) > featherErase(0, 1) + 0.3, "noise moves the edge");
  });

  it("canvas-edge falloff: always fully erased at the edge, depth varies with noise", () => {
    for (const n of [0, 0.5, 1]) {
      assert.equal(edgeErase(0, 100, n), 1);
      assert.equal(edgeErase(150, 100, n), 0);
    }
    assert.ok(edgeErase(60, 100, 1) > edgeErase(60, 100, 0) + 0.3);
  });
});
