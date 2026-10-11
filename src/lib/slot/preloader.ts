/**
 * Boot preloader (browser). HRAŤ unlocks only when every image, font, sound (downloaded and decoded) and the
 * start data are on the device — after that the game does not download any asset. Pure rules (asset list,
 * progress, retry timing, slow hint) live in preload-plan.ts.
 *
 * Failures: each item retries on its own (RETRY_DELAYS_MS, a stalled download is aborted after STALL_MS with no
 * new byte). Uploads from Supabase, fonts and start data fall back (built-in file / system font / defaults);
 * only a game file from our own host that still fails blocks HRAŤ, with "Skúsiť znova".
 */
import assets from "virtual:park-public-assets";
import * as sfx from "./audio";
import { contractTitlesReady } from "./job-titles";
import { ticketNamesReady } from "./ticket-names";
import { holdImage } from "./predecode";
import type { CueRow } from "./sfx-cache";
import {
  FONT_FACES,
  FONT_SAMPLE,
  imageTimeout,
  STALL_MS,
  failMessage,
  pathOf,
  progressOf,
  publicImages,
  retryDelay,
  showSlowHint,
  type ItemState,
  type PreloadItem,
  type Progress,
} from "./preload-plan";

/** Art imported from src/assets (hashed by Vite): KOLESO host poses, VERSUS cards. Same URLs the components get. */
const BUNDLED = Object.values(
  import.meta.glob("/src/assets/**/*.{webp,png,jpg,jpeg,svg}", { eager: true, query: "?url", import: "default" }) as Record<
    string,
    string
  >,
);
const BUNDLED_GUESS = 28 * 1024;

export type BootPhase = "list" | "load" | "error" | "ready";

export interface BootSnapshot {
  phase: BootPhase;
  progress: Progress;
  elapsedMs: number;
  slow: boolean;
  failMsg: string | null;
  /** Manual retries already done after an error. */
  rounds: number;
}

interface Task extends PreloadItem {
  run: (onBytes: (n: number) => void, signal: AbortSignal) => Promise<unknown>;
  /** Called once after the last retry failed (non-critical fallbacks). */
  giveUp?: () => void;
  /** Abort when no byte arrived for this long (streams); fixed timeout for the rest. */
  stall: number;
  /** One try only (start data and fonts have their own fallback; retrying a hung promise is pointless). */
  once?: boolean;
  streamed: boolean;
}

export interface DataSource {
  id: string;
  run: () => Promise<unknown>;
}

const DATA_TIMEOUT_MS = 10_000;
const FONT_TIMEOUT_MS = 15_000;
const POOL = 6;

function loadImage(src: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    const off = () => {
      img.onload = null;
      img.onerror = null;
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      off();
      img.src = "";
      reject(new Error(`timeout ${src}`));
    };
    signal.addEventListener("abort", onAbort);
    img.onload = () => {
      off();
      const keep = () => {
        holdImage(src, img);
        resolve();
      };
      if (typeof img.decode === "function") img.decode().then(keep, keep);
      else keep();
    };
    img.onerror = () => {
      off();
      reject(new Error(`image ${src}`));
    };
    img.src = src;
  });
}

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        reject(e);
      },
    );
  });
}

export class BootPreloader {
  private tasks: Task[] = [];
  private states = new Map<string, ItemState>();
  private listeners = new Set<(s: BootSnapshot) => void>();
  private t0 = 0;
  private phase: BootPhase = "list";
  private rounds = 0;
  private started = false;
  private queue: Task[] = [];
  private active = 0;
  private emitTimer = 0;
  private slowTimer = 0;
  private data: DataSource[];
  /** Built-in file URL → slots playing it. */
  private builtinKeys = new Map<string, string[]>();
  private planned = false;

  constructor(data: DataSource[] = []) {
    this.data = data;
  }

  subscribe(fn: (s: BootSnapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  snapshot(): BootSnapshot {
    const progress = progressOf(this.tasks, this.states);
    const elapsedMs = this.t0 ? performance.now() - this.t0 : 0;
    return {
      phase: this.phase,
      progress,
      elapsedMs,
      slow: showSlowHint(elapsedMs, this.phase === "ready"),
      failMsg: this.phase === "error" ? failMessage(progress.blocking.length) : null,
      rounds: this.rounds,
    };
  }

  /** Items in the plan (for tests / the debug HUD). */
  items(): readonly PreloadItem[] {
    return this.tasks;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.t0 = performance.now();
    // The slow hint must appear even while no byte moves the bar.
    this.slowTimer = window.setInterval(() => this.emit(), 500);
    void this.plan();
  }

  /** "Skúsiť znova": failed critical items start over (fresh retry budget). */
  retry(): void {
    if (this.phase !== "error") return;
    this.rounds += 1;
    this.phase = "load";
    for (const t of this.tasks) {
      const st = this.states.get(t.id);
      if (st?.status === "fail" && t.critical) {
        this.states.set(t.id, { status: "wait", loaded: 0, attempts: 0 });
        this.queue.push(t);
      }
    }
    this.emit(true);
    this.pump();
  }

  private add(t: Task): void {
    if (this.states.has(t.id)) return;
    this.tasks.push(t);
    this.states.set(t.id, { status: "wait", loaded: 0, attempts: 0 });
    this.queue.push(t);
  }

  private async plan(): Promise<void> {
    sfx.setShippedSfx(assets.md5, assets.sizes);
    // Decoding needs a context; it may exist suspended before the first tap (it resumes on HRAŤ).
    try {
      sfx.prepareAudio();
    } catch {
      /* no Web Audio: the game plays silent */
    }
    // Small things first so the screen fills in, the sound bank after.
    for (const src of publicImages()) this.addImage(src, assets.sizes[pathOf(src)] || 0);
    for (const src of BUNDLED) this.addImage(src, BUNDLED_GUESS);
    for (const face of FONT_FACES) {
      this.add({
        id: `font:${face}`,
        kind: "font",
        bytes: 20 * 1024,
        critical: false,
        once: true,
        stall: FONT_TIMEOUT_MS,
        streamed: false,
        run: () => (document.fonts ? document.fonts.load(face, FONT_SAMPLE) : Promise.resolve()),
      });
    }
    const data: DataSource[] = [
      { id: "volumes", run: () => sfx.volumesReady },
      { id: "fades", run: () => sfx.fadesReady },
      { id: "job-titles", run: () => contractTitlesReady },
      { id: "ticket-names", run: () => ticketNamesReady },
      ...this.data,
    ];
    for (const d of data) {
      this.add({ id: `data:${d.id}`, kind: "data", bytes: 2 * 1024, critical: false, once: true, stall: DATA_TIMEOUT_MS, streamed: false, run: d.run });
    }
    this.phase = "load";
    this.emit(true);
    this.pump();
    // Which slots have an upload decides which sound files are needed: list first (tiny), then every file.
    let rows: CueRow[] | null = null;
    for (let attempt = 0; attempt < 4 && !rows; attempt += 1) {
      rows = await sfx.listCues();
      if (!rows) await new Promise((r) => window.setTimeout(r, retryDelay(attempt + 1) ?? 1000));
    }
    // Supabase unreachable: every slot plays its built-in file (no upload can be known).
    for (const row of sfx.remotePlan()) this.addRemote(row);
    for (const b of sfx.builtinPlan()) this.addBuiltin(b.key, b.url, b.bytes);
    this.planned = true;
    this.emit(true);
    this.pump();
  }

  private addImage(src: string, bytes: number): void {
    this.add({ id: `img:${src}`, kind: "image", bytes, critical: true, stall: imageTimeout(bytes), streamed: false, run: (_b, signal) => loadImage(src, signal) });
  }

  private addBuiltin(key: string, url: string, bytes: number): void {
    // One task per file: slots sharing a file (zbox_slam = land2) ride on the same download.
    const id = `sfx:${url}`;
    const keys = this.builtinKeys.get(url);
    if (keys) {
      if (keys.includes(key)) return;
      keys.push(key);
      // File already on the device: just decode the extra slot.
      if (this.states.get(id)?.status === "ok") void sfx.preloadBuiltin(key);
      return;
    }
    this.builtinKeys.set(url, [key]);
    this.add({
      id,
      kind: "audio",
      bytes,
      critical: true,
      stall: STALL_MS,
      streamed: true,
      run: async (onBytes, signal) => {
        for (const k of this.builtinKeys.get(url) ?? []) await sfx.preloadBuiltin(k, onBytes, signal);
      },
    });
  }

  private addRemote(row: CueRow): void {
    this.add({
      id: `cue:${row.key}`,
      kind: "audio",
      bytes: sfx.cueBytesHint(row),
      critical: false,
      stall: STALL_MS,
      streamed: true,
      run: async (onBytes, signal) => {
        await sfx.pullCue(row, onBytes, signal);
        await sfx.decodeCue(row.key);
      },
      // The upload stayed out of reach: its built-in file (or synth) plays, and that file is preloaded now.
      giveUp: () => {
        sfx.dropRemote(row.key);
        for (const b of sfx.builtinPlan()) if (b.key === row.key) this.addBuiltin(b.key, b.url, b.bytes);
        this.pump();
      },
    });
  }

  private pump(): void {
    while (this.active < POOL && this.queue.length) {
      const t = this.queue.shift()!;
      this.active += 1;
      void this.runTask(t).finally(() => {
        this.active -= 1;
        this.pump();
        this.check();
      });
    }
    this.check();
  }

  private async runTask(t: Task): Promise<void> {
    const st = this.states.get(t.id)!;
    for (;;) {
      st.status = "load";
      st.attempts += 1;
      st.loaded = 0;
      const ac = new AbortController();
      let timer = 0;
      const arm = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => ac.abort(), t.stall);
      };
      arm();
      try {
        const work = t.run((n) => {
          st.loaded = n;
          if (t.streamed) arm();
          this.emit();
        }, ac.signal);
        // Promises that cannot take a signal (fonts, data) still give up at the deadline.
        await new Promise<unknown>((resolve, reject) => {
          ac.signal.addEventListener("abort", () => reject(new Error("stalled")), { once: true });
          work.then(resolve, reject);
        });
        window.clearTimeout(timer);
        st.status = "ok";
        st.error = undefined;
        this.emit();
        return;
      } catch (e) {
        window.clearTimeout(timer);
        st.error = e instanceof Error ? e.message : String(e);
        const wait = t.once ? null : retryDelay(st.attempts);
        if (wait == null) {
          st.status = "fail";
          t.giveUp?.();
          this.emit(true);
          return;
        }
        st.status = "wait";
        this.emit();
        await new Promise((r) => window.setTimeout(r, wait));
      }
    }
  }

  private check(): void {
    if (!this.planned || this.phase === "ready") return;
    if (this.active > 0 || this.queue.length > 0) return;
    const p = progressOf(this.tasks, this.states);
    if (!p.settled) return;
    if (p.blocking.length) this.phase = "error";
    else {
      this.phase = "ready";
      sfx.markCuesHydrated();
      window.clearInterval(this.slowTimer);
    }
    this.emit(true);
  }

  /** Skip the asset that keeps failing (offered after two manual rounds): the game starts without it. */
  skipFailed(): void {
    if (this.phase !== "error") return;
    for (const t of this.tasks) if (this.states.get(t.id)?.status === "fail") t.critical = false;
    this.check();
  }

  private emit(now = false): void {
    if (now) {
      window.clearTimeout(this.emitTimer);
      this.emitTimer = 0;
      this.flush();
      return;
    }
    if (this.emitTimer) return;
    this.emitTimer = window.setTimeout(() => {
      this.emitTimer = 0;
      this.flush();
    }, 100);
  }

  private flush(): void {
    const s = this.snapshot();
    for (const fn of this.listeners) fn(s);
  }
}

let shared: BootPreloader | null = null;

/** One preloader per page (StrictMode mounts twice). */
export function bootPreloader(data: DataSource[] = []): BootPreloader {
  if (!shared) {
    shared = new BootPreloader(data);
    if (typeof window !== "undefined") window.__parkBoot = shared;
  }
  return shared;
}

declare global {
  interface Window {
    __parkBoot?: BootPreloader;
  }
}
