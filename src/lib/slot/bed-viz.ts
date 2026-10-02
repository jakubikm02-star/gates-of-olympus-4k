/**
 * 4KA TV bonus visualizer: pure DSP helpers (no DOM, no audio graph).
 * Reads the bed loop's AnalyserNode bytes, splits them into bands and finds
 * kick onsets. Display only: nothing here touches audio output or game math.
 */

/**
 * Tunable constants. Times in ms. Display levels are 0..1 (dB mapped from MIN_DB..MAX_DB);
 * the beat detector works on linear bass amplitude (dB scale squashes a kick to a few %).
 */
export const VIZ = {
  /** AnalyserNode setup. 2048 at 48 kHz gives ~23 Hz bins, enough to isolate the kick. */
  FFT_SIZE: 2048,
  SMOOTHING: 0.3,
  MIN_DB: -90,
  MAX_DB: -16,
  /** Bands in Hz. */
  BASS_HZ: [40, 150] as const,
  MID_HZ: [150, 2000] as const,
  HIGH_HZ: [2000, 12000] as const,
  /** Spectrum ring range (log spaced, four-way mirror: bass at top/bottom center, highs at the side middles). */
  RING_HZ: [40, 14000] as const,
  /** Beat: linear bass amplitude must exceed rolling average × THRESHOLD and the MIN_BASS floor (≈ -50 dBFS). */
  THRESHOLD: 1.25,
  MIN_BASS: 0.003,
  /** Rolling average time constant. */
  AVG_MS: 600,
  /** Minimum gap between flashes: 300 ms = max 3.3 flashes/s (cap < 4/s; 340 for strict WCAG 2.3.1 ≤ 3/s). */
  COOLDOWN_MS: 300,
  /** Pulse envelope decay after a beat. */
  PULSE_DECAY_MS: 190,
  /** Output caps (seizure safety + taste). */
  GLOW_BASE: 0.28,
  GLOW_MAX: 0.92,
  HOT_MAX: 0.62,
  BURST_MAX: 0.26,
  AURA_BASE: 0.12,
  AURA_MAX: 0.85,
  BUMP_MAX: 0.011,
  /** Highs shimmer on the frame edge: (high level - SHIMMER_FROM) × SHIMMER_GAIN, clamped 0.12..1. */
  SHIMMER_FROM: 0.3,
  SHIMMER_GAIN: 2.2,
  /** Idle breathing (muted / no signal / AudioContext suspended). */
  IDLE_GLOW: 0.26,
  IDLE_SWING: 0.1,
  IDLE_PERIOD_MS: 4200,
  /** Below this total level for SILENCE_MS the visualizer falls back to idle breathing. */
  SILENCE_LEVEL: 0.015,
  SILENCE_MS: 600,
  /** Reduced motion: one static glow. */
  STATIC_GLOW: 0.42,
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
export function dbLevel(db: number, minDb: number = VIZ.MIN_DB, maxDb: number = VIZ.MAX_DB): number {
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
export function ringBins(count: number, band: Band, sampleRate: number, fftSize: number): Uint16Array {
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
  constructor(o: BeatOpts = { threshold: VIZ.THRESHOLD, minLevel: VIZ.MIN_BASS, avgMs: VIZ.AVG_MS, cooldownMs: VIZ.COOLDOWN_MS }) {
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
    if (this.armed && energy >= this.o.minLevel && energy > base * this.o.threshold && nowMs - this.last >= this.o.cooldownMs) {
      this.last = nowMs;
      this.armed = false;
      const over = (energy / base - this.o.threshold) / this.o.threshold;
      hit = Math.min(1, 0.7 + over * 0.9);
    }
    this.avg += (energy - this.avg) * ease(dtMs, this.o.avgMs);
    return hit;
  }
}
