import { pick, roll } from "./rng.ts";
import { PLAY_SYMS } from "./symbols.ts";
import type { StatId, SymId } from "./types.ts";

export type Family = "telekom" | "urad" | "policia" | "kamene" | "parkvolt";
export type Rarity = "bezny" | "vzacny" | "epicky" | "legendarny";
export type Arrow = "up" | "down" | "left" | "right";
export type Ink = "modra" | "zlta";

export interface SymMeta {
  family: Family;
  rarity: Rarity;
  stat: StatId;
  arrow: Arrow;
  ink: Ink;
  /** 0–1. A proc adds a flat bonus. Bloček has none, so seeded hits stay exact. */
  proc: number;
  procFlat: number;
  cursed?: boolean;
}

const m = (
  family: Family,
  rarity: Rarity,
  stat: StatId,
  arrow: Arrow,
  ink: Ink,
  proc = 0,
  procFlat = 0,
  cursed = false,
): SymMeta => ({ family, rarity, stat, arrow, ink, proc, procFlat, cursed });

/**
 * One card of stats for every shared symbol. Bloček is plain on purpose:
 * three of them are the seeded critical and must stay 15 × 2.
 */
export const META: Partial<Record<SymId, SymMeta>> = {
  krimp: m("parkvolt", "vzacny", "sila", "up", "zlta", 0.14, 6),
  stit: m("policia", "bezny", "odolnost", "down", "modra"),
  parkvolt: m("parkvolt", "epicky", "charizma", "up", "zlta", 0.12, 4),
  konektor: m("parkvolt", "bezny", "charizma", "right", "zlta"),
  boticka: m("policia", "vzacny", "rychlost", "down", "modra"),
  data: m("urad", "vzacny", "rychlost", "left", "modra"),
  exekucia: m("policia", "epicky", "sila", "up", "modra"),
  restart: m("urad", "vzacny", "rychlost", "left", "zlta"),
  natural: m("parkvolt", "legendarny", "sila", "up", "zlta"),
  rj45: m("telekom", "bezny", "sila", "left", "modra"),
  router: m("telekom", "vzacny", "rychlost", "left", "modra", 0.1, 4),
  hap: m("telekom", "vzacny", "rychlost", "right", "zlta", 0.1, 4),
  roof: m("policia", "bezny", "odolnost", "down", "modra"),
  arris: m("telekom", "epicky", "rychlost", "up", "zlta"),
  case: m("parkvolt", "bezny", "charizma", "right", "zlta"),
  dacia: m("parkvolt", "vzacny", "sila", "right", "zlta"),
  meter: m("telekom", "vzacny", "sila", "right", "modra"),
  pdf: m("urad", "epicky", "sila", "up", "modra", 0.12, 6),
  tv: m("telekom", "epicky", "charizma", "up", "zlta"),
  gemr: m("kamene", "bezny", "sila", "up", "zlta"),
  gemb: m("kamene", "bezny", "odolnost", "down", "modra"),
  gemg: m("kamene", "vzacny", "odolnost", "up", "zlta"),
  gemy: m("kamene", "vzacny", "charizma", "right", "zlta"),
  gemp: m("kamene", "vzacny", "rychlost", "down", "modra"),
  crown: m("kamene", "legendarny", "charizma", "up", "zlta", 0.2, 8),
  chalice: m("kamene", "epicky", "odolnost", "up", "modra"),
  hour: m("urad", "epicky", "rychlost", "left", "zlta"),
  ring: m("kamene", "epicky", "charizma", "left", "modra"),
  fs: m("urad", "epicky", "sila", "down", "modra"),
  can1: m("policia", "bezny", "sila", "up", "zlta"),
  can2: m("policia", "vzacny", "sila", "right", "zlta"),
  can3: m("policia", "epicky", "sila", "up", "modra"),
  can4: m("policia", "legendarny", "sila", "down", "modra", 0.15, 6),
  canarc: m("policia", "vzacny", "odolnost", "left", "modra"),
  ulica: m("telekom", "bezny", "rychlost", "left", "modra"),
  okres: m("telekom", "vzacny", "odolnost", "down", "zlta"),
  kraj: m("telekom", "epicky", "rychlost", "up", "modra"),
  stat: m("telekom", "legendarny", "sila", "right", "zlta"),
  pokuta: m("urad", "bezny", "charizma", "down", "modra", 0, 0, true),
  syntik: m("parkvolt", "vzacny", "charizma", "right", "zlta"),
  cymbal: m("parkvolt", "bezny", "sila", "up", "zlta"),
  ventilator: m("parkvolt", "bezny", "rychlost", "left", "modra"),
};

export const FAMILY_NAME: Record<Family, string> = {
  telekom: "Telekom",
  urad: "Úrad",
  policia: "Polícia",
  kamene: "Kamene",
  parkvolt: "PARKVOLT",
};

export const STAT_NAME: Record<StatId, string> = {
  sila: "SILA",
  odolnost: "ODOLNOSŤ",
  rychlost: "RÝCHLOSŤ",
  charizma: "CHARIZMA",
};

export const RARITY_NAME: Record<Rarity, string> = {
  bezny: "bežný",
  vzacny: "vzácny",
  epicky: "epický",
  legendarny: "legendárny",
};

const THEME: Record<string, Family[]> = {
  neplatic: ["parkvolt", "kamene"],
  pokutomat: ["policia", "urad"],
  ozran: ["kamene", "parkvolt"],
  inkasak: ["urad", "policia"],
  zlodej: ["parkvolt", "kamene"],
  uradnicka: ["urad", "telekom"],
  kurier: ["parkvolt", "policia"],
  demon: ["kamene", "policia"],
  anjel: ["policia", "urad"],
  general: ["urad", "policia"],
  prednosta: ["urad", "telekom"],
  krovinorez: ["parkvolt", "kamene"],
  motorka: ["parkvolt", "kamene"],
  myto: ["urad", "parkvolt"],
  blastbeat: ["parkvolt", "kamene"],
};

export function metaOf(id: SymId): SymMeta | null {
  return META[id] ?? null;
}

export function rarityOf(id: SymId): Rarity {
  return META[id]?.rarity ?? "bezny";
}

/** Same colour and a matching or opposite arrow is the good link. Clash is a tax. */
export function chemPair(a: SymId, b: SymId): number {
  const ma = META[a];
  const mb = META[b];
  if (!ma || !mb) return 0;
  if (ma.ink !== mb.ink) return -0.05;
  const opposite =
    (ma.arrow === "up" && mb.arrow === "down") ||
    (ma.arrow === "down" && mb.arrow === "up") ||
    (ma.arrow === "left" && mb.arrow === "right") ||
    (ma.arrow === "right" && mb.arrow === "left");
  if (opposite || ma.arrow === mb.arrow) return 0.1;
  return 0.05;
}

export function rowMul(lands: readonly SymId[], index: number, call: readonly StatId[]): number {
  const id = lands[index];
  const meta = id ? META[id] : undefined;
  if (!id || !meta) return 1;
  let bonus = 0;
  let mates = 0;
  for (const sym of lands) if (META[sym]?.family === meta.family) mates += 1;
  if (mates >= 3) bonus += 0.15;
  else if (mates >= 2) bonus += 0.08;
  const prev = index > 0 ? lands[index - 1] : undefined;
  if (prev) bonus += chemPair(prev, id);
  if (call.includes(meta.stat)) bonus += 0.12;
  return 1 + bonus;
}

export function procBonus(id: SymId, reel: number, salt: number): number {
  const meta = META[id];
  if (!meta || meta.proc <= 0) return 0;
  const n = Math.abs(Math.sin(salt * 0.017 + reel * 2.3 + id.length * 1.7)) % 1;
  return n < meta.proc ? meta.procFlat : 0;
}

export function linkBetween(lands: readonly SymId[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < lands.length; i++) out.push(chemPair(lands[i - 1] ?? "medzera", lands[i] ?? "medzera"));
  return out;
}

/** Shared pool. Theme families are drawn more often; every other symbol can still appear. */
export function buildDeck(state: number, id: string, n = 10): { state: number; deck: SymId[] } {
  const fav = new Set(THEME[id] ?? ["parkvolt"]);
  const bag: SymId[] = [];
  for (const sym of PLAY_SYMS) {
    const meta = META[sym];
    const w = meta && fav.has(meta.family) ? 5 : 1;
    for (let i = 0; i < w; i++) bag.push(sym);
  }
  const deck: SymId[] = [];
  let s = state;
  const seen = new Set<SymId>();
  while (deck.length < n) {
    const got = pick(s, bag);
    s = got.state;
    if (seen.has(got.item) && seen.size < Math.min(n, 8)) continue;
    seen.add(got.item);
    deck.push(got.item);
  }
  return { state: s, deck };
}

export function rollCall(state: number): { state: number; call: StatId[] } {
  const stats: StatId[] = ["sila", "odolnost", "rychlost", "charizma"];
  const a = pick(state, stats);
  const again = roll(a.state);
  if (again.n < 0.4) {
    const rest = stats.filter((s) => s !== a.item);
    const b = pick(again.state, rest);
    return { state: b.state, call: [a.item, b.item] };
  }
  return { state: again.state, call: [a.item] };
}

export function rollRare(state: number): { state: number; sym: SymId } {
  const bag = PLAY_SYMS.filter((id) => {
    const r = rarityOf(id);
    return r === "epicky" || r === "legendarny";
  });
  const got = pick(state, bag.length ? bag : PLAY_SYMS);
  return { state: got.state, sym: got.item };
}

export function foeScale(enemy: { id?: string; boss: boolean; elite: boolean; enraged: boolean }): number {
  // Phase 2 is a second swing, so the tempo meter is his only other multiplier.
  if (enemy.id === "blastbeat") return 0.36;
  const base = enemy.boss ? 0.42 : enemy.elite ? 0.52 : 0.58;
  return base * (enemy.enraged ? 1.16 : 1);
}
