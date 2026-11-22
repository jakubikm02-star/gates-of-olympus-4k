import type { Grade, SymId } from "./types.ts";

export const PLAY_SYMS = [
  "blocek",
  "krimp",
  "stit",
  "parkvolt",
  "konektor",
  "boticka",
  "data",
  "exekucia",
  "restart",
  "natural",
] as const satisfies readonly SymId[];

export const STRIP = 16;
export const SHIELD_CAP = 48;
export const ENEMY_SHIELD_CAP = 90;
export const ENERGY_AT = 3;
export const ENERGY_BONUS = 8;
export const DOT_CAP = 18;
export const POISON_CAP = 12;
export const MIN_DECK = 3;
export const HEAL_PRICE = 5;
export const HEAL_GAIN = 10;
export const HEAL_STOCK = 2;
export const REROLL_PRICE = 5;
export const REMOVE_PRICE = 10;
export const REEL_PRICE = 15;
export const START_HP = 100;
export const START_REELS = 3;

export interface SymDef {
  id: SymId;
  name: string;
  blurb: string;
  art: string;
  price: number;
  weight: number;
  dmg: number;
  shield: number;
  heal: number;
  coins: number;
  self: number;
  dot: number;
  dotTurns: number;
  pierce: boolean;
  stun: boolean;
  skill: "bar" | "dial" | null;
}

export const SYM: Record<Exclude<SymId, "medzera">, SymDef> = {
  blocek: {
    id: "blocek",
    name: "Bloček",
    blurb: "Základný úder. 15.",
    art: "/nocna/symbols/sym-blocek.webp",
    price: 6,
    weight: 14,
    dmg: 15,
    shield: 0,
    heal: 0,
    coins: 0,
    self: 0,
    dot: 0,
    dotTurns: 0,
    pierce: false,
    stun: false,
    skill: null,
  },
  krimp: {
    id: "krimp",
    name: "Krimpovačka",
    blurb: "Silný úder. Pomalé časovanie.",
    art: "/nocna/symbols/sym-krimpovacka.webp",
    price: 12,
    weight: 7,
    dmg: 26,
    shield: 0,
    heal: 0,
    coins: 0,
    self: 0,
    dot: 0,
    dotTurns: 0,
    pierce: false,
    stun: false,
    skill: "bar",
  },
  stit: {
    id: "stit",
    name: "Dvere-štít",
    blurb: "Štít 20. Drží, kým ho nerozbijú.",
    art: "/nocna/symbols/sym-dvere-stit.webp",
    price: 8,
    weight: 10,
    dmg: 0,
    shield: 20,
    heal: 0,
    coins: 0,
    self: 0,
    dot: 0,
    dotTurns: 0,
    pierce: false,
    stun: false,
    skill: null,
  },
  parkvolt: {
    id: "parkvolt",
    name: "PARKVOLT 400 NITRO",
    blurb: "Naleje ti 12 života.",
    art: "/nocna/symbols/sym-parkvolt-400.webp",
    price: 10,
    weight: 8,
    dmg: 0,
    shield: 0,
    heal: 12,
    coins: 0,
    self: 0,
    dot: 0,
    dotTurns: 0,
    pierce: false,
    stun: false,
    skill: null,
  },
  konektor: {
    id: "konektor",
    name: "Zlatý konektor",
    blurb: "Jedna minca do kšefty.",
    art: "/nocna/symbols/sym-zlaty-konektor.webp",
    price: 7,
    weight: 9,
    dmg: 0,
    shield: 0,
    heal: 0,
    coins: 1,
    self: 0,
    dot: 0,
    dotTurns: 0,
    pierce: false,
    stun: false,
    skill: null,
  },
  boticka: {
    id: "boticka",
    name: "Botička",
    blurb: "Kopne a nechá jed na 3 ťahy.",
    art: "/nocna/symbols/sym-boticka.webp",
    price: 9,
    weight: 8,
    dmg: 6,
    shield: 0,
    heal: 0,
    coins: 0,
    self: 0,
    dot: 4,
    dotTurns: 3,
    pierce: false,
    stun: false,
    skill: null,
  },
  data: {
    id: "data",
    name: "DATA 0 kB",
    blurb: "Omráči ďalší úder nepriateľa.",
    art: "/nocna/symbols/sym-data-stun.webp",
    price: 11,
    weight: 6,
    dmg: 0,
    shield: 0,
    heal: 0,
    coins: 0,
    self: 0,
    dot: 0,
    dotTurns: 0,
    pierce: false,
    stun: true,
    skill: null,
  },
  exekucia: {
    id: "exekucia",
    name: "Exekúcia",
    blurb: "22 cez štít. Ciferník.",
    art: "/nocna/symbols/sym-exekucia.webp",
    price: 14,
    weight: 5,
    dmg: 22,
    shield: 0,
    heal: 0,
    coins: 0,
    self: 0,
    dot: 0,
    dotTurns: 0,
    pierce: true,
    stun: false,
    skill: "dial",
  },
  restart: {
    id: "restart",
    name: "Restart",
    blurb: "Pretočí ten valec ešte raz.",
    art: "/nocna/symbols/sym-restart.webp",
    price: 12,
    weight: 5,
    dmg: 0,
    shield: 0,
    heal: 0,
    coins: 0,
    self: 0,
    dot: 0,
    dotTurns: 0,
    pierce: false,
    stun: false,
    skill: null,
  },
  natural: {
    id: "natural",
    name: "95 natural",
    blurb: "Veľká rana. Stojí ťa 8 HP.",
    art: "/nocna/symbols/sym-95-natural.webp",
    price: 15,
    weight: 4,
    dmg: 34,
    shield: 0,
    heal: 0,
    coins: 0,
    self: 8,
    dot: 0,
    dotTurns: 0,
    pierce: false,
    stun: false,
    skill: "bar",
  },
};

export function symDef(id: SymId): SymDef | null {
  if (id === "medzera") return null;
  return SYM[id];
}

export function skillMul(grade: Grade): number {
  if (grade === "perfect") return 1.25;
  if (grade === "miss") return 0.5;
  return 1;
}

export function critMul(count: number): number {
  if (count >= 4) return 3;
  if (count >= 3) return 2;
  return 1;
}

export const FLOORS: readonly { id: number; name: string; line: string; bg: string }[] = [
  { id: 1, name: "Parkovisko", line: "Prvé miesto, kde ťa nájdu.", bg: "bg-1-parkovisko" },
  { id: 2, name: "Podzemná garáž", line: "Signál tu zomiera skôr ako ty.", bg: "bg-2-podzemna-garaz" },
  { id: 3, name: "Odťahový dvor", line: "Háky, bločky, žiadne vysvetľovanie.", bg: "bg-3-odtahovy-dvor" },
  { id: 4, name: "Mestský úrad", line: "Pečiatka bolí viac ako päsť.", bg: "bg-4-mestsky-urad" },
  { id: 5, name: "Kabinet prednostu", line: "Posledné dvere pred rannou.", bg: "bg-5-kabinet-prednostu" },
  { id: 6, name: "Ranná špička", line: "Koniec smeny. Začiatok frontu.", bg: "bg-6-ranna-spicka" },
];

export type BgKind = "port" | "land" | "fold-port" | "fold-land";

export function aspectKind(w: number, h: number): BgKind {
  const r = w / Math.max(1, h);
  if (r >= 1.45) return "land";
  if (r >= 1.05) return "fold-land";
  if (r >= 0.8) return "fold-port";
  return "port";
}

export function floorInfo(floor: number) {
  return FLOORS[Math.min(FLOORS.length, Math.max(1, floor)) - 1]!;
}

export function bgSrc(floor: number, kind: BgKind): string {
  return `/nocna/backgrounds/${floorInfo(floor).bg}-${kind}.webp`;
}

/** Frame width in px. The 3-window art is 1024×650; windows sit in the lower 73 %. */
export function frameWidth(w: number, h: number, kind: BgKind): number {
  const wide = kind === "land" || kind === "fold-land";
  const maxW = wide ? Math.min(w * (kind === "land" ? 0.46 : 0.52), 760) : Math.max(220, w - 16);
  const maxH = kind === "land" ? h * 0.4 : kind === "fold-land" ? h * 0.5 : h * (kind === "fold-port" ? 0.42 : 0.4);
  const frameH = Math.min(maxH, maxW * (650 / 1024));
  return Math.max(220, Math.round(frameH / (650 / 1024)));
}
