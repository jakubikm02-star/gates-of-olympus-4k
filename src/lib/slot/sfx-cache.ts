/**
 * Uploaded sounds kept in Cache Storage as raw bytes (device cache, one entry per md5).
 *
 * A cue with `path` is fetched once from the public Storage bucket (CDN, immutable Cache-Control on a
 * hash-named object) and written here. Without `path` — or when that GET fails — the same slot still
 * comes from the sfx_audio RPC (base64 POST, not HTTP-cacheable) and is written here too.
 *
 * Version of a cue: `v` from sfx_keys2 (md5 of the bytes). Without that RPC the version is the mime type
 * only, so a re-upload of the same slot is picked up after UNVERSIONED_TTL_MS (a re-upload in the admin
 * panel on this device refreshes it at once).
 */
import { storagePathForRow } from "./sfx-storage.ts";

export const SFX_CACHE = "parkizmus-sfx-v1";
/** Unversioned entries are re-downloaded after this long. */
export const UNVERSIONED_TTL_MS = 12 * 60 * 60 * 1000;

export interface CueRow {
  key: string;
  mime: string;
  /** md5 of the stored bytes (sfx_keys2) */
  v?: string;
  /** raw byte length (sfx_keys2) */
  len?: number;
  /** Object key in the public `sfx` bucket (`key/md5.ext`). Absent until the upload script fills it. */
  path?: string;
}

export function cueVersion(row: CueRow): { ver: string; versioned: boolean } {
  if (row.v && /^[0-9a-f]{8,64}$/i.test(row.v)) return { ver: row.v.toLowerCase(), versioned: true };
  return { ver: `m-${(row.mime || "audio").replace(/[^a-z0-9]+/gi, "-")}`, versioned: false };
}

/** Cache key: a same-origin URL that is never requested from the network. */
export function cueCacheUrl(origin: string, key: string, ver: string): string {
  return `${origin}/__sfx-cache/${encodeURIComponent(key)}?v=${encodeURIComponent(ver)}`;
}

export function isFresh(savedAt: number, now: number, versioned: boolean): boolean {
  if (versioned) return true;
  return Number.isFinite(savedAt) && savedAt > 0 && now - savedAt < UNVERSIONED_TTL_MS && savedAt <= now + 60_000;
}

/** Rows parsed from sfx_keys / sfx_keys2 (anything malformed dropped). */
export function parseCueRows(raw: unknown, known: (key: string) => boolean): CueRow[] {
  if (!Array.isArray(raw)) return [];
  const out: CueRow[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const key = typeof r?.key === "string" ? r.key : "";
    if (!key || !known(key)) continue;
    const row: CueRow = { key, mime: typeof r.mime === "string" ? r.mime : "" };
    if (typeof r.v === "string") row.v = r.v;
    const len = Number(r.len);
    if (Number.isFinite(len) && len > 0) row.len = Math.floor(len);
    const path = storagePathForRow({ path: typeof r.path === "string" ? r.path : undefined, v: row.v });
    if (path) row.path = path;
    out.push(row);
  }
  return out;
}

/** Bytes the sfx_audio answer will carry: base64 (4/3) of the raw length plus Postgres' 76-char line breaks. */
export function b64Size(raw: number): number {
  const chars = Math.ceil(raw / 3) * 4;
  return chars + Math.floor(chars / 76) + 2;
}

interface CacheLike {
  match(url: string): Promise<Response | undefined>;
  put(url: string, res: Response): Promise<void>;
  delete(url: string): Promise<boolean>;
  keys(): Promise<readonly Request[]>;
}

async function open(): Promise<CacheLike | null> {
  try {
    if (typeof caches === "undefined") return null;
    return (await caches.open(SFX_CACHE)) as unknown as CacheLike;
  } catch {
    // private mode / storage disabled: no cache, download as before
    return null;
  }
}

const origin = () => (typeof location !== "undefined" ? location.origin : "http://local");

export async function readCue(row: CueRow, now = Date.now()): Promise<{ bytes: ArrayBuffer; type: string } | null> {
  const c = await open();
  if (!c) return null;
  const { ver, versioned } = cueVersion(row);
  try {
    const res = await c.match(cueCacheUrl(origin(), row.key, ver));
    if (!res) return null;
    const saved = Number(res.headers.get("x-saved-at") || 0);
    if (!isFresh(saved, now, versioned)) return null;
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength < 8) return null;
    return { bytes, type: res.headers.get("content-type") || row.mime || "audio/mpeg" };
  } catch {
    return null;
  }
}

export async function writeCue(row: CueRow, bytes: ArrayBuffer, type: string, now = Date.now()): Promise<void> {
  const c = await open();
  if (!c) return;
  const { ver } = cueVersion(row);
  try {
    await c.put(
      cueCacheUrl(origin(), row.key, ver),
      new Response(bytes.slice(0), { headers: { "content-type": type || "audio/mpeg", "x-saved-at": String(now) } }),
    );
  } catch {
    /* quota: next visit downloads again */
  }
}

/** Drop cached cues that are no longer listed or were replaced by a newer version. */
export async function pruneCues(rows: readonly CueRow[]): Promise<number> {
  const c = await open();
  if (!c) return 0;
  const keep = new Set(rows.map((r) => cueCacheUrl(origin(), r.key, cueVersion(r).ver)));
  let n = 0;
  try {
    for (const req of await c.keys()) {
      if (!keep.has(req.url) && (await c.delete(req.url))) n += 1;
    }
  } catch {
    /* ignore */
  }
  return n;
}

/** Admin replaced / reset a slot on this device: forget every cached copy of it. */
export async function forgetCue(key: string): Promise<void> {
  const c = await open();
  if (!c) return;
  const prefix = `${origin()}/__sfx-cache/${encodeURIComponent(key)}?`;
  try {
    for (const req of await c.keys()) if (req.url.startsWith(prefix)) await c.delete(req.url);
  } catch {
    /* ignore */
  }
}
