/**
 * Can (plechovka) sound timing. Pure, no Web Audio here, so node:test can cover it (audio.ts plays).
 *
 * Drop: cans dropped by the rampa fall in with `.cell.is-drop` (styles.css `cell-drop`, 280 ms). One drop
 * of 1–4+ cans is ONE landing moment. The Plechovka slot does not play on the drop; it plays only when a
 * winning multiplier is counted into the win. The drop key is still one moment so a later cascade is distinct.
 * Every landing moment has a key (spin + step: the land after the reels stop, or tumble n); a key plays
 * at most once, and anything inside CAN_DROP_WINDOW_MS of the last play is the same moment too (two
 * calls in one frame never stack). A later cascade of the same spin is a new key, so it plays again.
 *
 * Lightning (blesk): when the cans of a win are activated, the attendant's bolt hits them one after the
 * other. The Blesk do plechovky slot plays once for that spin, on the first bolt, however many cans
 * ignite. A later spin plays again.
 */

/** `.cell.is-drop` animation length (styles.css `cell-drop 280ms`). */
export const CAN_LAND_MS = 280;
/** Cans landing within this window are one landing moment (one drop sound). */
export const CAN_DROP_WINDOW_MS = 150;
/** Lightning strikes closer than this are one sound (strikes fired in one go when skipping). */
export const CAN_STRIKE_GAP_MS = 90;

/** Milliseconds from putting the dropped cans on the grid to their visual landing. */
export function canLandDelay(reduced: boolean): number {
  return reduced ? 0 : CAN_LAND_MS;
}

/** Key of one landing moment: `step` 0 = drop after the reels stop, n ≥ 1 = drop with the n-th tumble. */
export function canDropKey(spin: number, step: number): string {
  return `${spin}:drop:${step}`;
}

/** One lightning sound for the whole spin, not one per can. */
export function canBoltKey(spin: number): string {
  return `${spin}:bolt`;
}

/** Key of one lightning strike on a can (the can's cell uid). */
export function canStrikeKey(spin: number, uid: number): string {
  return `${spin}:strike:${uid}`;
}

export interface SfxGate {
  /** True when the sound for `key` may play now (and records it); false = already played / same moment. */
  take(key: string, now: number): boolean;
  reset(): void;
}

/**
 * "Once per moment" gate: a key plays at most once, and nothing plays within `windowMs` of the last
 * play. Remembers the last `memory` keys (a spin has a handful of moments; old keys can go).
 */
export function createSfxGate(windowMs: number, memory = 64): SfxGate {
  let last = Number.NEGATIVE_INFINITY;
  const seen: string[] = [];
  const remember = (key: string) => {
    seen.push(key);
    if (seen.length > memory) seen.shift();
  };
  return {
    take(key, now) {
      if (seen.includes(key)) return false;
      remember(key);
      if (now - last < windowMs) return false;
      last = now;
      return true;
    },
    reset() {
      last = Number.NEGATIVE_INFINITY;
      seen.length = 0;
    },
  };
}
