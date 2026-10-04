/**
 * Sample bank: Mixkit (slot/thunder/whoosh) + Kenney Casino (CC0)
 * + Freesound LilMati coin05 (CC0). Pragmatic Play SFX are not used.
 * Synth fallbacks fire only if a buffer has not decoded yet.
 *
 * Node graph (master volume is the LAST stage, after every analyser tap):
 *
 *   one-shot / loop ▶ voice gain ─▶ cue[key] 0–2 ─▶ sfx ─┐
 *   synth music ─────────────────────────────────▶ music ┴▶ master (mute, 0.92) ▶ glue comp ─┐
 *   bed/zásah <audio> ─▶ MediaElementSource (mediaSource(el, key)) ─▶ cue[el:key] 0–2 ────────┤
 *                       └─ (4KA TV visualizer analyser taps here, before every volume) ─────  │
 *                                                                                             ▼
 *                                             out = audioOut(): volume Gain 0–2 ▶ limiter ▶ destination
 *
 * cue[key] is the per-sound slider, so effective = cue × master. Both are GLOBAL: set by the admin in
 * Settings, stored in Supabase public.sfx_volume, loaded by every client at start (100 % until then).
 * Analysers (e.g. the 4KA TV visualizer) tap `mediaSource(el)` or the voice gain, so they read
 * the signal before both the per-sound and the master volume. Nothing may connect to
 * ctx.destination directly, or it would skip the volume sliders: connect to audioOut() instead.
 * Fallback sounds are counted to the slot whose moment they play (withCue): e.g. zásah start
 * without its own upload plays the KONTROLA sample on the „Štart zásahu“ slider.
 */

import { VIZ } from "./bed-viz.ts";
import { antiFallback, type AntiCue } from "./anticipation.ts";
import { CUE_WAIT_MS, cueRoute } from "./cue-ready.ts";
import { CAN_DROP_WINDOW_MS, CAN_STRIKE_GAP_MS, createSfxGate } from "./can-sfx.ts";
import {
  CUE_LEVEL_MAX,
  MASTER_KEY,
  clampCueLevel,
  directElementVolume,
  globalLevelsPayload,
  isLegacyVolumeKey,
  parseGlobalLevels,
} from "./cue-volume.ts";

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
let liveBed: { stop: () => void; duck: (amount: number) => void } | null = null;
let liveEl: HTMLAudioElement | null = null;
let loopKey: string | null = null;
let loopGen = 0;
let pendingLoop: "bed" | "zasah" | null = null;
const LIVE_VOL = 0.62;
let liveDuck = 1;
const playing: Partial<Record<string, { stop: () => void }>> = {};
const CUT_PREV = new Set(["win", "winFull", "payout", "bigwin", "tumble", "pop", "tableA", "tableB", "massive"]);
/** Player master volume, 0 … 2 (0 % … 200 %). Above 1 the limiter engages. */
export const VOLUME_MAX = 2;
/** Global master volume (admin-set, loaded from Supabase). 100 % until loaded or if the fetch fails. */
let volume = 1;
let out: GainNode | null = null;
let limiter: DynamicsCompressorNode | null = null;
const elSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
/** Which per-sound bus an element routed by mediaSource() feeds ("" = straight to out). */
const elRoute = new WeakMap<HTMLMediaElement, string>();
/** Global per-sound volume, 0 … 2 (missing = 100 %). */
const cueLevels: Record<string, number> = {};
/** Per-sound gain nodes: "fx:<key>" feeds sfx, "el:<key>" (HTMLAudio) feeds out. */
const cueBuses = new Map<string, GainNode>();
/** Slot that owns the sounds started right now (fallbacks play on the event's slider). */
let scope: string | null = null;
const volumeListeners = new Set<() => void>();
const bufs: Record<string, AudioBuffer> = {};
/** 4KA TV visualizer tap: read-only analyser on the bed loop. Never feeds the speakers. */
const VIZ_KEYS = new Set(["bed"]);
let vizAnalyser: AnalyserNode | null = null;
let vizSource: AudioNode | null = null;
const tappedEls = new WeakSet<HTMLAudioElement>();

const FILES: Record<string, string> = {
  spin: "/sfx/spin.mp3?v=trailer1",
  land: "/sfx/land.mp3?v=keys1",
  land2: "/sfx/land2.mp3?v=keys1",
  land3: "/sfx/land3.mp3?v=keys1",
  click: "/sfx/click.mp3",
  win: "/sfx/win.mp3?v=phaser1",
  winFull: "/sfx/win-full.mp3?v=tumble2",
  payout: "/sfx/payout.mp3",
  coin: "/sfx/coin.mp3",
  ticketOk: "/sfx/ticket-ok.mp3?v=garand1",
  scatter: "/sfx/scatter.mp3",
  collect: "/sfx/collect.mp3",
  tumble: "/sfx/tumble.mp3?v=mech1",
  pop: "/sfx/pop.mp3?v=pneumatic1",
  zap: "/sfx/zap.mp3?v=park1",
  electric: "/sfx/electric.mp3?v=park1",
  thunder: "/sfx/thunder.mp3?v=park1",
  bigwin: "/sfx/bigwin.mp3",
  tableA: "/sfx/table-a.mp3?v=glitch1",
  tableB: "/sfx/table-b.mp3?v=fail1",
  siren: "/sfx/siren.mp3",
  harp: "/sfx/harp.mp3",
  kontrola: "/sfx/kontrola.mp3?v=ignition1",
  fsStart: "/sfx/fs-start.mp3?v=build1",
  anticipate: "/sfx/bonus-loop.mp3?v=4ka1",
  /** Anticipation 2 (5th–9th tease in a row without a bonus) and 3 (10th+). Empty until the admin uploads;
   *  an empty slot falls back anticipation3 → anticipation2 → anticipate (lib/slot/anticipation antiFallback). */
  anticipation2: "",
  anticipation3: "",
  can: "/sfx/can-open.mp3?v=open2",
  /** Blesk do plechovky: the bolt hits a winning can (activation). Until the admin uploads one, Elektrika's crackle. */
  can_lightning: "/sfx/electric.mp3?v=park1",
  bed: "/sfx/fs-bed.mp3?v=moon2",
  zasah: "/sfx/fs-bed.mp3?v=zasah1",
  /** Zásah one-shots. Empty until the admin uploads; the game keeps the old cue. */
  zStart: "/sfx/kontrola.mp3?v=ignition1",
  zTravel: "/sfx/zap.mp3?v=park1",
  zHit: "/sfx/coin.mp3",
  zFs: "/sfx/thunder.mp3?v=park1",
  zHeart: "",
  zEscape: "/sfx/ticket-ok.mp3?v=garand1",
  zTax: "/sfx/table-b.mp3?v=fail1",
  zNeutral: "",
  /** MASÍVNA VÝHRA (250×+). Until the admin uploads one, the game plays the big-win fanfare (A/B). */
  massive: "/sfx/table-a.mp3?v=glitch1",
};

const CUE_MAX = 50 * 1024 * 1024;
const MUSIC_KEYS = new Set(["bed", "zasah"]);
const SUPA_URL = "https://xgpnmxkquxzbhgktjipa.supabase.co";
const SUPA_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncG5teGtxdXh6Ymhna3RqaXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMzI1MDgsImV4cCI6MjEwMTkwODUwOH0.KrNERJS8gxc1663oN73CaZ2ZqXZOQTX-AnoMwCmWQUo";
const custom = new Set<string>();
const previewUrl: Record<string, string> = {};
const stored: Record<string, { bytes: ArrayBuffer; type: string }> = {};
const listeners = new Set<() => void>();
let io: Promise<void> = Promise.resolve();
/** Slots the server lists an upload for (sfx_keys), known before their bytes arrive. */
const remoteKeys = new Set<string>();
/** decodeAudioData in flight per slot (one per stored upload). */
const decoding: Partial<Record<string, Promise<void>>> = {};
/** Slots whose stored upload Web Audio could not decode (played through an <audio> element instead). */
const decodeFailed = new Set<string>();
/** Resolves once the short (non-music) uploads are on the device, or the hydrate gave up. */
let shortResolve: () => void = () => {};
const shortGate = new Promise<void>((resolve) => {
  shortResolve = resolve;
});
let shortSettled = false;
/** sfx_keys answered (remoteKeys is the full list from now on). */
let keysKnown = false;
function shortDone(): void {
  shortSettled = true;
  shortResolve();
}

function queue(task: () => Promise<void>): Promise<void> {
  const run = io.then(task, task);
  io = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function emitSfx(): void {
  for (const fn of listeners) fn();
}

export function subscribeSfx(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function cueMax(_key: string): number {
  return CUE_MAX;
}

function cueMaxLabel(_key: string): string {
  return "50 MB";
}

export function cueSrc(key: string): string {
  return previewUrl[key] || FILES[key] || "";
}

export function isCustomCue(key: string): boolean {
  return custom.has(key);
}

function sniffMime(bytes: ArrayBuffer, fallback: string): string {
  const u = new Uint8Array(bytes, 0, Math.min(12, bytes.byteLength));
  if (u.length >= 4 && u[0] === 0x66 && u[1] === 0x4c && u[2] === 0x61 && u[3] === 0x43) return "audio/flac";
  if (u.length >= 4 && u[0] === 0x4f && u[1] === 0x67 && u[2] === 0x67 && u[3] === 0x53) return "audio/ogg";
  if (u.length >= 12 && u[0] === 0x52 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x46 && u[8] === 0x57 && u[9] === 0x41 && u[10] === 0x56 && u[11] === 0x45) return "audio/wav";
  if (u.length >= 3 && u[0] === 0x49 && u[1] === 0x44 && u[2] === 0x33) return "audio/mpeg";
  if (u.length >= 2 && u[0] === 0xff && (u[1] & 0xe0) === 0xe0) return "audio/mpeg";
  if (fallback === "audio/x-flac" || fallback === "audio/flac") return "audio/flac";
  return fallback && fallback.startsWith("audio/") ? fallback : "audio/mpeg";
}

function mimeFromFile(file: File, bytes: ArrayBuffer): string {
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() || "";
  const byExt: Record<string, string> = {
    flac: "audio/flac",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    opus: "audio/ogg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    webm: "audio/webm",
  };
  return sniffMime(bytes, byExt[ext] || file.type);
}

function rememberPreview(key: string, bytes: ArrayBuffer, type: string): void {
  if (previewUrl[key]) URL.revokeObjectURL(previewUrl[key]);
  previewUrl[key] = URL.createObjectURL(new Blob([bytes.slice(0)], { type: type || "audio/mpeg" }));
}

async function sfxRpc(name: string, body: Record<string, unknown>, low = false): Promise<Response> {
  return fetch(`${SUPA_URL}/rest/v1/rpc/${name}`, {
    // Music blobs are tens of MB of base64; let the jackpot / board calls on the same host go first.
    ...(low ? ({ priority: "low" } as RequestInit) : {}),
    method: "POST",
    headers: {
      apikey: SUPA_ANON,
      Authorization: `Bearer ${SUPA_ANON}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function b64ToBytes(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** atob of a 19 MB bed is one long main-thread stall. Yield between chunks; Postgres base64 has newlines. */
async function b64ToBytesYield(b64: string): Promise<ArrayBuffer> {
  const parts: Uint8Array[] = [];
  let total = 0;
  const STEP = 256 * 1024;
  let carry = "";
  const take = (clean: string) => {
    if (!clean) return;
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
    parts.push(bytes);
    total += bytes.length;
  };
  for (let i = 0; i < b64.length; i += STEP) {
    const clean = (carry + b64.slice(i, i + STEP)).replace(/\s+/g, "");
    const usable = clean.length - (clean.length % 4);
    take(clean.slice(0, usable));
    carry = clean.slice(usable);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  if (carry) take(carry);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out.buffer;
}

function fileToB64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result || "");
      resolve(data.slice(data.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function pullRemote(musicOnly = false): Promise<void> {
  const list = await sfxRpc("sfx_keys", {});
  if (!list.ok) return;
  const rows = (await list.json()) as { key?: string; mime?: string }[];
  if (!Array.isArray(rows)) return;
  for (const row of rows) if (row.key && row.key in FILES) remoteKeys.add(row.key);
  keysKnown = true;
  const pull = async (row: { key?: string; mime?: string }, low: boolean) => {
    const key = row.key || "";
    if (!(key in FILES) || custom.has(key)) return;
    const audio = await sfxRpc("sfx_audio", { p_key: key }, low);
    if (!audio.ok) return;
    const b64 = (await audio.json()) as unknown;
    if (typeof b64 !== "string" || b64.length < 8) return;
    const bytes = b64.length > 512 * 1024 ? await b64ToBytesYield(b64) : b64ToBytes(b64);
    const type = sniffMime(bytes, row.mime || "");
    stored[key] = { bytes, type };
    delete decoding[key];
    decodeFailed.delete(key);
    custom.add(key);
    rememberPreview(key, bytes, type);
    // Decode a short cue as soon as it is here (if audio is unlocked), not after the music beds downloaded.
    if (ctx && !MUSIC_KEYS.has(key)) void decodeCustom(key);
  };
  // Short cues first, together. The big music beds after them, one at a time, at low priority, so they do not
  // saturate a phone link while the player is already spinning. Music is not part of boot: a 19 MB atob
  // froze HRAŤ. It starts after the player presses play.
  const music = rows.filter((row) => MUSIC_KEYS.has(row.key || ""));
  if (!musicOnly) {
    await Promise.all(rows.filter((row) => !MUSIC_KEYS.has(row.key || "")).map((row) => pull(row, false).catch(() => {})));
  } else {
    for (const row of music) await pull(row, true).catch(() => {});
  }
}

let hydrated = false;

function hydrateCustoms(): Promise<void> {
  if (hydrated) return Promise.resolve();
  return queue(async () => {
    if (hydrated) return;
    try {
      await pullRemote();
    } catch {
      /* originals stay */
    }
    shortDone();
    hydrated = true;
    emitSfx();
  });
}

let musicPromise: Promise<void> | null = null;

/** Bed / zásah uploads. Not during boot — the FLAC bed is ~19 MB of base64. */
function ensureMusic(): Promise<void> {
  if (!musicPromise) {
    musicPromise = hydrateCustoms()
      .then(() => pullRemote(true))
      .then(() => {
        emitSfx();
      })
      .catch(() => {
        musicPromise = null;
      });
  }
  return musicPromise;
}

/**
 * Short uploads are usable once this resolves: sfx_keys listed and every non-music cue pulled. The music
 * beds (tens of MB of base64) keep downloading behind it; ensureMusic() waits for those, never boot.
 */
function shortHydrate(): Promise<void> {
  void hydrateCustoms();
  return shortGate;
}

function decodeCustom(key: string): Promise<void> {
  const row = stored[key];
  if (!ctx || !row) return Promise.resolve();
  const running = decoding[key];
  if (running) return running;
  const ac = ctx;
  const p = (async () => {
    try {
      const buf = await ac.decodeAudioData(row.bytes.slice(0));
      // A newer upload / reset replaced the bytes meanwhile: drop this result.
      if (stored[key] !== row) return;
      bufs[key] = buf;
      decodeFailed.delete(key);
    } catch {
      if (stored[key] !== row) return;
      delete bufs[key];
      decodeFailed.add(key);
    }
  })();
  decoding[key] = p;
  return p;
}

if (typeof window !== "undefined") void hydrateCustoms();

export function isMuted(): boolean {
  return muted;
}

/** Volumes used to be per device in localStorage (p4k.volume*). They are global now: drop the old keys once. */
function dropLegacyVolumes(): void {
  try {
    if (typeof localStorage === "undefined") return;
    const old: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (isLegacyVolumeKey(k)) old.push(k as string);
    }
    for (const k of old) localStorage.removeItem(k);
  } catch {
    /* private mode */
  }
}

/** Last levels loaded from / saved to the server (what every player hears). */
let savedLevels: Record<string, number> = {};
let levelsLoaded = false;

function applyLevels(levels: Record<string, number>): void {
  setMasterNow(levels[MASTER_KEY] ?? 1);
  for (const key of Object.keys(FILES)) {
    cueLevels[key] = clampCueLevel(levels[key] ?? 1);
    applyCueLevel(key);
  }
  liveBed?.duck(liveDuck);
  refreshPreviewEl();
  for (const fn of volumeListeners) fn();
}

/**
 * Global volumes: one cheap public GET at start (public.sfx_volume, a few rows). Missing rows or a
 * failed fetch = 100 %. Applied live (gains glide, nothing restarts).
 */
async function loadGlobalVolumes(): Promise<void> {
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/sfx_volume?select=key,level`, {
      headers: { apikey: SUPA_ANON, Authorization: `Bearer ${SUPA_ANON}` },
    });
    if (!res.ok) return;
    savedLevels = parseGlobalLevels(await res.json(), new Set(Object.keys(FILES)));
    levelsLoaded = true;
    applyLevels(savedLevels);
  } catch {
    /* defaults stay */
  }
}

if (typeof window !== "undefined") {
  dropLegacyVolumes();
  void loadGlobalVolumes();
}

/** True when the admin moved a slider since the last load/save (preview only, not saved yet). */
export function volumesDirty(): boolean {
  if (Math.round(volume * 100) !== Math.round((savedLevels[MASTER_KEY] ?? 1) * 100)) return true;
  return Object.keys(FILES).some((k) => Math.round(getCueLevel(k) * 100) !== Math.round((savedLevels[k] ?? 1) * 100));
}

/** Throw away unsaved slider moves: back to what every player hears. */
export function revertVolumes(): void {
  applyLevels(savedLevels);
}

/** Whether the global levels came from the server (false: defaults, fetch failed or pending). */
export function volumesLoaded(): boolean {
  return levelsLoaded;
}

/** Admin: save the master + every per-sound level for all players (admin password, like sfx_put). */
export async function saveVolumes(password: string): Promise<string | null> {
  if (!password.trim()) return "Zadaj heslo.";
  const levels = globalLevelsPayload(volume, cueLevels, Object.keys(FILES));
  let res: Response;
  try {
    res = await sfxRpc("sfx_volume_put", { p_pass: password, p_levels: levels });
  } catch {
    return "Hlasitosť sa nepodarilo uložiť.";
  }
  if (!res.ok) {
    const text = await res.text();
    if (text.includes("denied")) return "Zlé heslo.";
    return "Hlasitosť sa nepodarilo uložiť.";
  }
  savedLevels = levels;
  levelsLoaded = true;
  for (const fn of volumeListeners) fn();
  return null;
}

/** Soft limiter: transparent up to 100 %, a fast brick-wall-ish knee above it so 200 % does not clip. */
function tuneLimiter(when: number): void {
  if (!limiter) return;
  const hot = volume > 1.001;
  limiter.threshold.setValueAtTime(hot ? -3 : 0, when);
  limiter.knee.setValueAtTime(hot ? 4 : 0, when);
  limiter.ratio.setValueAtTime(hot ? 14 : 1, when);
  limiter.attack.setValueAtTime(0.002, when);
  limiter.release.setValueAtTime(0.14, when);
}

export function getVolume(): number {
  return volume;
}

export { CUE_LEVEL_MAX };

/** Every sound slot with its own per-sound slider (the FILES keys). */
export function cueKeys(): string[] {
  return Object.keys(FILES);
}

/** Per-sound volume of one slot, 0 … 2 (default 1). */
export function getCueLevel(key: string): number {
  if (!key || !(key in FILES)) return 1;
  return cueLevels[key] ?? 1;
}

function applyCueLevel(key: string): void {
  const v = getCueLevel(key);
  if (ctx) {
    for (const id of ["fx:" + key, "el:" + key]) {
      const g = cueBuses.get(id);
      if (!g) continue;
      g.gain.cancelScheduledValues(ctx.currentTime);
      g.gain.setTargetAtTime(v, ctx.currentTime, 0.03);
    }
  }
}

/** Admin slider: 0 … 2 for one slot, applied live on this device. saveVolumes() makes it global. */
export function setCueLevel(key: string, next: number): void {
  if (!(key in FILES)) return;
  const v = clampCueLevel(next);
  if (v === getCueLevel(key)) return;
  cueLevels[key] = v;
  applyCueLevel(key);
  liveBed?.duck(liveDuck);
  refreshPreviewEl();
  for (const fn of volumeListeners) fn();
}

/** Admin: every slot back to 100 % (preview until saved). The master volume is left alone. */
export function resetCueLevels(): void {
  for (const key of Object.keys(FILES)) {
    cueLevels[key] = 1;
    applyCueLevel(key);
  }
  liveBed?.duck(liveDuck);
  refreshPreviewEl();
  for (const fn of volumeListeners) fn();
}

/** Live gain from the per-sound bus through the master volume (for checks): cue × master. */
export function cueGainNow(key: string): { cue: number; master: number; effective: number } | null {
  const g = cueBuses.get("fx:" + key) ?? cueBuses.get("el:" + key);
  if (!g || !out) return null;
  return { cue: g.gain.value, master: out.gain.value, effective: g.gain.value * out.gain.value };
}

/** Per-sound gain node. Buffer sounds feed sfx (mix bus), media elements feed out directly. */
function cueBus(key: string, element = false): AudioNode | null {
  if (!ctx || !sfx || !out) return null;
  const target = element ? out : sfx;
  if (!key || !(key in FILES)) return target;
  const id = (element ? "el:" : "fx:") + key;
  let g = cueBuses.get(id);
  if (!g) {
    g = ctx.createGain();
    g.gain.value = getCueLevel(key);
    g.connect(target);
    cueBuses.set(id, g);
  }
  return g;
}

/** Run `fn` with its sounds on `key`'s slider. An outer scope wins (fallback chains keep the event's slot). */
function withCue<T>(key: string, fn: () => T): T {
  const prev = scope;
  scope = prev ?? key;
  try {
    return fn();
  } finally {
    scope = prev;
  }
}

/** Where synth fallbacks connect: the current slot's bus, else the plain sfx bus. */
function synthOut(): AudioNode | null {
  return (scope && cueBus(scope)) || sfx;
}

export function subscribeVolume(fn: () => void): () => void {
  volumeListeners.add(fn);
  return () => volumeListeners.delete(fn);
}

/** Admin master slider, 0 … 2, applied live on this device; saveVolumes() makes it global. */
export function setVolume(next: number): void {
  if (!setMasterNow(next)) return;
  liveBed?.duck(liveDuck);
  refreshPreviewEl();
  for (const fn of volumeListeners) fn();
}

/** Master gain glide (Web Audio) + limiter mode; HTMLAudio fallbacks are capped at 1.0. */
function setMasterNow(next: number): boolean {
  const v = Math.max(0, Math.min(VOLUME_MAX, Math.round(next * 100) / 100));
  if (v === volume) return false;
  volume = v;
  if (ctx && out) {
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setTargetAtTime(v, ctx.currentTime, 0.03);
    tuneLimiter(ctx.currentTime);
  }
  return true;
}

/** Final stage input (volume → limiter → speakers). Connect here, never to ctx.destination. */
export function audioOut(): AudioNode | null {
  return out;
}

/**
 * One MediaElementSource per element (the API allows only one), wired to audioOut().
 * Only while the context runs: an element captured by a suspended context plays silence.
 * Analysers can fan out from the returned node; it is upstream of the volume gain.
 */
export function mediaSource(el: HTMLMediaElement, cue = ""): MediaElementAudioSourceNode | null {
  const known = elSources.get(el);
  if (known) {
    const was = elRoute.get(el);
    // Elements from playBlob() are wired by hand (was === undefined): leave them.
    if (was === undefined || was === cue) return known;
    const from = cueBus(was, true);
    const to = cueBus(cue, true);
    if (!to) return known;
    try {
      if (from) known.disconnect(from);
    } catch {
      /* not connected */
    }
    known.connect(to);
    elRoute.set(el, cue);
    return known;
  }
  if (!ctx || !out || ctx.state !== "running") return null;
  try {
    const node = ctx.createMediaElementSource(el);
    node.connect(cueBus(cue, true) ?? out);
    elSources.set(el, node);
    elRoute.set(el, cue);
    return node;
  } catch {
    return null;
  }
}

/**
 * Element volume for a part of the mix: exact through the graph (the cue bus and the master
 * volume do the rest), min(1, level × cue × master) when the element plays direct.
 */
export function elementVolume(el: HTMLMediaElement, level: number, cue = ""): number {
  return elSources.has(el) ? Math.min(1, level) : directElementVolume(level, cue ? getCueLevel(cue) : 1, volume);
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
    out = ctx.createGain();
    out.gain.value = volume;
    limiter = ctx.createDynamicsCompressor();
    tuneLimiter(0);
    master.connect(comp);
    comp.connect(out);
    out.connect(limiter);
    limiter.connect(ctx.destination);
    ctx.addEventListener("statechange", () => {
      // A bed routed through the graph (volume chain and/or visualizer tap) goes quiet if the context sleeps mid-loop; wake it.
      const routed = (liveEl && elSources.has(liveEl)) || vizSource;
      if (ctx?.state === "suspended" && routed && !muted && document.visibilityState === "visible") void ctx.resume();
    });
    whiteBuf = makeNoise(ctx, 1.4, "white");
    brownBuf = makeNoise(ctx, 1.6, "brown");
    void loadBank();
    // Uploads that arrived before the context existed decode now; the rest decode as they arrive (pullRemote).
    void applyCustoms();
    void shortHydrate().then(() => applyCustoms());
  }
  if (ctx.state === "suspended") void ctx.resume();
}

/** A one-shot fired mid-sequence (no tap): wake a context the OS suspended (Samsung Internet PWA, iOS). */
function wake(): void {
  if (!ctx || muted) return;
  if (ctx.state === "running") return;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  void Promise.resolve(ctx.resume()).catch(() => {});
}

const pending: Partial<Record<string, Promise<void>>> = {};
let bankAll: Promise<void> | null = null;

function loadOne(key: string): Promise<void> {
  if (custom.has(key)) return Promise.resolve();
  if (bufs[key]) return Promise.resolve();
  const existing = pending[key];
  if (existing) return existing;
  const url = FILES[key];
  if (!url || !ctx) return Promise.resolve();
  const p = (async () => {
    try {
      const res = await fetch(url);
      const raw = await res.arrayBuffer();
      if (!ctx || custom.has(key)) return;
      bufs[key] = await ctx.decodeAudioData(raw.slice(0));
    } catch {
      /* keep synth fallback */
    }
  })();
  pending[key] = p;
  return p;
}

async function applyCustoms(): Promise<void> {
  if (!ctx) return;
  await Promise.all(
    [...custom].filter((key) => !MUSIC_KEYS.has(key)).map((key) => decodeCustom(key).catch(() => undefined)),
  );
}

function loadBank(): Promise<void> {
  if (!ctx) return Promise.resolve();
  if (!bankAll) {
    // Short cues as soon as the short uploads are known (not after the music beds), the beds after the full hydrate.
    const short = shortHydrate()
      .then(() => Promise.all(Object.keys(FILES).filter((key) => !MUSIC_KEYS.has(key)).map((key) => loadOne(key))))
      .then(() => applyCustoms());
    const beds = hydrateCustoms().then(() =>
      Promise.all(Object.keys(FILES).filter((key) => MUSIC_KEYS.has(key)).map((key) => loadOne(key))),
    );
    bankAll = Promise.all([short, beds]).then(() => undefined);
  }
  return bankAll;
}

function probeAudio(bytes: ArrayBuffer, type: string): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([bytes], { type: type || "audio/mpeg" }));
    const el = new Audio();
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      el.onloadedmetadata = null;
      el.onerror = null;
      el.src = "";
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    el.preload = "metadata";
    el.onloadedmetadata = () => finish(el.duration > 0.2);
    el.onerror = () => finish(false);
    window.setTimeout(() => finish(false), 12000);
    el.src = url;
  });
}

export async function replaceCue(key: string, file: File, password: string): Promise<string | null> {
  if (!(key in FILES)) return "Tento zvuk sa nedá vymeniť.";
  if (!password.trim()) return "Zadaj heslo.";
  const limit = cueMaxLabel(key);
  if (file.size > cueMax(key)) return `Súbor je väčší ako ${limit}.`;
  const named = /\.(mp3|wav|ogg|opus|m4a|aac|webm|flac)$/i.test(file.name);
  if (file.type && !file.type.startsWith("audio/") && !named) return "To nie je zvuk.";
  unlockAudio();
  const bytes = await file.arrayBuffer();
  const type = mimeFromFile(file, bytes);
  let probe: AudioBuffer | null = null;
  if (MUSIC_KEYS.has(key)) {
    if (!(await probeAudio(bytes, type))) return "Súbor sa nedá prehrať.";
  } else if (ctx) {
    try {
      probe = await ctx.decodeAudioData(bytes.slice(0));
    } catch {
      probe = null;
    }
    if (!probe && !(await probeAudio(bytes, type))) return "Súbor sa nedá prehrať.";
  } else if (!(await probeAudio(bytes, type))) {
    return "Súbor sa nedá prehrať.";
  }
  const b64 = await fileToB64(new Blob([bytes], { type }));
  const res = await sfxRpc("sfx_put", { p_pass: password, p_key: key, p_mime: type, p_b64: b64 });
  if (!res.ok) {
    const text = await res.text();
    if (text.includes("denied")) return "Zlé heslo.";
    if (text.includes("size")) return `Súbor je väčší ako ${limit}.`;
    return "Zvuk sa nepodarilo uložiť.";
  }
  await hydrateCustoms();
  stored[key] = { bytes, type };
  delete decoding[key];
  decodeFailed.delete(key);
  remoteKeys.add(key);
  custom.add(key);
  if (probe) bufs[key] = probe;
  else if (!MUSIC_KEYS.has(key)) await decodeCustom(key);
  rememberPreview(key, bytes, type);
  emitSfx();
  return null;
}

export async function resetCue(key: string, password: string): Promise<string | null> {
  if (!(key in FILES)) return "Tento zvuk sa nedá vrátiť.";
  if (!password.trim()) return "Zadaj heslo.";
  unlockAudio();
  const res = await sfxRpc("sfx_drop", { p_pass: password, p_key: key });
  if (!res.ok) {
    const text = await res.text();
    if (text.includes("denied")) return "Zlé heslo.";
    return "Zvuk sa nepodarilo vrátiť.";
  }
  await hydrateCustoms();
  custom.delete(key);
  remoteKeys.delete(key);
  decodeFailed.delete(key);
  delete decoding[key];
  if (previewUrl[key]) URL.revokeObjectURL(previewUrl[key]);
  delete previewUrl[key];
  delete stored[key];
  delete bufs[key];
  delete pending[key];
  await loadOne(key);
  emitSfx();
  return null;
}

export async function resetCues(password: string): Promise<string | null> {
  if (!password.trim()) return "Zadaj heslo.";
  const res = await sfxRpc("sfx_reset", { p_pass: password });
  if (!res.ok) {
    const text = await res.text();
    if (text.includes("denied")) return "Zlé heslo.";
    return "Pôvodné zvuky sa nepodarilo vrátiť.";
  }
  await hydrateCustoms();
  const keys = [...custom];
  custom.clear();
  remoteKeys.clear();
  decodeFailed.clear();
  for (const key of keys) {
    delete decoding[key];
    if (previewUrl[key]) URL.revokeObjectURL(previewUrl[key]);
    delete previewUrl[key];
    delete stored[key];
    delete bufs[key];
    delete pending[key];
  }
  bankAll = null;
  await loadBank();
  emitSfx();
  return null;
}

/** Resolves once the reel-loop sample is decoded. Other cues keep loading behind it. */
export function whenSpinReady(): Promise<void> {
  unlockAudio();
  return shortHydrate()
    .then(() => (custom.has("spin") ? decodeCustom("spin") : loadOne("spin")))
    .then(() => undefined);
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
  if (next) stopHeartbeat();
  if (master && ctx) master.gain.setTargetAtTime(next ? 0 : 0.92, ctx.currentTime, 0.04);
  if (liveEl) {
    liveEl.muted = next;
    if (next) liveEl.pause();
    else void liveEl.play().catch(() => {});
  }
}

export function duckMusic(amount: number): void {
  if (!music || !ctx) return;
  const a = Math.max(0.04, Math.min(1, amount));
  music.gain.setTargetAtTime(muted ? 0 : 0.14 * a, ctx.currentTime, 0.08);
}

/**
 * Detach a finished one-shot voice from the graph. Chrome collects ended sources on its own, but
 * WebKit (iOS Safari) keeps connected nodes processing until they are disconnected, so a long
 * session would pile hundreds of dead voices (source → panner → gain) onto the mix bus.
 */
function releaseOnEnd(src: AudioScheduledSourceNode, ...chain: AudioNode[]): void {
  src.addEventListener(
    "ended",
    () => {
      for (const n of [src, ...chain]) {
        try {
          n.disconnect();
        } catch {
          /* already */
        }
      }
    },
    { once: true },
  );
}

function playBlob(
  name: string,
  opts: { gain?: number; rate?: number; pan?: number; loop?: boolean; when?: number },
): { stop: () => void; gain: GainNode } | null {
  const url = previewUrl[name];
  const bus = cueBus(scope ?? name);
  if (!ctx || !sfx || !url) return null;
  const el = new Audio(url);
  el.loop = !!opts.loop;
  el.preservesPitch = false;
  el.playbackRate = opts.rate ?? 1;
  el.preload = "auto";
  let node: MediaElementAudioSourceNode;
  try {
    node = ctx.createMediaElementSource(el);
  } catch {
    // Never throw into the spin sequence: a sound is optional.
    return null;
  }
  elSources.set(el, node);
  const g = ctx.createGain();
  const t = opts.when ?? ctx.currentTime;
  g.gain.setValueAtTime(opts.gain ?? 0.85, t);
  const p = ctx.createStereoPanner();
  p.pan.setValueAtTime(Math.max(-1, Math.min(1, opts.pan ?? 0)), t);
  node.connect(p);
  p.connect(g);
  g.connect(bus ?? sfx);
  const start = () => {
    void el.play().catch(() => {});
  };
  if (opts.when && ctx) {
    const wait = Math.max(0, (opts.when - ctx.currentTime) * 1000);
    window.setTimeout(start, wait);
  } else start();
  const handle = {
    gain: g,
    stop: () => {
      g.gain.setTargetAtTime(0.0001, ctx!.currentTime, 0.04);
      window.setTimeout(() => {
        el.pause();
        node.disconnect();
      }, 80);
    },
  };
  if (CUT_PREV.has(name)) {
    playing[name]?.stop();
    playing[name] = handle;
  }
  return handle;
}

function playBuf(
  name: string,
  opts: { gain?: number; rate?: number; pan?: number; loop?: boolean; when?: number } = {},
): { stop: () => void; gain: GainNode } | null {
  const b = bufs[name];
  if (!ctx || !sfx) return null;
  if (!b) return custom.has(name) ? playBlob(name, opts) : null;
  const bus = cueBus(scope ?? name);
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
  g.connect(bus ?? sfx);
  // Visualizer reads the voice gain, i.e. before the per-sound and master volume.
  const tapped = VIZ_KEYS.has(name) && tapNode(g);
  releaseOnEnd(src, p, g);
  src.start(t);
  if (!opts.loop) src.stop(t + b.duration / (opts.rate ?? 1) + 0.02);
  const handle = {
    gain: g,
    stop: () => {
      if (tapped) untapViz(g);
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
  g.connect(synthOut() ?? sfx);
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
  releaseOnEnd(o, p, g);
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
  releaseOnEnd(src, f1, f2, p, g);
  src.start(t);
  src.stop(t + duration + 0.03);
}

export function playClick(): void {
  withCue("click", () => {
    if (!playBuf("click", { gain: 0.7, rate: 0.95 + Math.random() * 0.1 })) {
      noise("white", 0.04, 0.06, 1200, 5000);
      tone("triangle", 880, 0.05, 0.035);
    }
  });
}

export function playCollect(): void {
  withCue("collect", () => {
    if (!playBuf("collect", { gain: 0.72, rate: 0.96 + Math.random() * 0.08 })) {
      playCoin();
    }
  });
}

export function startSpin(): void {
  withCue("spin", () => {
    if (!ctx || !sfx) return;
    stopSpin();
    duckMusic(0.45);
    liveBed?.duck(0.78);
    const sample = playBuf("spin", { gain: 0.62, loop: true, rate: 1 });
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
    g.connect(synthOut() ?? sfx);
    releaseOnEnd(src, bp, g);
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
  });
}

export function setSpinEnergy(t: number): void {
  if (!ctx || !spinNodes) return;
  const x = Math.max(0, Math.min(1, t));
  spinNodes.gain.gain.setTargetAtTime((bufs.spin ? 0.62 : 0.07) * x, ctx.currentTime, 0.05);
}

export function stopSpin(): void {
  spinNodes?.stop();
  spinNodes = null;
  liveBed?.duck(1);
}

const LAND_KEYS = ["land", "land2", "land3"] as const;
let lastLand = -1;

export function playLand(col = 0): void {
  const pan = (col / 5) * 1.3 - 0.65;
  let pick = Math.floor(Math.random() * LAND_KEYS.length);
  if (pick === lastLand) pick = (pick + 1 + Math.floor(Math.random() * 2)) % LAND_KEYS.length;
  lastLand = pick;
  const name = LAND_KEYS[pick];
  withCue(name, () => {
    if (!playBuf(name, { gain: 0.38, rate: 0.97 + Math.random() * 0.06, pan })) {
      noise("white", 0.055, 0.13, 1800, 7000, undefined, pan);
      tone("sine", 118 - col * 8, 0.14, 0.09, 48, undefined, pan);
    }
  });
}

export function playWin(size: "spark" | "full" = "spark"): void {
  withCue(size === "full" ? "winFull" : "win", () => {
    if (size === "full") {
      if (playBuf("winFull", { gain: 0.62 })) return;
    } else if (playBuf("win", { gain: 0.72, rate: 0.94 + Math.random() * 0.12 })) {
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
  });
}

export function playCoin(): void {
  withCue("coin", () => {
    if (!playBuf("coin", { gain: 0.65, rate: 0.96 + Math.random() * 0.08 })) {
      tone("sine", 1480, 0.12, 0.05, 1360);
    }
  });
}

export function playTicketOk(): void {
  withCue("ticketOk", () => {
    if (!playBuf("ticketOk", { gain: 0.9 })) playCoin();
  });
}

export function playPayout(): void {
  withCue("payout", () => {
    if (!playBuf("payout", { gain: 0.46 })) playCoin();
  });
}

export function playTumble(cascade = 0): void {
  withCue("tumble", () => {
    playing["pop"]?.stop();
    const rate = Math.min(1.12, 0.96 + cascade * 0.03);
    if (!playBuf("tumble", { gain: Math.min(0.9, 0.62 + cascade * 0.06), rate })) {
      noise("brown", 0.32, 0.11, 50, 900);
    }
  });
}

export function playPop(): void {
  withCue("pop", () => {
    if (!playBuf("pop", { gain: 0.7 }) && !playBuf("electric", { gain: 0.55 })) {
      noise("white", 0.1, 0.12, 600, 7000);
    }
  });
}

/**
 * One-shot that waits (≤ CUE_WAIT_MS) for an upload still downloading / decoding instead of silently
 * playing something else or nothing (lib/slot/cue-ready cueRoute). `fallback` runs when the upload is not
 * usable in time and no built-in buffer is decoded.
 */
function playSoon(
  name: string,
  opts: { gain?: number; rate?: number; pan?: number },
  fallback?: () => void,
): void {
  if (!ctx || !sfx) return;
  const owner = scope;
  const asked = performance.now();
  const run = (fn: () => void) => (owner ? withCue(owner, fn) : fn());
  const attempt = (final: boolean, seen?: Promise<void>) => {
    if (custom.has(name) && !bufs[name] && !decoding[name] && !decodeFailed.has(name)) void decodeCustom(name);
    const how = cueRoute({
      decoded: Boolean(bufs[name]),
      // Until the short uploads are in, an upload may still be on its way (or not even listed yet).
      remote: !shortSettled && (!keysKnown || remoteKeys.has(name)),
      stored: custom.has(name),
      failed: decodeFailed.has(name),
      loading: !custom.has(name) && Boolean(pending[name]) && !bufs[name],
      waitedMs: final ? Number.POSITIVE_INFINITY : performance.now() - asked,
      maxWaitMs: CUE_WAIT_MS,
    });
    if (how === "wait") {
      const ready = custom.has(name) ? decoding[name] : shortSettled ? pending[name] : shortGate;
      // Nothing to wait on, or the thing we waited on already settled without a buffer: stop waiting.
      if (!ready || ready === seen) {
        attempt(true);
        return;
      }
      const left = Math.max(0, CUE_WAIT_MS - (performance.now() - asked));
      const timeout = new Promise<boolean>((resolve) => window.setTimeout(() => resolve(true), left));
      void Promise.race([ready.then(() => false), timeout]).then((timedOut) => attempt(timedOut, ready));
      return;
    }
    run(() => {
      if (how === "buffer" || how === "element") {
        if (playBuf(name, opts)) return;
      }
      fallback?.();
    });
  };
  attempt(false);
}

/** Rampa: every can drop (after the reels stop and after a tumble, lib/slot/cue-ready canEventCue), with Elektrika. */
export function playZap(): void {
  wake();
  playSoon("electric", { gain: 0.7, rate: 1.05 });
  playSoon("zap", { gain: 0.8 }, () =>
    withCue("zap", () => {
      noise("white", 0.08, 0.2, 1800, 9000);
      tone("sawtooth", 520, 0.1, 0.06, 70);
    }),
  );
}

/**
 * Land sound of the n-th scatter on the board (every scatter, from the first). Called when it really lands
 * (reel stopped / cascade drop ended, see lib/slot/scatter-sfx). `delayMs` spaces scatters landing together.
 * `thunder`: this land brought the board to 4+ scatters.
 */
export function playScatterLand(n: number, delayMs = 0, thunder = false): void {
  const play = () => playBuf("scatter", { gain: 0.45 + n * 0.08, rate: 0.92 + n * 0.04 });
  if (delayMs > 0) window.setTimeout(play, delayMs);
  else play();
  if (thunder) playThunder();
}

/** +5 4KA TV announcement (retrigger): the old cue minus the harp (harp is only the exact-3 settle cue now). */
export function playRetrigger(): void {
  playBuf("collect", { gain: 0.55 });
  playThunder();
}

/** Third scatter: the settled final board has exactly 3 scatters (never on 4+). Harp + Zber, as the old 3rd-land cue. */
export function playThirdScatter(): void {
  playBuf("harp", { gain: 0.45 + 3 * 0.08, rate: 0.92 + 3 * 0.04 });
  playBuf("collect", { gain: 0.55 });
}

/**
 * Tease loop while reels still run with 2+ scatters. `cue` picks the slot (lib/slot/anticipation antiCue); an empty
 * anticipation3 / anticipation2 falls back down the chain and then plays on the slider of the slot that sounds.
 * Returns the slot that actually plays (null if nothing started, e.g. already running or no audio).
 */
export function startAnticipate(cue: AntiCue = "anticipate"): AntiCue | null {
  if (!ctx || !sfx || anticipateNodes) return null;
  const key = antiFallback(cue, ownCue);
  withCue(key, () => {
    if (!ctx || !sfx || anticipateNodes) return;
    duckMusic(0.16);
    const t = ctx.currentTime;
    const bed = playBuf(key, { gain: 0.01, loop: true, rate: 1 });
    if (bed) {
      bed.gain.gain.setValueAtTime(0.01, t);
      bed.gain.gain.linearRampToValueAtTime(0.78, t + 0.18);
      anticipateNodes = {
        stop: () => {
          bed.gain.gain.setTargetAtTime(0.0001, ctx!.currentTime, 0.18);
          window.setTimeout(bed.stop, 380);
        },
      };
      return;
    }
    const harp = playBuf("harp", { gain: 0.12, rate: 0.82, loop: true });
    if (harp) {
      harp.gain.gain.linearRampToValueAtTime(0.4, t + 1.2);
      anticipateNodes = {
        stop: () => {
          harp.gain.gain.setTargetAtTime(0.0001, ctx!.currentTime, 0.2);
          window.setTimeout(harp.stop, 400);
        },
      };
    }
  });
  return anticipateNodes ? key : null;
}

export function stopAnticipate(): void {
  anticipateNodes?.stop();
  anticipateNodes = null;
}

export function playThunder(): void {
  withCue("thunder", () => {
    if (!playBuf("thunder", { gain: 0.9 })) {
      noise("brown", 0.7, 0.24, 20, 380);
      noise("white", 0.12, 0.16, 900, 6000);
    }
  });
}

const canDropGate = createSfxGate(CAN_DROP_WINDOW_MS);
const canStrikeGate = createSfxGate(CAN_STRIKE_GAP_MS);

/**
 * Plechovka for a can drop: call when the cans visually land. `key` is the landing moment
 * (lib/slot/can-sfx canDropKey): 1–4+ cans of one drop play once, a later cascade plays again.
 */
export function playCanDrop(key: string): boolean {
  if (!canDropGate.take(key, performance.now())) return false;
  wake();
  playMult();
  return true;
}

/**
 * Blesk do plechovky: the bolt hits one winning can (lib/slot/can-sfx canStrikeKey). Once per visible
 * strike; strikes in one go (skip) are one sound. Own upload, else the built-in crackle (Elektrika's file),
 * else a synth zap, all on this slot's slider.
 */
export function playCanLightning(key: string): boolean {
  if (!canStrikeGate.take(key, performance.now())) return false;
  wake();
  withCue("can_lightning", () =>
    playSoon("can_lightning", { gain: 0.8, rate: 0.97 + Math.random() * 0.06 }, () => {
      noise("white", 0.09, 0.22, 2200, 9000);
      tone("sawtooth", 880, 0.12, 0.05, 140);
    }),
  );
  return true;
}

export function playMult(): void {
  withCue("can", () => {
    if (!playBuf("can", { gain: 1, rate: 0.98 + Math.random() * 0.05 })) {
      playBuf("collect", { gain: 0.5, rate: 0.98 });
    }
  });
}

export function playFsStart(): void {
  withCue("fsStart", () => {
    stopSpin();
    duckMusic(0.18);
    if (!playBuf("fsStart", { gain: 0.82 })) {
      playThunder();
      playBuf("harp", { gain: 0.7 });
    }
  });
}

export function startLiveBed(): void {
  const gen = ++loopGen;
  pendingLoop = "bed";
  void ensureMusic().then(() => {
    if (gen !== loopGen) return;
    startCueLoop("bed");
  });
}

export function startChaseBed(): void {
  if (loopKey === "zasah" && liveEl) return;
  const gen = ++loopGen;
  pendingLoop = "zasah";
  void ensureMusic().then(() => {
    if (gen !== loopGen) return;
    startCueLoop("zasah");
  });
}

export function stopChaseBed(): void {
  if (pendingLoop === "zasah") {
    pendingLoop = null;
    loopGen += 1;
  }
  if (loopKey !== "zasah") return;
  stopLiveBed();
}

function haltLiveBed(): void {
  loopKey = null;
  const tap = vizSource instanceof MediaElementAudioSourceNode ? vizSource : null;
  liveBed?.stop();
  if (tap) untapViz(tap);
  liveBed = null;
  liveEl = null;
  duckMusic(1);
}

function startCueLoop(key: string): void {
  unlockAudio();
  haltLiveBed();
  pendingLoop = null;
  loopKey = key;
  const el = new Audio(cueSrc(key));
  el.loop = true;
  el.preload = "auto";
  el.setAttribute("playsinline", "true");
  el.muted = muted;
  liveDuck = 1;
  const vol = () => {
    el.volume = muted ? 0 : elementVolume(el, LIVE_VOL * Math.max(0.18, Math.min(1, liveDuck)), key);
  };
  vol();
  const playSafe = () => {
    void (ctx?.state === "suspended" ? ctx.resume() : Promise.resolve()).then(() => {
      // Route through the volume chain first (running context only), then fan out to the visualizer.
      if (liveEl === el && mediaSource(el, key)) {
        if (VIZ_KEYS.has(key)) tapElement(el, key);
        vol();
      }
      void el.play().then(vol).catch(() => {
        window.setTimeout(() => void el.play().then(vol).catch(() => {}), 180);
      });
    });
  };
  const kick = () => {
    const dur = Number.isFinite(el.duration) && el.duration > 2 ? el.duration : 0;
    const span = dur > 2 ? dur - 0.4 : 0;
    const at = span > 0 ? Math.random() * span : 0;
    if (at <= 0) {
      playSafe();
      return;
    }
    let armed = false;
    const go = () => {
      if (armed) return;
      armed = true;
      playSafe();
    };
    el.addEventListener("seeked", go, { once: true });
    try {
      el.currentTime = at;
    } catch {
      go();
    }
    window.setTimeout(go, 500);
  };
  if (el.readyState >= 1) kick();
  else el.addEventListener("loadedmetadata", kick, { once: true });
  liveEl = el;
  liveBed = {
    duck: (amount) => {
      liveDuck = amount;
      vol();
    },
    stop: () => {
      try {
        el.pause();
        el.removeAttribute("src");
        el.load();
      } catch {
        /* already */
      }
      // The element is dropped; its MediaElementSource would otherwise stay wired to the bus for
      // the rest of the session (one more per bed ↔ zásah switch).
      try {
        elSources.get(el)?.disconnect();
      } catch {
        /* not connected */
      }
    },
  };
}

export function stopLiveBed(): void {
  loopGen += 1;
  pendingLoop = null;
  haltLiveBed();
}

function vizNode(): AnalyserNode | null {
  if (!ctx) return null;
  if (!vizAnalyser) {
    vizAnalyser = ctx.createAnalyser();
    vizAnalyser.fftSize = VIZ.FFT_SIZE;
    vizAnalyser.smoothingTimeConstant = VIZ.SMOOTHING;
    vizAnalyser.minDecibels = VIZ.MIN_DB;
    vizAnalyser.maxDecibels = VIZ.MAX_DB;
  }
  return vizAnalyser;
}

/** AudioBuffer path: fan the bed's gain out to the analyser too. Output is untouched (the analyser has no outputs wired). */
function tapNode(node: AudioNode): boolean {
  const an = vizNode();
  if (!an) return false;
  if (vizSource && vizSource !== node) untapViz(vizSource);
  node.connect(an);
  vizSource = node;
  return true;
}

/**
 * HTMLAudioElement path. A media element can only be read through the graph and may have only
 * one MediaElementSource, so reuse the volume chain's mediaSource(el, key) (element → per-sound
 * gain → audioOut → volume → limiter → speakers) and fan it out to the analyser, which thus reads
 * the signal before the per-sound and the player's volume. Never connect to ctx.destination here
 * (it would skip the volume). mediaSource() only captures while the context is running: otherwise
 * the bed plays directly and the visualizer just breathes.
 */
function tapElement(el: HTMLAudioElement, key: string): boolean {
  if (!ctx || ctx.state !== "running" || tappedEls.has(el)) return false;
  const an = vizNode();
  if (!an) return false;
  const node = mediaSource(el, key);
  if (!node) return false;
  tappedEls.add(el);
  if (vizSource) untapViz(vizSource);
  node.connect(an);
  vizSource = node;
  return true;
}

function untapViz(node: AudioNode): void {
  if (vizSource !== node) return;
  try {
    if (vizAnalyser) node.disconnect(vizAnalyser);
  } catch {
    /* already */
  }
  vizSource = null;
}

/**
 * The bed loop's analyser while the 4KA TV bed is actually flowing through a running
 * AudioContext, otherwise null (muted, suspended, not tapped, other loop).
 */
export function bedAnalyser(): AnalyserNode | null {
  if (!ctx || ctx.state !== "running" || !vizSource || !vizAnalyser || muted) return null;
  return vizAnalyser;
}

/**
 * Seconds between the analyser seeing a sample and the speaker playing it (base + output latency,
 * as far as the browser reports them; 0 where unsupported). The visualizer holds frames back by this.
 */
export function bedLatency(): { output: number; base: number } {
  const c = ctx as (AudioContext & { outputLatency?: number }) | null;
  return { output: c?.outputLatency ?? 0, base: c?.baseLatency ?? 0 };
}

function ownCue(key: string): boolean {
  return custom.has(key) && Boolean(bufs[key]);
}

function playOwn(
  key: string,
  opts: { gain?: number; rate?: number; pan?: number; loop?: boolean; when?: number } = {},
): boolean {
  if (!ownCue(key)) return false;
  return Boolean(playBuf(key, opts));
}

export function playSiren(): void {
  withCue("zStart", () => {
    stopSpin();
    duckMusic(0.4);
    if (playOwn("zStart", { gain: 0.9 })) return;
    if (!playBuf("kontrola", { gain: 0.92 })) playBuf("siren", { gain: 0.7 });
  });
}

export function playHackTravel(): void {
  withCue("zTravel", () => {
    if (playOwn("zTravel", { gain: 0.55 })) return;
    playBuf("zap", { gain: 0.35, rate: 1.4 });
  });
}

export function playHack(): void {
  withCue("zHit", () => {
    if (playOwn("zHit", { gain: 0.8 })) return;
    playBuf("coin", { gain: 0.7, rate: 1.2 });
  });
}

export function playStrike(): void {
  withCue("zFs", () => {
    if (playOwn("zFs", { gain: 0.75 })) return;
    playBuf("thunder", { gain: 0.5 });
  });
}

export function playEscape(): void {
  withCue("zEscape", () => {
    if (playOwn("zEscape", { gain: 0.85 })) return;
    playBuf("ticketOk", { gain: 0.8 });
    playBuf("harp", { gain: 0.45 });
  });
}

export function playTaxLoss(): void {
  withCue("zTax", () => {
    if (playOwn("zTax", { gain: 0.75 })) return;
    playBuf("tableB", { gain: 0.7 });
  });
}

export function playChaseNeutral(): void {
  withCue("zNeutral", () => {
    playOwn("zNeutral", { gain: 0.8 });
  });
}

let heartTimer = 0;
let heartNodes: OscillatorNode[] = [];

function synthHeartbeat(): void {
  if (!ctx || !sfx || muted) return;
  const now = ctx.currentTime;
  for (const delay of [0, 0.16]) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(55, now + delay);
    g.gain.setValueAtTime(0.0001, now + delay);
    g.gain.exponentialRampToValueAtTime(0.35, now + delay + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.14);
    osc.connect(g);
    g.connect(synthOut() ?? sfx);
    releaseOnEnd(osc, g);
    // Keep only the voices still to play: a long ZÁSAH chase beats every 850 ms.
    osc.addEventListener("ended", () => (heartNodes = heartNodes.filter((n) => n !== osc)), { once: true });
    osc.start(now + delay);
    osc.stop(now + delay + 0.16);
    heartNodes.push(osc);
  }
}

export function stopHeartbeat(): void {
  window.clearInterval(heartTimer);
  heartTimer = 0;
  for (const node of heartNodes) {
    try {
      node.stop();
    } catch {
      /* already stopped */
    }
  }
  heartNodes = [];
}

export function startHeartbeat(): void {
  stopHeartbeat();
  if (muted) return;
  unlockAudio();
  const beat = () => {
    if (muted) return;
    withCue("zHeart", () => {
      if (playOwn("zHeart", { gain: 0.85 })) return;
      synthHeartbeat();
    });
  };
  beat();
  const dur = ownCue("zHeart") ? bufs.zHeart.duration : 0;
  const gap = dur > 0.2 ? Math.max(850, Math.round(dur * 1000) + 80) : 850;
  heartTimer = window.setInterval(beat, gap);
}

let cuePreview: { stop: () => void } | null = null;
let cuePreviewTimer = 0;

/**
 * Player's per-sound preview (Settings): the slot's own sample through its per-sound bus and the
 * master volume, so it sounds exactly as in the game. Loops stop after a few seconds.
 * Returns false while the sample is not decoded yet (or the slot is empty).
 */
export function previewCue(key: string): boolean {
  unlockAudio();
  stopCuePreview();
  if (!(key in FILES)) return false;
  if (key === "zHeart" && !ownCue("zHeart")) {
    previewHeartbeat();
    return true;
  }
  if (MUSIC_KEYS.has(key)) return previewLoopEl(key);
  const loop = key === "spin" || key === "anticipate" || key === "anticipation2" || key === "anticipation3";
  // An empty anticipation 2 / 3 previews what the game plays instead (the fallback chain, on that slot's slider).
  const src = key === "anticipation2" || key === "anticipation3" ? antiFallback(key, ownCue) : key;
  const handle = withCue(src, () => playBuf(src, { gain: 0.85, loop }));
  if (!handle) {
    void loadBank();
    return false;
  }
  cuePreview = handle;
  if (loop) cuePreviewTimer = window.setTimeout(stopCuePreview, 5000);
  return true;
}

let previewEl: HTMLAudioElement | null = null;
let previewKey = "";
let previewGen = 0;

/** Keep a direct-playing preview element in step with the sliders (routed ones follow the graph). */
function refreshPreviewEl(): void {
  if (previewEl && previewKey && !previewEl.paused) previewEl.volume = muted ? 0 : elementVolume(previewEl, LIVE_VOL, previewKey);
}

/** Bed / zásah preview: an <audio> like the game's loop, on the same "el:<key>" bus. */
function previewLoopEl(key: string): boolean {
  const gen = ++previewGen;
  void ensureMusic().then(() => {
    if (gen !== previewGen) return;
    const src = cueSrc(key);
    if (!src) return;
    if (!previewEl) {
      previewEl = new Audio();
      previewEl.preload = "auto";
      previewEl.setAttribute("playsinline", "true");
    }
    const el = previewEl;
    previewKey = key;
    el.pause();
    el.loop = true;
    el.src = src;
    void (ctx?.state === "suspended" ? ctx.resume() : Promise.resolve()).then(() => {
      if (gen !== previewGen) return;
      mediaSource(el, key);
      el.volume = muted ? 0 : elementVolume(el, LIVE_VOL, key);
      void el.play().catch(() => {});
    });
    cuePreview = { stop: () => el.pause() };
    cuePreviewTimer = window.setTimeout(stopCuePreview, 5000);
  });
  return true;
}

export function stopCuePreview(): void {
  previewGen += 1;
  window.clearTimeout(cuePreviewTimer);
  cuePreviewTimer = 0;
  cuePreview?.stop();
  cuePreview = null;
}

/** One beat in the settings preview, before a custom file exists. */
export function previewHeartbeat(): void {
  withCue("zHeart", () => {
    unlockAudio();
    if (playOwn("zHeart", { gain: 0.85 })) return;
    synthHeartbeat();
  });
}

export function playPickStart(): void {
  withCue("kontrola", () => {
    stopSpin();
    duckMusic(0.4);
    if (!playBuf("kontrola", { gain: 0.78 })) playBuf("siren", { gain: 0.4 });
  });
}

export function playBigWin(): void {
  stopSpin();
  duckMusic(0.35);
  playing["tableA"]?.stop();
  playing["tableB"]?.stop();
  playing["bigwin"]?.stop();
  const key = Math.random() < 0.5 ? "tableA" : "tableB";
  withCue(key, () => {
    if (!playBuf(key, { gain: 0.82 })) {
      playBuf("bigwin", { gain: 0.8 }) || playBuf("winFull", { gain: 0.8 });
    }
  });
}

export function playMaxWin(): void {
  playBigWin();
}

/** MASÍVNA VÝHRA. Own upload if the admin set one, else the existing big-win fanfare. */
export function playMassiveWin(): void {
  withCue("massive", () => {
    stopSpin();
    duckMusic(0.3);
    liveBed?.duck(0.35);
    playing["tableA"]?.stop();
    playing["tableB"]?.stop();
    playing["bigwin"]?.stop();
    if (playOwn("massive", { gain: 0.9 })) return;
    playBigWin();
  });
}

export function startAmbience(): void {
  if (musicTimer !== null) {
    window.clearTimeout(musicTimer);
    musicTimer = null;
  }
  if (music && ctx) music.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
  void ensureMusic();
}

export function resumeIfNeeded(): void {
  if (ctx?.state === "suspended") void ctx.resume();
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      resumeIfNeeded();
      if (liveEl && !muted) void liveEl.play().catch(() => {});
    } else {
      liveEl?.pause();
    }
  });
}
