/** Procedural slot SFX. Unlock from the first user gesture. */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfx: GainNode | null = null;
let music: GainNode | null = null;
let muted = false;
let musicTimer: number | null = null;

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
    sfx.gain.value = 0.7;
    music.gain.value = 0.18;
    master.gain.value = muted ? 0 : 0.85;
    sfx.connect(master);
    music.connect(master);
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
}

export function setMuted(next: boolean): void {
  muted = next;
  if (master && ctx) {
    master.gain.setTargetAtTime(next ? 0 : 0.85, ctx.currentTime, 0.03);
  }
}

function envGain(duration: number, peak = 0.2, attack = 0.008): GainNode | null {
  if (!ctx || !sfx) return null;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, ctx.currentTime);
  g.gain.linearRampToValueAtTime(peak, ctx.currentTime + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  g.connect(sfx);
  return g;
}

function osc(type: OscillatorType, freq: number, duration: number, peak = 0.12): void {
  if (!ctx || !sfx) return;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime);
  const g = envGain(duration, peak);
  if (!g) return;
  o.connect(g);
  o.start();
  o.stop(ctx.currentTime + duration + 0.02);
}

export function playClick(): void {
  osc("square", 620, 0.05, 0.05);
}

export function playSpin(): void {
  if (!ctx || !sfx) return;
  const now = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(180, now);
  o.frequency.exponentialRampToValueAtTime(70, now + 0.28);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.06, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
  o.connect(g);
  g.connect(sfx);
  o.start(now);
  o.stop(now + 0.32);
}

export function playLand(): void {
  osc("triangle", 220, 0.07, 0.09);
  osc("square", 880, 0.04, 0.03);
}

export function playWin(): void {
  osc("triangle", 523, 0.18, 0.1);
  osc("triangle", 659, 0.22, 0.08);
  osc("sine", 784, 0.28, 0.07);
}

export function playTumble(): void {
  osc("sine", 160, 0.12, 0.06);
}

export function playScatter(): void {
  if (!ctx || !sfx) return;
  const now = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(90, now);
  o.frequency.exponentialRampToValueAtTime(40, now + 0.5);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.16, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(800, now);
  o.connect(f);
  f.connect(g);
  g.connect(sfx);
  o.start(now);
  o.stop(now + 0.56);
  osc("sine", 1200, 0.25, 0.05);
}

export function playThunder(): void {
  playScatter();
  osc("triangle", 55, 0.6, 0.14);
}

export function playBigWin(): void {
  const notes = [261, 329, 392, 523, 659, 784];
  notes.forEach((n, i) => {
    window.setTimeout(() => osc("triangle", n, 0.35, 0.1), i * 70);
  });
}

export function playMaxWin(): void {
  playBigWin();
  window.setTimeout(() => playThunder(), 200);
}

export function startAmbience(): void {
  if (!ctx || !music || musicTimer !== null) return;
  const loop = () => {
    if (!ctx || !music || muted) {
      musicTimer = window.setTimeout(loop, 2400);
      return;
    }
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(110 + Math.random() * 8, now);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.04, now + 0.8);
    g.gain.linearRampToValueAtTime(0.0001, now + 2.4);
    o.connect(g);
    g.connect(music);
    o.start(now);
    o.stop(now + 2.5);
    musicTimer = window.setTimeout(loop, 2200);
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
