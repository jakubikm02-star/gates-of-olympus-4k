/**
 * The KONTROLA bar (pity, lib/slot/pick-bonus) no longer always opens KONTROLA: when it fills, a mode is
 * drawn right away and saved with the player (PlayerSave.bonusPending), so a reload cannot redraw it. The
 * mode strip (BonusModeStrip) only shows the result. Every mode has the same EV per rank as KONTROLA
 * (lib/slot/bonus-ev, scripts/zbox-ev.ts, scripts/koleso-ev.ts), so the bar's RTP share does not depend on
 * the draw. Three modes, 1/3 each: KONTROLA, Ž-BOX, KOLESO NEŠŤASTIA.
 */
import type { ChaseModKind } from "./zasah.ts";

export type BonusModeId = "kontrola" | "zbox" | "koleso";

export interface BonusModeDef {
  id: BonusModeId;
  label: string;
  sub: string;
  /** Draw weight. 0 = on the strip, never selected. */
  weight: number;
}

export const BONUS_MODES: readonly BonusModeDef[] = [
  { id: "kontrola", label: "KONTROLA", sub: "Parkovné", weight: 1 },
  { id: "zbox", label: "Ž-BOX", sub: "Pakeťák", weight: 1 },
  { id: "koleso", label: "KOLESO", sub: "Nešťastia", weight: 1 },
];

export function bonusModeDef(id: BonusModeId): BonusModeDef {
  return BONUS_MODES.find((m) => m.id === id) ?? BONUS_MODES[0];
}

/** Line under the mode strip once it lands. */
export const BONUS_MODE_RESULT: Record<BonusModeId, string> = {
  kontrola: "KONTROLA · PARKOVNÉ",
  zbox: "Ž-BOX · PAKEŤÁK DORUČUJE",
  koleso: "KOLESO NEŠŤASTIA · TOČÍME!",
};

/** Modes that keep the pending bar (with its seed) until they pay, so a reload replays the same run. */
export function seededMode(id: BonusModeId): boolean {
  return id === "zbox" || id === "koleso";
}

/** Draw a mode by weight (the same rng source the game deals KONTROLA with). */
export function drawBonusMode(rng: () => number): BonusModeId {
  const live = BONUS_MODES.filter((m) => m.weight > 0);
  const total = live.reduce((s, m) => s + m.weight, 0);
  let r = rng() * total;
  for (const m of live) {
    r -= m.weight;
    if (r < 0) return m.id;
  }
  return live[live.length - 1].id;
}

/** Bar filled, bonus not played yet. Saved with the player. */
export interface PendingBonus {
  mode: BonusModeId;
  /** Bet the bar was filled on (the bonus pays on it). */
  bet: number;
  /** Tax period of the triggering spin (null = none / ZÁSAH spin). */
  mod: ChaseModKind | null;
  /** Left of the tax period when it was drawn (applyMod only needs the kind). */
  modLeft: number;
  at: number;
  /** Ž-BOX / KOLESO: seed of its run, fixed when it starts (a reload mid-run replays the same run). */
  seed?: number;
}

export function sanitizePendingBonus(raw: unknown): PendingBonus | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const live = BONUS_MODES.filter((m) => m.weight > 0).map((m) => m.id);
  if (!live.includes(r.mode as BonusModeId)) return null;
  const bet = typeof r.bet === "number" && Number.isFinite(r.bet) && r.bet > 0 ? r.bet : 0;
  if (!bet) return null;
  const mod = r.mod === "bezDane" || r.mod === "danUrad" ? r.mod : null;
  const modLeft = typeof r.modLeft === "number" && Number.isFinite(r.modLeft) ? Math.max(0, Math.min(15, Math.floor(r.modLeft))) : 0;
  const at = typeof r.at === "number" && Number.isFinite(r.at) ? Math.max(0, Math.floor(r.at)) : 0;
  const seed = typeof r.seed === "number" && Number.isInteger(r.seed) && r.seed >= 0 && r.seed < 0x100000000 ? r.seed : undefined;
  return {
    mode: r.mode as BonusModeId,
    bet,
    mod: mod && modLeft > 0 ? mod : null,
    modLeft: mod && modLeft > 0 ? modLeft : 0,
    at,
    ...(seed !== undefined ? { seed } : {}),
  };
}

/**
 * Strip animation plan: the strip scrolls `laps` full rounds of the tiles plus the offset of the chosen
 * one, decelerating (easeOutCubic-like) into it. Returns the final tile index in the repeated strip.
 */
export function stripTarget(mode: BonusModeId, laps: number): number {
  const idx = Math.max(0, BONUS_MODES.findIndex((m) => m.id === mode));
  return laps * BONUS_MODES.length + idx;
}

/** Strip duration (ms): ~2 s, turbo faster, reduced motion = no spin. */
export function stripMs(turbo: boolean, reduced: boolean): number {
  if (reduced) return 700;
  return turbo ? 1000 : 2000;
}
