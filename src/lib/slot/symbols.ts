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
}

export const PAY_SYMBOLS: readonly PaySymbol[] = [
  {
    id: "rj45",
    name: "Hrdzavý RJ45",
    src: "/symbols/rj45.png",
    pays: [0.25, 0.75, 2],
    weight: 22,
  },
  {
    id: "router",
    name: "Wi-Fi router",
    src: "/symbols/router.png",
    pays: [0.4, 0.9, 4],
    weight: 18,
  },
  {
    id: "hap",
    name: "hAP ac²",
    src: "/symbols/hap.png",
    pays: [0.5, 1, 5],
    weight: 15,
  },
  {
    id: "roof",
    name: "Krytina",
    src: "/symbols/roof.png",
    pays: [0.8, 1.2, 8],
    weight: 12,
  },
  {
    id: "arris",
    name: "ARRIS",
    src: "/symbols/arris.png",
    pays: [1, 1.5, 10],
    weight: 10,
  },
  {
    id: "case",
    name: "Kufrík",
    src: "/symbols/case.png",
    pays: [1.5, 2, 12],
    weight: 8,
  },
  {
    id: "meter",
    name: "OLP-87",
    src: "/symbols/meter.png",
    pays: [2, 5, 15],
    weight: 6,
  },
  {
    id: "pdf",
    name: "PDF 4K 5G",
    src: "/symbols/pdf.png",
    pays: [2.5, 10, 25],
    weight: 5,
  },
  {
    id: "dacia",
    name: "Dacia Jogger",
    src: "/symbols/dacia.png",
    pays: [10, 25, 50],
    weight: 3.4,
  },
] as const;

export const SCATTER = {
  id: "scatter" as const,
  name: "4ka TV",
  src: "/symbols/tv4ka.png",
  /** 4 / 5 / 6+ scatters as multiple of bet */
  pays: [3, 5, 100] as const,
  weight: 2.7,
};

export const MULT_WEIGHT = 3.8;

export const MULT_TABLE: readonly { value: number; w: number }[] = [
  { value: 2, w: 28 },
  { value: 3, w: 22 },
  { value: 4, w: 16 },
  { value: 5, w: 12 },
  { value: 6, w: 8 },
  { value: 8, w: 6 },
  { value: 10, w: 4.5 },
  { value: 12, w: 3 },
  { value: 15, w: 2.2 },
  { value: 20, w: 1.4 },
  { value: 25, w: 1 },
  { value: 50, w: 0.45 },
  { value: 100, w: 0.22 },
  { value: 250, w: 0.08 },
  { value: 500, w: 0.03 },
];

export const BETS = [
  0.2, 0.4, 0.6, 0.8, 1, 1.6, 2, 2.4, 3.2, 4, 5, 8, 10, 16, 20, 40, 50, 80, 100,
] as const;

export const MAX_WIN_X = 5000;
export const FS_SPINS = 15;
export const FS_RETRIGGER = 5;
export const BUY_COST_X = 100;
export const ANTE_COST = 1.25;
export const START_BALANCE = 5000;

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
