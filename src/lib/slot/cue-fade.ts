/**
 * Per-sound cut-off + fade-out ("Max. dĺžka" / "Fade out" in Settings). GLOBAL like the volumes: the admin
 * sets them, they are stored in Supabase (public.sfx_fade, migration 20261004_sfx_fade.sql) and every player
 * loads them at start. Until that table exists (or when the fetch fails) the last known values are kept in
 * localStorage (FADE_LOCAL_KEY) as a fallback. Pure helpers only (no Web Audio), unit-tested in node.
 *
 * - maxS: null = off (default, the sound plays to its end). Otherwise the voice is cut after maxS seconds.
 * - fadeMs: 0 … 3000. Length of the gain ramp to 0 that ends at the cut, and of the ramp used when the game
 *   stops / interrupts the sound early (next spin, retrigger, preview stop). Never shorter than STOP_FADE_MIN_MS,
 *   so even 0 ms does not click.
 */

export type CueFade = { maxS: number | null; fadeMs: number };

export const FADE_MS_MAX = 3000;
export const MAX_S_MIN = 0.1;
export const MAX_S_MAX = 120;
/** Shortest ramp ever used for a stop / cut (anti-click floor). */
export const STOP_FADE_MIN_MS = 30;
/** localStorage fallback: last fades loaded from / saved to the server, or saved locally when it has no table. */
export const FADE_LOCAL_KEY = "p4k.sfxFade";

export const DEFAULT_FADE: CueFade = Object.freeze({ maxS: null, fadeMs: 0 }) as CueFade;

/** Clamp the cut to 0.1 … 120 s (one decimal). 0 / negative / garbage / null = off. */
export function clampMaxS(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(MAX_S_MIN, Math.min(MAX_S_MAX, Math.round(n * 10) / 10));
}

/** Clamp the fade to whole ms 0 … 3000. Garbage = 0. */
export function clampFadeMs(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(FADE_MS_MAX, Math.round(n)));
}

export function normFade(f: Partial<CueFade> | null | undefined): CueFade {
  return { maxS: clampMaxS(f?.maxS ?? null), fadeMs: clampFadeMs(f?.fadeMs ?? 0) };
}

export function isDefaultFade(f: CueFade | undefined): boolean {
  return !f || (f.maxS === null && f.fadeMs === 0);
}

export function sameFade(a: CueFade | undefined, b: CueFade | undefined): boolean {
  const x = a ?? DEFAULT_FADE;
  const y = b ?? DEFAULT_FADE;
  return x.maxS === y.maxS && x.fadeMs === y.fadeMs;
}

/** Ramp length (s) when a voice is stopped early: the slot's fade, never under the anti-click floor. */
export function stopFadeSec(f: CueFade | undefined): number {
  return Math.max(STOP_FADE_MIN_MS, f?.fadeMs ?? 0) / 1000;
}

/**
 * When to cut a voice (seconds after its start, playback time). `durationS` = file length (Infinity / 0 when
 * unknown or looping), `rate` = playback rate. null = no cut (off, or the sound ends on its own first).
 * The fade ends exactly at the cut and is never longer than the part that plays.
 */
export function cutPlan(
  durationS: number,
  rate: number,
  fade: CueFade | undefined,
  loop = false,
): { cutAt: number; fadeStart: number; fadeLen: number } | null {
  const f = fade ?? DEFAULT_FADE;
  if (f.maxS === null) return null;
  const r = Number.isFinite(rate) && rate > 0 ? rate : 1;
  const natural = loop || !Number.isFinite(durationS) || durationS <= 0 ? Infinity : durationS / r;
  if (f.maxS >= natural) return null;
  const cutAt = f.maxS;
  const fadeLen = Math.min(cutAt, stopFadeSec(f));
  return { cutAt, fadeStart: cutAt - fadeLen, fadeLen };
}

/** What actually sounds (s): min(file / rate, max) — for the label next to the duration. */
export function playedLength(durationS: number, fade: CueFade | undefined, rate = 1): number {
  const plan = cutPlan(durationS, rate, fade);
  return plan ? plan.cutAt : durationS / (rate > 0 ? rate : 1);
}

/**
 * Server rows (public.sfx_fade: key, max_s, fade_ms) or the localStorage copy → fades. Malformed rows are
 * skipped, values clamped, unknown slots dropped, default rows omitted.
 */
export function parseFadeRows(rows: unknown, known: ReadonlySet<string>): Record<string, CueFade> {
  const out: Record<string, CueFade> = {};
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const { key, max_s, fade_ms } = row as { key?: unknown; max_s?: unknown; fade_ms?: unknown };
    if (typeof key !== "string" || !known.has(key)) continue;
    const f: CueFade = { maxS: clampMaxS(max_s), fadeMs: clampFadeMs(fade_ms) };
    if (!isDefaultFade(f)) out[key] = f;
  }
  return out;
}

/** Full payload for sfx_fade_put / localStorage: every slot (default rows are deleted server-side). */
export function fadePayload(
  fades: Record<string, CueFade | undefined>,
  keys: readonly string[],
): Record<string, { max_s: number | null; fade_ms: number }> {
  const out: Record<string, { max_s: number | null; fade_ms: number }> = {};
  for (const k of keys) {
    const f = normFade(fades[k]);
    out[k] = { max_s: f.maxS, fade_ms: f.fadeMs };
  }
  return out;
}

/** Payload object → rows (for the localStorage copy, read back with parseFadeRows). */
export function payloadRows(p: Record<string, { max_s: number | null; fade_ms: number }>): unknown[] {
  return Object.entries(p).map(([key, v]) => ({ key, max_s: v.max_s, fade_ms: v.fade_ms }));
}

/** "2,4 s" / "850 ms" / "1:12" (Slovak decimal comma). */
export function formatSec(s: number | null | undefined): string {
  if (s === null || s === undefined || !Number.isFinite(s) || s <= 0) return "—";
  if (s < 1) return `${Math.round(s * 1000)} ms`;
  if (s < 60) return `${(Math.round(s * 10) / 10).toFixed(1).replace(".", ",")} s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}
