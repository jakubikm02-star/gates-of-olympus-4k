/**
 * Per-sound player volume (0 … 200 %), one per sound slot, saved per device.
 * Pure helpers only (no Web Audio), so they can be unit-tested in node.
 *
 * Effective level of a cue = cue level × master volume (then the limiter).
 */

/** Upper bound of a single cue, same as the master slider (200 %). */
export const CUE_LEVEL_MAX = 2;
/** localStorage key prefix: `p4k.volume.<slot>`; `p4k.volume` itself is the master. */
export const CUE_LEVEL_PREFIX = "p4k.volume.";

export function cueLevelKey(key: string): string {
  return CUE_LEVEL_PREFIX + key;
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
