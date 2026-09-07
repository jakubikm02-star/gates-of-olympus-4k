/**
 * Original Pragmatic Play SFX are copyrighted — we do not rip, sample, or
 * redistribute them. These are original Web Audio recreations of the same
 * *roles* (reel whir, metallic stop, sparkle win, thunder, choir scatter,
 * tumble whoosh, anticipation riser) for a private / personal demo.
 *
 * Legal royalty-free sources you can swap in later for personal use:
 *   - Mixkit (mixkit.co/free-sound-effects) — Mixkit License, free personal + commercial
 *   - Pixabay Sound Effects (pixabay.com/sound-effects) — Pixabay License
 *   - Kenney.nl Casino Audio / Interface Sounds — CC0
 *   - Freesound.org — filter by CC0 / CC-BY (credit the author if CC-BY)
 * Do not use rips from YouTube, casino streams, or extracted .bank/.awc files.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfx: GainNode | null = null;
let music: GainNode | null = null;
let muted = false;
let musicTimer: number | null = null;
let noiseBuf: AudioBuffer | null = null;
let spinNodes: { stop: () => void } | null = null;
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
    sfx.gain.value = 0.8;
    music.gain.value = 0.15;
    master.gain.value = muted ? 0 : 0.92;
    sfx.connect(master);
    music.connect(master);
    master.connect(ctx.destination);
    const n = Math.floor(ctx.sampleRate * 1.4);
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      last = last * 0.96 + (Math.random() * 2 - 1) * 0.04;
      d[i] = last + (Math.random() * 2 - 1) * 0.35;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
}

export function setMuted(next: boolean): void {
  muted = next;
  if (master && ctx) master.gain.setTargetAtTime(next ? 0 : 0.92, ctx.currentTime, 0.03);
}

function env(duration: number, peak: number, attack = 0.006): GainNode | null {
  if (!ctx || !sfx) return null;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  g.connect(sfx);
  return g;
}

function tone(type: OscillatorType, freq: number, duration: number, peak = 0.1, slide?: number): void {
  if (!ctx || !sfx) return;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), ctx.currentTime + duration);
  const g = env(duration, peak);
  if (!g) return;
  o.connect(g);
  o.start();
  o.stop(ctx.currentTime + duration + 0.02);
}

function burst(duration: number, peak: number, hp = 200, lp = 2400): void {
  if (!ctx || !sfx || !noiseBuf) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.92 + Math.random() * 0.16;
  const f1 = ctx.createBiquadFilter();
  f1.type = "highpass";
  f1.frequency.value = hp;
  const f2 = ctx.createBiquadFilter();
  f2.type = "lowpass";
  f2.frequency.value = lp;
  const g = env(duration, peak, 0.004);
  if (!g) return;
  src.connect(f1);
  f1.connect(f2);
  f2.connect(g);
  src.start();
  src.stop(ctx.currentTime + duration + 0.02);
}

export function playClick(): void {
  burst(0.05, 0.08, 800, 4000);
  tone("square", 740, 0.04, 0.04);
}

export function startSpin(): void {
  if (!ctx || !sfx || !noiseBuf) return;
  stopSpin();
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 780;
  bp.Q.value = 1.4;
  const g = ctx.createGain();
  g.gain.value = 0.075;
  src.connect(bp);
  bp.connect(g);
  g.connect(sfx);
  src.start();
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.value = 38;
  const og = ctx.createGain();
  og.gain.value = 0.038;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 220;
  o.connect(lp);
  lp.connect(og);
  og.connect(sfx);
  o.start();
  spinNodes = {
    stop: () => {
      try {
        src.stop();
        o.stop();
      } catch {
        /* already stopped */
      }
      g.disconnect();
      og.disconnect();
    },
  };
}

export function stopSpin(): void {
  spinNodes?.stop();
  spinNodes = null;
  stopAnticipate();
}

export function playLand(col = 0): void {
  const detune = col * 18;
  burst(0.08, 0.16, 70, 980);
  tone("triangle", 188 + detune + Math.random() * 24, 0.1, 0.11);
  tone("square", 780 + detune, 0.035, 0.035);
  tone("sine", 110, 0.12, 0.05, 55);
}

export function playWin(): void {
  burst(0.2, 0.08, 1800, 9000);
  [523, 659, 784, 1046, 1318].forEach((n, i) => {
    window.setTimeout(() => {
      tone("triangle", n, 0.26, 0.09);
      tone("sine", n * 2, 0.18, 0.03);
    }, i * 48);
  });
}

export function playCoin(): void {
  const f = 1280 + Math.random() * 280;
  tone("square", f, 0.055, 0.038);
  tone("sine", f * 1.5, 0.08, 0.028);
}

export function playTumble(): void {
  burst(0.26, 0.12, 90, 1500);
  tone("sine", 150, 0.22, 0.07, 62);
  tone("triangle", 90, 0.18, 0.05, 40);
}

export function playPop(): void {
  burst(0.12, 0.14, 380, 6200);
  tone("square", 170, 0.09, 0.08, 55);
  tone("sine", 920, 0.08, 0.04);
}

export function playScatter(n = 1): void {
  const gain = 0.06 + Math.min(4, n) * 0.028;
  burst(0.32, 0.1 + n * 0.03, 80, 800);
  const chord = n >= 3 ? [392, 494, 587, 784, 988] : [392, 494, 587, 784];
  chord.forEach((note, i) => {
    window.setTimeout(() => {
      tone("sine", note, 0.42, gain);
      tone("triangle", note * 2, 0.28, gain * 0.45);
    }, i * 38);
  });
  tone("sawtooth", 64 + n * 6, 0.5, 0.07 + n * 0.015, 30);
  if (n >= 3) burst(0.4, 0.14, 40, 500);
}

export function startAnticipate(): void {
  if (!ctx || !sfx || anticipateNodes) return;
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(88, ctx.currentTime);
  o.frequency.linearRampToValueAtTime(240, ctx.currentTime + 1.8);
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(360, ctx.currentTime);
  f.frequency.linearRampToValueAtTime(2200, ctx.currentTime + 1.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.14);
  o.connect(f);
  f.connect(g);
  g.connect(sfx);
  o.start();

  const beat = ctx.createOscillator();
  beat.type = "sine";
  beat.frequency.value = 52;
  const bg = ctx.createGain();
  bg.gain.value = 0.04;
  const lfo = ctx.createOscillator();
  lfo.type = "square";
  lfo.frequency.value = 2.35;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.038;
  lfo.connect(lfoG);
  lfoG.connect(bg.gain);
  beat.connect(bg);
  bg.connect(sfx);
  beat.start();
  lfo.start();

  const shimmer = ctx.createOscillator();
  shimmer.type = "triangle";
  shimmer.frequency.setValueAtTime(880, ctx.currentTime);
  shimmer.frequency.linearRampToValueAtTime(1760, ctx.currentTime + 1.8);
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.0001, ctx.currentTime);
  sg.gain.exponentialRampToValueAtTime(0.035, ctx.currentTime + 0.3);
  shimmer.connect(sg);
  sg.connect(sfx);
  shimmer.start();

  burst(0.22, 0.09, 50, 420);
  anticipateNodes = {
    stop: () => {
      try {
        o.stop();
        beat.stop();
        lfo.stop();
        shimmer.stop();
      } catch {
        /* already */
      }
      g.disconnect();
      bg.disconnect();
      sg.disconnect();
    },
  };
}

export function stopAnticipate(): void {
  anticipateNodes?.stop();
  anticipateNodes = null;
}

export function playThunder(): void {
  burst(0.62, 0.26, 30, 520);
  burst(0.28, 0.14, 700, 4200);
  tone("triangle", 46, 0.8, 0.18, 24);
  tone("sine", 980, 0.2, 0.055);
  tone("sawtooth", 38, 0.55, 0.1, 18);
}

export function playFsStart(): void {
  playThunder();
  [261, 329, 392, 523, 659, 784].forEach((n, i) => {
    window.setTimeout(() => {
      tone("sine", n, 0.7, 0.1);
      tone("triangle", n * 2, 0.5, 0.045);
    }, i * 90);
  });
}

export function playBigWin(): void {
  stopSpin();
  const notes = [261, 329, 392, 523, 659, 784, 1046];
  notes.forEach((n, i) => {
    window.setTimeout(() => {
      tone("triangle", n, 0.48, 0.12);
      tone("sine", n * 2, 0.32, 0.04);
    }, i * 78);
  });
  burst(0.45, 0.12, 180, 3200);
}

export function playMaxWin(): void {
  playBigWin();
  window.setTimeout(() => playThunder(), 180);
  window.setTimeout(() => playFsStart(), 400);
}

export function startAmbience(): void {
  if (!ctx || !music || musicTimer !== null) return;
  const chords = [
    [146.8, 220, 277.2],
    [164.8, 196, 246.9],
    [130.8, 196, 261.6],
    [174.6, 220, 261.6],
  ];
  let i = 0;
  const loop = () => {
    if (!ctx || !music) {
      musicTimer = window.setTimeout(loop, 2800);
      return;
    }
    if (muted) {
      musicTimer = window.setTimeout(loop, 2800);
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
      g.gain.linearRampToValueAtTime(0.026, now + 0.7);
      g.gain.linearRampToValueAtTime(0.0001, now + 2.6);
      o.connect(g);
      g.connect(music);
      o.start(now);
      o.stop(now + 2.7);
    }
    const shimmer = ctx.createOscillator();
    shimmer.type = "triangle";
    shimmer.frequency.value = 1174;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0, now);
    sg.gain.linearRampToValueAtTime(0.011, now + 0.4);
    sg.gain.linearRampToValueAtTime(0.0001, now + 1.8);
    shimmer.connect(sg);
    sg.connect(music);
    shimmer.start(now);
    shimmer.stop(now + 1.9);
    musicTimer = window.setTimeout(loop, 2600);
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
