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
  | "pokuta"
  | "syntik"
  | "cymbal"
  | "ventilator"
  | "medzera";

export type StatId = "sila" | "odolnost" | "rychlost" | "charizma";
export type EquipId = "uder" | "stit";

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
  /** First landed window. The row itself is `lands`. */
  reel: SymId;
  kit: SymId[];
  /** Shared-pool deck. Empty on fixtures, so the scripted pattern stays the test path. */
  deck: SymId[];
  /** Symbols sitting in the enemy's windows. The telegraph is this roll. */
  lands: SymId[];
  windows: number;
  /** Increments every time the enemy reel lands, so the cabinet can spin. */
  roll: number;
  enraged: boolean;
  /** Big hit winding up. `left` is how many enemy turns remain, including the impact. */
  charge: { left: number; amount: number; pierce: boolean } | null;
  /** DJ Blastbeat only. Absent on every other foe. */
  dj?: DjState;
}

export interface DjClone {
  hp: number;
  maxHp: number;
  /** Window this clone has marked. Null when it is only standing there. */
  mark: number | null;
  /** The mark has lasted a turn. The next player spin mutes that window. */
  armed: boolean;
  /** Black shirt. One of the four. */
  black: boolean;
}

export interface DjState {
  bpm: number;
  clones: DjClone[];
  /** Blows a landed symbol one window sideways on the next player spin. */
  fan: { reel: number; dir: -1 | 1 } | null;
  /** -1 hits the boss. Otherwise the clone index. */
  focus: number;
  acts: number;
  /** Telegraph: the next player spin blanks this window. */
  phone: { reel: number; line: string } | null;
}

export interface Offer {
  sym: SymId;
  price: number;
}

export interface Shop {
  offers: Offer[];
  heals: number;
  rerolled: boolean;
  /** How many times this shop was already shuffled. The price climbs. */
  rolls: number;
  /** Face-down draft. One pick, then the row closes. */
  faces: SymId[];
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
  /** Stats the round is calling. Matching symbols hit a little harder. */
  call: StatId[];
  /** 0–100. The player spends it with a tap before the spin. */
  super: number;
  /** Next spin's damage multiplier. 1, or 1.5 after an all-in. */
  wager: number;
  held: number | null;
  heldSym: SymId | null;
  /** Shops in a row with only ordinary offers. */
  pity: number;
  /** Win streak inside the run. Caps at 3. */
  momentum: number;
  lastLands: SymId[];
  /** Kľúče od auta: bonus damage still in the glovebox. */
  keys: number;
  /** Pečiatka úradu: the next enemy swing is stunned. */
  stamp: boolean;
  equip: EquipId[];
  /** Run-scoped level, 0–3, from training or the upgrade service. */
  levels: Partial<Record<SymId, number>>;
  /** Damage dealt by the spin that just sealed. Phase 2 listens for a whiff. */
  spinDealt: number;
  /** Spares fed in, 0–3. Each one is a flat bump. */
  fortify: Partial<Record<SymId, number>>;
  /** Two maxed copies combined. */
  pro: SymId[];
  /** Permanent Dielňa bonuses. Empty on a fresh profile. Not cleared by death. */
  meta?: Partial<Record<SymId, MetaPerk>>;
  trace: RunTrace;
}

export interface MetaPerk {
  dmg: number;
  shield: number;
  proc: number;
  pro: boolean;
}

/** Facts the death screen can quote. Reset every run. */
export interface RunTrace {
  chemGood: number;
  chemBad: number;
  chemRow: number;
  callHits: number;
  callMiss: number;
  allIns: number;
  bosses: number;
}

export function emptyTrace(): RunTrace {
  return { chemGood: 0, chemBad: 0, chemRow: 0, callHits: 0, callMiss: 0, allIns: 0, bosses: 0 };
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
