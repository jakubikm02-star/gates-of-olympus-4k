import { buildDeck, foeScale, rowMul } from "./depth.ts";
import { pick } from "./rng.ts";
import { ENEMY_SHIELD_CAP, symDef } from "./symbols.ts";
import type { Enemy, Intent, StatId, SymId } from "./types.ts";

type Scaler = (base: number) => number;

function hit(n: number, heavy = false): Intent {
  const amount = Math.max(1, Math.round(n));
  return { kind: heavy ? "heavy" : "hit", amount, label: heavy ? `Ťažký úder ${amount}` : `Úder ${amount}` };
}
function shield(n: number): Intent {
  const amount = Math.max(1, Math.round(n));
  return { kind: "shield", amount, label: `Štít ${amount}` };
}
function poison(dmg: number, turns = 3): Intent {
  const amount = Math.max(1, Math.round(dmg));
  return { kind: "poison", amount, turns, label: `Jed ${amount} × ${turns}` };
}
function steal(coins: number, dmg: number): Intent {
  return { kind: "steal", amount: Math.max(1, Math.round(dmg)), turns: Math.max(1, Math.round(coins)), label: `Krádež ${Math.max(1, Math.round(coins))}` };
}
function stun(dmg: number): Intent {
  const amount = Math.max(1, Math.round(dmg));
  return { kind: "stun", amount, label: `Pečiatka ${amount}` };
}
function heal(n: number): Intent {
  const amount = Math.max(1, Math.round(n));
  return { kind: "heal", amount, label: `Liečenie ${amount}` };
}
function pierce(n: number): Intent {
  const amount = Math.max(1, Math.round(n));
  return { kind: "pierce", amount, label: `Exekúcia ${amount}` };
}
function double(n: number): Intent {
  const amount = Math.max(1, Math.round(n));
  return { kind: "double", amount, label: `Dvojitý úder ${amount}` };
}

interface Foe {
  id: string;
  name: string;
  art: string;
  taunt: string;
  boss: boolean;
  elite: boolean;
  hp: number;
  pattern: (s: Scaler) => Intent[];
}

const FOES: Record<string, Foe> = {
  neplatic: {
    id: "neplatic",
    name: "Neplatič",
    art: "/nocna/enemies/enemy-neplatic.webp",
    taunt: "Nemám drobné. Mám čas.",
    boss: false,
    elite: false,
    hp: 140,
    pattern: (s) => [hit(s(14)), hit(s(15)), hit(s(22), true)],
  },
  pokutomat: {
    id: "pokutomat",
    name: "Pokutomat",
    art: "/nocna/enemies/enemy-pokutomat.webp",
    taunt: "Lístok je vytlačený. Diskusia nie.",
    boss: false,
    elite: false,
    hp: 150,
    pattern: (s) => [hit(s(10)), hit(s(11)), hit(s(20), true)],
  },
  ozran: {
    id: "ozran",
    name: "Ožran z mriežky",
    art: "/nocna/enemies/enemy-ozran.webp",
    taunt: "Dýchanie je u nás spoplatnené.",
    boss: false,
    elite: false,
    hp: 136,
    pattern: (s) => [poison(s(5), 2), hit(s(14)), hit(s(14))],
  },
  inkasak: {
    id: "inkasak",
    name: "Inkasák",
    art: "/nocna/enemies/enemy-inkasak.webp",
    taunt: "Dlžíš. Ja som splátkový kalendár.",
    boss: false,
    elite: false,
    hp: 142,
    pattern: (s) => [hit(s(14)), shield(s(16)), hit(s(17))],
  },
  zlodej: {
    id: "zlodej",
    name: "Zlodej paragónov",
    art: "/nocna/enemies/enemy-zlodej-paragonov.webp",
    taunt: "Paragón si nenecháš. Ani drobné.",
    boss: false,
    elite: false,
    hp: 148,
    pattern: (s) => [hit(s(13)), steal(2, s(10)), hit(s(17))],
  },
  uradnicka: {
    id: "uradnicka",
    name: "Úradníčka za prepážkou",
    art: "/nocna/enemies/enemy-uradnicka.webp",
    taunt: "Číslo máte. Kávu nie.",
    boss: false,
    elite: false,
    hp: 160,
    pattern: (s) => [hit(s(13)), stun(s(10)), heal(s(16))],
  },
  kurier: {
    id: "kurier",
    name: "Pekelný kuriér",
    art: "/nocna/bosses/boss-1-pekelny-kurier.webp",
    taunt: "Balík je tvoj. Podpis krvou.",
    boss: true,
    elite: false,
    hp: 340,
    pattern: (s) => [hit(s(18)), hit(s(30), true), shield(s(20))],
  },
  demon: {
    id: "demon",
    name: "Démon žiariviek",
    art: "/nocna/bosses/boss-2-demon-ziariviek.webp",
    taunt: "Svetlo tu stojí viac ako ty.",
    boss: true,
    elite: false,
    hp: 380,
    pattern: (s) => [hit(s(20)), poison(s(6), 2), shield(s(24)), hit(s(20))],
  },
  anjel: {
    id: "anjel",
    name: "Anjel exekúcie",
    art: "/nocna/bosses/boss-3-anjel-exekucie.webp",
    taunt: "Štít som ti neuznal.",
    boss: true,
    elite: false,
    hp: 460,
    pattern: (s) => [pierce(s(18)), hit(s(16)), hit(s(26), true)],
  },
  general: {
    id: "general",
    name: "Generál podateľne",
    art: "/nocna/bosses/boss-4-general-podatelne.webp",
    taunt: "Podaj to. A potom podaj seba.",
    boss: true,
    elite: false,
    hp: 800,
    pattern: (s) => [hit(s(21)), shield(s(30)), stun(s(13)), hit(s(32), true)],
  },
  prednosta: {
    id: "prednosta",
    name: "Prednosta",
    art: "/nocna/bosses/boss-5-prednosta.webp",
    taunt: "Smena končí, keď poviem.",
    boss: true,
    elite: false,
    hp: 960,
    pattern: (s) => [hit(s(22)), hit(s(38), true), heal(s(32)), pierce(s(28))],
  },
  krovinorez: {
    id: "krovinorez",
    name: "Krovinorez",
    art: "/nocna/enemies/elite-krovinorez.webp",
    taunt: "Kríky sú vybavené. Ty nie.",
    boss: false,
    elite: true,
    hp: 280,
    pattern: (s) => [hit(s(18), true), poison(s(5), 2), hit(s(16))],
  },
  motorka: {
    id: "motorka",
    name: "Motorka smrti",
    art: "/nocna/enemies/elite-motorka-smrti.webp",
    taunt: "Dve svetlá. Dva údery. Žiadna brzda.",
    boss: false,
    elite: true,
    hp: 250,
    pattern: (s) => [double(s(12)), hit(s(16)), double(s(14))],
  },
  myto: {
    id: "myto",
    name: "Výberča mýta",
    art: "/nocna/enemies/elite-vyberca-myta.webp",
    taunt: "Mýto sa nevracia. Ani ty.",
    boss: false,
    elite: true,
    hp: 300,
    pattern: (s) => [steal(3, s(12)), shield(s(24)), hit(s(20))],
  },
};

const MOBS: Record<number, string[]> = {
  1: ["neplatic", "pokutomat", "ozran"],
  2: ["inkasak", "zlodej", "uradnicka", "neplatic"],
  3: ["uradnicka", "inkasak", "pokutomat", "zlodej"],
  4: ["uradnicka", "ozran", "inkasak", "zlodej"],
  5: ["uradnicka", "inkasak", "pokutomat", "ozran", "zlodej", "neplatic"],
};

const BOSSES = ["kurier", "demon", "anjel", "general", "prednosta"] as const;
const ELITES = ["krovinorez", "motorka", "myto"] as const;

export function hpScale(floor: number): number {
  if (floor <= 1) return 1;
  if (floor === 2) return 1.4;
  if (floor === 3) return 1.85;
  if (floor === 4) return 2.35;
  return 2.9;
}

export function dmgScale(floor: number): number {
  if (floor <= 1) return 1;
  if (floor === 2) return 1.22;
  if (floor === 3) return 1.42;
  if (floor === 4) return 1.62;
  return 1.84;
}

function build(id: string, floor: number, ranna: number, rng: number): { rng: number; enemy: Enemy } {
  const def = FOES[id] ?? FOES.neplatic!;
  let ds = 1;
  let hp = def.hp;
  if (def.elite) {
    const depth = Math.max(0, ranna - 1);
    ds = 1 + depth * 0.1;
    hp = Math.round(def.hp * (1 + depth * 0.18));
  } else if (!def.boss) {
    ds = dmgScale(floor);
    hp = Math.round(def.hp * hpScale(floor));
  }
  const scale: Scaler = (base) => Math.max(1, Math.round(base * ds));
  const pattern = def.pattern(scale);
  const enemy: Enemy = {
    id: def.id,
    name: def.name,
    art: def.art,
    taunt: def.taunt,
    boss: def.boss,
    elite: def.elite,
    hp,
    maxHp: hp,
    shield: 0,
    dot: null,
    stunned: false,
    pattern,
    pi: 0,
    intent: pattern[0]!,
    reel: "blocek",
    kit: KITS[def.id] ?? [],
    deck: [],
    lands: [],
    windows: def.boss ? 4 : 3,
    roll: 0,
    enraged: false,
    charge: null,
  };
  return openReel({ ...enemy }, rng, floor);
}

const KITS: Record<string, SymId[]> = {
  neplatic: ["dacia", "rj45", "gemr", "roof"],
  pokutomat: ["meter", "gemr", "dacia", "fs"],
  ozran: ["gemr", "dacia", "rj45", "gemp"],
  inkasak: ["fs", "gemr", "dacia", "roof"],
  zlodej: ["dacia", "gemr", "roof", "case"],
  uradnicka: ["gemr", "dacia", "roof", "fs"],
  kurier: ["dacia", "gemr", "can3", "crown"],
  demon: ["gemr", "dacia", "can3", "gemp"],
  anjel: ["gemr", "dacia", "fs", "krimp"],
  general: ["krimp", "fs", "dacia", "arris"],
  prednosta: ["pdf", "fs", "krimp", "stat"],
  krovinorez: ["dacia", "gemr", "can2", "gemp"],
  motorka: ["dacia", "crown", "gemr", "can4"],
  myto: ["fs", "dacia", "case", "gemr"],
};

export interface FoePart {
  dmg: number;
  pierce: boolean;
  shield: number;
  heal: number;
  coins: number;
  dot: number;
  stun: boolean;
}

/** One window of the shared symbol, scaled so three of them feel like the old single swing. */
export function foePart(lands: readonly SymId[], index: number, enemy: Enemy, call: readonly StatId[]): FoePart {
  const empty: FoePart = { dmg: 0, pierce: false, shield: 0, heal: 0, coins: 0, dot: 0, stun: false };
  const sym = lands[index];
  const def = sym ? symDef(sym) : null;
  if (!sym || !def) return empty;
  const scale = foeScale(enemy) * rowMul(lands, index, call);
  let dmg = def.dmg;
  if (def.hook === "left") dmg = index === 0 ? def.dmg + 8 : def.dmg;
  if (def.hook === "right") dmg = index === lands.length - 1 ? def.dmg * 2 : def.dmg;
  if (def.hook === "chain") dmg = lands.filter((id) => id === sym).length >= 2 ? Math.max(def.dmg, 14) : def.dmg;
  if (def.hook === "copy" && index > 0) {
    const left = symDef(lands[index - 1] ?? "medzera");
    dmg = left && left.dmg > 0 ? left.dmg : def.dmg;
  }
  if (def.hook === "double" && index > 0) {
    const left = symDef(lands[index - 1] ?? "medzera");
    if (left && left.dmg > 0) dmg += left.dmg;
  }
  return {
    dmg: dmg > 0 ? Math.max(1, Math.round(dmg * scale)) : 0,
    pierce: def.pierce,
    shield: def.shield > 0 ? Math.max(1, Math.round(def.shield * scale)) : 0,
    heal: def.heal > 0 ? Math.max(1, Math.round(def.heal * scale)) : 0,
    coins: def.coins > 0 ? 1 : 0,
    dot: def.dot > 0 ? Math.max(1, Math.round(def.dot * foeScale(enemy) * 0.45)) : 0,
    stun: def.stun,
  };
}

function intentFromLands(lands: readonly SymId[], enemy: Enemy): Intent {
  let dmg = 0;
  let shield = 0;
  let pierce = false;
  let poison = 0;
  for (let i = 0; i < lands.length; i++) {
    const part = foePart(lands, i, enemy, []);
    dmg += part.dmg;
    shield += part.shield;
    poison += part.dot;
    if (part.pierce && part.dmg > 0) pierce = true;
  }
  if (shield > dmg && shield >= poison) return { kind: "shield", amount: Math.max(1, shield), label: `Štít ${shield}` };
  if (poison > dmg && poison > 0) return { kind: "poison", amount: Math.min(8, poison), turns: 2, label: `Jed ${Math.min(8, poison)}` };
  const amount = Math.max(1, dmg);
  return { kind: pierce ? "pierce" : "hit", amount, label: pierce ? `Cez štít ${amount}` : `Úder ${amount}` };
}

/** Spin the enemy row from the shared pool and leave it sitting as the telegraph. */
export function openReel(enemy: Enemy, rng: number, floor = 1): { rng: number; enemy: Enemy } {
  if (!enemy.deck.length && !enemy.kit.length && enemy.id === "fixture") return { rng, enemy };
  if (!enemy.deck.length && enemy.kit.length === 0 && !enemy.boss && !enemy.elite && enemy.windows === 0) return { rng, enemy };
  let state = rng;
  let deck = enemy.deck;
  if (!deck.length) {
    const built = buildDeck(state, enemy.id, enemy.boss ? 12 : 10);
    state = built.state;
    deck = built.deck.length ? built.deck : enemy.kit;
  }
  if (!deck.length) return { rng, enemy };
  const n = enemy.windows > 0 ? enemy.windows : enemy.boss ? 4 : 3;
  const lands: SymId[] = [];
  for (let i = 0; i < n; i++) {
    const got = pick(state, deck);
    state = got.state;
    lands.push(got.item);
  }
  const step = enemy.pattern[enemy.pi];
  const heavy = step && (step.kind === "heavy" || step.kind === "pierce") && step.amount >= 16;
  const preview = intentFromLands(lands, enemy);
  const charge = heavy
    ? {
        left: enemy.boss ? 3 : 2,
        amount: Math.max(step!.amount, Math.round(preview.amount * 1.25)),
        pierce: step!.kind === "pierce",
      }
    : null;
  const intent: Intent = charge
    ? { kind: "heavy", amount: charge.amount, label: `NABÍJA ${charge.left}` }
    : preview;
  void floor;
  return {
    rng: state,
    enemy: {
      ...enemy,
      deck,
      lands,
      windows: n,
      reel: lands[0] ?? "blocek",
      roll: enemy.roll + 1,
      intent,
      charge,
    },
  };
}

export function spawnFoe(
  kind: "mob" | "boss" | "elite",
  floor: number,
  ranna: number,
  rng: number,
): { rng: number; enemy: Enemy } {
  if (kind === "boss") {
    const id = BOSSES[Math.min(BOSSES.length - 1, Math.max(0, floor - 1))]!;
    return build(id, floor, ranna, rng);
  }
  if (kind === "elite") {
    const drawn = pick(rng, ELITES);
    return build(drawn.item, floor, ranna, drawn.state);
  }
  const pool = MOBS[Math.min(5, Math.max(1, floor))] ?? MOBS[1]!;
  const drawn = pick(rng, pool);
  return build(drawn.item, floor, ranna, drawn.state);
}

export function advanceIntent(enemy: Enemy): Enemy {
  const pi = (enemy.pi + 1) % enemy.pattern.length;
  return { ...enemy, pi, intent: enemy.pattern[pi]! };
}

export function capEnemyShield(n: number): number {
  return Math.max(0, Math.min(ENEMY_SHIELD_CAP, Math.round(n)));
}
