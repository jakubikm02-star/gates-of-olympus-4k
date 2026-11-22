/**
 * Nočná smena feel + layout. One place to retune timings after the UX brief.
 * Fractions are of the fight canvas, not the whole phone.
 * The canvas mounts in a DOM node, so a later Capacitor WebView can host it as-is.
 */
export const FEEL = {
  dprCap: 2,
  particles: 24,
  /** Symbol falls into an empty window. */
  dropMs: 200,
  /** Symbol flies from its window to the target. */
  travelMs: 180,
  /** Plain symbol spotlight, travel + hold ≈ 450–600 ms. */
  resultHoldMs: 380,
  bigHoldMs: 900,
  rewindMs: 160,
  /** Enemy tell + number. Together about 2 s. Tap speeds this up. */
  foeTellMs: 400,
  foeHoldMs: 1600,
  shakeHitMs: 140,
  shakeCritMs: 220,
  spinStaggerMs: 100,
  layout: {
    enemyTop: 0.02,
    enemyH: 0.46,
    reelBottom: 0.03,
    reelH: 0.32,
    gap: 0.018,
    landEnemyW: 0.36,
  },
} as const;

export type FeelTarget = "foe" | "you" | "coin";
