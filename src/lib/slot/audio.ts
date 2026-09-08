/**
 * Sample bank: Mixkit (slot/thunder/whoosh) + Kenney Casino (CC0).
 * Pragmatic Play SFX are copyrighted and are not used.
 * Synth fallbacks fire only if a buffer has not decoded yet.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfx: GainNode | null = null;
let music: GainNode | null = null;
let muted = false;
let musicTimer: number | null = null;
let whiteBuf: AudioBuffer | null = null;
let brownBuf: AudioBuffer | null = null;
let spinNodes: { stop: () => void; gain: GainNode } | null = null;
let anticipateNodes: { stop: () => void } | null = null;
const playing: Partial<Record<string, { stop: () => void }>> = {};
const CUT_PREV = new Set(["win", "winFull", "payout", "bigwin"]);
const bufs: Record<string, AudioBuffer> = {};
let loadStarted = false;

const FILES: Record<string, string> = {
  spin: "/sfx/spin.mp3",
  land: "/sfx/land.mp3",
  land2: "/sfx/land2.mp3",
  click: "/sfx/click.mp3",
  win: "/sfx/win.mp3",
  winFull: "/sfx/win-full.mp3",
  payout: "/sfx/payout.mp3",
  coin: "/sfx/coin.mp3",
  scatter: "/sfx/scatter.mp3",
  collect: "/sfx/collect.mp3",
  tumble: "/sfx/tumble.mp3",
  pop: "/sfx/pop.mp3",
  zap: "/sfx/zap.mp3",
  electric: "/sfx/electric.mp3",
  thunder: "/sfx/thunder.mp3",
  bigwin: "/sfx/bigwin.mp3",
  siren: "/sfx/siren.mp3",
  harp: "/sfx/harp.mp3",
};

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
    sfx.gain.value = 0.86;
    music.gain.value = 0.14;
    master.gain.value = muted ? 0 : 0.92;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 10;
    comp.ratio.value = 3.2;
    comp.attack.value = 0.004;
    comp.release.value = 0.16;
    sfx.connect(master);
    music.connect(master);
    master.connect(comp);
    comp.connect(ctx.destination);
    whiteBuf = makeNoise(ctx, 1.4, "white");
    brownBuf = makeNoise(ctx, 1.6, "brown");
    void loadBank();
  }
  if (ctx.state === "suspended") void ctx.resume();
}

async function loadBank(): Promise<void> {
  if (!ctx || loadStarted) return;
  loadStarted = true;
  await Promise.all(
    Object.entries(FILES).map(async ([key, url]) => {
      try {
        const res = await fetch(url);
        const raw = await res.arrayBuffer();
        bufs[key] = await ctx!.decodeAudioData(raw.slice(0));
      } catch {
        /* keep synth fallback */
      }
    }),
  );
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
    } else d[i] = w;
  }
  return buf;
}

export function setMuted(next: boolean): void {
  muted = next;
  if (master && ctx) master.gain.setTargetAtTime(next ? 0 : 0.92, ctx.currentTime, 0.04);
}

export function duckMusic(amount: number): void {
  if (!music || !ctx) return;
  const a = Math.max(0.04, Math.min(1, amount));
  music.gain.setTargetAtTime(muted ? 0 : 0.14 * a, ctx.currentTime, 0.08);
}

function playBuf(
  name: string,
  opts: { gain?: number; rate?: number; pan?: number; loop?: boolean; when?: number } = {},
): { stop: () => void; gain: GainNode } | null {
  const b = bufs[name];
  if (!ctx || !sfx || !b) return null;
  const t = opts.when ?? ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = b;
  src.loop = !!opts.loop;
  src.playbackRate.value = opts.rate ?? 1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(opts.gain ?? 0.85, t);
  const p = ctx.createStereoPanner();
  p.pan.setValueAtTime(Math.max(-1, Math.min(1, opts.pan ?? 0)), t);
  src.connect(p);
  p.connect(g);
  g.connect(sfx);
  src.start(t);
  if (!opts.loop) src.stop(t + b.duration / (opts.rate ?? 1) + 0.02);
  const handle = {
    gain: g,
    stop: () => {
      g.gain.setTargetAtTime(0.0001, ctx!.currentTime, 0.04);
      window.setTimeout(() => {
        try {
          src.stop();
        } catch {
          /* already */
        }
      }, 80);
    },
  };
  if (CUT_PREV.has(name)) {
    playing[name]?.stop();
    playing[name] = handle;
  }
  return handle;
}

function env(duration: number, peak: number, attack = 0.005, when = 0): GainNode | null {
  if (!ctx || !sfx) return null;
  const g = ctx.createGain();
  const t = when || ctx.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  g.connect(sfx);
  return g;
}

function tone(type: OscillatorType, freq: number, duration: number, peak = 0.1, slide?: number, when?: number, pan = 0): void {
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
  if (!playBuf("click", { gain: 0.7, rate: 0.95 + Math.random() * 0.1 })) {
    noise("white", 0.04, 0.06, 1200, 5000);
    tone("triangle", 880, 0.05, 0.035);
  }
}

export function startSpin(): void {
  if (!ctx || !sfx) return;
  stopSpin();
  duckMusic(0.45);
  const sample = playBuf("spin", { gain: 0.42, loop: true, rate: 1.02 });
  if (sample) {
    spinNodes = { gain: sample.gain, stop: sample.stop };
    return;
  }
  if (!whiteBuf || !brownBuf) return;
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
  spinNodes = {
    gain: g,
    stop: () => {
      g.gain.setTargetAtTime(0.0001, ctx!.currentTime, 0.05);
      window.setTimeout(() => {
        try {
          src.stop();
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
  spinNodes.gain.gain.setTargetAtTime((bufs.spin ? 0.42 : 0.07) * x, ctx.currentTime, 0.05);
}

export function stopSpin(): void {
  spinNodes?.stop();
  spinNodes = null;
  stopAnticipate();
}

export function playLand(col = 0): void {
  const pan = (col / 5) * 1.3 - 0.65;
  const rate = 0.9 + col * 0.035 + Math.random() * 0.04;
  const name = col % 2 === 0 ? "land" : "land2";
  if (!playBuf(name, { gain: 0.8, rate, pan })) {
    noise("white", 0.055, 0.13, 1800, 7000, undefined, pan);
    tone("sine", 92 + col * 22, 0.14, 0.09, 48, undefined, pan);
  }
}

export function playWin(size: "spark" | "full" = "spark"): void {
  if (size === "full") {
    if (playBuf("winFull", { gain: 0.48 })) return;
  } else if (playBuf("win", { gain: 0.4, rate: 0.96 + Math.random() * 0.08 })) {
    return;
  }
  if (!ctx) return;
  const t = ctx.currentTime;
  if (size === "full") {
    tone("sine", 261, 0.32, 0.05, undefined, t);
    tone("sine", 329, 0.34, 0.045, undefined, t + 0.05);
    tone("sine", 392, 0.36, 0.05, undefined, t + 0.1);
  } else {
    tone("sine", 392, 0.18, 0.045, 330, t);
    tone("sine", 523, 0.16, 0.03, undefined, t + 0.02);
  }
}

export function playCoin(): void {
  if (!playBuf("coin", { gain: 0.65, rate: 0.96 + Math.random() * 0.08 })) {
    tone("sine", 1480, 0.12, 0.05, 1360);
  }
}

export function playPayout(): void {
  if (!playBuf("payout", { gain: 0.46 })) playCoin();
}

export function playTumble(): void {
  if (!playBuf("tumble", { gain: 0.75, rate: 0.92 + Math.random() * 0.1 })) {
    noise("brown", 0.32, 0.11, 50, 900);
  }
}

export function playPop(): void {
  if (!playBuf("pop", { gain: 0.7 }) && !playBuf("electric", { gain: 0.55 })) {
    noise("white", 0.1, 0.12, 600, 7000);
  }
}

export function playZap(): void {
  playBuf("electric", { gain: 0.7, rate: 1.05 });
  if (!playBuf("zap", { gain: 0.8 })) {
    noise("white", 0.08, 0.2, 1800, 9000);
    tone("sawtooth", 520, 0.1, 0.06, 70);
  }
}

export function playScatter(n = 1): void {
  playBuf(n >= 3 ? "harp" : "scatter", { gain: 0.45 + n * 0.08, rate: 0.92 + n * 0.04 });
  if (n >= 3) playBuf("collect", { gain: 0.55 });
  if (n >= 4) playThunder();
}

export function startAnticipate(): void {
  if (!ctx || !sfx || anticipateNodes) return;
  duckMusic(0.28);
  const harp = playBuf("harp", { gain: 0.35, rate: 0.85, loop: true });
  if (harp) {
    harp.gain.gain.setValueAtTime(0.12, ctx.currentTime);
    harp.gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 1.6);
    anticipateNodes = { stop: harp.stop };
    return;
  }
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(70, ctx.currentTime);
  o.frequency.linearRampToValueAtTime(210, ctx.currentTime + 2);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.16);
  o.connect(g);
  g.connect(sfx);
  o.start();
  anticipateNodes = {
    stop: () => {
      g.gain.setTargetAtTime(0.0001, ctx!.currentTime, 0.04);
      window.setTimeout(() => {
        try {
          o.stop();
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
  if (!playBuf("thunder", { gain: 0.9 })) {
    noise("brown", 0.7, 0.24, 20, 380);
    noise("white", 0.12, 0.16, 900, 6000);
  }
}

export function playMult(): void {
  playBuf("collect", { gain: 0.5, rate: 0.98 });
}

export function playFsStart(): void {
  playThunder();
  playBuf("harp", { gain: 0.7 });
  playBuf("siren", { gain: 0.35 });
}

export function playBigWin(): void {
  stopSpin();
  duckMusic(0.35);
  if (!playBuf("bigwin", { gain: 0.8 })) playBuf("winFull", { gain: 0.8 });
}

export function playMaxWin(): void {
  playBigWin();
  playBuf("siren", { gain: 0.55 });
  window.setTimeout(() => playThunder(), 160);
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
      g.gain.linearRampToValueAtTime(0.028, now + 0.8);
      g.gain.linearRampToValueAtTime(0.0001, now + 2.8);
      o.connect(g);
      g.connect(music);
      o.start(now);
      o.stop(now + 2.9);
    }
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
