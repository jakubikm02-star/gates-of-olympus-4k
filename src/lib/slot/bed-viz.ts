/**
 * 4KA TV bonus visualizer: pure DSP helpers (no DOM, no audio graph).
 * Reads the bed loop's AnalyserNode, turns it into per-frame band envelopes (instant attack,
 * short release) and finds kick onsets for extra punches. Display only: nothing here touches audio output or game math.
 */

/**
 * Tunable constants. Times in ms. Display levels are 0..1 (dB mapped from MIN_DB..MAX_DB);
 * the beat detector works on linear bass amplitude (dB scale squashes a kick to a few %).
 */
export const VIZ = {
  /**
   * AnalyserNode setup. 2048 at 48 kHz gives ~23 Hz bins for the radial spectrum; smoothing is low
   * (0.5) so a hit shows on the next frame instead of being smeared over several. The kick itself is
   * NOT read from the FFT (its 43 ms window lags and the 808 sub leaks into the kick bins): it is
   * filtered from the raw time-domain samples, see KICK_HZ.
   */
  FFT_SIZE: 2048,
  SMOOTHING: 0.5,
  MIN_DB: -90,
  MAX_DB: -16,
  /**
   * Kick "punch" band, filtered from the newest time-domain samples (4th-order high-pass + 2nd-order
   * low-pass), RMS over the last KICK_MS. Above the sustained 808 sub (which a sidechained drop ducks
   * ON the kick), so it pumps with the kick; ~10 ms behind the sound instead of ~25 ms for an FFT.
   */
  KICK_HZ: [90, 260] as const,
  KICK_MS: 10,
  /** Bands in Hz (FFT): sub/bass swell, idle detection. */
  BASS_HZ: [40, 150] as const,
  MID_HZ: [150, 2000] as const,
  HIGH_HZ: [2000, 12000] as const,
  /** Radial spectrum range (log spaced, mirrored left/right: bass at the bottom, highs at the top). */
  RING_HZ: [40, 12000] as const,
  /** Beat: linear bass amplitude must exceed rolling average × THRESHOLD and the MIN_BASS floor (≈ -50 dBFS). */
  THRESHOLD: 1.25,
  MIN_BASS: 0.003,
  /** Rolling average time constant. */
  AVG_MS: 600,
  /** Minimum gap between punches: 300 ms = max 3.3 flashes/s (cap < 4/s; 340 for strict WCAG 2.3.1 ≤ 3/s). */
  COOLDOWN_MS: 300,
  /** Beat punch (extra flash / shake / star push) decay. The per-frame envelope drives everything else. */
  PULSE_DECAY_MS: 160,
  /** Per-frame envelopes: attack is instant, release is short so the picture drops between kicks. */
  RELEASE_MS: 100,
  /** Bass auto-gain: level = amp / peak, peak decays with this time constant (track-independent). */
  PEAK_MS: 2600,
  /** Kick level below this share of the recent peak counts as "between kicks". */
  BASS_FLOOR: 0.3,
  /** Sub swell (FFT bass) floor: only the top of the 808 adds a little breathing on top of the kick. */
  SUB_FLOOR: 0.55,
  /** Output caps (seizure safety + taste). */
  GLOW_BASE: 0.22,
  GLOW_MAX: 0.92,
  HOT_MAX: 0.55,
  AURA_BASE: 0.1,
  AURA_MAX: 0.85,
  /** Reel frame scale pulse: bass envelope × FRAME_PULSE + beat punch × FRAME_PUNCH, capped. */
  FRAME_PULSE: 0.02,
  FRAME_PUNCH: 0.008,
  FRAME_MAX: 0.026,
  /** Emblem scale pulse. */
  EMBLEM_PULSE: 0.07,
  EMBLEM_MAX: 0.1,
  /** Background shake in px on strong bass (canvas + aura only, never the reels). */
  SHAKE_PX: 4,
  /** Display latency assumed after rAF (one frame) and the kick window centre + filter delay, in ms, for output-latency compensation. */
  FRAME_MS: 16,
  WINDOW_MS: 8,
  /** Max compensation delay (Bluetooth sinks report 150–300 ms). */
  MAX_COMP_MS: 300,
  /** Idle breathing (muted / no signal / AudioContext suspended). */
  IDLE_GLOW: 0.26,
  IDLE_SWING: 0.1,
  IDLE_PERIOD_MS: 4200,
  /** Below this total level for SILENCE_MS the visualizer falls back to idle breathing. */
  SILENCE_LEVEL: 0.015,
  SILENCE_MS: 600,
  /** Reduced motion: one static glow. */
  STATIC_GLOW: 0.42,
  /**
   * Rainbow fog (prerendered blurred sprites, public/fx/fog-rainbow.webp; only moved and faded).
   * Brightness: instant attack on the bass, FOG_RELEASE_MS release, and at most one full rise per
   * FLASH_GAP_MS (≤ 2.9 brightness flashes/s, strobe-safe); inside the gap it only creeps up.
   */
  FOG_RELEASE_MS: 180,
  FLASH_GAP_MS: 340,
  FLASH_STEP: 0.12,
  FLASH_CREEP_MS: 260,
  /**
   * Fog alpha: idle floor and the most a beat may add. The bass mostly drives the MOTION (FLOW_*),
   * so the brightness only lifts a little (luminance swing cap) and the fog never swells.
   */
  FOG_BASE: 0.72,
  FOG_SWING: 0.12,
  /**
   * Bass → fog motion speed (orbit, spin, wobble, wisp drift all run on one flow clock):
   * speed = FLOW_BASE + FLOW_GAIN × drive, drive follows the bass with a fast attack and a smooth
   * release, so the fog surges forward on every kick and glides back to its cruising speed.
   */
  FLOW_BASE: 1,
  FLOW_GAIN: 5,
  FLOW_IDLE: 0.7,
  FLOW_ATTACK_MS: 18,
  FLOW_RELEASE_MS: 260,
  /** Frame feather (CSS px): fog starts fading FEATHER_OUT outside the frame edge, gone FEATHER_IN inside; noise jitter ±FEATHER_JITTER. */
  FEATHER_OUT: 10,
  FEATHER_IN: 34,
  FEATHER_JITTER: 16,
  /** Hue drift in turns/s: a slow base plus mids/highs (gentle: ≤ ~0.06 turn/s). */
  FOG_HUE_BASE: 0.012,
  FOG_HUE_MIDHI: 0.045,
  /** Fog canvas resolution in CSS px (the fog is blurred, so a coarse canvas looks the same). */
  FOG_RES: 0.5,
  /** Number of hues in the sprite sheet. */
  FOG_HUES: 8,
} as const;

export type Band = readonly [number, number];

/** Inclusive FFT bin range for a Hz band. Always at least one bin, never bin 0 (DC). */
export function bandBins(band: Band, sampleRate: number, fftSize: number): [number, number] {
  const hz = sampleRate / fftSize;
  const max = fftSize / 2 - 1;
  const a = Math.min(max, Math.max(1, Math.floor(band[0] / hz)));
  const b = Math.min(max, Math.max(a, Math.ceil(band[1] / hz)));
  return [a, b];
}

/** dB → 0..1 display level. */
export function dbLevel(
  db: number,
  minDb: number = VIZ.MIN_DB,
  maxDb: number = VIZ.MAX_DB,
): number {
  const v = (db - minDb) / (maxDb - minDb);
  return v > 1 ? 1 : v > 0 ? v : 0;
}

/** Mean display level (0..1) of bins [a..b] from getFloatFrequencyData() dB values. */
export function bandLevel(data: Float32Array, bins: readonly [number, number]): number {
  let sum = 0;
  for (let i = bins[0]; i <= bins[1]; i++) sum += dbLevel(data[i]);
  return sum / (bins[1] - bins[0] + 1);
}

/** Linear RMS amplitude of bins [a..b] (dB in, |X|/N out): what the kick detector listens to. */
export function bandAmp(data: Float32Array, bins: readonly [number, number]): number {
  let sum = 0;
  for (let i = bins[0]; i <= bins[1]; i++) {
    const db = data[i];
    if (db > -200) sum += Math.pow(10, db / 10);
  }
  return Math.sqrt(sum / (bins[1] - bins[0] + 1));
}

/** Frame-rate independent exponential approach factor. */
export function ease(dtMs: number, tauMs: number): number {
  return 1 - Math.exp(-Math.max(0, dtMs) / Math.max(1, tauMs));
}

/** Log-spaced bin edges for `count` ring bars between RING_HZ. */
export function ringBins(
  count: number,
  band: Band,
  sampleRate: number,
  fftSize: number,
): Uint16Array {
  const out = new Uint16Array(count * 2);
  const [lo, hi] = band;
  let prev = 0;
  for (let i = 0; i < count; i++) {
    const f0 = lo * Math.pow(hi / lo, i / count);
    const f1 = lo * Math.pow(hi / lo, (i + 1) / count);
    const [a0, b] = bandBins([f0, f1], sampleRate, fftSize);
    const a = a0 < prev ? Math.min(prev, b) : a0;
    out[i * 2] = a;
    out[i * 2 + 1] = Math.max(a, b);
    prev = a;
  }
  return out;
}

export type BeatOpts = {
  threshold: number;
  minLevel: number;
  avgMs: number;
  cooldownMs: number;
};

/**
 * Kick onset: energy vs rolling average, threshold + hysteresis + cooldown.
 * step() returns 0 (no beat) or a strength in (0, 1].
 */
export class BeatDetector {
  private avg = 0;
  private last = -Infinity;
  private armed = true;
  private seeded = false;
  private o: BeatOpts;
  constructor(
    o: BeatOpts = {
      threshold: VIZ.THRESHOLD,
      minLevel: VIZ.MIN_BASS,
      avgMs: VIZ.AVG_MS,
      cooldownMs: VIZ.COOLDOWN_MS,
    },
  ) {
    this.o = o;
  }

  reset(): void {
    this.avg = 0;
    this.last = -Infinity;
    this.armed = true;
    this.seeded = false;
  }

  /**
   * Fires once per onset: energy crosses avg × threshold while armed, then disarms until the
   * energy falls back to halfway (hysteresis), plus a hard cooldown that caps the flash rate.
   */
  step(energy: number, nowMs: number, dtMs: number): number {
    if (!this.seeded) {
      this.avg = energy;
      this.seeded = true;
      return 0;
    }
    const base = Math.max(this.avg, this.o.minLevel * 0.5);
    let hit = 0;
    if (!this.armed && energy < base * (1 + (this.o.threshold - 1) * 0.5)) this.armed = true;
    if (
      this.armed &&
      energy >= this.o.minLevel &&
      energy > base * this.o.threshold &&
      nowMs - this.last >= this.o.cooldownMs
    ) {
      this.last = nowMs;
      this.armed = false;
      const over = (energy / base - this.o.threshold) / this.o.threshold;
      hit = Math.min(1, 0.7 + over * 0.9);
    }
    this.avg += (energy - this.avg) * ease(dtMs, this.o.avgMs);
    return hit;
  }
}

/**
 * Per-frame envelope: jumps to a higher input at once (no attack lag), decays exponentially.
 */
export function follow(prev: number, input: number, dtMs: number, releaseMs: number): number {
  return input >= prev ? input : prev + (input - prev) * ease(dtMs, releaseMs);
}

/**
 * Bass level 0..1 that pumps on kicks for any track loudness: amp / recent peak, with the
 * sustained floor (BASS_FLOOR of the peak) cut away so the picture drops between kicks.
 */
export class BassNorm {
  private peak = 0;
  private floor: number;
  private peakMs: number;
  private minAmp: number;
  constructor(
    floor: number = VIZ.BASS_FLOOR,
    peakMs: number = VIZ.PEAK_MS,
    minAmp: number = VIZ.MIN_BASS,
  ) {
    this.floor = floor;
    this.peakMs = peakMs;
    this.minAmp = minAmp;
  }

  reset(): void {
    this.peak = 0;
  }

  step(amp: number, dtMs: number): number {
    this.peak = amp > this.peak ? amp : this.peak + (amp - this.peak) * ease(dtMs, this.peakMs);
    const ref = Math.max(this.peak, this.minAmp * 4);
    const v = (amp / ref - this.floor) / (1 - this.floor);
    return v > 1 ? 1 : v > 0 ? v : 0;
  }
}

/** Peak linear amplitude of each ring bin range (dB in). */
export function ringAmps(data: Float32Array, rb: Uint16Array, out: Float32Array): void {
  const n = out.length;
  for (let i = 0; i < n; i++) {
    let s = -Infinity;
    for (let j = rb[i * 2]; j <= rb[i * 2 + 1]; j++) if (data[j] > s) s = data[j];
    out[i] = s > -200 ? Math.pow(10, s / 20) : 0;
  }
}

/**
 * Per-bin auto-gain for the radial spectrum: every frequency is shown relative to its own recent
 * peak with the sustained floor cut away, so a kick bulges the bass, a snare the mids, hats the
 * top, whatever the mix balance. Bins that never get loud (below minAmp) stay flat.
 */
export class BinNorm {
  private peak: Float32Array;
  private floor: number;
  private peakMs: number;
  private minAmp: number;
  constructor(n: number, floor = 0.32, peakMs: number = VIZ.PEAK_MS, minAmp = 0.0015) {
    this.peak = new Float32Array(n);
    this.floor = floor;
    this.peakMs = peakMs;
    this.minAmp = minAmp;
  }

  reset(): void {
    this.peak.fill(0);
  }

  step(amps: Float32Array, out: Float32Array, dtMs: number): void {
    const e = ease(dtMs, this.peakMs);
    for (let i = 0; i < amps.length; i++) {
      const a = amps[i];
      const p = (this.peak[i] = a > this.peak[i] ? a : this.peak[i] + (a - this.peak[i]) * e);
      const v = (a / Math.max(p, this.minAmp) - this.floor) / (1 - this.floor);
      out[i] = v > 1 ? 1 : v > 0 ? v : 0;
    }
  }
}

/** [1 2 3 2 1]/9 smoothing across neighbouring bins (edges clamp), so the ring bulges instead of spiking. */
export function smoothBins(src: Float32Array, out: Float32Array): void {
  const n = src.length;
  const at = (i: number) => src[i < 0 ? 0 : i >= n ? n - 1 : i];
  for (let i = 0; i < n; i++)
    out[i] = (at(i - 2) + 2 * at(i - 1) + 3 * src[i] + 2 * at(i + 1) + at(i + 2)) / 9;
}

/**
 * How long to hold analyser frames back so the picture lands with the sound: the analyser sees
 * samples when they are rendered, the speaker plays them base+output latency later, while the
 * frame itself shows up ~1 frame after rAF and the FFT window already lags by its centre.
 */
export function latencyCompMs(
  outputLatencySec: number | undefined,
  baseLatencySec: number | undefined,
): number {
  const lat =
    ((Number.isFinite(outputLatencySec) ? outputLatencySec! : 0) +
      (Number.isFinite(baseLatencySec) ? baseLatencySec! : 0)) *
    1000;
  const c = lat - VIZ.FRAME_MS - VIZ.WINDOW_MS;
  return c > 0 ? Math.min(VIZ.MAX_COMP_MS, c) : 0;
}

/**
 * Fixed-size history of per-frame snapshots (time + values), read back `delayMs` late.
 * Used for output-latency compensation without allocating per frame.
 */
export class LagLine {
  private t: Float64Array;
  private v: Float32Array[];
  private head = -1;
  private size = 0;
  private cap: number;
  readonly width: number;
  constructor(cap: number, width: number) {
    this.cap = cap;
    this.width = width;
    this.t = new Float64Array(cap);
    this.v = Array.from({ length: cap }, () => new Float32Array(width));
  }

  reset(): void {
    this.head = -1;
    this.size = 0;
  }

  /** Slot to fill for time `t` (overwrites the oldest). */
  push(t: number): Float32Array {
    this.head = (this.head + 1) % this.cap;
    this.size = Math.min(this.cap, this.size + 1);
    this.t[this.head] = t;
    return this.v[this.head];
  }

  /** Newest snapshot at least `delayMs` old (or the oldest one kept), null when empty. */
  read(now: number, delayMs: number): Float32Array | null {
    if (this.size === 0) return null;
    let k = this.head;
    for (let i = 0; i < this.size; i++) {
      if (now - this.t[k] >= delayMs - 0.5) return this.v[k];
      if (i < this.size - 1) k = (k - 1 + this.cap) % this.cap;
    }
    return this.v[k];
  }
}

/** RBJ biquad coefficients [b0, b1, b2, a1, a2] (normalised by a0). */
function biquad(kind: "hp" | "lp", f: number, q: number, sr: number): number[] {
  const w = (2 * Math.PI * f) / sr;
  const c = Math.cos(w);
  const al = Math.sin(w) / (2 * q);
  const a0 = 1 + al;
  const b =
    kind === "lp" ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [(1 + c) / 2, -(1 + c), (1 + c) / 2];
  return [b[0] / a0, b[1] / a0, b[2] / a0, (-2 * c) / a0, (1 - al) / a0];
}

/**
 * Kick band meter on raw samples: Butterworth 4th-order high-pass (two biquads) + 2nd-order low-pass,
 * run from rest over the analyser's time-domain window each frame (the first ~30 ms settle the filter),
 * RMS of the newest `ms`. Allocation-free after construction.
 */
export class KickMeter {
  private c: number[][];
  private tail: number;
  constructor(sampleRate: number, band: Band = VIZ.KICK_HZ, ms: number = VIZ.KICK_MS) {
    this.c = [
      biquad("hp", band[0], 0.5412, sampleRate),
      biquad("hp", band[0], 1.3066, sampleRate),
      biquad("lp", band[1], Math.SQRT1_2, sampleRate),
    ];
    this.tail = Math.max(16, Math.round((sampleRate * ms) / 1000));
  }

  amp(td: Float32Array): number {
    const n = td.length;
    const from = n - Math.min(this.tail, n);
    let sum = 0;
    // Three cascaded direct-form-I biquads; state per stage: x[n-1], x[n-2], y[n-1], y[n-2].
    const st = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      let x = td[i];
      for (let k = 0; k < 3; k++) {
        const c = this.c[k];
        const o = k * 4;
        const y = c[0] * x + c[1] * st[o] + c[2] * st[o + 1] - c[3] * st[o + 2] - c[4] * st[o + 3];
        st[o + 1] = st[o];
        st[o] = x;
        st[o + 3] = st[o + 2];
        st[o + 2] = y;
        x = y;
      }
      if (i >= from) sum += x * x;
    }
    return Math.sqrt(sum / (n - from));
  }
}

/**
 * Strobe-safe brightness follower for the fog: jumps to a higher target at once (so the fog stays on
 * the beat), but only once per FLASH_GAP_MS; a second rise inside the gap only creeps up
 * (FLASH_CREEP_MS), so fast bass (16ths, rolls) cannot flicker the fog. Releases in FOG_RELEASE_MS.
 */
export class FlashGate {
  v = 0;
  private lastRise = -Infinity;
  reset(): void {
    this.v = 0;
    this.lastRise = -Infinity;
  }

  step(target: number, nowMs: number, dtMs: number): number {
    if (target > this.v) {
      if (nowMs - this.lastRise >= VIZ.FLASH_GAP_MS) {
        if (target - this.v > VIZ.FLASH_STEP) this.lastRise = nowMs;
        this.v = target;
      } else this.v += (target - this.v) * ease(dtMs, VIZ.FLASH_CREEP_MS);
    } else this.v += (target - this.v) * ease(dtMs, VIZ.FOG_RELEASE_MS);
    return this.v;
  }
}

/**
 * Fog sprite pick for a hue position (turns, any real): the two neighbouring hue cells and the
 * crossfade weight of the second one, so the colour glides around the wheel instead of stepping.
 */
export function fogHue(turns: number, hues: number = VIZ.FOG_HUES): [number, number, number] {
  const f = (((turns % 1) + 1) % 1) * hues;
  const i0 = Math.floor(f) % hues;
  return [i0, (i0 + 1) % hues, f - Math.floor(f)];
}

/** Bass → fog motion drive (0..1): fast attack (FLOW_ATTACK_MS), smooth release (FLOW_RELEASE_MS). */
export class FlowDrive {
  v = 0;
  reset(): void {
    this.v = 0;
  }

  step(target: number, dtMs: number): number {
    const t = target > 1 ? 1 : target > 0 ? target : 0;
    this.v += (t - this.v) * ease(dtMs, t > this.v ? VIZ.FLOW_ATTACK_MS : VIZ.FLOW_RELEASE_MS);
    return this.v;
  }
}

/** Fog motion speed multiplier for a drive value (1 = cruising, 1 + FLOW_GAIN on a full kick). */
export function flowSpeed(drive: number): number {
  return VIZ.FLOW_BASE + VIZ.FLOW_GAIN * (drive > 1 ? 1 : drive > 0 ? drive : 0);
}

function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Smooth value noise in [0,1], tileable with `period` lattice cells (x, y in cells), 3 octaves.
 * Used once per resize to prerender the gaseous masks (never per frame).
 */
export function tileNoise(x: number, y: number, period: number, seed = 1): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < 3; o++) {
    const p = period * f;
    const fx = x * f;
    const fy = y * f;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const w = (v: number) => ((v % p) + p) % p;
    const a = hash2(w(x0), w(y0), seed + o);
    const b = hash2(w(x0 + 1), w(y0), seed + o);
    const c = hash2(w(x0), w(y0 + 1), seed + o);
    const d = hash2(w(x0 + 1), w(y0 + 1), seed + o);
    sum += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/** Signed distance (px) from a point to a rounded rect centred at 0 (half sizes hw, hh, radius r); < 0 inside. */
export function roundRectSd(x: number, y: number, hw: number, hh: number, r: number): number {
  const qx = Math.abs(x) - hw + r;
  const qy = Math.abs(y) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * Frame feather: how much fog is erased (0..1) at signed distance `d` from the frame edge, after the
 * noise jitter `n` (0..1) moved the edge in or out. Never a straight line: the jitter varies along the edge.
 */
export function featherErase(d: number, n: number): number {
  const e = d + (n - 0.5) * 2 * VIZ.FEATHER_JITTER;
  const u = (VIZ.FEATHER_OUT - e) / (VIZ.FEATHER_OUT + VIZ.FEATHER_IN);
  const c = u > 1 ? 1 : u > 0 ? u : 0;
  return c * c * (3 - 2 * c);
}

/**
 * Canvas-edge falloff: erase (0..1) at `e` px inside the fog canvas edge for a falloff `depth` px deep,
 * where the depth varies 0.55×…1.45× with the noise `n` (0..1): a cloud-shaped border, always fully
 * erased right at the edge.
 */
export function edgeErase(e: number, depth: number, n: number): number {
  const u = e / (depth * (0.55 + 0.9 * n));
  const c = u > 1 ? 1 : u > 0 ? u : 0;
  return 1 - c * c * (3 - 2 * c);
}
