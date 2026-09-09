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

export type CellKind = "pay" | "scatter" | "mult";

export interface Cell {
  uid: number;
  kind: CellKind;
  payId?: PayId;
  mult?: number;
  /** Rows this cell just fell (presentation only). */
  fall?: number;
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

export const PAY_SYMBOLS: readonly PaySymbol[] = [
  {
    id: "rj45",
    name: "Hrdzavý RJ45",
    src: "/symbols/rj45.png",
    pays: [0.25, 0.75, 2],
    weight: 16,
    quip: "Ešte drží. Skoro.",
  },
  {
    id: "router",
    name: "Wi-Fi router",
    src: "/symbols/router.png",
    pays: [0.4, 0.9, 4],
    weight: 14,
    quip: "Heslo je na spodku.",
  },
  {
    id: "hap",
    name: "hAP ac²",
    src: "/symbols/hap.png",
    pays: [0.5, 1, 5],
    weight: 12,
    quip: "Winbox otvorený na 8291.",
  },
  {
    id: "roof",
    name: "Krytina",
    src: "/symbols/roof.png",
    pays: [0.8, 1.2, 8],
    weight: 12,
    quip: "Padá aj v lete.",
  },
  {
    id: "arris",
    name: "ARRIS",
    src: "/symbols/arris.png",
    pays: [1, 1.5, 10],
    weight: 10,
    quip: "Modem, ktorý prežil tri providery.",
  },
  {
    id: "case",
    name: "Kufrík",
    src: "/symbols/case.png",
    pays: [1.5, 2, 12],
    weight: 8,
    quip: "Vnútri je len merací kábel a hnev.",
  },
  {
    id: "meter",
    name: "OLP-87",
    src: "/symbols/meter.png",
    pays: [2, 5, 15],
    weight: 6,
    quip: "−27 dBm. Zázrak, že to svieti.",
  },
  {
    id: "pdf",
    name: "PDF 4K 5G",
    src: "/symbols/pdf.png",
    pays: [2.5, 8, 22],
    weight: 5,
    quip: "ULTRA MAX PRO. Stále PDF.",
  },
  {
    id: "dacia",
    name: "Dacia Jogger",
    src: "/symbols/dacia.png",
    pays: [10, 25, 50],
    weight: 3.4,
    quip: "Sedem miest, nula hanby.",
  },
] as const;

export const SCATTER = {
  id: "scatter" as const,
  name: "4ka TV",
  src: "/symbols/tv4ka.png",
  /** 4 / 5 / 6+ scatters as multiple of bet */
  pays: [3, 5, 100] as const,
  /** Base weight: P(4+ on land) ~1/330; tumble inflates bonus toward ~1/300. */
  weight: 1.55,
  /** Binomial: P(X≥4) with ante ≈ 2× base. Not a raw cell-weight ×2. */
  weightAnte: 1.95,
};

export const ALL_ART: readonly string[] = [
  ...PAY_SYMBOLS.map((s) => s.src),
  SCATTER.src,
  "/art/orb.png",
  "/art/ramp.png",
  "/art/parking-bg.jpg",
];

/** Base orbs: mostly 2–8× so dead-spin theater exists without paying a bank. */
export const BASE_MULT_TABLE: readonly { value: number; w: number }[] = [
  { value: 2, w: 30 },
  { value: 3, w: 22 },
  { value: 4, w: 16 },
  { value: 5, w: 12 },
  { value: 6, w: 8 },
  { value: 8, w: 5 },
  { value: 10, w: 3.2 },
  { value: 12, w: 2 },
  { value: 15, w: 1.2 },
  { value: 20, w: 0.7 },
  { value: 25, w: 0.4 },
  { value: 50, w: 0.18 },
  { value: 100, w: 0.08 },
  { value: 250, w: 0.025 },
  { value: 500, w: 0.01 },
];

/** FS orbs: mass on 2–8×, fat 50–500 so stacked meter can actually cap at 5000×. */
export const MULT_TABLE: readonly { value: number; w: number }[] = [
  { value: 2, w: 22 },
  { value: 3, w: 17 },
  { value: 4, w: 13 },
  { value: 5, w: 10 },
  { value: 6, w: 7 },
  { value: 8, w: 5.5 },
  { value: 10, w: 4.5 },
  { value: 12, w: 3.2 },
  { value: 15, w: 2.3 },
  { value: 20, w: 1.7 },
  { value: 25, w: 1.3 },
  { value: 50, w: 0.9 },
  { value: 100, w: 0.55 },
  { value: 250, w: 0.28 },
  { value: 500, w: 0.18 },
];

export const BETS = [
  0.2, 0.4, 0.6, 0.8, 1, 1.6, 2, 2.4, 3.2, 4, 5, 8, 10, 16, 20, 40, 50, 80, 100,
] as const;

export const MAX_WIN_X = 5000;
export const FS_SPINS = 15;
export const FS_RETRIGGER = 5;
export const FS_TRIGGER_SCATTERS = 4;
export const FS_RETRIGGER_SCATTERS = 3;
export const BUY_COST_X = 100;
export const ANTE_COST = 1.25;
export const START_BALANCE = 5000;

/** Baked from scripts/slot-rtp.ts 1e6 paid spins. */
export const MATH_NOTE = {
  spins: 1_000_000,
  rtp: 0.9769,
  hit: 0.3467,
  bonusEvery: 317,
  anteBonusEvery: 146,
  buyEv: 1.2586,
  maxEvery: 1_000_000 as number | null,
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
  if (cell.kind === "mult") return "/art/orb.png";
  const s = PAY_SYMBOLS.find((p) => p.id === cell.payId);
  return s?.src ?? PAY_SYMBOLS[0].src;
}

export function symbolName(cell: Cell): string {
  if (cell.kind === "scatter") return SCATTER.name;
  if (cell.kind === "mult") return `x${cell.mult ?? 2}`;
  return PAY_SYMBOLS.find((p) => p.id === cell.payId)?.name ?? "";
}

export function payName(id: PayId | "scatter"): string {
  if (id === "scatter") return SCATTER.name;
  return PAY_SYMBOLS.find((p) => p.id === id)?.name ?? id;
}
