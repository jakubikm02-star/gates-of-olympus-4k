/**
 * Boot preloader, pure part (no DOM, node:test covers it): the list of public art the game shows, the
 * byte-weighted progress, retry / stall timing and the "slow network" hint. preloader.ts runs it in the browser.
 *
 * Rule: nothing the game draws or plays may start downloading after HRAŤ. Every image the game can show
 * (reels, Paas poses, bonus screens KOLESO / Ž-BOX / VERSUS / ZÁSAH smog, 4KA TV fog, rank cabinets of every
 * rank, CSS backgrounds) is listed here; preload-plan.test.ts greps src/ and fails when a new public asset
 * is referenced without being listed.
 */
import { ALL_ART, CAN_ART } from "./symbols.ts";
import { machineAiSrc, machineFrameSrc, machineTileSrc, rankFrameSrc, RANK_HALO_SRC } from "./rank-frames.ts";
import { MACHINE_AI } from "./machine-ai-frames.ts";

export type PreloadKind = "image" | "audio" | "font" | "data";

export interface PreloadItem {
  id: string;
  kind: PreloadKind;
  /** Expected bytes (0 = unknown, weighted as MIN_WEIGHT). */
  bytes: number;
  /** A critical item that still fails after its retries blocks HRAŤ (Skúsiť znova). Others fall back silently. */
  critical: boolean;
}

export type ItemStatus = "wait" | "load" | "ok" | "fail";

export interface ItemState {
  status: ItemStatus;
  /** Bytes received so far (streamed fetches) — capped by the item's weight. */
  loaded: number;
  attempts: number;
  error?: string;
}

/** Families with their own cabinet / rank frame art (every rank can be reached in one session). */
const FAMILIES = Object.keys(MACHINE_AI);
const DIVS: Record<string, number[]> = Object.fromEntries(
  FAMILIES.map((id) => [id, id === "fiveg" || id === "nekonecno" ? [0] : [4, 3, 2, 1]]),
);

/** Art referenced by literal URL in components / CSS (not already in ALL_ART). */
export const LITERAL_ART: readonly string[] = [
  // boot + intro
  "/art/paas-hero.webp",
  "/symbols/park.svg",
  // CSS backgrounds (styles.css, boot-screen.css, massive-win.css)
  "/frames/cabinet.jpg",
  "/frames/cpu.svg",
  "/frames/radar.svg",
  "/frames/satellite.svg",
  "/frames/trail.png",
  "/massive/eu-stars.svg",
  "/massive/wave.svg",
  // KONTROLA pick bonus
  "/art/city-map.jpg",
  "/art/paas-letak.webp",
  // KOLESO
  "/koleso/disc.webp",
  "/koleso/hub.webp",
  "/koleso/pointer.webp",
  "/koleso/rim.webp",
  "/koleso/bg-blur.webp",
  // Ž-BOX
  "/zbox/alu.webp",
  "/zbox/bg-blur.webp",
  "/zbox/bg.webp",
  "/zbox/parcel.webp",
  "/zbox/print-p.webp",
  "/zbox/print-w.webp",
  // ZÁSAH police smog (police-smog.css)
  "/fx/beam-blue.webp",
  "/fx/beam-red.webp",
  "/fx/smog-blue.webp",
  "/fx/smog-blue2.webp",
  "/fx/smog-red.webp",
  "/fx/smog-red2.webp",
  // 4KA TV visualizer fog
  "/fx/fog-rainbow.webp",
];

/** Every rank badge, cabinet corner, side tile and AI cabinet sheet (both sizes) of every rank family. */
export function rankArt(): string[] {
  const out: string[] = [RANK_HALO_SRC];
  for (const id of FAMILIES) {
    for (const d of DIVS[id]) {
      out.push(rankFrameSrc(id, d), machineFrameSrc(id, d));
      for (const axis of ["h", "v"] as const) out.push(machineTileSrc(id, d, axis));
    }
    out.push(machineAiSrc(id, "hi"), machineAiSrc(id, "m"));
  }
  return out;
}

/** All public images the game can show, deduplicated, in load order (reels and boot art first). */
export function publicImages(): string[] {
  return [...new Set([...ALL_ART, ...CAN_ART, ...LITERAL_ART, ...rankArt()])];
}

/** URL without its ?v= query (size table key). */
export function pathOf(url: string): string {
  const q = url.indexOf("?");
  return q < 0 ? url : url.slice(0, q);
}

/** Unknown-size items still move the bar a little. */
export const MIN_WEIGHT = 4 * 1024;

export function weightOf(item: PreloadItem): number {
  return Math.max(MIN_WEIGHT, item.bytes || 0);
}

export interface Progress {
  /** 0 … 100, never 100 until every item settled. */
  pct: number;
  loadedBytes: number;
  totalBytes: number;
  done: number;
  total: number;
  failed: string[];
  /** Failed critical items (block HRAŤ). */
  blocking: string[];
  settled: boolean;
}

export function progressOf(items: readonly PreloadItem[], states: ReadonlyMap<string, ItemState>): Progress {
  let total = 0;
  let loaded = 0;
  let done = 0;
  const failed: string[] = [];
  const blocking: string[] = [];
  for (const it of items) {
    const w = weightOf(it);
    total += w;
    const st = states.get(it.id);
    if (!st) continue;
    if (st.status === "ok") {
      loaded += w;
      done += 1;
    } else if (st.status === "fail") {
      failed.push(it.id);
      if (it.critical) blocking.push(it.id);
      else {
        // A non-critical item that gave up counts as handled (its fallback is in place).
        loaded += w;
        done += 1;
      }
    } else loaded += Math.min(w * 0.98, Math.max(0, st.loaded));
  }
  const settled = items.every((it) => {
    const s = states.get(it.id)?.status;
    return s === "ok" || s === "fail";
  });
  const raw = total > 0 ? (loaded / total) * 100 : 100;
  const pct = settled && blocking.length === 0 ? 100 : Math.min(99, Math.floor(raw));
  return { pct, loadedBytes: Math.round(loaded), totalBytes: Math.round(total), done, total: items.length, failed, blocking, settled };
}

/** Under the bar after this long: "Načítanie závisí od rýchlosti internetu". */
export const SLOW_HINT_MS = 5000;
export const SLOW_HINT = "Načítanie závisí od rýchlosti internetu";

export function showSlowHint(elapsedMs: number, ready: boolean): boolean {
  return !ready && elapsedMs >= SLOW_HINT_MS;
}

/** Automatic retries per item (after the first try), then the item fails. */
export const RETRY_DELAYS_MS = [700, 2000, 5000] as const;

export function retryDelay(attempt: number): number | null {
  // attempt = tries already made (1 after the first failure)
  return attempt >= 1 && attempt <= RETRY_DELAYS_MS.length ? RETRY_DELAYS_MS[attempt - 1] : null;
}

/**
 * A download is aborted (and retried) only when no byte arrived for this long — never on total time,
 * so a multi-MB music bed on a slow phone link can take a while without being cut off.
 */
export const STALL_MS = 20_000;
/** Images have no byte stream: one try gets this long plus 1 s per 4 kB (a very slow link still finishes). */
export const IMAGE_TIMEOUT_MS = 45_000;

export function imageTimeout(bytes: number): number {
  return IMAGE_TIMEOUT_MS + Math.ceil(Math.max(0, bytes) / 4);
}

/** "12,3 MB" (Slovak decimal comma). */
export function formatMB(bytes: number): string {
  const mb = Math.max(0, bytes) / (1024 * 1024);
  return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`.replace(".", ",");
}

/** Text of the failure line on the boot screen. */
export function failMessage(n: number): string {
  const what = n === 1 ? "1 súbor" : n >= 2 && n <= 4 ? `${n} súbory` : `${n} súborov`;
  return `Nepodarilo sa stiahnuť ${what} hry. Skontroluj pripojenie a skús znova.`;
}

/** Fonts the CSS uses (styles.css @import), with the weights in use. Loaded with Slovak sample text. */
export const FONT_FACES: readonly string[] = [
  "400 16px 'IBM Plex Mono'",
  "600 16px 'IBM Plex Mono'",
  "700 16px 'IBM Plex Mono'",
  "500 16px Oswald",
  "600 16px Oswald",
  "700 16px Oswald",
  "400 16px Outfit",
  "500 16px Outfit",
  "600 16px Outfit",
  "700 16px Outfit",
  "800 16px Outfit",
];
/** Latin + latin-ext glyphs (Google serves those as separate files): loading both up front. */
export const FONT_SAMPLE = "AaZz09 ŽžČčŠšŤťĽľŇňĎďÁáÄäÉéÍíÓóÔôÚúÝýŔŕĹĺ ×€%·–—…";
