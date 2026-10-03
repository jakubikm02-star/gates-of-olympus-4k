/**
 * Anticipation 2 / 3: which tease sound a spin plays.
 *
 * An anticipation is per SPIN, not per reel: the tease loop starts once, on the first reel that still runs
 * while 2+ scatters are on the board (base game only; in 4KA TV the reels tease silently). The loop keeps
 * playing until the reels stop, so one spin = at most one anticipation.
 *
 * `streak` counts anticipations in a row that ended without a 4KA TV trigger (checked BEFORE the event):
 *   streak 0–3  → "anticipate"      (anticipations 1–4)
 *   streak 4–8  → "anticipation2"   (anticipations 5–9)
 *   streak 9+   → "anticipation3"   (anticipation 10 and every next one)
 * Any 4KA TV trigger from a base spin (anticipated or not: scatters in tumbles, ZÁSAH, buy) resets it to 0.
 * Playing anticipation 2 or 3 does not reset it.
 * Empty slots fall back down the chain: anticipation3 → anticipation2 → anticipate (see antiFallback).
 */
export const ANTI2_AFTER = 4;
export const ANTI3_AFTER = 9;
/** Upper bound kept in the save so a corrupt value cannot grow without limit. */
export const ANTI_STREAK_MAX = 9999;

export type AntiCue = "anticipate" | "anticipation2" | "anticipation3";
const CHAIN: AntiCue[] = ["anticipation3", "anticipation2", "anticipate"];

/** Sound slot for the anticipation that is starting now. */
export function antiCue(streak: number): AntiCue {
  const n = antiStreak(streak);
  return n >= ANTI3_AFTER ? "anticipation3" : n >= ANTI2_AFTER ? "anticipation2" : "anticipate";
}

/** Level of a cue for stats: 1 = normal, 2, 3. */
export function antiLevel(cue: AntiCue): 1 | 2 | 3 {
  return cue === "anticipation3" ? 3 : cue === "anticipation2" ? 2 : 1;
}

/**
 * The slot that really plays for `cue`: the first one down the chain that has a sound (`has`).
 * "anticipate" is the built-in default and always plays.
 */
export function antiFallback(cue: AntiCue, has: (key: AntiCue) => boolean): AntiCue {
  for (const key of CHAIN.slice(CHAIN.indexOf(cue))) {
    if (key === "anticipate" || has(key)) return key;
  }
  return "anticipate";
}

/** Streak after a spin. `anticipated` = the tease sound played this spin, `bonus` = the spin triggered 4KA TV. */
export function antiAfterSpin(streak: number, r: { anticipated: boolean; bonus: boolean }): number {
  if (r.bonus) return 0;
  if (!r.anticipated) return antiStreak(streak);
  return Math.min(ANTI_STREAK_MAX, antiStreak(streak) + 1);
}

/** Sanitize a saved streak. */
export function antiStreak(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : 0;
  return Math.min(ANTI_STREAK_MAX, Math.max(0, n));
}
