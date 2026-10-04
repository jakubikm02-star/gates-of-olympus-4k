/**
 * Ž-BOX (PAKEŤÁK): the second mode of the KONTROLA bar. Hold & Win on a wall of 12 compartments.
 * Satire of a parcel locker; no real brand, e-shop or tracking number.
 *
 * - Start: 2 parcels are already in (no zero result), plus the rank's priority parcel(s) (zboxVipOf).
 * - 3 delivery windows. Every round each empty compartment gets a parcel with P_PARCEL (value from the
 *   compartment's size tier). Any new parcel → windows back to 3, none → one window off (NEDORUČENÉ).
 * - Kuriérsky príplatok: with P_CAN per round a can (2/3/5×) lands on the roof. Cans add up (2+3 = 5) and
 *   multiply the parcel sum at the end. A can does not touch the windows.
 * - Full wall (all 12): ×2 (VŠETKO DORUČENÉ). Cap ZBOX_CAP_X × bet.
 * - The whole run is decided up front by playZbox(rng) — the same createRng() the game deals KONTROLA with —
 *   the UI only animates the script. Deterministic per seed.
 * EV is tuned per rank to KONTROLA (scripts/zbox-ev.ts, zbox.test.ts): the bar's RTP share does not move.
 */

export type ZSize = "s" | "m" | "w" | "l";

export interface ZCell {
  id: number;
  /** Left or right bank of the locker (the control column with the display is between). */
  side: "l" | "r";
  /** Column inside the bank (0 | 1) and unit row (0 … 5); w/h in units. */
  col: number;
  row: number;
  w: number;
  h: number;
  size: ZSize;
}

/** Each bank: 2 columns × 6 unit rows. S = 1×1, M = 1×2 (tall), W = 2×1 (wide), L = 2×2. */
export const ZBOX_LAYOUT: readonly ZCell[] = [
  // left bank
  { id: 0, side: "l", col: 0, row: 0, w: 1, h: 1, size: "s" },
  { id: 1, side: "l", col: 1, row: 0, w: 1, h: 1, size: "s" },
  { id: 2, side: "l", col: 0, row: 1, w: 2, h: 2, size: "l" },
  { id: 3, side: "l", col: 0, row: 3, w: 1, h: 2, size: "m" },
  { id: 4, side: "l", col: 1, row: 3, w: 1, h: 2, size: "m" },
  { id: 5, side: "l", col: 0, row: 5, w: 2, h: 1, size: "w" },
  // right bank
  { id: 6, side: "r", col: 0, row: 0, w: 2, h: 1, size: "w" },
  { id: 7, side: "r", col: 0, row: 1, w: 1, h: 2, size: "m" },
  { id: 8, side: "r", col: 1, row: 1, w: 1, h: 2, size: "m" },
  { id: 9, side: "r", col: 0, row: 3, w: 2, h: 2, size: "l" },
  { id: 10, side: "r", col: 0, row: 5, w: 1, h: 1, size: "s" },
  { id: 11, side: "r", col: 1, row: 5, w: 1, h: 1, size: "s" },
];

export const ZBOX_CELLS = ZBOX_LAYOUT.length;
export const ZBOX_ROWS = 6;
export const ZBOX_START = 2;
export const ZBOX_WINDOWS = 3;
export const ZBOX_CAP_X = 30;
export const ZBOX_FULL_MUL = 2;

/** Chance per empty compartment per round that a parcel lands (tuned, scripts/zbox-ev.ts). */
export const P_PARCEL = 0.0333;
/** Chance per round that a Kuriérsky príplatok can lands on the roof. */
export const P_CAN = 0.05;
export const CAN_TABLE: readonly { x: number; w: number }[] = [
  { x: 2, w: 75 },
  { x: 3, w: 20 },
  { x: 5, w: 5 },
];

export interface ZTierRow {
  x: number;
  w: number;
  /** Label on the parcel (parody e-shop / content). */
  what: string;
}

/** Bigger door = bigger value tier. */
export const ZBOX_TIERS: Record<ZSize, readonly ZTierRow[]> = {
  s: [
    { x: 0.1, w: 50, what: "Obálka · Temušop" },
    { x: 0.2, w: 35, what: "Krabička · Krémiky.sk" },
    { x: 0.3, w: 15, what: "Kábel · Kabláky.sk" },
  ],
  m: [
    { x: 0.3, w: 45, what: "Kábel · Kabláky.sk" },
    { x: 0.5, w: 35, what: "Router · Lacnotech.sk" },
    { x: 1, w: 20, what: "Krabica · Tescik.pl" },
  ],
  w: [
    { x: 0.3, w: 45, what: "Krabica · Tescik.pl" },
    { x: 0.5, w: 35, what: "Router · Lacnotech.sk" },
    { x: 1, w: 20, what: "Set-top box · Lacnotech.sk" },
  ],
  l: [
    { x: 1, w: 65, what: "Veľká krabica · Tescik.pl" },
    { x: 2, w: 28, what: "Set-top box · Lacnotech.sk" },
    { x: 5, w: 7, what: "Paleta · Temušop" },
  ],
};

/**
 * Rank perk (replaces KONTROLA's peek): PRIORITNÁ ZÁSIELKA — extra parcel(s) already in the wall at the
 * start, with a fixed value. Tuned so E[Ž-BOX] = E[KONTROLA with peek] per rank (within ±1 %, see test).
 */
export const ZBOX_VIP: Record<string, readonly number[]> = {
  kredit: [],
  sloboda: [],
  smart: [0.32],
  telka: [0.43],
  optika: [0.48],
  duo: [0.65],
  fiveg: [0.76],
  nekonecno: [0.71, 0.71],
};

export function zboxVipOf(rankId: string | undefined): readonly number[] {
  return (rankId && ZBOX_VIP[rankId]) || [];
}

export interface ZParcel {
  id: number;
  x: number;
  what: string;
  /** Rank priority parcel. */
  vip?: boolean;
}

export interface ZRound {
  /** Parcels that landed this round (empty = NEDORUČENÉ). */
  parcels: ZParcel[];
  /** Can that landed on the roof this round (0 = none). */
  can: number;
  /** Windows after this round. */
  windows: number;
}

export interface ZPlay {
  start: ZParcel[];
  rounds: ZRound[];
  cans: number[];
  /** Sum of the cans (0 = no can, the parcels pay ×1). */
  canSum: number;
  /** Parcel sum before cans / full wall / cap. */
  sumX: number;
  mult: number;
  full: boolean;
  /** Before the cap. */
  grossX: number;
  totalX: number;
  capped: boolean;
}

function pick<T extends { w: number }>(rng: () => number, table: readonly T[]): T {
  let total = 0;
  for (const t of table) total += t.w;
  let r = rng() * total;
  for (const t of table) {
    r -= t.w;
    if (r < 0) return t;
  }
  return table[table.length - 1];
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

export interface ZOpts {
  vip?: readonly number[];
  p?: number;
  q?: number;
}

/** The whole Ž-BOX run, decided up front. Same rng → same run. */
export function playZbox(rng: () => number, opts: ZOpts = {}): ZPlay {
  const p = opts.p ?? P_PARCEL;
  const q = opts.q ?? P_CAN;
  const filled: (ZParcel | null)[] = ZBOX_LAYOUT.map(() => null);
  const emptyIds = () => filled.flatMap((c, i) => (c ? [] : [i]));
  const drop = (id: number): ZParcel => {
    const row = pick(rng, ZBOX_TIERS[ZBOX_LAYOUT[id].size]);
    return { id, x: row.x, what: row.what };
  };
  const start: ZParcel[] = [];
  for (let k = 0; k < ZBOX_START; k++) {
    const free = emptyIds();
    const id = free[Math.floor(rng() * free.length)];
    const parcel = drop(id);
    filled[id] = parcel;
    start.push(parcel);
  }
  for (const x of opts.vip ?? []) {
    const free = emptyIds();
    if (!free.length) break;
    const id = free[Math.floor(rng() * free.length)];
    const parcel: ZParcel = { id, x, what: "Prioritná zásielka", vip: true };
    filled[id] = parcel;
    start.push(parcel);
  }
  const rounds: ZRound[] = [];
  const cans: number[] = [];
  let windows = ZBOX_WINDOWS;
  while (windows > 0 && filled.some((c) => !c)) {
    const parcels: ZParcel[] = [];
    for (let id = 0; id < filled.length; id++) {
      if (filled[id]) continue;
      if (rng() < p) parcels.push(drop(id));
    }
    for (const parcel of parcels) filled[parcel.id] = parcel;
    const can = rng() < q ? pick(rng, CAN_TABLE).x : 0;
    if (can) cans.push(can);
    windows = parcels.length ? ZBOX_WINDOWS : windows - 1;
    rounds.push({ parcels, can, windows });
  }
  const full = filled.every(Boolean);
  const sumX = round4(filled.reduce((s, c) => s + (c ? c.x : 0), 0));
  const canSum = cans.reduce((s, c) => s + c, 0);
  const mult = (canSum || 1) * (full ? ZBOX_FULL_MUL : 1);
  const grossX = round4(sumX * mult);
  const totalX = Math.min(ZBOX_CAP_X, grossX);
  return { start, rounds, cans, canSum, sumX, mult, full, grossX, totalX, capped: grossX > ZBOX_CAP_X };
}

/** Parcels in the wall after `n` rounds (start included). */
export function zboxFilledAfter(play: ZPlay, n: number): ZParcel[] {
  const out = [...play.start];
  for (let i = 0; i < Math.min(n, play.rounds.length); i++) out.push(...play.rounds[i].parcels);
  return out;
}

/** Display gags on a miss (NEDORUČENÉ). Satire of statuses, never of people or lost parcels. */
export const ZBOX_GAGS: readonly string[] = [
  "Ž-BOX JE PLNÝ. SKÚSIME ZAJTRA… A POZAJTRA… V PONDELOK.",
  "Zapnite Bluetooth, polohu, dáta, priblížte sa na 2 m a vypnite hodinky aj auto.",
  "Presmerované: Večierka u Jožka, 14 km, otvorené Po 9:00–9:15.",
  "Dobierka 0,01 €. Zaplaťte v appke, inak vám radosť nevydáme.",
  "Kód: 123456. Nesprávny kód. Kód: 123456.",
  "Úložná doba končí dnes o 23:59. Predĺžiť? (Nie.)",
];

export const ZBOX_TICKER = ["Na ceste", "Triediace centrum", "Na ceste", "Na ceste", "Depo", "Na ceste", "Triediace centrum"];

/** Obviously fictional parcel number for the display (never a real format). */
export function zboxParcelNo(rng: () => number): string {
  let d = "";
  for (let i = 0; i < 6; i++) d += Math.floor(rng() * 10);
  return `Ž ${d.slice(0, 3)} SLOT ${d.slice(3)}`;
}
