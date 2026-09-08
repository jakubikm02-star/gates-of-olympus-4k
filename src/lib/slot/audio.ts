/**
 * Original Pragmatic Play SFX are copyrighted — we do not rip or redistribute
 * them. Original Web Audio recreations of the same roles for this demo.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfx: GainNode | null = null;
let music: GainNode | null = null;
let muted = false;
let musicTimer: number | null = null;
let whiteBuf: AudioBuffer | null = null;
let brownBuf: AudioBuffer | null = null;
let spinNodes: { stop: () => void; gain: GainNode; bp: BiquadFilterNode } | null = null;
let anticipateNodes: { stop: () => void } | null = null;

export function isMuted(): boolean {
  return muted;
}

export function unlockAudio(): void {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC({ latencyHint: "interactive" });
    master = ctx.createGain();
    sfx = ctx.createGain();
    music = ctx.createGain();
    sfx.gain.value = 0.78;
    music.gain.value = 0.16;
    master.gain.value = muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.004;
    comp.release.value = 0.14;
    sfx.connect(master);
    music.connect(master);
    master.connect(comp);
    comp.connect(ctx.destination);
    whiteBuf = makeNoise(ctx, 1.6, "white");
    brownBuf = makeNoise(ctx, 1.8, "brown");
  }
  if (ctx.state === "suspended") void ctx.resume();
}

function makeNoise(ac: AudioContext, seconds: number, kind: "white" | "brown"): AudioBuffer {
  const n = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === "brown") {
      last = Math.max(-1, Math.min(1, last * 0.98 + w * 0.04));
      d[i] = last * 3.2;
    } else {
      d[i] = w;
    }
  }
  return buf;
}

export function setMuted(next: boolean): void {
  muted = next;
  if (master && ctx) master.gain.setTargetAtTime(next ? 0 : 0.9, ctx.currentTime, 0.04);
}

export function duckMusic(amount: number): void {
  if (!music || !ctx) return;
  const a = Math.max(0.04, Math.min(1, amount));
  music.gain.setTargetAtTime(muted ? 0 : 0.16 * a, ctx.currentTime, 0.08);
}

function env(duration: number, peak: number, attack = 0.005, when = 0): GainNode | null {
  if (!ctx || !sfx) return null;
  const g = ctx.createGain();
  const t = (when || ctx.currentTime);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  g.connect(sfx);
  return g;
}

function tone(
  type: OscillatorType,
  freq: number,
  duration: number,
  peak = 0.1,
  slide?: number,
  when?: number,
  pan = 0,
): void {
  if (!ctx || !sfx) return;
  const t = when ?? ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + duration);
  const g = env(duration, peak, 0.006, t);
  if (!g) return;
  const p = ctx.createStereoPanner();
  p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), t);
  o.connect(p);
  p.connect(g);
  o.start(t);
  o.stop(t + duration + 0.03);
}

function noise(kind: "white" | "brown", duration: number, peak: number, hp = 200, lp = 2400, when?: number, pan = 0): void {
  if (!ctx || !sfx) return;
  const buf = kind === "brown" ? brownBuf : whiteBuf;
  if (!buf) return;
  const t = when ?? ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = 0.88 + Math.random() * 0.22;
  const f1 = ctx.createBiquadFilter();
  f1.type = "highpass";
  f1.frequency.value = hp;
  const f2 = ctx.createBiquadFilter();
  f2.type = "lowpass";
  f2.frequency.value = lp;
  const g = env(duration, peak, 0.003, t);
  if (!g) return;
  const p = ctx.createStereoPanner();
  p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), t);
  src.connect(f1);
  f1.connect(f2);
  f2.connect(p);
  p.connect(g);
  src.start(t);
  src.stop(t + duration + 0.03);
}

export function playClick(): void {
  noise("white", 0.04, 0.06, 1200, 5000);
  tone("triangle", 880, 0.05, 0.035);
}

export function startSpin(): void {
  if (!ctx || !sfx || !whiteBuf || !brownBuf) return;
  stopSpin();
  const src = ctx.createBufferSource();
  src.buffer = whiteBuf;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 920;
  bp.Q.value = 1.1;
  const g = ctx.createGain();
  g.gain.value = 0.07;
  src.connect(bp);
  bp.connect(g);
  g.connect(sfx);
  src.start();

  const rumble = ctx.createBufferSource();
  rumble.buffer = brownBuf;
  rumble.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 180;
  const rg = ctx.createGain();
  rg.gain.value = 0.05;
  rumble.connect(lp);
  lp.connect(rg);
  rg.connect(sfx);
  rumble.start();

  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.value = 32;
  const og = ctx.createGain();
  og.gain.value = 0.028;
  o.connect(og);
  og.connect(sfx);
  o.start();

  duckMusic(0.45);
  spinNodes = {
    gain: g,
    bp,
    stop: () => {
      const now = ctx!.currentTime;
      g.gain.setTargetAtTime(0.0001, now, 0.05);
      rg.gain.setTargetAtTime(0.0001, now, 0.05);
      og.gain.setTargetAtTime(0.0001, now, 0.05);
      window.setTimeout(() => {
        try {
          src.stop();
          rumble.stop();
          o.stop();
        } catch {
          /* already */
        }
        try {
          g.disconnect();
          rg.disconnect();
          og.disconnect();
        } catch {
          /* already */
        }
      }, 90);
    },
  };
}

export function setSpinEnergy(t: number): void {
  if (!ctx || !spinNodes) return;
  const x = Math.max(0, Math.min(1, t));
  spinNodes.gain.gain.setTargetAtTime(0.07 * x, ctx.currentTime, 0.045);
  spinNodes.bp.frequency.setTargetAtTime(380 + 540 * x, ctx.currentTime, 0.06);
}

export function stopSpin(): void {
  spinNodes?.stop();
  spinNodes = null;
  stopAnticipate();
}

export function playLand(col = 0): void {
  const pan = (col / 5) * 1.3 - 0.65;
  const detune = col * 22;
  noise("white", 0.055, 0.13, 1800, 7000, undefined, pan);
  noise("brown", 0.12, 0.1, 40, 280, undefined, pan);
  tone("sine", 92 + detune, 0.14, 0.09, 48, undefined, pan);
  tone("triangle", 420 + detune, 0.07, 0.05, undefined, undefined, pan);
  tone("sine", 1240 + detune, 0.04, 0.028, undefined, undefined, pan);
}

export function playWin(size: "spark" | "full" = "spark"): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise("white", 0.16, 0.05, 2500, 9000, t);
  const notes = size === "full" ? [523, 659, 784, 1046, 1318, 1568] : [784, 1046, 1318];
  notes.forEach((n, i) => {
    tone("sine", n, 0.38, size === "full" ? 0.08 : 0.055, undefined, t + i * 0.042);
    tone("triangle", n * 2.01, 0.22, 0.022, undefined, t + i * 0.042);
  });
}

export function playCoin(): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  const f = 1480 + Math.random() * 220;
  tone("sine", f, 0.12, 0.05, f * 0.92, t);
  tone("sine", f * 1.5, 0.09, 0.02, undefined, t);
}

export function playPayout(): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  [0, 0.07, 0.13, 0.2, 0.28].forEach((off, i) => {
    const f = 1320 + i * 90;
    tone("sine", f, 0.14, 0.045, f * 0.9, t + off);
    tone("triangle", f * 2, 0.08, 0.016, undefined, t + off);
  });
}

export function playTumble(): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise("brown", 0.32, 0.11, 50, 900, t);
  noise("white", 0.18, 0.06, 400, 2800, t);
  tone("sine", 180, 0.28, 0.06, 55, t);
}

export function playPop(): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise("white", 0.1, 0.12, 600, 7000, t);
  tone("sawtooth", 240, 0.1, 0.05, 50, t);
  tone("sine", 70, 0.16, 0.06, 32, t);
}

export function playZap(): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise("white", 0.08, 0.2, 1800, 9000, t);
  noise("brown", 0.28, 0.12, 40, 400, t + 0.02);
  tone("sawtooth", 520, 0.1, 0.06, 70, t);
  tone("sine", 48, 0.32, 0.1, 22, t);
  tone("sine", 1400, 0.06, 0.03, undefined, t);
}

export function playScatter(n = 1): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  const pan = 0;
  const peak = 0.05 + Math.min(4, n) * 0.022;
  noise("brown", 0.22, 0.07 + n * 0.02, 60, 700, t, pan);
  const harp = n >= 4 ? [392, 523, 659, 784, 1046] : n >= 3 ? [392, 494, 659, 784] : [330, 392, 523];
  harp.forEach((note, i) => {
    tone("sine", note, 0.46, peak, undefined, t + i * 0.036, pan);
    tone("triangle", note * 2, 0.22, peak * 0.35, undefined, t + i * 0.036, pan);
  });
  if (n >= 3) {
    tone("sine", 55, 0.5, 0.08, 28, t);
    noise("white", 0.2, 0.08, 200, 1600, t);
  }
  if (n >= 4) playThunder();
}

export function startAnticipate(): void {
  if (!ctx || !sfx || anticipateNodes) return;
  duckMusic(0.28);
  const now = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(70, now);
  o.frequency.linearRampToValueAtTime(210, now + 2);
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(280, now);
  f.frequency.linearRampToValueAtTime(2400, now + 2);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.09, now + 0.16);
  o.connect(f);
  f.connect(g);
  g.connect(sfx);
  o.start(now);

  const kick = ctx.createOscillator();
  kick.type = "sine";
  kick.frequency.value = 48;
  const kg = ctx.createGain();
  kg.gain.value = 0.0001;
  const lfo = ctx.createOscillator();
  lfo.type = "square";
  lfo.frequency.value = 2.6;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.045;
  lfo.connect(lfoG);
  lfoG.connect(kg.gain);
  kick.connect(kg);
  kg.connect(sfx);
  kick.start(now);
  lfo.start(now);

  const choir = ctx.createOscillator();
  choir.type = "triangle";
  choir.frequency.setValueAtTime(392, now);
  choir.frequency.linearRampToValueAtTime(784, now + 2);
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.0001, now);
  cg.gain.exponentialRampToValueAtTime(0.04, now + 0.4);
  choir.connect(cg);
  cg.connect(sfx);
  choir.start(now);

  noise("brown", 0.24, 0.08, 40, 380, now);
  anticipateNodes = {
    stop: () => {
      const t = ctx!.currentTime;
      g.gain.setTargetAtTime(0.0001, t, 0.04);
      kg.gain.setTargetAtTime(0.0001, t, 0.04);
      cg.gain.setTargetAtTime(0.0001, t, 0.04);
      window.setTimeout(() => {
        try {
          o.stop();
          kick.stop();
          lfo.stop();
          choir.stop();
        } catch {
          /* already */
        }
      }, 80);
    },
  };
}

export function stopAnticipate(): void {
  anticipateNodes?.stop();
  anticipateNodes = null;
}

export function playThunder(): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise("brown", 0.7, 0.24, 20, 380, t);
  noise("white", 0.12, 0.16, 900, 6000, t);
  noise("white", 0.18, 0.08, 400, 2500, t + 0.08);
  tone("sine", 42, 0.85, 0.16, 22, t);
  tone("triangle", 78, 0.4, 0.05, 30, t);
}

export function playMult(): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  [659, 784, 988, 1318].forEach((n, i) => {
    tone("sine", n, 0.4, 0.07, undefined, t + i * 0.05);
    tone("triangle", n * 2, 0.2, 0.02, undefined, t + i * 0.05);
  });
  noise("white", 0.12, 0.06, 2000, 8000, t);
}

export function playFsStart(): void {
  playThunder();
  if (!ctx) return;
  const t = ctx.currentTime + 0.08;
  [261, 329, 392, 523, 659, 784].forEach((n, i) => {
    tone("sine", n, 0.7, 0.08, undefined, t + i * 0.08);
    tone("triangle", n * 2, 0.4, 0.03, undefined, t + i * 0.08);
  });
}

export function playBigWin(): void {
  stopSpin();
  duckMusic(0.35);
  if (!ctx) return;
  const t = ctx.currentTime;
  [261, 329, 392, 523, 659, 784, 1046].forEach((n, i) => {
    tone("triangle", n, 0.5, 0.1, undefined, t + i * 0.07);
    tone("sine", n * 2, 0.28, 0.03, undefined, t + i * 0.07);
  });
  noise("white", 0.35, 0.08, 200, 3000, t);
}

export function playMaxWin(): void {
  playBigWin();
  if (!ctx) return;
  const t = ctx.currentTime;
  window.setTimeout(() => playThunder(), 160);
  [523, 659, 784, 1046, 1318].forEach((n, i) => {
    tone("sine", n, 0.8, 0.08, undefined, t + 0.4 + i * 0.09);
  });
}

export function startAmbience(): void {
  if (!ctx || !music || musicTimer !== null) return;
  const chords = [
    [146.8, 220, 293.7],
    [130.8, 196, 261.6],
    [164.8, 246.9, 329.6],
    [174.6, 220, 261.6],
  ];
  let i = 0;
  const loop = () => {
    if (!ctx || !music) {
      musicTimer = window.setTimeout(loop, 3000);
      return;
    }
    if (muted) {
      musicTimer = window.setTimeout(loop, 3000);
      return;
    }
    const now = ctx.currentTime;
    const chord = chords[i % chords.length];
    i += 1;
    for (const freq of chord) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.03, now + 0.8);
      g.gain.linearRampToValueAtTime(0.0001, now + 2.8);
      o.connect(g);
      g.connect(music);
      o.start(now);
      o.stop(now + 2.9);
    }
    const harp = ctx.createOscillator();
    harp.type = "triangle";
    harp.frequency.value = 1174.7;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0, now);
    hg.gain.linearRampToValueAtTime(0.012, now + 0.3);
    hg.gain.linearRampToValueAtTime(0.0001, now + 1.6);
    harp.connect(hg);
    hg.connect(music);
    harp.start(now);
    harp.stop(now + 1.7);
    musicTimer = window.setTimeout(loop, 2800);
  };
  loop();
}

export function resumeIfNeeded(): void {
  if (ctx?.state === "suspended") void ctx.resume();
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resumeIfNeeded();
  });
}
