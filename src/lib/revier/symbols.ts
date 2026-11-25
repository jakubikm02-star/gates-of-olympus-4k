import { FAMILY_NAME, RARITY_NAME, STAT_NAME, metaOf } from "./depth.ts";
import type { SymHook, SymId, SymMotion } from "./types.ts";

/** Opening draft. Order is the contract the seeded tests shuffle. */
export const CORE_SYMS = [
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

/** Classic Parkizmus art, each with its own night-shift job. Shop and enemy reels. */
export const EXTRA_SYMS = [
  "rj45",
  "router",
  "hap",
  "roof",
  "arris",
  "case",
  "dacia",
  "meter",
  "pdf",
  "tv",
  "gemr",
  "gemb",
  "gemg",
  "gemy",
  "gemp",
  "crown",
  "chalice",
  "hour",
  "ring",
  "fs",
  "can1",
  "can2",
  "can3",
  "can4",
  "canarc",
  "ulica",
  "okres",
  "kraj",
  "stat",
  "syntik",
] as const satisfies readonly SymId[];

export const PLAY_SYMS = [...CORE_SYMS, ...EXTRA_SYMS] as const satisfies readonly SymId[];

export const STRIP = 16;
export const SHIELD_CAP = 48;
export const ENEMY_SHIELD_CAP = 90;
export const ENERGY_AT = 3;
export const ENERGY_BONUS = 8;
export const DOT_CAP = 18;
export const POISON_CAP = 8;
export const MIN_DECK = 3;
export const HEAL_PRICE = 5;
export const HEAL_GAIN = 10;
export const HEAL_STOCK = 2;
export const REROLL_PRICE = 5;
export const REMOVE_PRICE = 10;
export const REEL_PRICE = 15;
export const REEL5_PRICE = 28;
export const SUPPORT_PRICE = 7;
export const EQUIP_PRICE = 9;
export const UPGRADE_PRICE = 8;
export const HOLD_PRICE = 2;
export const START_HP = 205;
export const START_REELS = 3;

export function rerollCost(rolls: number): number {
  return REROLL_PRICE + Math.max(0, rolls) * 3;
}

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
  hook?: SymHook;
  motion?: SymMotion;
  aim?: "foe" | "you" | "coin";
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
  },
  krimp: {
    id: "krimp",
    name: "Krimpovačka",
    blurb: "Silný úder. Berie viac ako bloček.",
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
  },
  rj45: s("rj45", "Hrdzavý RJ45", "Úder 8, ale 18 keď sedí na ľavom valci.", "/symbols/rj45.png", 7, 6, { dmg: 8, hook: "left", motion: "strike" }),
  router: s("router", "Wi-Fi router", "Zopakuje úder suseda vľavo. Sám dá 6, keď je prvý.", "/symbols/router.png", 9, 5, { dmg: 6, hook: "copy", motion: "copy" }),
  hap: s("hap", "hAP ac²", "Sám dá 6. Dva a viac v rade dajú každý 16.", "/symbols/hap.png", 8, 6, { dmg: 6, hook: "chain", motion: "strike" }),
  roof: s("roof", "Krytina", "Štít 14. Drží, kým ho nerozbijú.", "/symbols/roof.png", 8, 6, { shield: 14, motion: "guard", aim: "you" }),
  arris: s("arris", "Set-top box", "Omráči ďalší úder. Druhý v rade ho len kopne.", "/symbols/arris.png", 10, 4, { stun: true, motion: "stamp" }),
  case: s("case", "Kufrík", "Dve mince do tácky.", "/symbols/case.png", 7, 6, { coins: 2, motion: "coin", aim: "coin" }),
  dacia: s("dacia", "Dacia Jogger", "Nájazd za 18.", "/symbols/dacia.png", 11, 5, { dmg: 18, motion: "strike" }),
  meter: s("meter", "OLP-87", "Úder 9, na pravom valci 18.", "/symbols/meter.png", 10, 4, { dmg: 9, hook: "right", motion: "strike" }),
  pdf: s("pdf", "PDF 4K 5G", "Zmaže sa z balíka a tresne 32.", "/symbols/pdf.png", 13, 3, { dmg: 32, hook: "burst", motion: "burst" }),
  tv: s("tv", "4KA TV", "Divoká. Počíta sa k najčastejšiemu symbolu a dá 8.", "/symbols/tv4ka.png", 12, 3, { dmg: 8, hook: "wild", motion: "wild" }),
  gemr: s("gemr", "Červený kameň", "Úder 12.", "/symbols/gem-red.png", 7, 7, { dmg: 12, motion: "strike" }),
  gemb: s("gemb", "Modrý kameň", "Štít 11.", "/symbols/gem-blue.png", 7, 6, { shield: 11, motion: "guard", aim: "you" }),
  gemg: s("gemg", "Zelený kameň", "Naleje 8 života.", "/symbols/gem-green.png", 8, 5, { heal: 8, motion: "sip", aim: "you" }),
  gemy: s("gemy", "Žltý kameň", "Minca a malý úder 4.", "/symbols/gem-yellow.png", 8, 5, { coins: 1, dmg: 4, motion: "coin", aim: "coin" }),
  gemp: s("gemp", "Fialový kameň", "Jed 4 na 3 ťahy.", "/symbols/gem-purple.png", 9, 5, { dot: 4, dotTurns: 3, motion: "venom" }),
  crown: s("crown", "Koruna", "Tento úder 14 je vždy kritický.", "/symbols/crown.png", 14, 3, { dmg: 14, motion: "burst" }),
  chalice: s("chalice", "Kalich", "Naleje 14 života.", "/symbols/chalice.png", 11, 4, { heal: 14, motion: "sip", aim: "you" }),
  hour: s("hour", "Presýpacie hodiny", "Úder 5 a pri každom ďalšom použití +3.", "/symbols/hourglass.png", 9, 4, { dmg: 5, hook: "grow", motion: "strike" }),
  ring: s("ring", "Prsteň", "Zopakuje úder suseda vľavo ešte raz.", "/symbols/ring.png", 12, 3, { dmg: 0, hook: "double", motion: "copy" }),
  fs: s("fs", "Finančná správa", "14 cez štít.", "/symbols/fs.png", 12, 4, { dmg: 14, pierce: true, motion: "pierce" }),
  can1: s("can1", "Plechovka I", "Zmaže sa a dá 10.", "/spektrum/can-green.webp", 6, 5, { dmg: 10, hook: "burst", motion: "burst" }),
  can2: s("can2", "Plechovka II", "Zmaže sa a dá 16.", "/spektrum/can-blue.webp", 8, 4, { dmg: 16, hook: "burst", motion: "burst" }),
  can3: s("can3", "Plechovka III", "Zmaže sa a dá 24.", "/spektrum/can-violet.webp", 11, 3, { dmg: 24, hook: "burst", motion: "burst" }),
  can4: s("can4", "Plechovka IV", "Zmaže sa a dá 34.", "/spektrum/can-yellow.webp", 14, 2, { dmg: 34, hook: "burst", motion: "burst" }),
  canarc: s("canarc", "Oblúková plechovka", "Štít 8 a úder 8.", "/spektrum/can-orange.webp", 10, 4, { shield: 8, dmg: 8, motion: "guard", aim: "you" }),
  ulica: s("ulica", "1-FTTB", "Úder 6, na ľavom valci 16.", "/symbols/fttb-ulica.png", 7, 5, { dmg: 6, hook: "left", motion: "strike" }),
  okres: s("okres", "2-FTTB", "Štít 10.", "/symbols/fttb-okres.png", 8, 5, { shield: 10, motion: "guard", aim: "you" }),
  kraj: s("kraj", "3-FTTB", "Jed 5 na 3 ťahy.", "/symbols/fttb-kraj.png", 9, 4, { dot: 5, dotTurns: 3, motion: "venom" }),
  stat: s("stat", "4-FTTB", "Úder 10, na pravom valci 20 cez štít.", "/symbols/fttb-stat.png", 12, 3, { dmg: 10, hook: "right", pierce: true, motion: "pierce" }),
  pokuta: s("pokuta", "Pokuta", "Vnútený lístok. Keď padne, stratíš 6 HP a dáš úder 4.", "/symbols/listok-ulica.svg", 0, 0, {
    dmg: 4,
    self: 6,
    motion: "stamp",
  }),
  syntik: s("syntik", "Syntík", "Úder 8. Sused z rovnakej rodiny dostane +8.", "/nocna/symbols/sym-syntik.webp", 11, 6, {
    dmg: 8,
    motion: "strike",
  }),
  cymbal: s("cymbal", "Činel", "Úder 11. Patrí kapele.", "/nocna/symbols/sym-cymbal.webp", 0, 0, { dmg: 11, motion: "strike" }),
  ventilator: s("ventilator", "Ventilátor", "Úder 5. Vietor ide bokom.", "/nocna/symbols/sym-ventilator.webp", 0, 0, { dmg: 5, motion: "strike" }),
};

function s(
  id: SymId,
  name: string,
  blurb: string,
  art: string,
  price: number,
  weight: number,
  extra: Partial<SymDef>,
): SymDef {
  return {
    id,
    name,
    blurb,
    art,
    price,
    weight,
    dmg: 0,
    shield: 0,
    heal: 0,
    coins: 0,
    self: 0,
    dot: 0,
    dotTurns: 0,
    pierce: false,
    stun: false,
    ...extra,
  };
}

export function symDef(id: SymId): SymDef | null {
  if (id === "medzera") return null;
  return SYM[id];
}

/** One short line on the card. Detail is the tap-bubble, one or two sentences. */
export function symMark(id: SymId, mul = 1): { chip: string; detail: string } | null {
  const def = symDef(id);
  if (!def) return null;
  const n = (v: number) => Math.max(0, Math.round(v * mul));
  let chip = "·";
  if (def.dmg > 0 && def.self > 0) chip = `⚔${n(def.dmg)} ❤−${def.self}`;
  else if (def.dmg > 0) chip = `⚔${n(def.dmg)}`;
  else if (def.shield > 0) chip = `🛡${n(def.shield)}`;
  else if (def.heal > 0) chip = `❤+${n(def.heal)}`;
  else if (def.coins > 0) chip = `🪙${n(def.coins)}`;
  else if (def.stun) chip = "✦";
  else if (id === "restart") chip = "↻";
  if (def.dot > 0) chip = `${chip} ◉${n(def.dot)}`;
  const meta = metaOf(id);
  const extra = meta
    ? ` ${FAMILY_NAME[meta.family]}, ${RARITY_NAME[meta.rarity]}. Volá sa ${STAT_NAME[meta.stat]}.`
    : "";
  return { chip, detail: def.blurb + extra };
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
