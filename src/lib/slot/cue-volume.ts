/**
 * Sound volumes (0 … 200 %): one master + one per sound slot. GLOBAL for the whole game: the admin
 * sets them in Settings, they are stored in Supabase (public.sfx_volume) and every player loads them
 * at start. Pure helpers only (no Web Audio), so they can be unit-tested in node.
 *
 * Effective level of a cue = cue level × master volume (then the limiter).
 */

/** Upper bound of a single cue, same as the master slider (200 %). */
export const CUE_LEVEL_MAX = 2;
/** Row key of the master volume in public.sfx_volume (cue keys are the sound slot ids). */
export const MASTER_KEY = "_master";

/**
 * Old per-device localStorage keys (`p4k.volume` master, `p4k.volume.<slot>` cues). No longer read:
 * volumes are global now; clients delete these once.
 */
export function isLegacyVolumeKey(k: string | null): boolean {
  return k === "p4k.volume" || (k !== null && k.startsWith("p4k.volume."));
}

/** Clamp to 0 … 2 and round to whole percent. Non-numbers fall back to 100 %. */
export function clampCueLevel(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.max(0, Math.min(CUE_LEVEL_MAX, Math.round(v * 100) / 100));
}

/** Stored string → level. Missing or garbage → 100 %. */
export function parseCueLevel(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || raw.trim() === "") return 1;
  const v = Number(raw);
  return Number.isFinite(v) ? clampCueLevel(v) : 1;
}

/** What the player hears relative to the file: cue × master (both 0 … 2). */
export function effectiveCueGain(cue: number, master: number): number {
  return clampCueLevel(cue) * Math.max(0, Math.min(2, master));
}

/**
 * HTMLAudio played directly (context suspended): element volume cannot exceed 1,
 * so the product is capped there.
 */
export function directElementVolume(level: number, cue: number, master: number): number {
  return Math.max(0, Math.min(1, level * effectiveCueGain(cue, master)));
}

/**
 * Server rows → levels. Anything malformed is skipped (that slot stays at 100 %); values are clamped.
 * `known` limits cue keys to existing slots; the master is always accepted.
 */
export function parseGlobalLevels(
  rows: unknown,
  known: ReadonlySet<string>,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const { key, level } = row as { key?: unknown; level?: unknown };
    if (typeof key !== "string" || (key !== MASTER_KEY && !known.has(key))) continue;
    const v = typeof level === "number" ? level : typeof level === "string" ? Number(level) : NaN;
    if (!Number.isFinite(v)) continue;
    out[key] = clampCueLevel(v);
  }
  return out;
}

/** Full payload for sfx_volume_put: master + every slot (100 % rows are deleted server-side). */
export function globalLevelsPayload(
  master: number,
  cues: Record<string, number>,
  keys: readonly string[],
): Record<string, number> {
  const out: Record<string, number> = { [MASTER_KEY]: clampCueLevel(master) };
  for (const k of keys) out[k] = clampCueLevel(cues[k] ?? 1);
  return out;
}
