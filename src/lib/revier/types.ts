export type SymId =
  | "blocek"
  | "krimp"
  | "stit"
  | "parkvolt"
  | "konektor"
  | "boticka"
  | "data"
  | "exekucia"
  | "restart"
  | "natural"
  | "rj45"
  | "router"
  | "hap"
  | "roof"
  | "arris"
  | "case"
  | "dacia"
  | "meter"
  | "pdf"
  | "tv"
  | "gemr"
  | "gemb"
  | "gemg"
  | "gemy"
  | "gemp"
  | "crown"
  | "chalice"
  | "hour"
  | "ring"
  | "fs"
  | "can1"
  | "can2"
  | "can3"
  | "can4"
  | "canarc"
  | "ulica"
  | "okres"
  | "kraj"
  | "stat"
  | "medzera";

/** How a symbol bends the basic numbers. Absent means the numbers stand alone. */
export type SymHook = "left" | "right" | "chain" | "copy" | "burst" | "grow" | "double" | "wild";

export type SymMotion = "strike" | "guard" | "sip" | "coin" | "venom" | "stamp" | "burst" | "copy" | "pierce" | "wild";

export type Phase = "draft" | "banner" | "fight" | "shop" | "dead";

export type IntentKind = "hit" | "heavy" | "shield" | "poison" | "steal" | "stun" | "heal" | "pierce" | "double";

export interface Intent {
  kind: IntentKind;
  /** Damage, shield, heal, coins stolen, or poison per tick. */
  amount: number;
  turns?: number;
  label: string;
}

export interface Dot {
  dmg: number;
  left: number;
}

export interface Enemy {
  id: string;
  name: string;
  art: string;
  taunt: string;
  boss: boolean;
  elite: boolean;
  hp: number;
  maxHp: number;
  shield: number;
  dot: Dot | null;
  stunned: boolean;
  pattern: Intent[];
  pi: number;
  intent: Intent;
  /** Landed enemy-reel symbol. Empty kit means the scripted pattern is the whole telegraph. */
  reel: SymId;
  kit: SymId[];
  /** Increments every time the enemy reel lands, so the cabinet can spin. */
  roll: number;
}

export interface Offer {
  sym: SymId;
  price: number;
}

export interface Shop {
  offers: Offer[];
  heals: number;
  rerolled: boolean;
}

export interface Stats {
  turns: number;
  fights: number;
  kills: number;
  crits: number;
  dealt: number;
  taken: number;
  coins: number;
  bestFloor: number;
}

export interface Run {
  rng: number;
  floor: number;
  /** Mob fights still queued before the boss. */
  mobsLeft: number;
  bossPending: boolean;
  /** Elites already beaten on Ranná špička. */
  ranna: number;
  phase: Phase;
  hp: number;
  maxHp: number;
  shield: number;
  coins: number;
  energy: number;
  reels: number;
  deck: SymId[];
  /** Poison on the player. */
  poison: Dot | null;
  /** Rightmost reels locked empty on the next spin. */
  blankReels: number;
  fightTurns: number;
  enemy: Enemy | null;
  shop: Shop | null;
  draft: SymId[];
  picks: SymId[];
  stats: Stats;
  cause: string;
  /** Classic credit paid to enter. Bookkeeping only — never paid back. */
  entry: number;
  /** Times a growing symbol has already fired. */
  growth: Partial<Record<SymId, number>>;
}

export interface LiveSpin {
  strips: SymId[][];
  index: (number | null)[];
  blanks: boolean[];
}

export interface Reroll {
  reel: number;
  from: SymId;
  to: SymId;
}

export interface PlanReel {
  reel: number;
  sym: SymId;
  crit: boolean;
}

export interface Plan {
  lands: SymId[];
  rerolls: Reroll[];
  critSym: SymId | null;
  critMul: number;
  reels: PlanReel[];
}

export type Fx =
  | { t: "hit"; amount: number; crit: boolean; pierce: boolean; blocked: number; bonus: number }
  | { t: "shield"; amount: number; crit: boolean }
  | { t: "heal"; amount: number; crit: boolean }
  | { t: "coin"; amount: number; crit: boolean }
  | { t: "dot"; amount: number; turns: number; immediate: number; crit: boolean }
  | { t: "stun"; crit: boolean; slap: number }
  | { t: "self"; amount: number }
  | { t: "blank" }
  | { t: "fizzle" };

export interface Beat {
  t: "hit" | "block" | "poison" | "steal" | "stun" | "heal" | "whiff" | "dot" | "dead";
  amount: number;
  blocked: number;
  text: string;
}

/** Lifetime night-shift record stored on the classic save. No credit, no RP. */
export interface NocnaRecord {
  runs: number;
  bestFloor: number;
  bestKills: number;
}
