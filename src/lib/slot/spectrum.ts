/**
 * PARKVOLT SPEKTRUM — variant B2 „Nálada dňa“ (navrh v3, kap. B, fázy P4 a P5).
 *
 * A modifier over the existing multiplier cans. No new symbol. Active only from rank
 * NEKONEČNO, and only on a base spin (off in ZÁSAH, 4KA TV, bonus buy and VERSUS).
 *
 * The day is a deterministic grammar from hash(playerId + Bratislava date). Credit
 * effects are a mean-preserving spread; pairs, triads and ŽIVÁ VODA are positive and
 * are paid for by p_c below 0.5, the combination gate and the weather weights
 * (SPECTRUM_TUNE). Acceptance: scripts/feature-sim/spectrum-sim.ts.
 *
 * 1-FTTB stays client-side. Orange parks 10 % of the spin win on the save (`pending`)
 * until a real 1-FTTB claim or the local ČIERNA DIERA echo. The shared pool is not
 * touched; sql/not-applied/20261023_jackpot_spectrum.sql is the server shape, not applied.
 */

import { createRng } from "./engine.ts";
import { MAX_WIN_X, ORB_TABLE } from "./symbols.ts";
import { TICKET_ODDS } from "./jackpot.ts";
import { addCashback, cutCashback, sanitizeCashback } from "./cashback.ts";

/** Kill switch. Default on. Off with ?spektrum=0 or localStorage park-flag-spektrum=0. */
export const SPECTRUM_FLAG_DEFAULT = true;
const FLAG_KEY = "park-flag-spektrum";

export function spectrumEnabled(): boolean {
  try {
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search).get("spektrum");
      if (q === "0") return false;
      if (q === "1") return true;
      const v = window.localStorage.getItem(FLAG_KEY);
      if (v === "0") return false;
      if (v === "1") return true;
    }
  } catch {
    /* storage blocked: default */
  }
  return SPECTRUM_FLAG_DEFAULT;
}

export function spectrumActive(opts: {
  enabled?: boolean;
  rankId: string;
  free: boolean;
  chase: boolean;
  buy: boolean;
  duel: boolean;
}): boolean {
  if (opts.enabled === false) return false;
  return opts.rankId === "nekonecno" && !opts.free && !opts.chase && !opts.buy && !opts.duel;
}

/** Personal echo paid when the doubled 1-FTTB chance hits before the server pool can. Seed of 1-FTTB. */
export const ULICA_ECHO = 500;

export interface SpectrumTune {
  /** P(good) for the seven colours. Index matches COLORS. */
  p: readonly number[];
  /** Extra gate once a pair or triad is legally ready. */
  comboP: number;
  calmW: number;
  normalW: number;
  stormW: number;
  /** P(ŽIVÁ VODA | triad), before the once-per-day cap. */
  whiteP: number;
  /**
   * Rolling window, in spins, for the day's three colours.
   * ŽIVÁ VODA may fire when all three have landed inside this window,
   * not only when three lamps are lit at once. Omit to use TRIAD_WINDOW.
   * The 12-spin ring lamps are unchanged.
   */
  triadSpan?: number;
  /**
   * ČIERNA DIERA: the day's `holeN`-th NEUTRALIZOVANÉ always collapses into it; an earlier one
   * does with chance `holeP`. Still at most once per day. Omit to use HOLE_N / HOLE_P.
   */
  holeN?: number;
  holeP?: number;
  /** Scales credit deltas (1 = the sizes in the spec). */
  amp: number;
}

/**
 * Tuned on the CRN session sim (NEKONEČNO, with and without ante, 20 M).
 * p_c pays for the extras: ŽIVÁ VODA adds credits, ČIERNA DIERA swallows the spin's multiplier.
 * amp scales every credit delta (1 would be the sizes in the spec).
 * Every legal lamp overlap is a combination, still at most one per 20 spins.
 * ŽIVÁ VODA also opens when the day's three colours have each landed inside
 * TRIAD_WINDOW spins (a cancel still counts). The 12-spin lamps stay as they
 * are, and white is still at most once per day. An active NEKONEČNO day
 * (~1 000 spins) sees it about 1–2 times a week.
 */
export const TRIAD_WINDOW = 28;

/**
 * ČIERNA DIERA (2026-10-28). The old rule (3× NEUTRALIZOVANÉ inside 50 spins) fired about once
 * in 30 years of play. NEUTRALIZOVANÉ lands ~0.45× per active day, so: the day's 2nd one is always
 * a black hole, the 1st one is with chance HOLE_P. At ~1 000 spins/day that is about 1–2× a week.
 */
export const HOLE_N = 2;
export const HOLE_P = 0.4;

export const SPECTRUM_TUNE: SpectrumTune = {
  // 2026-10-28: +0.08 on the credit colours (orange capped at 0.60) pays for ČIERNA DIERA at ~1.3×/week.
  p: [0.41, 0.6, 0.55, 0.39, 0.47, 0.5, 0.5],
  comboP: 1,
  calmW: 0.5,
  normalW: 0.4,
  stormW: 0.1,
  whiteP: 1,
  triadSpan: TRIAD_WINDOW,
  amp: 0.58,
};

export interface SpectrumColor {
  id: number;
  name: string;
  emotion: string;
  hex: string;
  /** CSS hue-rotate companion for the temporary tint. */
  hue: number;
  /** Index of the opposite colour, or -1 for the centre (blue). */
  opposite: number;
}

export const COLORS: readonly SpectrumColor[] = [
  { id: 0, name: "REKLAMÁCIA", emotion: "zlosť", hex: "#e23b3b", hue: -16, opposite: 5 },
  { id: 1, name: "PRÍPLATOK", emotion: "chamtivosť", hex: "#ff8a1e", hue: 18, opposite: 6 },
  { id: 2, name: "UPOMIENKA", emotion: "strach", hex: "#ffe14a", hue: 48, opposite: 3 },
  { id: 3, name: "SIGNÁL", emotion: "vôľa", hex: "#3dde6a", hue: 100, opposite: 2 },
  { id: 4, name: "ČAKAČKA", emotion: "nádej", hex: "#3aa0ff", hue: 195, opposite: -1 },
  { id: 5, name: "SOLIDARITA", emotion: "súcit", hex: "#6a4dff", hue: 235, opposite: 0 },
  { id: 6, name: "VERNOSŤ", emotion: "láska", hex: "#d24dff", hue: 285, opposite: 1 },
];

export const WHITE_ID = 7;
export const BLACK_ID = 8;

export const ROLE_MOOD = "NÁLADA";
export const ROLE_SUPPORT = "PODPORA";
export const ROLE_OPPONENT = "PROTIVNÍK";

const WEATHER_NAME = ["Pokojný deň", "Bežný", "Búrka"] as const;

/** One sentence, the first time that colour pays. No outside names. */
export const COLOR_TIP: Readonly<Record<number, string>> = {
  0: "REKLAMÁCIA buď zdvojnásobí túto plechovku, alebo ju zamietne.",
  1: "PRÍPLATOK pridá krok tiketu, alebo 10 % výhry odvedie do 1-FTTB.",
  2: "UPOMIENKA dobije hlásenie ZÁSAHU, alebo zníži výhru spinu.",
  3: "SIGNÁL podrží plechovku cez tumble. Bez tumble prepadne.",
  4: "ČAKAČKA posunie bar kontroly, alebo zníži túto plechovku.",
  5: "SOLIDARITA pridá alebo uberie 4 RP.",
  6: "VERNOSŤ pridá +0,5× do Cashback bonusu (max ×3), alebo 0,5× uberie.",
  7: "ŽIVÁ VODA zdvojnásobí plechovky na obrazovke a pridá tumble.",
  8: "ČIERNA DIERA zhltne násobič, dobije bar a na 10 spinov zdvojnásobí šancu na 1-FTTB.",
};

export interface SpectrumState {
  day: string;
  mood: number;
  support: number;
  opponent: number;
  /** 0 calm, 1 normal, 2 storm. */
  weather: number;
  prevMoods: number[];
  prevStorms: number[];
  seen: number[];
  /** Spins left on each of the 7 ring slots. */
  lit: number[];
  /**
   * Spins since each colour last landed. 999 = not in this day.
   * Longer than the lamp: ŽIVÁ VODA reads this window, the HUD still uses `lit`.
   */
  ringAge: number[];
  sinceCombo: number;
  badId: number;
  badN: number;
  debt: number;
  white: number;
  black: number;
  /** Ages of recent NEUTRALIZOVANÉ, in spins. */
  neutrals: number[];
  /** NEUTRALIZOVANÉ so far today (ČIERNA DIERA rule). Older saves omit it: 0. */
  neutralsDay: number;
  /** Spins left of the doubled 1-FTTB chance. */
  fttb: number;
  sinceStorm: number;
  triad: number[];
  /** Eligible spins, so the side seed never repeats after a reload. */
  n: number;
  /** Credits parked for 1-FTTB (orange surcharge). Not in the shared pool. */
  pending: number;
  /** VERNOSŤ: multiplier bonus stored for the next Cashback bonus (lib/slot/cashback), 0 … 2. Not reset by day. */
  cashback: number;
}

export function emptySpectrum(): SpectrumState {
  return {
    day: "",
    mood: 0,
    support: 1,
    opponent: 5,
    weather: 1,
    prevMoods: [],
    prevStorms: [],
    seen: [],
    lit: [0, 0, 0, 0, 0, 0, 0],
    ringAge: [999, 999, 999, 999, 999, 999, 999],
    sinceCombo: 20,
    badId: -1,
    badN: 0,
    debt: 0,
    white: 0,
    black: 0,
    neutrals: [],
    neutralsDay: 0,
    fttb: 0,
    sinceStorm: 30,
    triad: [],
    n: 0,
    pending: 0,
    cashback: 0,
  };
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function idList(raw: unknown, max: number, hi: number): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const v of raw) {
    const n = clampInt(v, 0, hi, -1);
    if (n >= 0 && out.length < max) out.push(n);
  }
  return out;
}

/** Old saves have no `spectrum`. Anything broken falls back to a fresh day. */
export function sanitizeSpectrum(raw: unknown): SpectrumState {
  const e = emptySpectrum();
  if (!raw || typeof raw !== "object") return e;
  const r = raw as Record<string, unknown>;
  e.day = typeof r.day === "string" ? r.day.slice(0, 16) : "";
  e.mood = clampInt(r.mood, 0, 6, 0);
  e.support = clampInt(r.support, 0, 6, 1);
  e.opponent = clampInt(r.opponent, 0, 6, 5);
  e.weather = clampInt(r.weather, 0, 2, 1);
  e.prevMoods = idList(r.prevMoods, 3, 6);
  e.prevStorms = idList(r.prevStorms, 3, 1);
  e.seen = idList(r.seen, 12, 8);
  const lit = idList(r.lit, 7, 12);
  for (let i = 0; i < 7; i++) e.lit[i] = lit[i] ?? 0;
  const ages = Array.isArray(r.ringAge) ? r.ringAge : [];
  for (let i = 0; i < 7; i++) {
    const n = ages[i];
    e.ringAge[i] = typeof n === "number" && n >= 0 && n <= 999 ? Math.floor(n) : 999;
  }
  e.sinceCombo = clampInt(r.sinceCombo, 0, 10_000, 20);
  e.badId = clampInt(r.badId, -1, 6, -1);
  e.badN = clampInt(r.badN, 0, 8, 0);
  e.debt = clampInt(r.debt, 0, 100, 0);
  e.white = clampInt(r.white, 0, 1, 0);
  e.black = clampInt(r.black, 0, 1, 0);
  e.neutrals = idList(r.neutrals, 8, 50);
  e.neutralsDay = clampInt(r.neutralsDay, 0, 99, 0);
  e.fttb = clampInt(r.fttb, 0, 10, 0);
  e.sinceStorm = clampInt(r.sinceStorm, 0, 10_000, 30);
  e.triad = idList(r.triad, 3, 6);
  e.n = clampInt(r.n, 0, 2_000_000_000, 0);
  const pending = typeof r.pending === "number" ? r.pending : Number(r.pending);
  e.pending = Number.isFinite(pending) ? Math.min(1_000_000, Math.max(0, Math.round(pending * 100) / 100)) : 0;
  e.cashback = sanitizeCashback(r.cashback);
  return e;
}

/** FNV-1a, 32-bit. Stable across reloads. */
export function hash32(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickOrb(rng: () => number): number {
  let total = 0;
  for (const it of ORB_TABLE) total += it.w;
  let r = rng() * total;
  for (const it of ORB_TABLE) {
    r -= it.w;
    if (r <= 0) return it.value;
  }
  return ORB_TABLE[ORB_TABLE.length - 1].value;
}

function neighbors(id: number): number[] {
  const opp = COLORS[id].opposite;
  const raw = [(id + 6) % 7, (id + 1) % 7];
  return raw.filter((n) => n !== opp);
}

export interface DayPlan {
  mood: number;
  support: number;
  opponent: number;
  weather: number;
}

/** Weather roll. A storm in any of the previous 3 days bans today's storm (max 1 day in 4). */
export function rollWeather(rng: () => number, prevStorms: readonly number[], tune: SpectrumTune = SPECTRUM_TUNE): number {
  const banned = prevStorms.some((s) => s === 1);
  const calm = Math.max(0, tune.calmW);
  const normal = Math.max(0, tune.normalW);
  const storm = banned ? 0 : Math.max(0, tune.stormW);
  const total = calm + normal + storm || 1;
  const r = rng() * total;
  if (r < calm) return 0;
  if (r < calm + normal) return 1;
  return storm > 0 ? 2 : 1;
}

/** Grammar of one day. Deterministic for (playerId, date, history). */
export function rollDay(
  playerId: string,
  day: string,
  prevMoods: readonly number[],
  prevStorms: readonly number[],
  tune: SpectrumTune = SPECTRUM_TUNE,
): DayPlan {
  const rng = createRng(hash32(`${playerId}|${day}|den`));
  const weights = COLORS.map((c) => (prevMoods.includes(c.id) ? 0.5 : 1));
  let total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  let mood = 0;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      mood = i;
      break;
    }
  }
  const neigh = neighbors(mood);
  const support = neigh[Math.floor(rng() * neigh.length)] ?? (mood + 1) % 7;
  const opp = COLORS[mood].opposite;
  const rest: number[] = [];
  for (let i = 0; i < 7; i++) if (i !== mood && i !== support) rest.push(i);
  let opponent = rest[Math.floor(rng() * rest.length)] ?? support;
  if (opp >= 0 && opp !== support && rng() < 0.6) opponent = opp;
  const weather = rollWeather(rng, prevStorms, tune);
  return { mood, support, opponent, weather };
}

export interface SpectrumInput {
  sequenceX: number;
  orbSum: number;
  tumbles: number;
  orbs: readonly { uid: number; mult: number }[];
  hitMax: boolean;
  basePaidX: number;
}

export interface SpectrumHooks {
  forceColor?: number;
  forceFace?: "good" | "bad";
  forceColored?: boolean;
  forceWhite?: boolean;
}

export interface SpectrumFx {
  paidX: number;
  /** Sum the HUD may show as the multiplier. */
  appliedSum: number;
  touched: boolean;
  label: string;
  tip: string | null;
  /** 0–6 colour, 7 white, 8 black, null = no tint. */
  color: number | null;
  /** Can to tint. null = every can on the board (white / black). */
  uid: number | null;
  pity: number;
  heat: number;
  rp: number;
  ticket: number;
  streak: -1 | 0 | 1;
  /** VERNOSŤ: change of the stored Cashback multiplier this spin (+0,5 / −0,5 / 0). */
  cashbackDelta: number;
  /** Stored Cashback multiplier after this spin. */
  cashback: number;
  /** Fraction of the pre-cut win parked for 1-FTTB, in bet-multiples. */
  ulicaX: number;
  event: "none" | "tint" | "pair" | "cancel" | "white" | "black" | "triad";
  fttb: number;
}

export interface SpectrumHud {
  on: boolean;
  weather: number;
  weatherLabel: string;
  roles: { id: number; name: string; role: string; hex: string }[];
  lit: number[];
  fttb: number;
  pending: number;
  /** Stored Cashback multiplier (VERNOSŤ), 0 … 2. */
  cashback: number;
}

function blankFx(paidX: number, state: SpectrumState): SpectrumFx {
  return {
    paidX,
    appliedSum: 0,
    touched: false,
    label: "",
    tip: null,
    color: null,
    uid: null,
    pity: 0,
    heat: 0,
    rp: 0,
    ticket: 0,
    streak: 0,
    cashbackDelta: 0,
    cashback: state.cashback,
    ulicaX: 0,
    event: "none",
    fttb: state.fttb,
  };
}

function tipFor(state: SpectrumState, id: number): string | null {
  if (state.seen.includes(id)) return null;
  state.seen = [...state.seen, id].slice(-12);
  return COLOR_TIP[id] ?? null;
}

function spanOf(tune: SpectrumTune): number {
  const n = tune.triadSpan ?? TRIAD_WINDOW;
  if (!Number.isFinite(n)) return TRIAD_WINDOW;
  return Math.max(0, Math.min(999, Math.floor(n)));
}

function markRing(state: SpectrumState, color: number): void {
  if (!state.ringAge) state.ringAge = [999, 999, 999, 999, 999, 999, 999];
  if (color >= 0 && color <= 6) state.ringAge[color] = 0;
}

/** Day's three colours have each landed inside the window. Lamps may already be out. */
function dayWindowOpen(state: SpectrumState, span: number): boolean {
  const ages = state.ringAge;
  if (!ages) return false;
  const ids = [state.mood, state.support, state.opponent];
  for (const id of ids) {
    if (!(ages[id] <= span)) return false;
  }
  return true;
}

function weatherMul(state: SpectrumState, tune: SpectrumTune): { w: number; amplified: boolean } {
  const amp = tune.amp > 0 ? tune.amp : 1;
  if (state.weather === 0) return { w: 0.5 * amp, amplified: false };
  if (state.weather === 2 && state.sinceStorm >= 30) return { w: 1.5 * amp, amplified: true };
  return { w: amp, amplified: false };
}

interface Bag {
  seq: number;
  sum: number;
  can: number;
  winMul: number;
  take: number;
  pity: number;
  heat: number;
  rp: number;
  ticket: number;
  streak: -1 | 0 | 1;
  /** VERNOSŤ intent: +1 store, −1 cut (settled against the state in settleCashback). */
  cash: -1 | 0 | 1;
  /** What settleCashback actually changed. */
  cashDelta: number;
  wiped: boolean;
  black: boolean;
  white: boolean;
  tumbles: number;
}

function chance(rng: () => number, w: number): boolean {
  return rng() < Math.min(1, Math.max(0, w));
}

function applyGood(id: number, w: number, bag: Bag, rng: () => number): void {
  if (id === 0) {
    bag.sum += bag.can * w;
    bag.can += bag.can * w;
  } else if (id === 1) {
    if (chance(rng, w)) bag.ticket = Math.min(2, bag.ticket + 1);
  } else if (id === 2) {
    bag.heat += Math.max(0, Math.round(25 * w));
  } else if (id === 3) {
    bag.sum += bag.can * w;
    bag.can += bag.can * w;
  } else if (id === 4) {
    bag.pity += Math.max(0, Math.round(6 * w));
  } else if (id === 5) {
    bag.rp += Math.round(4 * w);
  } else if (id === 6) {
    if (chance(rng, w)) bag.cash = 1;
  }
}

function applyBad(id: number, w: number, bag: Bag, rng: () => number): void {
  if (id === 0 || (id === 3 && bag.tumbles === 0)) {
    const cut = bag.can * w;
    bag.sum -= cut;
    bag.can = Math.max(0, bag.can - cut);
    if (bag.sum <= 1e-9) {
      bag.sum = 0;
      bag.wiped = true;
    }
  } else if (id === 1) {
    bag.take = Math.min(0.5, bag.take + 0.1 * w);
  } else if (id === 2) {
    bag.winMul *= Math.max(0, 1 - 0.2 * w);
  } else if (id === 4) {
    const cut = bag.can * 0.5 * w;
    bag.sum -= cut;
    bag.can = Math.max(0, bag.can - cut);
    if (bag.sum < 0) bag.sum = 0;
  } else if (id === 5) {
    bag.rp -= Math.round(4 * w);
  } else if (id === 6) {
    if (chance(rng, w)) bag.cash = -1;
  }
}

/** VERNOSŤ against the save: +0,5 (cap 2), −0,5 (floor 0), or the old streak reset when nothing is stored. */
function settleCashback(state: SpectrumState, bag: Bag): void {
  if (bag.cash > 0) {
    const r = addCashback(state.cashback);
    state.cashback = r.next;
    bag.cashDelta = r.delta;
  } else if (bag.cash < 0) {
    const r = cutCashback(state.cashback);
    state.cashback = r.next;
    bag.cashDelta = r.delta;
    if (r.streakReset) bag.streak = -1;
  }
}

function finishPaid(bag: Bag, input: SpectrumInput, tune: SpectrumTune): { paid: number; ulicaX: number; applied: number } {
  let paid: number;
  let applied = bag.sum;
  if (bag.black) {
    paid = bag.seq;
    applied = 1;
  } else if (bag.white) {
    const amp = tune.amp > 0 ? tune.amp : 1;
    const step = bag.seq / (bag.tumbles + 1);
    applied = bag.sum * (1 + amp);
    paid = (bag.seq + step * amp) * applied;
  } else if (bag.wiped && bag.sum <= 0) {
    paid = 0;
    applied = 0;
  } else if (bag.sum > 0) {
    paid = bag.seq * bag.sum;
  } else {
    paid = bag.seq;
    applied = 1;
  }
  paid *= bag.winMul;
  const ulicaX = paid * bag.take;
  paid -= ulicaX;
  if (input.hitMax) return { paid: input.basePaidX, ulicaX: 0, applied: input.orbSum };
  if (!(input.basePaidX >= MAX_WIN_X) && paid >= MAX_WIN_X) paid = MAX_WIN_X - 1e-4;
  if (paid < 0) paid = 0;
  return { paid, ulicaX, applied };
}

function tick(state: SpectrumState, amplified: boolean): void {
  state.n += 1;
  for (let i = 0; i < 7; i++) {
    if (state.lit[i] > 0) state.lit[i] -= 1;
    if (state.ringAge && state.ringAge[i] < 999) state.ringAge[i] += 1;
  }
  if (state.fttb > 0) state.fttb -= 1;
  state.neutrals = state.neutrals.map((a) => a + 1).filter((a) => a < 50);
  if (amplified) state.sinceStorm = 0;
  else state.sinceStorm += 1;
  state.sinceCombo += 1;
}

/** Roll today's grammar if the Bratislava date changed. Does not tick the ring. */
export function syncSpectrumDay(state: SpectrumState, playerId: string, day: string): void {
  ensureDay(state, playerId || "hrac", day || "1970-01-01", SPECTRUM_TUNE);
}

function ensureDay(state: SpectrumState, playerId: string, day: string, tune: SpectrumTune): void {
  if (state.day === day && day) return;
  if (state.day) {
    state.prevMoods = [...state.prevMoods, state.mood].slice(-3);
    state.prevStorms = [...state.prevStorms, state.weather === 2 ? 1 : 0].slice(-3);
    state.white = 0;
    state.black = 0;
    state.neutralsDay = 0;
    state.triad = [];
    state.ringAge = [999, 999, 999, 999, 999, 999, 999];
  }
  const plan = rollDay(playerId || "hrac", day || "1970-01-01", state.prevMoods, state.prevStorms, tune);
  state.day = day;
  state.mood = plan.mood;
  state.support = plan.support;
  state.opponent = plan.opponent;
  state.weather = plan.weather;
}

function labelOf(name: string, rest: string): string {
  const text = `${name} ${rest}`.trim();
  return text.length > 22 ? text.slice(0, 22) : text;
}

/**
 * One eligible base spin. Mutates `state`. Dead spins and capped spins still tick the ring.
 * `rng` is the side stream — it must not be the engine stream (CRN).
 */
export function applySpectrum(
  state: SpectrumState,
  input: SpectrumInput,
  rng: () => number,
  ctx: { day: string; playerId: string },
  hooks?: SpectrumHooks,
  tune: SpectrumTune = SPECTRUM_TUNE,
): SpectrumFx {
  ensureDay(state, ctx.playerId, ctx.day, tune);
  const fx = blankFx(input.basePaidX, state);

  const armed = state.triad.length > 0;
  let forced = hooks?.forceColor;
  let forcedGood = hooks?.forceFace === "good";
  if (armed && forced == null) {
    forced = state.triad[Math.floor(rng() * state.triad.length)] ?? state.triad[0];
    forcedGood = true;
    state.triad = [];
  }

  const noWin = !(input.sequenceX > 0) || input.hitMax;
  if (noWin) {
    tick(state, false);
    fx.fttb = state.fttb;
    fx.paidX = input.basePaidX;
    return fx;
  }

  let orbs = input.orbs;
  let sum0 = input.orbSum;
  if (!(sum0 > 0) && forced != null) {
    const mult = pickOrb(rng);
    orbs = [{ uid: -1, mult }];
    sum0 = mult;
  }
  if (!(sum0 > 0) || orbs.length === 0) {
    tick(state, false);
    fx.fttb = state.fttb;
    return fx;
  }

  let color = forced ?? -1;
  if (color < 0) {
    const roll = rng();
    const neutral = hooks?.forceColored ? -1 : 0.5;
    if (roll < neutral) {
      tick(state, false);
      fx.fttb = state.fttb;
      return fx;
    }
    if (roll < 0.75) color = state.mood;
    else if (roll < 0.9) color = state.support;
    else color = state.opponent;
  }
  if (color < 0 || color > 6) color = state.mood;
  markRing(state, color);

  const orb = orbs[Math.floor(rng() * orbs.length)] ?? orbs[0];
  const opp = COLORS[color].opposite;

  if (opp >= 0 && state.lit[opp] > 0 && !forcedGood) {
    state.lit[opp] = 0;
    state.lit[color] = 0;
    state.neutrals = [...state.neutrals, 0].slice(-8);
    state.neutralsDay = (state.neutralsDay ?? 0) + 1;
    const holeN = tune.holeN ?? HOLE_N;
    const holeP = tune.holeP ?? HOLE_P;
    // Side stream only; the roll is skipped once today's hole is used or the count already decides.
    const hole = state.black === 0 && (state.neutralsDay >= holeN || rng() < holeP);
    if (hole) state.black = 1;
    const bag: Bag = {
      seq: input.sequenceX,
      sum: sum0,
      can: orb.mult,
      winMul: 1,
      take: 0,
      pity: 0,
      heat: 0,
      rp: 0,
      ticket: 0,
      streak: 0,
      cash: 0,
      cashDelta: 0,
      wiped: false,
      black: hole,
      white: false,
      tumbles: input.tumbles,
    };
    if (hole) {
      bag.pity += 10;
      bag.black = true;
    }
    const fin = hole ? finishPaid(bag, input, tune) : { paid: input.basePaidX, ulicaX: 0, applied: sum0 };
    tick(state, false);
    if (hole) state.fttb = 10;
    fx.paidX = fin.paid;
    fx.appliedSum = fin.applied;
    fx.touched = hole;
    fx.pity = bag.pity;
    fx.label = hole ? "ČIERNA DIERA" : "NEUTRALIZOVANÉ";
    fx.tip = tipFor(state, hole ? BLACK_ID : color);
    fx.color = hole ? BLACK_ID : color;
    fx.uid = hole ? null : orb.uid;
    fx.event = hole ? "black" : "cancel";
    fx.fttb = state.fttb;
    return fx;
  }

  state.lit[color] = 12;
  const litIds: number[] = [];
  for (let i = 0; i < 7; i++) if (state.lit[i] > 0) litIds.push(i);
  const comboReady = state.sinceCombo >= 20 && rng() < Math.min(1, Math.max(0, tune.comboP));
  const adjacent = litIds.filter((id) => id !== color && (Math.abs(id - color) === 1 || Math.abs(id - color) === 6));
  const litTriad = litIds.length >= 3 && comboReady;
  const windowTriad = dayWindowOpen(state, spanOf(tune)) && comboReady;
  const pair = !litTriad && adjacent.length > 0 && comboReady;

  const { w: w0, amplified } = weatherMul(state, tune);
  const bag: Bag = {
    seq: input.sequenceX,
    sum: sum0,
    can: orb.mult,
    winMul: 1,
    take: 0,
    pity: 0,
    heat: 0,
    rp: 0,
    ticket: 0,
    streak: 0,
    cash: 0,
    cashDelta: 0,
    wiped: false,
    black: false,
    white: false,
    tumbles: input.tumbles,
  };

  let event: SpectrumFx["event"] = "tint";
  let label = "";
  let show = color;

  if ((litTriad || windowTriad) && state.white === 0 && (hooks?.forceWhite || rng() < tune.whiteP)) {
    bag.white = true;
    bag.sum = sum0;
    state.white = 1;
    state.sinceCombo = -1;
    event = "white";
    show = WHITE_ID;
    label = "ŽIVÁ VODA";
  } else if (pair) {
    const half = w0 * 0.5;
    applyGood(color, half, bag, rng);
    applyGood(adjacent[0], half, bag, rng);
    settleCashback(state, bag);
    state.sinceCombo = -1;
    event = "pair";
    label = labelOf(COLORS[color].name, "PÁR");
  } else {
    let good = rng() < (tune.p[color] ?? 0.5);
    if (forcedGood || hooks?.forceFace === "good") good = true;
    if (hooks?.forceFace === "bad") good = false;
    const capped = !good && state.badId === color && state.badN >= 2;
    if (capped) {
      good = true;
      state.debt += 1;
    } else if (good && state.debt > 0 && !forcedGood) {
      good = false;
      state.debt -= 1;
    }
    if (good) {
      state.badId = -1;
      state.badN = 0;
      applyGood(color, w0, bag, rng);
    } else {
      state.badId = color;
      state.badN += 1;
      applyBad(color, w0, bag, rng);
    }
    settleCashback(state, bag);
    if (litTriad) {
      state.triad = litIds.slice(0, 3);
      state.sinceCombo = -1;
      event = "triad";
    }
    label = good ? goodLabel(color, bag, w0) : badLabel(color, bag, w0);
  }

  const fin = finishPaid(bag, input, tune);
  tick(state, amplified);
  fx.paidX = fin.paid;
  fx.appliedSum = fin.applied;
  fx.touched = true;
  fx.label = label;
  fx.tip = tipFor(state, show);
  fx.color = show;
  fx.uid = bag.white ? null : orb.uid;
  fx.pity = bag.pity;
  fx.heat = bag.heat;
  fx.rp = bag.rp;
  fx.ticket = bag.ticket;
  fx.streak = bag.streak;
  fx.cashbackDelta = bag.cashDelta;
  fx.cashback = state.cashback;
  fx.ulicaX = fin.ulicaX;
  fx.event = event;
  fx.fttb = state.fttb;
  return fx;
}

function goodLabel(id: number, bag: Bag, w: number): string {
  const name = COLORS[id].name;
  if (id === 0) return labelOf(name, `×${trim(1 + w)}`);
  if (id === 1) return bag.ticket > 0 ? "KROK +1" : labelOf(name, "TIKET");
  if (id === 2) return labelOf("HLÁSENIE", `+${bag.heat}`);
  if (id === 3) return "DRŽÍ SA";
  if (id === 4) return labelOf("BAR", `+${bag.pity}`);
  if (id === 5) return `+${Math.abs(bag.rp)} RP`;
  if (bag.cash > 0) return bag.cashDelta > 0 ? "CASHBACK +0,5×" : "CASHBACK MAX ×3";
  return labelOf(name, "CASHBACK");
}

function badLabel(id: number, bag: Bag, w: number): string {
  const name = COLORS[id].name;
  if (id === 0) return "ZAMIETNUTÉ";
  if (id === 1) return "DO 1-FTTB";
  if (id === 2) return labelOf("VÝHRA", `×${trim(Math.max(0, 1 - 0.2 * w))}`);
  if (id === 3) return bag.tumbles === 0 ? "BEZ TUMBLE" : name;
  if (id === 4) return labelOf(name, `×${trim(Math.max(0, 1 - 0.5 * w))}`);
  if (id === 5) return `−${Math.abs(bag.rp)} RP`;
  if (bag.cashDelta < 0) return "CASHBACK −0,5×";
  return "SÉRIA 0";
}

function trim(n: number): string {
  const t = Math.round(n * 10) / 10;
  return Number.isInteger(t) ? String(t) : t.toFixed(1).replace(".", ",");
}

export interface SpectrumMark {
  uid: number | null;
  color: number;
  label: string;
  hex: string;
  hue: number;
}

/** Tint + short label for the can that just resolved. White and black cover every can. */
export function spectrumMark(fx: SpectrumFx): SpectrumMark | null {
  if (fx.color == null || !fx.label) return null;
  if (fx.color <= 6) {
    const c = COLORS[fx.color];
    return { uid: fx.uid, color: c.id, label: fx.label, hex: c.hex, hue: c.hue };
  }
  if (fx.color === WHITE_ID) return { uid: null, color: WHITE_ID, label: fx.label, hex: "#f4f8ff", hue: 0 };
  return { uid: null, color: BLACK_ID, label: fx.label, hex: "#140810", hue: 0 };
}

export function spectrumHud(state: SpectrumState, on: boolean): SpectrumHud {
  const roles = [
    { id: state.mood, role: ROLE_MOOD },
    { id: state.support, role: ROLE_SUPPORT },
    { id: state.opponent, role: ROLE_OPPONENT },
  ].map((r) => ({
    id: r.id,
    role: r.role,
    name: COLORS[r.id]?.name ?? "",
    hex: COLORS[r.id]?.hex ?? "#fff",
  }));
  return {
    on,
    weather: state.weather,
    weatherLabel: WEATHER_NAME[state.weather] ?? WEATHER_NAME[1],
    roles,
    lit: state.lit.slice(),
    fttb: state.fttb,
    pending: state.pending,
    cashback: state.cashback,
  };
}

/** Second independent 1-FTTB roll. The server still rolls once; this is the other half of „2×“. */
export function rollUlicaEcho(rng: () => number): boolean {
  return rng() < TICKET_ODDS.ulica;
}

/** Move parked orange credits out of the save. Caller adds them to the payout. */
export function takeUlicaPending(state: SpectrumState): number {
  const n = state.pending;
  state.pending = 0;
  return n > 0 ? n : 0;
}
