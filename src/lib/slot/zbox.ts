/**
 * Ž-BOX (PAKEŤÁK): the second mode of the KONTROLA bar. Hold & Win on a wall of 12 compartments.
 * Satire of a parcel locker; no real brand, e-shop or tracking number.
 *
 * - Start: 2 parcels are already in (no zero result), plus the rank's priority parcel(s) (zboxVipOf).
 * - 3 delivery windows. Every round each empty compartment gets a parcel with P_PARCEL (value from the
 *   compartment's size tier). Any new parcel → windows back to 3, none → one window off (NEDORUČENÉ).
 * - Kuriérsky príplatok: with P_CAN per round a can (2/3/5×) lands on the roof. Cans add up (2+3 = 5) and
 *   multiply the parcel sum at the end. A can does not touch the windows.
 * - Special parcels (modifiers, Money-Train style): a hit is a special with P_MOD (ZBOX_MODS weights). It has its
 *   own tier value and acts on landing — KURIÉR ×2 on 2–4 parcels, ZBERNÝ KURIÉR adds every other value to
 *   itself (the others keep theirs), DOBIERKA adds its value to every parcel, PRESMEROVANIE +1 window, EXPRES adds its value to every
 *   parcel after each later round (persistent), SKLADOVÉ POPLATKY −10 % on every other parcel (gag).
 *   Specials are processed in compartment order (the order the UI sweep tests the doors).
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
export const P_PARCEL = 0.0284;
/** Chance that a hit is a special parcel (modifier). */
export const P_MOD = 0.12;
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
  smart: [0.3],
  telka: [0.4],
  optika: [0.46],
  duo: [0.62],
  fiveg: [0.73],
  nekonecno: [0.68, 0.68],
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
  /** Special parcel (modifier). */
  mod?: ZMod;
}

/** Special parcels (modifiers). */
export type ZMod = "kurier" | "zberny" | "dobierka" | "presmer" | "expres" | "sklad";

export const ZBOX_MODS: readonly { mod: ZMod; w: number; name: string; line: string }[] = [
  { mod: "kurier", w: 30, name: "KURIÉR", line: "×2 na 2–4 iné balíky v stene" },
  { mod: "dobierka", w: 25, name: "DOBIERKA", line: "pridá svoju hodnotu každému inému balíku" },
  { mod: "presmer", w: 20, name: "PRESMEROVANIE", line: "okná sa tentoraz doplnia na 4 namiesto 3" },
  { mod: "zberny", w: 8, name: "ZBERNÝ KURIÉR", line: "pripočíta si hodnotu všetkých ostatných balíkov" },
  { mod: "expres", w: 7, name: "EXPRES", line: "po každom ďalšom kole pridá svoju hodnotu všetkým ostatným" },
  { mod: "sklad", w: 10, name: "SKLADOVÉ POPLATKY", line: "−10 % z každého iného balíka (najmenej 0,05× stávky)" },
];

/** One modifier action: the special in compartment `by` sets these compartments to new values (× bet). */
export interface ZFx {
  by: number;
  mod: ZMod;
  set: { id: number; x: number }[];
  /** PRESMEROVANIE: windows after the action. */
  windows?: number;
  /** EXPRES acting at the end of a later round. */
  tick?: boolean;
}

export interface ZRound {
  /** Parcels that landed this round (empty = NEDORUČENÉ), in compartment order. */
  parcels: ZParcel[];
  /** Modifier actions this round, in order (landing actions, then EXPRES ticks). */
  fx: ZFx[];
  /** Can that landed on the roof this round (0 = none). */
  can: number;
  /** Windows after this round. */
  windows: number;
}

export interface ZPlay {
  start: ZParcel[];
  /** Final value of every compartment after all modifiers (0 = empty). */
  vals: number[];
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
  /** Override P_MOD (tests, tuning). */
  m?: number;
}

/** The whole Ž-BOX run, decided up front. Same rng → same run. */
export function playZbox(rng: () => number, opts: ZOpts = {}): ZPlay {
  const p = opts.p ?? P_PARCEL;
  const q = opts.q ?? P_CAN;
  const pm = opts.m ?? P_MOD;
  const filled: (ZParcel | null)[] = ZBOX_LAYOUT.map(() => null);
  const vals: number[] = ZBOX_LAYOUT.map(() => 0);
  const emptyIds = () => filled.flatMap((c, i) => (c ? [] : [i]));
  const drop = (id: number): ZParcel => {
    const row = pick(rng, ZBOX_TIERS[ZBOX_LAYOUT[id].size]);
    return { id, x: row.x, what: row.what };
  };
  const put = (parcel: ZParcel) => {
    filled[parcel.id] = parcel;
    vals[parcel.id] = parcel.x;
  };
  const start: ZParcel[] = [];
  for (let k = 0; k < ZBOX_START; k++) {
    const free = emptyIds();
    const id = free[Math.floor(rng() * free.length)];
    put(drop(id));
    start.push(filled[id]!);
  }
  for (const x of opts.vip ?? []) {
    const free = emptyIds();
    if (!free.length) break;
    const id = free[Math.floor(rng() * free.length)];
    put({ id, x, what: "Prioritná zásielka", vip: true });
    start.push(filled[id]!);
  }
  const others = (self: number) => filled.flatMap((c, i) => (c && i !== self ? [i] : []));
  const rounds: ZRound[] = [];
  const cans: number[] = [];
  const expres: number[] = [];
  let windows = ZBOX_WINDOWS;
  while (windows > 0 && filled.some((c) => !c)) {
    const parcels: ZParcel[] = [];
    const fx: ZFx[] = [];
    let bonusWin = 0;
    for (let id = 0; id < filled.length; id++) {
      if (filled[id]) continue;
      if (rng() >= p) continue;
      const parcel = drop(id);
      if (rng() < pm) parcel.mod = pick(rng, ZBOX_MODS).mod;
      put(parcel);
      parcels.push(parcel);
      const mod = parcel.mod;
      if (!mod) continue;
      const set: { id: number; x: number }[] = [];
      const o = others(id);
      if (mod === "kurier") {
        const n = Math.min(o.length, 2 + Math.floor(rng() * 3));
        const pool = [...o];
        for (let k = 0; k < n; k++) {
          const t = pool.splice(Math.floor(rng() * pool.length), 1)[0];
          vals[t] = round4(vals[t] * 2);
          set.push({ id: t, x: vals[t] });
        }
      } else if (mod === "dobierka") {
        for (const t of o) {
          vals[t] = round4(vals[t] + vals[id]);
          set.push({ id: t, x: vals[t] });
        }
      } else if (mod === "zberny") {
        vals[id] = round4(vals[id] + o.reduce((s2, t) => s2 + vals[t], 0));
        set.push({ id, x: vals[id] });
      } else if (mod === "sklad") {
        for (const t of o) {
          vals[t] = Math.max(0.05, round4(vals[t] * 0.9));
          set.push({ id: t, x: vals[t] });
        }
      } else if (mod === "presmer") {
        bonusWin += 1;
      } else if (mod === "expres") {
        expres.push(id);
      }
      fx.push(mod === "presmer" ? { by: id, mod, set, windows: ZBOX_WINDOWS + bonusWin } : { by: id, mod, set });
    }
    const can = rng() < q ? pick(rng, CAN_TABLE).x : 0;
    if (can) cans.push(can);
    // EXPRES: after every later round (not the one it landed in), its value goes to every other parcel
    for (const e of expres) {
      if (parcels.some((x) => x.id === e)) continue;
      const set = others(e).map((t) => {
        vals[t] = round4(vals[t] + vals[e]);
        return { id: t, x: vals[t] };
      });
      if (set.length) fx.push({ by: e, mod: "expres", set, tick: true });
    }
    windows = parcels.length ? ZBOX_WINDOWS + bonusWin : windows - 1;
    rounds.push({ parcels, fx, can, windows });
  }
  const full = filled.every(Boolean);
  const sumX = round4(vals.reduce((s, v) => s + v, 0));
  const canSum = cans.reduce((s, c) => s + c, 0);
  const mult = (canSum || 1) * (full ? ZBOX_FULL_MUL : 1);
  const grossX = round4(sumX * mult);
  const totalX = Math.min(ZBOX_CAP_X, grossX);
  return { start, vals, rounds, cans, canSum, sumX, mult, full, grossX, totalX, capped: grossX > ZBOX_CAP_X };
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
