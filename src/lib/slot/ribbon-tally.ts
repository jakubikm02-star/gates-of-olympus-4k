/**
 * Lifetime ribbon counts for the "Ribbony" gallery. The daily log (ribbon-store) is wiped at
 * midnight and player_ribbon keeps only the latest title per player, so neither can say how many
 * times a ribbon was earned. This tally lives on this phone only (localStorage), next to the
 * daily log. It is folded from the daily log: an entry counts once when its `at` is newer than
 * the last one counted for that ribbon, so replaying the same log never double counts.
 * Cosmetic only. No network.
 */
import { RIBBONS, isRibbonId, type RibbonDef, type RibbonLog } from "./ribbons.ts";

export const TALLY_KEY = "parkizmus-ribbon-tally-v1";

export interface TallyEntry {
  /** Times earned (one per Bratislava day at most, the daily log never repeats a title). */
  n: number;
  /** ms of the last earn; 0 when the log had no time. */
  last: number;
}

export type RibbonTally = Readonly<Record<string, TallyEntry>>;

const MAX_N = 1_000_000;
const MAX_AT = 10_000_000_000_000;

export function sanitizeTally(raw: unknown): RibbonTally {
  const out: Record<string, TallyEntry> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isRibbonId(id) || !v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const n = typeof o.n === "number" && Number.isFinite(o.n) ? Math.min(MAX_N, Math.max(0, Math.floor(o.n))) : 0;
    const last = typeof o.last === "number" && Number.isFinite(o.last) ? Math.min(MAX_AT, Math.max(0, o.last)) : 0;
    if (n > 0) out[id] = { n, last };
  }
  return out;
}

/** Fold one daily log into the tally. Returns the same object when nothing changed. */
export function foldRibbonLog(tally: RibbonTally, log: RibbonLog | null | undefined): RibbonTally {
  if (!log || !log.earned.length) return tally;
  let next: Record<string, TallyEntry> | null = null;
  for (const e of log.earned) {
    if (!isRibbonId(e.id)) continue;
    const cur = (next ?? tally)[e.id];
    if (cur && e.at <= cur.last) continue;
    next ??= { ...tally };
    next[e.id] = { n: Math.min(MAX_N, (cur?.n ?? 0) + 1), last: Math.max(0, e.at) };
  }
  return next ?? tally;
}

export interface GalleryTile {
  def: RibbonDef;
  n: number;
  last: number;
  earned: boolean;
}

/** Every ribbon in the catalogue order, with the current player's count. */
export function galleryTiles(tally: RibbonTally): GalleryTile[] {
  return RIBBONS.map((def) => {
    const t = tally[def.id];
    const n = t?.n ?? 0;
    return { def, n, last: n > 0 ? (t?.last ?? 0) : 0, earned: n > 0 };
  });
}

export function earnedKinds(tally: RibbonTally): number {
  return RIBBONS.reduce((k, r) => k + ((tally[r.id]?.n ?? 0) > 0 ? 1 : 0), 0);
}

/* ---- store (browser) ---- */

const subs = new Set<() => void>();
let tally: RibbonTally = {};
let loaded = false;

function read(): RibbonTally {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(TALLY_KEY);
    return raw ? sanitizeTally(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

function ensure(): RibbonTally {
  if (!loaded) {
    loaded = true;
    tally = read();
  }
  return tally;
}

export function subscribeTally(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function tallySnapshot(): RibbonTally {
  return ensure();
}

const EMPTY: RibbonTally = {};
export function tallyServerSnapshot(): RibbonTally {
  return EMPTY;
}

/** Called by ribbon-store whenever the daily log is loaded or changes. */
export function syncTally(log: RibbonLog): void {
  const prev = ensure();
  const next = foldRibbonLog(prev, log);
  if (next === prev) return;
  tally = next;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(TALLY_KEY, JSON.stringify(next));
  } catch {
    /* private mode: counts live until reload */
  }
  for (const fn of subs) fn();
}

/** Test hook. */
export function resetTally(next: RibbonTally = {}): void {
  tally = next;
  loaded = true;
}

/* ---- which ribbon the gallery shows ---- */

export interface GalleryState {
  open: boolean;
  /** Ribbon in the detail view; "" = the grid. */
  id: string;
}

const CLOSED: GalleryState = { open: false, id: "" };
let gallery: GalleryState = CLOSED;
const gallerySubs = new Set<() => void>();

function setGallery(next: GalleryState): void {
  gallery = next;
  for (const fn of gallerySubs) fn();
}

export function subscribeGallery(fn: () => void): () => void {
  gallerySubs.add(fn);
  return () => gallerySubs.delete(fn);
}

export function gallerySnapshot(): GalleryState {
  return gallery;
}

export function galleryServerSnapshot(): GalleryState {
  return CLOSED;
}

/** Open the gallery; with a ribbon id it opens straight on that ribbon's detail. */
export function openRibbonGallery(id = ""): void {
  setGallery({ open: true, id: isRibbonId(id) ? id : "" });
}

export function showRibbonGrid(): void {
  if (gallery.open) setGallery({ open: true, id: "" });
}

export function closeRibbonGallery(): void {
  if (gallery.open) setGallery(CLOSED);
}
