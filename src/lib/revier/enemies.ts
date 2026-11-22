import { pick } from "./rng.ts";
import { ENEMY_SHIELD_CAP } from "./symbols.ts";
import type { Enemy, Intent } from "./types.ts";

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
    hp: 155,
    pattern: (s) => [hit(s(11)), hit(s(12)), hit(s(24), true)],
  },
  ozran: {
    id: "ozran",
    name: "Ožran z mriežky",
    art: "/nocna/enemies/enemy-ozran.webp",
    taunt: "Dýchanie je u nás spoplatnené.",
    boss: false,
    elite: false,
    hp: 136,
    pattern: (s) => [poison(s(6), 3), hit(s(14)), hit(s(15))],
  },
  inkasak: {
    id: "inkasak",
    name: "Inkasák",
    art: "/nocna/enemies/enemy-inkasak.webp",
    taunt: "Dlžíš. Ja som splátkový kalendár.",
    boss: false,
    elite: false,
    hp: 170,
    pattern: (s) => [hit(s(16)), shield(s(18)), hit(s(20))],
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
    hp: 480,
    pattern: (s) => [hit(s(20)), poison(s(8), 3), shield(s(24)), hit(s(22))],
  },
  anjel: {
    id: "anjel",
    name: "Anjel exekúcie",
    art: "/nocna/bosses/boss-3-anjel-exekucie.webp",
    taunt: "Štít som ti neuznal.",
    boss: true,
    elite: false,
    hp: 640,
    pattern: (s) => [pierce(s(26)), hit(s(20)), hit(s(34), true)],
  },
  general: {
    id: "general",
    name: "Generál podateľne",
    art: "/nocna/bosses/boss-4-general-podatelne.webp",
    taunt: "Podaj to. A potom podaj seba.",
    boss: true,
    elite: false,
    hp: 820,
    pattern: (s) => [hit(s(22)), shield(s(32)), stun(s(14)), hit(s(34), true)],
  },
  prednosta: {
    id: "prednosta",
    name: "Prednosta",
    art: "/nocna/bosses/boss-5-prednosta.webp",
    taunt: "Smena končí, keď poviem.",
    boss: true,
    elite: false,
    hp: 980,
    pattern: (s) => [hit(s(24)), hit(s(40), true), heal(s(36)), pierce(s(30))],
  },
  krovinorez: {
    id: "krovinorez",
    name: "Krovinorez",
    art: "/nocna/enemies/elite-krovinorez.webp",
    taunt: "Kríky sú vybavené. Ty nie.",
    boss: false,
    elite: true,
    hp: 280,
    pattern: (s) => [hit(s(18), true), poison(s(7), 3), hit(s(16))],
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
  };
  return { rng, enemy };
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
