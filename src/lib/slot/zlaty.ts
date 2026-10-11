/**
 * ZLATÝ BONUS (navrh-v3 kap. D, G/P1): once per day (Europe/Bratislava, server clock, lib/slot/server-day) the
 * first bar bonus (KONTROLA / Ž-BOX / KOLESO) is golden: the cap goes 30× → 100× and the ZLATÁ SIM (Martin's gold SIM card, the chip pops out) hands a
 * themed card for the drawn mode, each tuned to the same EV uplift (ZLATY_TARGET_UP × bet per bonus):
 *   KONTROLA  · ZLATÁ POKUTA  — the lowest safe tile the rank does not peek turns into a gold fine (V× bet).
 *   Ž-BOX     · ZLATÝ KURIÉR  — the roof can (kuriérsky príplatok) lands k× more often.
 *   KOLESO    · ZLATÉ VÝSEKY  — value slices and KURIÉR pay × g (same wheel path as a normal run).
 * Anti max-bet: the golden part pays on at most the player's usual stake (median of the last paid spins):
 *   cash = regularX × bet + (goldX − regularX) × min(bet, usual)   (regularX = the same run without gold).
 * Tuning and acceptance: scripts/feature-sim/zlaty-sim.ts (EV per mode × rank, RTP at 100/500/1000 spins/day).
 */
import type { BonusModeId } from "./bonus-mode.ts";
import { rankPeekIds, type PickTile } from "./pick-bonus.ts";

/** Feature flag: default ON. Off with localStorage park-flag-zlaty = "0" or ?zlaty=0 (dev / emergency). */
export const ZLATY_FLAG_DEFAULT = true;
const FLAG_KEY = "park-flag-zlaty";

export function zlatyEnabled(): boolean {
  try {
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search).get("zlaty");
      if (q === "0") return false;
      if (q === "1") return true;
      const v = window.localStorage.getItem(FLAG_KEY);
      if (v === "0") return false;
      if (v === "1") return true;
    }
  } catch {
    /* storage blocked: default */
  }
  return ZLATY_FLAG_DEFAULT;
}

/** Cap of the golden bonus (× bet), all three modes. */
export const ZLATY_CAP_X = 100;

/** EV uplift per golden bonus every mode and rank is tuned to (× bet). Was KOLESO at g = 1.6; with the letter choice + 4KA/PAAS phrases (kolesopick, 11. 10.) KOLESO needs g = 1.57 for it (Jožo picks, 800 k paired runs: +1.507; naive +1.490). */
export const ZLATY_TARGET_UP = 1.5;

/** KONTROLA · ZLATÁ POKUTA value (× bet) per rank: exact, kontrolaExactEv(goldBoard) − kontrolaExactEv = target. */
export const ZLATA_POKUTA_X: Record<string, number> = {
  kredit: 6.09,
  sloboda: 6.09,
  smart: 6.26,
  telka: 6.06,
  optika: 6.06,
  duo: 6.06,
  fiveg: 6.06,
  nekonecno: 6.01,
};

/** Ž-BOX · ZLATÝ KURIÉR: P_CAN × k per rank (zlaty-sim.ts tune, 1.5 M paired runs × 9 bisection steps per rank;
 * SMART / 4KA TV / OPTIKA / NEKONEČNO trimmed after the 20 M acceptance run). */
export const ZLATY_KURIER_K: Record<string, number> = {
  kredit: 2.17,
  sloboda: 2.17,
  smart: 2.2,
  telka: 2.16,
  optika: 2.135,
  duo: 2.08,
  fiveg: 2.04,
  nekonecno: 1.975,
};

/** KOLESO · ZLATÉ VÝSEKY: gain of value slices and KURIÉR. */
export const ZLATE_VYSEKY_G = 1.57;

export function zlataPokutaOf(rankId: string | undefined): number {
  return (rankId && ZLATA_POKUTA_X[rankId]) || ZLATA_POKUTA_X.kredit;
}
export function zlatyKurierOf(rankId: string | undefined): number {
  return (rankId && ZLATY_KURIER_K[rankId]) || ZLATY_KURIER_K.kredit;
}

/**
 * KONTROLA board turned gold: the lowest-value safe tile the rank does not peek becomes ZLATÁ POKUTA (V× bet).
 * The rank's peek stays exactly what it would be on the normal board (gold V is above every peek cap).
 */
export function goldBoard(tiles: PickTile[], peekCap: number, peekCount: number, v: number): PickTile[] {
  const peek = new Set(rankPeekIds(tiles, peekCap, peekCount));
  let target: PickTile | null = null;
  for (const t of tiles) {
    if (t.payX <= 0 || peek.has(t.id)) continue;
    if (!target || t.payX < target.payX || (t.payX === target.payX && t.id < target.id)) target = t;
  }
  if (!target) return tiles;
  const id = target.id;
  return tiles.map((t) =>
    t.id === id ? { ...t, kind: "zlata", payX: v, baseX: t.payX, title: "ZLATÁ POKUTA", note: `${fmtX(v)} stávky`, zone: "Zlatá zóna" } : t,
  );
}

/** KONTROLA result without the gold (same picks): the gold tile counted at its normal value. */
export function kontrolaRegularX(tiles: PickTile[], revealed: boolean[], cleared: boolean, goldX: number): number {
  const g = tiles.find((t) => t.kind === "zlata");
  if (!g || !revealed[g.id]) return goldX;
  const sum = cleared ? goldX / 2 : goldX;
  const reg = sum - g.payX + (g.baseX ?? 0);
  return +((cleared ? reg * 2 : reg)).toFixed(4);
}

function fmtX(x: number): string {
  return `${Number.isInteger(x) ? x : x.toFixed(2).replace(/0$/, "")}×`.replace(".", ",");
}

/* ───────────── usual stake (anti max-bet) ───────────── */

/** Paid spins remembered for the usual stake. */
export const STAKE_WINDOW = 200;
/** Below this many remembered spins the bar's bet itself counts as usual (new player, fresh save). */
export const STAKE_MIN_SAMPLES = 30;

/** Median of the remembered stakes; `bet` when there are too few. */
export function usualStake(stakes: readonly number[], bet: number): number {
  const xs = stakes.filter((x) => Number.isFinite(x) && x > 0);
  if (xs.length < STAKE_MIN_SAMPLES) return bet;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : s[mid - 1];
}

/** Stake the golden part pays on. */
export function goldStakeOf(bet: number, usual: number): number {
  return Math.max(0, Math.min(bet, usual));
}

/** Cash before taxes: normal part on the bet, golden uplift on the usual stake. Never below 0. */
export function goldCash(goldX: number, regularX: number, bet: number, goldStake: number): number {
  const s = goldStakeOf(bet, goldStake);
  return Math.max(0, +(regularX * bet + (goldX - regularX) * s).toFixed(2));
}

/* ───────────── state (PlayerSave.zlaty) ───────────── */

export interface ZlatyModeStat {
  n: number;
  /** Sum of paid × bet (golden runs). */
  x: number;
}

export interface ZlatyState {
  /** Day (Europe/Bratislava) the golden bonus was used (drawn). "" = never. */
  usedDay: string;
  /** Day the "ZLATÝ BONUS DNES ČAKÁ" teaser was shown. */
  teasedDay: string;
  played: number;
  /** Sum of credited golden bonuses (€, before taxes). */
  cash: number;
  /** Sum of the golden uplift credited (€): cash − what the same run pays without gold. */
  extra: number;
  bestX: number;
  bestCash: number;
  /** Day the last golden bonus was paid (streak). */
  playedDay: string;
  /** Days in a row with a golden bonus played. */
  streak: number;
  bestStreak: number;
  byMode: Record<BonusModeId, ZlatyModeStat>;
  /** Ring of the last STAKE_WINDOW paid-spin stakes (base game, no duel, no free spins). */
  stakes: number[];
}

export function emptyZlaty(): ZlatyState {
  return {
    usedDay: "",
    teasedDay: "",
    played: 0,
    cash: 0,
    extra: 0,
    bestX: 0,
    bestCash: 0,
    playedDay: "",
    streak: 0,
    bestStreak: 0,
    byMode: { kontrola: { n: 0, x: 0 }, zbox: { n: 0, x: 0 }, koleso: { n: 0, x: 0 } },
    stakes: [],
  };
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown, lo = 0, hi = 1e12) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0);

export function sanitizeZlaty(raw: unknown): ZlatyState {
  const z = emptyZlaty();
  if (!raw || typeof raw !== "object") return z;
  const r = raw as Record<string, unknown>;
  z.usedDay = typeof r.usedDay === "string" && DAY_RE.test(r.usedDay) ? r.usedDay : "";
  z.teasedDay = typeof r.teasedDay === "string" && DAY_RE.test(r.teasedDay) ? r.teasedDay : "";
  z.played = Math.floor(num(r.played, 0, 1e7));
  z.cash = +num(r.cash).toFixed(2);
  z.extra = +num(r.extra, -1e12).toFixed(2);
  z.bestX = num(r.bestX, 0, 1e4);
  z.bestCash = num(r.bestCash);
  z.playedDay = typeof r.playedDay === "string" && DAY_RE.test(r.playedDay) ? r.playedDay : "";
  z.streak = Math.floor(num(r.streak, 0, 1e5));
  z.bestStreak = Math.max(z.streak, Math.floor(num(r.bestStreak, 0, 1e5)));
  const bm = (r.byMode && typeof r.byMode === "object" ? r.byMode : {}) as Record<string, unknown>;
  for (const m of ["kontrola", "zbox", "koleso"] as const) {
    const s = (bm[m] && typeof bm[m] === "object" ? bm[m] : {}) as Record<string, unknown>;
    z.byMode[m] = { n: Math.floor(num(s.n, 0, 1e7)), x: num(s.x, 0, 1e9) };
  }
  z.stakes = Array.isArray(r.stakes) ? r.stakes.filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x > 0).slice(-STAKE_WINDOW) : [];
  return z;
}

/** A golden bonus is still waiting today. Day strings compare lexically (YYYY-MM-DD). */
export function goldWaiting(z: ZlatyState, today: string, enabled = true): boolean {
  return enabled && DAY_RE.test(today) && z.usedDay < today;
}

/** The bar filled with the gold waiting: spend today's gold (saved with the pending bonus). */
export function claimGold(z: ZlatyState, today: string): ZlatyState {
  return { ...z, usedDay: today };
}

export function noteStake(z: ZlatyState, bet: number): ZlatyState {
  if (!(bet > 0)) return z;
  const stakes = z.stakes.length >= STAKE_WINDOW ? [...z.stakes.slice(1 - STAKE_WINDOW), bet] : [...z.stakes, bet];
  return { ...z, stakes };
}

function prevDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - 1));
  return t.toISOString().slice(0, 10);
}

/** A golden bonus paid: stats. `day` = the day it was claimed (pending.goldDay). */
export function recordGold(
  z: ZlatyState,
  r: { mode: BonusModeId; x: number; cash: number; extra: number; day: string },
): ZlatyState {
  const last = z.playedDay;
  const streak = last && last === prevDay(r.day) ? z.streak + 1 : last === r.day ? Math.max(1, z.streak) : 1;
  const bm = { ...z.byMode, [r.mode]: { n: z.byMode[r.mode].n + 1, x: +(z.byMode[r.mode].x + r.x).toFixed(4) } };
  return {
    ...z,
    played: z.played + 1,
    cash: +(z.cash + r.cash).toFixed(2),
    extra: +(z.extra + r.extra).toFixed(2),
    bestX: Math.max(z.bestX, r.x),
    bestCash: Math.max(z.bestCash, r.cash),
    playedDay: r.day > last ? r.day : last,
    streak,
    bestStreak: Math.max(z.bestStreak, streak),
    byMode: bm,
  };
}

/* ───────────── texts ───────────── */

export interface ZlatyCard {
  mode: BonusModeId;
  title: string;
  kicker: string;
  rule: (opts: { v: number; k: number; g: number }) => string;
  short: string;
}

export const ZLATY_CARDS: Record<BonusModeId, ZlatyCard> = {
  kontrola: {
    mode: "kontrola",
    title: "ZLATÁ POKUTA",
    kicker: "KONTROLA",
    rule: ({ v }) => `Jeden lístok na mape je zlatý: ZLATÁ POKUTA ${fmtX(v)} stávky. Nájdi ho skôr ako odťah.`,
    short: "zlatý lístok na mape",
  },
  zbox: {
    mode: "zbox",
    title: "ZLATÝ KURIÉR",
    kicker: "Ž-BOX",
    rule: ({ k }) => `Kuriérsky príplatok (plechovka na streche) chodí ${fmtX(k)} častejšie. Strop 100× stávky.`,
    short: "príplatok chodí častejšie",
  },
  koleso: {
    mode: "koleso",
    title: "ZLATÉ VÝSEKY",
    kicker: "KOLESO",
    rule: ({ g }) => `Všetky hodnotové výseky a KURIÉR platia ${fmtX(g)}. Strop kolesa 100× stávky.`,
    short: "výseky platia viac",
  },
};

/** Golden info for one bonus run, saved with the pending bonus and passed to the overlays. */
export interface GoldRun {
  day: string;
  /** Usual stake at the moment the bar filled (the golden part pays on min(bet, stake)). */
  stake: number;
}

export function sanitizeGoldRun(raw: unknown): GoldRun | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.day !== "string" || !DAY_RE.test(r.day)) return null;
  const stake = typeof r.stake === "number" && Number.isFinite(r.stake) && r.stake > 0 ? r.stake : 0;
  if (!stake) return null;
  return { day: r.day, stake };
}
