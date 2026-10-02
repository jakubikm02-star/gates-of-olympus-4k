export const COLS = 6;
export const ROWS = 5;

export type PayId =
  | "rj45"
  | "router"
  | "hap"
  | "roof"
  | "arris"
  | "case"
  | "meter"
  | "pdf"
  | "dacia";

export type CellKind = "pay" | "scatter" | "mult" | "park";

export type TicketId = "ulica" | "okres" | "kraj" | "stat";

export interface Cell {
  uid: number;
  kind: CellKind;
  payId?: PayId;
  mult?: number;
  ticket?: TicketId;
  /** Rows this cell just fell (presentation only). */
  fall?: number;
  /** Just exploded — render as an empty hole for a beat. */
  gone?: boolean;
}

export interface PaySymbol {
  id: PayId;
  name: string;
  src: string;
  /** Payout as multiple of total bet for 8–9 / 10–11 / 12+ */
  pays: readonly [number, number, number];
  weight: number;
  quip: string;
}

/** 8–9 / 10–11 / 12+, Gates of Olympus multiples of bet. Weights are a 1.08 ladder: cheap symbols connect more often, the crown still exists. */
export const PAY_SYMBOLS: readonly PaySymbol[] = [
  {
    id: "rj45",
    name: "Hrdzavý RJ45",
    src: "/symbols/rj45.png",
    pays: [0.25, 0.75, 2],
    weight: 14.8,
    quip: "Ešte drží. Skoro.",
  },
  {
    id: "router",
    name: "Wi-Fi router",
    src: "/symbols/router.png?v=3",
    pays: [0.4, 0.9, 4],
    weight: 13.7,
    quip: "Heslo je na spodku.",
  },
  {
    id: "hap",
    name: "hAP ac²",
    src: "/symbols/hap.png",
    pays: [0.5, 1, 5],
    weight: 12.7,
    quip: "Winbox otvorený na 8291.",
  },
  {
    id: "roof",
    name: "Krytina",
    src: "/symbols/roof.png",
    pays: [0.8, 1.2, 8],
    weight: 11.8,
    quip: "Padá aj v lete.",
  },
  {
    id: "arris",
    name: "Set-top box",
    src: "/symbols/arris.png",
    pays: [1, 1.5, 10],
    weight: 10.9,
    quip: "Modem, ktorý prežil tri providery.",
  },
  {
    id: "case",
    name: "Kufrík",
    src: "/symbols/case.png",
    pays: [1.5, 2, 12],
    weight: 10.1,
    quip: "Vnútri je len merací kábel a hnev.",
  },
  {
    id: "dacia",
    name: "Dacia Jogger",
    src: "/symbols/dacia.png",
    pays: [2, 5, 15],
    weight: 9.3,
    quip: "Sedem miest, nula hanby.",
  },
  {
    id: "meter",
    name: "OLP-87",
    src: "/symbols/meter.png",
    pays: [2.5, 10, 25],
    weight: 8.6,
    quip: "−27 dBm. Zázrak, že to svieti.",
  },
  {
    id: "pdf",
    name: "PDF 4K 5G",
    src: "/symbols/pdf.png",
    pays: [10, 25, 50],
    weight: 8,
    quip: "ULTRA MAX PRO. Stále PDF.",
  },
] as const;

export const SCATTER = {
  id: "scatter" as const,
  name: "4KA TV",
  src: "/symbols/tv4ka.png",
  /** 4 / 5 / 6 scatters, as a multiple of bet. */
  pays: [3, 5, 100] as const,
  /**
   * Base weight is the natural-bonus pin (~1/400). Ante weight is only a little higher:
   * four scatters on a tumbling screen is steep, so 2.40 lands the bonus about twice as often.
   * FS uses this same strip.
   */
  weight: 1.98,
  weightAnte: 2.44,
};

export const FS_SYMBOL = { name: "Finančná správa", src: "/symbols/fs.png" };

export const PARK = {
  id: "park" as const,
  name: "LÍSTOK",
  src: "/symbols/fttb-stat.png?v=fttb3",
  weight: 0,
};

export const TICKETS: Record<TicketId, { name: string; src: string; blank: string; ink: string }> = {
  ulica: {
    name: "1-FTTB",
    src: "/symbols/fttb-ulica.png?v=fttb3",
    blank: "/symbols/fttb-ulica-blank.png?v=fttb3",
    ink: "#c5ccd4",
  },
  okres: {
    name: "2-FTTB",
    src: "/symbols/fttb-okres.png?v=fttb3",
    blank: "/symbols/fttb-okres-blank.png?v=fttb3",
    ink: "#6ea8ff",
  },
  kraj: {
    name: "3-FTTB",
    src: "/symbols/fttb-kraj.png?v=fttb3",
    blank: "/symbols/fttb-kraj-blank.png?v=fttb3",
    ink: "#c86bff",
  },
  stat: {
    name: "4-FTTB",
    src: "/symbols/fttb-stat.png?v=fttb3",
    blank: "/symbols/fttb-stat-blank.png?v=fttb3",
    ink: "#e2b01a",
  },
};

export function ticketArt(id: TicketId, customName: boolean): string {
  const t = TICKETS[id];
  return customName ? t.blank : t.src;
}

/** Can look tier, presentation only. Bands follow ORB_TABLE: 2–5, 6–15, 20–50, 100+. */
export type CanTier = 1 | 2 | 3 | 4;

export function canTier(mult: number): CanTier {
  if (mult >= 100) return 4;
  if (mult >= 20) return 3;
  if (mult >= 6) return 2;
  return 1;
}

export function canSrc(mult: number): string {
  return `/symbols/can-t${canTier(mult)}.webp`;
}

/** PARKVOLT cans (4 tiers) + the electric arc layer of the top tier. */
export const CAN_ART: readonly string[] = [1, 2, 3, 4].map((t) => `/symbols/can-t${t}.webp`).concat("/symbols/can-arc.webp");

export const ALL_ART: readonly string[] = [
  ...PAY_SYMBOLS.map((s) => s.src),
  SCATTER.src,
  FS_SYMBOL.src,
  ...Object.values(TICKETS).flatMap((t) => [t.src, t.blank]),
  ...CAN_ART,
  "/art/paas-idle.png?v=3",
  "/art/paas-run.png?v=3",
  "/art/paas-anti.png?v=4",
  "/art/paas-bolt.png?v=4",
  "/art/paas-win.png?v=4",
  "/art/parking-bg.jpg",
];

/** Official Olympus pool. Cans ADD into SIGNÁL; they never multiply each other. */
export const ORB_VALUES = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100, 250, 500] as const;

/**
 * Same table in PORT and LIVE. Bands: 2–5 ~72 %, 6–15 ~21 %, 20–50 ~6 %, 100+ ~1 %.
 * Mean ≈ 7×. 500× is rarer than PDF 8+ (~1/100).
 */
export const ORB_TABLE: readonly { value: number; w: number }[] = [
  { value: 2, w: 2453 },
  { value: 3, w: 2000 },
  { value: 4, w: 1400 },
  { value: 5, w: 1400 },
  { value: 6, w: 550 },
  { value: 8, w: 500 },
  { value: 10, w: 450 },
  { value: 12, w: 300 },
  { value: 15, w: 300 },
  { value: 20, w: 180 },
  { value: 25, w: 220 },
  { value: 50, w: 150 },
  { value: 100, w: 70 },
  { value: 250, w: 20 },
  { value: 500, w: 7 },
];

export const BASE_MULT_TABLE = ORB_TABLE;
export const MULT_TABLE = ORB_TABLE;

export const BETS = [
  0.2, 0.4, 0.6, 0.8, 1, 1.6, 2, 2.4, 3.2, 4, 5, 8, 10, 16, 20, 40, 50, 80, 100, 200, 400, 500, 1000,
] as const;

export const MAX_WIN_X = 5000;
/** Pragmatic Gates of Olympus win-celebration floors (bet multiples). */
export const WIN_POP_X = {
  big: 20,
  mega: 35,
  epic: 50,
  /**
   * MASÍVNA VÝHRA: 5× the epic floor, 1/20 of the 5000× cap. Engine sim (5 M base spins, 2 seeds):
   * a base spin pays 250×+ about 1 in 3 800, a 4KA TV ends at 250×+ in ~8.5 % of bonuses,
   * together ~1 in 2 100 paid spins (200× would be ~1 in 1 500, 300× ~1 in 2 800).
   */
  massive: 250,
} as const;
export const FS_SPINS = 15;
export const FS_RETRIGGER = 5;
export const FS_TRIGGER_SCATTERS = 4;
export const FS_RETRIGGER_SCATTERS = 3;
/** Each scatter past the 4 that open the feature. */
export const FS_EXTRA_PER_SCATTER = 4;

/** 4 scatters = base (15, or the rank base). Each further scatter adds 4. */
export function fsTriggerSpins(scatters: number, base = FS_SPINS): number {
  const extra = Math.max(0, Math.floor(scatters) - FS_TRIGGER_SCATTERS);
  return base + extra * FS_EXTRA_PER_SCATTER;
}
export const BUY_COST_X = 79;
/**
 * Ante stake. A 2× bonus is not worth +25% here: most of the return is the base
 * game, so 1.25× dropped RTP by about ten points. 1.13× keeps it level with base.
 * From SMART the rank perk charges 1.10×.
 */
export const ANTE_COST = 1.13;
export const START_BALANCE = 5000;

/** 450k spins on this engine. Bonus ~1/378, ante ~1/192. Buy at 79× returns ~1.23× the price. */
export const MATH_NOTE = {
  spins: 450_000,
  rtp: 1.26,
  hit: 0.284,
  bonusEvery: 378,
  anteBonusEvery: 192,
  buyEv: 1.229,
  maxEvery: null as number | null,
};

export function payForCount(pays: readonly [number, number, number], count: number): number {
  if (count >= 12) return pays[2];
  if (count >= 10) return pays[1];
  if (count >= 8) return pays[0];
  return 0;
}

export function scatterPay(count: number): number {
  if (count >= 6) return SCATTER.pays[2];
  if (count >= 5) return SCATTER.pays[1];
  if (count >= 4) return SCATTER.pays[0];
  return 0;
}

export function symbolSrc(cell: Cell): string {
  if (cell.kind === "scatter") return SCATTER.src;
  if (cell.kind === "park") return TICKETS[cell.ticket ?? "stat"].src;
  if (cell.kind === "mult") return canSrc(cell.mult ?? 2);
  const s = PAY_SYMBOLS.find((p) => p.id === cell.payId);
  return s?.src ?? PAY_SYMBOLS[0].src;
}

export function symbolName(cell: Cell): string {
  if (cell.kind === "scatter") return SCATTER.name;
  if (cell.kind === "park") return `LÍSTOK ${TICKETS[cell.ticket ?? "stat"].name}`;
  if (cell.kind === "mult") return `x${cell.mult ?? 2}`;
  return PAY_SYMBOLS.find((p) => p.id === cell.payId)?.name ?? "";
}

export function payName(id: PayId | "scatter"): string {
  if (id === "scatter") return SCATTER.name;
  return PAY_SYMBOLS.find((p) => p.id === id)?.name ?? id;
}
