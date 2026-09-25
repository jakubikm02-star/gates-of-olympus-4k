export type PickKind = "listok" | "pokuta" | "zona" | "odtah";

export interface PickTile {
  id: number;
  kind: PickKind;
  payX: number;
  title: string;
  note: string;
  zone: string;
}

export const PICK_BAYS = 12;
export const PITY_GOAL = 100;

export type PityMap = Record<string, number>;

export function pityKey(bet: number): string {
  return String(bet);
}

export function readPity(map: PityMap, bet: number): number {
  const n = map[pityKey(bet)];
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export function bumpPity(map: PityMap, bet: number, add: number): PityMap {
  if (add === 0) return map;
  const key = pityKey(bet);
  const next = readPity(map, bet) + add;
  return { ...map, [key]: Math.max(0, next) };
}

/** Consume the bar for the current bet — no leftover after KONTROLA. */
export function spendPity(map: PityMap, bet: number): PityMap {
  return { ...map, [pityKey(bet)]: 0 };
}

/** PORT: only dead spins and 3 zo 4 charge KONTROLA. Wins give 0. */
export function pityGain(scatterPeak: number, dead: boolean): number {
  if (scatterPeak >= 4) return 0;
  if (scatterPeak >= 3) return 30;
  if (dead) return 2;
  return 0;
}

/** 3 ODŤAH among 12; pick until first tow. E[safes]=9/4=2.25, avg prize 1.333 → EV ≈ 3×. */
const BAG: readonly Omit<PickTile, "id">[] = [
  { kind: "listok", payX: 0.2, title: "LÍSTOK", note: "0:30", zone: "1020 · Nábrežie 1" },
  { kind: "listok", payX: 0.4, title: "LÍSTOK", note: "1:00", zone: "5001 · Dvory 4" },
  { kind: "listok", payX: 0.5, title: "LÍSTOK", note: "1:00", zone: "2010 · Staré mesto" },
  { kind: "listok", payX: 0.6, title: "LÍSTOK", note: "2:00", zone: "3012 · Sever 2" },
  { kind: "listok", payX: 0.8, title: "LÍSTOK", note: "celý deň", zone: "4040 · Sídlisko" },
  { kind: "listok", payX: 1, title: "LÍSTOK", note: "rezident", zone: "1001 · Centrum" },
  { kind: "pokuta", payX: 2, title: "POKUTA", note: "bez lístka", zone: "Zákaz zastavenia" },
  { kind: "pokuta", payX: 5, title: "POKUTA", note: "zákaz vjazdu", zone: "Modrá zóna" },
  { kind: "zona", payX: 1.5, title: "ZÓNA", note: "príplatok", zone: "Zóna A" },
  { kind: "odtah", payX: 0, title: "ODŤAH", note: "koniec", zone: "Odťahová služba" },
  { kind: "odtah", payX: 0, title: "ODŤAH", note: "koniec", zone: "Odťahová služba" },
  { kind: "odtah", payX: 0, title: "ODŤAH", note: "koniec", zone: "Odťahová služba" },
];

export function dealPickBoard(rng: () => number): PickTile[] {
  const bag = BAG.map((t) => ({ ...t }));
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = bag[i];
    bag[i] = bag[j];
    bag[j] = tmp;
  }
  return bag.map((t, id) => ({ ...t, id }));
}

/** Safe prices the rank may show before the first tap. Never an ODŤAH. */
export function rankPeekIds(tiles: PickTile[], cap: number, count: number): number[] {
  if (cap <= 0 || count <= 0) return [];
  return tiles
    .filter((t) => t.payX > 0 && t.payX <= cap + 1e-9)
    .sort((a, b) => b.payX - a.payX || a.id - b.id)
    .slice(0, count)
    .map((t) => t.id);
}
