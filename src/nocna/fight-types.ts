import type { FeelTarget } from "@/lib/revier/feel";

export interface WinSnap {
  sym: string | null;
  mode: "empty" | "flicker" | "sit";
  crit: boolean;
  token: number;
  chip: string;
}

export interface FightSnap {
  bg: string;
  enemyArt: string | null;
  ehp: number;
  emax: number;
  eshield: number;
  stunned: boolean;
  dot: number;
  hp: number;
  maxHp: number;
  shield: number;
  poison: number;
  windows: WinSnap[];
  /** Enemy's own row. Same symbols, sitting above their life. */
  foeWindows: WinSnap[];
  links: number[];
  reduced: boolean;
  /** Icon + number only, drawn beside the enemy bar. */
  intent: string;
  /** Enemy reel: the symbol they already landed, telegraphed before your spin. */
  foeArt: string | null;
  foeRoll: number;
  charge: number;
  enraged: boolean;
  suspense: boolean;
  danger: boolean;
  call: string;
  super: number;
  shake: number;
  shop: boolean;
  deck: string[];
  phase: string;
  button: string;
  pulse: boolean;
  coins: number;
  floor: number;
  turn: string;
  hint: string;
  active: number | null;
}

export interface Cue {
  reel: number;
  sym: string;
  crit: boolean;
  rewind: boolean;
  chip: string;
  selfChip?: string;
  target: FeelTarget;
  row?: "you" | "foe";
  slow?: boolean;
  proc?: number;
}

export interface FightHandle {
  setSnap(snap: FightSnap): void;
  setHooks(hooks: { onReel: (i: number) => void; onDeck?: (i: number) => void; onPress?: () => void }): void;
  playCue(cue: Cue, onImpact: () => void): Promise<void>;
  playFoe(text: string, kind: "hit" | "block" | "miss" | "heal", at?: "you" | "foe", slow?: boolean): Promise<void>;
  setPace(pace: number): void;
  setEffects(on: boolean): void;
  pump(): void;
  skip(): void;
  destroy(): void;
}
