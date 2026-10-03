import { COLS, type Cell } from "./symbols.ts";

/**
 * Scatter sound timing (4KA TV scatter), pure part.
 *
 * Land sound ("scatter" slot): one per scatter, at the moment it really lands:
 *  - from the reels: when the reel holding it visually stops (Grid reports the column after its travel/brake
 *    animation ends; reduced motion / no travel = when the hook stops the column), in reel stop order;
 *  - from a cascade: when the refill drop animation ends (cell-drop, 280 ms).
 * `n` of each sound is the running scatter count on the board (louder/higher per scatter, as before).
 *
 * Third scatter ("harp" + "collect"): only when the FINAL board has exactly 3 scatters, i.e. after every reel has
 * stopped and the tumbles have settled (scatters never tumble away, but new ones can drop in), played at that moment.
 * 4+ scatters never play it; their sound stays the "thunder" on the land that reaches 4+ (and the bonus/retrigger cues).
 */
export const THIRD_SCATTER = 3;
export const THUNDER_FROM = 4;
/** Scatters landing together on one reel are spaced by this much so each is heard. */
export const SAME_REEL_GAP_MS = 70;
/** If the grid never reports all reels (tab hidden, unmounted), the third-scatter cue waits at most this long. */
export const SETTLE_TIMEOUT_MS = 3000;

export type LandStep = { n: number; delayMs: number };
export type LandCue = { steps: LandStep[]; thunder: boolean };

export function countScatters(grid: Cell[][]): number {
  let n = 0;
  for (const row of grid) for (const cell of row) if (cell.kind === "scatter") n += 1;
  return n;
}

export function colScatters(grid: Cell[][], c: number): number {
  let n = 0;
  for (const row of grid) if (row[c]?.kind === "scatter") n += 1;
  return n;
}

/** Sounds for `add` scatters landing together after `heard` were already heard. Thunder once if the land reaches 4+. */
export function landCue(heard: number, add: number): LandCue {
  const steps: LandStep[] = [];
  for (let i = 0; i < add; i++) steps.push({ n: heard + i + 1, delayMs: i * SAME_REEL_GAP_MS });
  return { steps, thunder: add > 0 && heard + add >= THUNDER_FROM };
}

/** Third-scatter cue on the settled final board. */
export function thirdScatterCue(finalCount: number): boolean {
  return finalCount === THIRD_SCATTER;
}

/** Per-spin bookkeeping for the reel land sounds: each reel once, in the order the grid reports them. */
export class ReelScatterTracker {
  readonly grid: Cell[][];
  heard = 0;
  private readonly done = new Set<number>();

  constructor(grid: Cell[][]) {
    this.grid = grid;
  }

  /** Reel `c` stopped: its land cue, or null if already reported / out of range. */
  reel(c: number): LandCue | null {
    if (c < 0 || c >= COLS || this.done.has(c)) return null;
    this.done.add(c);
    const cue = landCue(this.heard, colScatters(this.grid, c));
    this.heard += cue.steps.length;
    return cue;
  }

  /** Every reel has reported. */
  get settled(): boolean {
    return this.done.size >= COLS;
  }
}

/** Cascade refill: land cue for the scatters that dropped in (board count before → after the drop). */
export function cascadeCue(before: number, after: number): LandCue {
  return landCue(before, Math.max(0, after - before));
}

/** Grid side: per-spin reel settle bookkeeping (a reel must be seen spinning in this spin before it can settle). */
export type SettleState = { token: number; armed: boolean[]; done: boolean[] };

export function emptySettle(): SettleState {
  return { token: -1, armed: Array(COLS).fill(false), done: Array(COLS).fill(false) };
}

/** Reels that just settled (to report now, in column order within one frame). Mutates `st`. */
export function settleReports(st: SettleState, token: number, settled: boolean[]): number[] {
  if (st.token !== token) {
    st.token = token;
    st.armed = Array(COLS).fill(false);
    st.done = Array(COLS).fill(false);
  }
  const out: number[] = [];
  for (let c = 0; c < COLS; c++) {
    if (!settled[c]) st.armed[c] = true;
    else if (st.armed[c] && !st.done[c]) {
      st.done[c] = true;
      out.push(c);
    }
  }
  return out;
}
