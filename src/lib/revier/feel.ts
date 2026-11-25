/**
 * Nočná smena feel + layout. One place to retune the cabinet, the rig and the cues.
 * Fractions are of the fight canvas. The canvas mounts in a DOM node.
 */
export const FEEL = {
  dprCap: 0.8,
  particles: 16,
  particlesLow: 14,
  budgetMs: 18,
  budgetFrames: 12,
  recoverFrames: 90,
  dropMs: 280,
  travelMs: 220,
  chargeMs: 90,
  impactMs: 140,
  /** Plain symbol, charge + travel + hold ≈ 450–600 ms. */
  resultHoldMs: 320,
  bigHoldMs: 900,
  rewindMs: 160,
  foeTellMs: 400,
  foeHoldMs: 1200,
  shakeHitMs: 140,
  shakeCritMs: 220,
  spinStaggerMs: 100,
  shutterMs: 260,
  critLinkMs: 420,
  numberPopMs: 260,
  buttonSquashMs: 120,
  rigMix: 0.12,
  gravity: 0.0016,
  layout: {
    enemyTop: 0.02,
    enemyH: 0.42,
    reelBottom: 0.12,
    reelH: 0.28,
    gap: 0.018,
    landEnemyW: 0.38,
  },
} as const;

export type FeelTarget = "foe" | "you" | "coin";
