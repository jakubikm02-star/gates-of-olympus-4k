export type PickKind = "listok" | "pokuta" | "zona" | "odtah";

export interface PickTile {
  id: number;
  kind: PickKind;
  payX: number;
  title: string;
  note: string;
}

export const PICK_BAYS = 12;
export const PITY_GOAL = 100;

/** Only dead spins and 3/4 scatters charge KONTROLA. */
export function pityGain(scatterPeak: number, dead: boolean): number {
  if (scatterPeak >= 4) return 35;
  if (scatterPeak >= 3) return 20;
  if (dead) return 2;
  return 0;
}

/** 3 ODŤAH among 12; pick until first tow. E[safes]=9/4=2.25, avg prize 1.333 → EV ≈ 3×. */
const BAG: readonly Omit<PickTile, "id">[] = [
  { kind: "listok", payX: 0.2, title: "LÍSTOK", note: "krátkodobé" },
  { kind: "listok", payX: 0.4, title: "LÍSTOK", note: "1 hodina" },
  { kind: "listok", payX: 0.5, title: "LÍSTOK", note: "zóna B" },
  { kind: "listok", payX: 0.6, title: "LÍSTOK", note: "2 hodiny" },
  { kind: "listok", payX: 0.8, title: "LÍSTOK", note: "celý deň" },
  { kind: "listok", payX: 1, title: "LÍSTOK", note: "rezident" },
  { kind: "pokuta", payX: 2, title: "POKUTA", note: "bez lístka" },
  { kind: "pokuta", payX: 5, title: "POKUTA", note: "zákaz zastavenia" },
  { kind: "zona", payX: 1.5, title: "ZÓNA", note: "modrá + príplatok" },
  { kind: "odtah", payX: 0, title: "ODŤAH", note: "koniec kontroly" },
  { kind: "odtah", payX: 0, title: "ODŤAH", note: "koniec kontroly" },
  { kind: "odtah", payX: 0, title: "ODŤAH", note: "koniec kontroly" },
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
