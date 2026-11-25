import { pick } from "./rng.ts";
import type { DjState, Enemy, Run, SymId } from "./types.ts";

export const DJ_BPM_START = 96;
export const DJ_BPM_CAP = 132;
export const DJ_CLONE_HP = 26;

export function freshDj(): DjState {
  return { bpm: DJ_BPM_START, clones: [], fan: null, focus: -1, acts: 0 };
}

export function bpmScale(enemy: Enemy): number {
  if (enemy.id !== "blastbeat") return 1;
  const bpm = enemy.dj?.bpm ?? DJ_BPM_START;
  return Math.max(0.8, Math.min(1.4, bpm / DJ_BPM_START));
}

/** Player chose a clone. Tapping the same one returns the hit to the boss. */
export function focusClone(run: Run, index: number): Run {
  const enemy = run.enemy;
  if (!enemy?.dj || run.phase !== "fight") return run;
  if (index < 0) {
    if (enemy.dj.focus === -1) return run;
    return { ...run, enemy: { ...enemy, dj: { ...enemy.dj, focus: -1 } } };
  }
  const live = enemy.dj.clones[index];
  if (!live || live.hp <= 0) return run;
  const focus = enemy.dj.focus === index ? -1 : index;
  return { ...run, enemy: { ...enemy, dj: { ...enemy.dj, focus } } };
}

/** Before the spin, a careful player kills a clone that is still only threatening. */
export function aimDj(run: Run): Run {
  const enemy = run.enemy;
  if (!enemy?.dj || run.phase !== "fight") return run;
  const open = enemy.dj.clones
    .map((clone, index) => ({ clone, index }))
    .filter((row) => row.clone.hp > 0 && row.clone.mark != null && !row.clone.armed);
  if (!open.length) {
    if (enemy.dj.focus === -1) return run;
    return { ...run, enemy: { ...enemy, dj: { ...enemy.dj, focus: -1 } } };
  }
  open.sort((a, b) => a.clone.hp - b.clone.hp);
  const index = open[0]!.index;
  if (enemy.dj.focus === index) return run;
  return { ...run, enemy: { ...enemy, dj: { ...enemy.dj, focus: index } } };
}

export function routeHit(enemy: Enemy, dealtHp: number, dealtShield: number): Enemy {
  const dj = enemy.dj;
  if (!dj || dj.focus < 0) return enemy;
  const clones = dj.clones.slice();
  const clone = clones[dj.focus];
  if (!clone || clone.hp <= 0) return { ...enemy, dj: { ...dj, focus: -1 } };
  const hp = clone.hp - dealtHp;
  clones[dj.focus] = hp > 0 ? { ...clone, hp } : { ...clone, hp: 0, mark: null, armed: false };
  const focus = hp > 0 ? dj.focus : -1;
  return { ...enemy, dj: { ...dj, clones, focus } };
}

/**
 * Consume telegraphs that were armed on the previous enemy turn.
 * A mark that is not armed yet is only a warning: the player can still kill it.
 */
export function twistLands(lands: SymId[], dj: DjState): { lands: SymId[]; dj: DjState } {
  const next = lands.slice();
  const clones = dj.clones.map((clone) => ({ ...clone }));
  for (const clone of clones) {
    if (clone.hp <= 0 || clone.mark == null || !clone.armed) continue;
    const at = clone.mark;
    if (at >= 0 && at < next.length) next[at] = "medzera";
    clone.mark = null;
    clone.armed = false;
  }
  let fan = dj.fan;
  if (fan && next.length > 1) {
    const from = Math.max(0, Math.min(next.length - 1, fan.reel));
    let to = from + fan.dir;
    if (to < 0 || to >= next.length) to = from - fan.dir;
    if (to !== from && to >= 0 && to < next.length) {
      const swap = next[from]!;
      next[from] = next[to]!;
      next[to] = swap;
    }
    fan = null;
  }
  return { lands: next, dj: { ...dj, clones, fan } };
}

function pickReel(state: number, n: number, taken: Set<number>): { state: number; reel: number } {
  const open: number[] = [];
  for (let i = 0; i < n; i++) if (!taken.has(i)) open.push(i);
  const bag = open.length ? open : [0];
  const drawn = pick(state, bag);
  return { state: drawn.state, reel: drawn.item };
}

/** One enemy turn of the band. Stun is handled by the caller before this runs. */
export function scriptDj(enemy: Enemy, call: readonly string[], reels: number, rng: number): { enemy: Enemy; notes: string[]; rng: number } {
  if (enemy.id !== "blastbeat" || !enemy.dj) return { enemy, notes: [], rng };
  let dj: DjState = {
    ...enemy.dj,
    clones: enemy.dj.clones.map((clone) => ({ ...clone })),
    fan: enemy.dj.fan ? { ...enemy.dj.fan } : null,
  };
  const notes: string[] = [];
  if (call.includes("charizma")) {
    dj.bpm = Math.max(72, dj.bpm - 24);
    notes.push("Charizma stiahla tempo");
  }
  dj.bpm = Math.min(DJ_BPM_CAP, dj.bpm + 6);
  dj.acts += 1;
  let state = rng || 1;
  for (const clone of dj.clones) {
    if (clone.hp > 0 && clone.mark != null && !clone.armed) {
      clone.armed = true;
      notes.push(`Činel na ${clone.mark + 1}`);
    }
  }
  const living = dj.clones.filter((clone) => clone.hp > 0).length;
  if (dj.acts % 3 === 1 && living < 4) {
    const taken = new Set(dj.clones.filter((clone) => clone.hp > 0 && clone.mark != null).map((clone) => clone.mark!));
    const drawn = pickReel(state, Math.max(1, reels), taken);
    state = drawn.state;
    dj.clones.push({
      hp: DJ_CLONE_HP,
      maxHp: DJ_CLONE_HP,
      mark: drawn.reel,
      armed: false,
      black: dj.clones.length === 3,
    });
    notes.push(`Kapela značí okno ${drawn.reel + 1}`);
  }
  if (dj.acts % 4 === 2 && !dj.fan) {
    const drawn = pickReel(state, Math.max(1, reels), new Set());
    state = drawn.state;
    const side = pick(state, [-1, 1] as const);
    state = side.state;
    const dir: -1 | 1 = drawn.reel <= 0 ? 1 : drawn.reel >= reels - 1 ? -1 : side.item;
    dj.fan = { reel: drawn.reel, dir };
    notes.push(dir > 0 ? "Ventilátor →" : "Ventilátor ←");
  }
  let next: Enemy = { ...enemy, dj };
  if (next.enraged) next = { ...next, shield: 0 };
  if (notes.length) {
    next = {
      ...next,
      intent: { ...next.intent, label: notes[notes.length - 1] ?? next.intent.label },
    };
  }
  return { enemy: next, notes, rng: state };
}

export function resetTempo(enemy: Enemy): Enemy {
  if (!enemy.dj) return enemy;
  return { ...enemy, dj: { ...enemy.dj, bpm: 84 } };
}
