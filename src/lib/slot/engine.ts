import {
  COLS,
  ROWS,
  ORB_TABLE,
  PAY_SYMBOLS,
  SCATTER,
  MAX_WIN_X,
  FS_TRIGGER_SCATTERS,
  FS_RETRIGGER_SCATTERS,
  payForCount,
  scatterPay,
  type Cell,
  type PayId,
  type TicketId,
} from "./symbols";

let uidSeq = 1000;
function nextUid(): number {
  uidSeq += 1;
  return uidSeq;
}

/**
 * One published fact per knob. Do not slide these to chase a sample RTP.
 * sticky — hit frequency 28.82%.
 * baseThrow — official split. Ante +25% at the same 96.5% RTP forces the
 *   non-feature game to return ~0.72. Naked clusters at that hit rate return
 *   ~0.42, so cans add the rest. A 500× every 15 000 spins would add ~0.60
 *   alone and break the split; that tracker figure loses.
 * fsThrow — 100× buy returns ~96.5× (Gates RTP) under the real rule:
 *   stored Mbps multiplies a free spin only when a new can is on that win.
 *   0.30, measured ~96× on ~6.5k buys. Entry uses the base throw.
 */
export const mathTune = {
  /** Chance Zeus throws on a screen. Opening and every tumble share it. */
  baseThrow: 0.036,
  fsThrow: 0.3,
  sticky: 0.156,
};

function pickWeighted<T extends { w: number }>(items: readonly T[], rng: () => number): T {
  let total = 0;
  for (const it of items) total += it.w;
  let r = rng() * total;
  for (const it of items) {
    r -= it.w;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

export function createRng(seed?: number): () => number {
  if (seed === undefined) return Math.random;
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function emptyGrid(): Cell[][] {
  const rng = createRng(4_000_004);
  const g: Cell[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < COLS; c++) {
      const cell = randomPayCell(rng);
      cell.uid = r * COLS + c + 1;
      row.push(cell);
    }
    g.push(row);
  }
  return g;
}

function randomPayCell(rng: () => number, live = false): Cell {
  const s = pickWeighted(
    PAY_SYMBOLS.map((p) => ({ w: p.weight, id: p.id })),
    rng,
  );
  return { uid: nextUid(), kind: "pay", payId: s.id };
}

export function randomOrb(rng: () => number, _fs = false): Cell {
  const m = pickWeighted(ORB_TABLE, rng).value;
  return { uid: nextUid(), kind: "mult", mult: m };
}

/** Cans never ride the strip — rampa drops them after the stop / tumble. FS uses the same strip as base. Ante only swaps the scatter weight. */
export function randomCell(rng: () => number, ante: boolean, _live = false): Cell {
  const scatterW = ante ? SCATTER.weightAnte : SCATTER.weight;
  const payW = PAY_SYMBOLS.reduce((s, p) => s + p.weight, 0);
  const t = payW + scatterW;
  const r = rng() * t;
  if (r < scatterW) return { uid: nextUid(), kind: "scatter" };
  return randomPayCell(rng);
}

/** Consistent filler for the reel. No holes and no cans — symbols stay themselves while they scroll. */
export function makeSpinStrip(rng: () => number, live = false): Cell[] {
  const pat: Cell[] = [];
  for (let i = 0; i < ROWS * 3; i++) {
    pat.push(live ? randomCell(rng, false, true) : randomPayCell(rng));
  }
  return pat;
}

export function generateGrid(rng: () => number, ante: boolean, live = false): Cell[][] {
  const g: Cell[][] = Array.from({ length: ROWS }, () => Array(COLS));
  for (let c = 0; c < COLS; c++) {
    let prev: Cell | null = null;
    for (let r = 0; r < ROWS; r++) {
      let cell: Cell;
      if (prev?.kind === "pay" && prev.payId && rng() < mathTune.sticky) {
        cell = { uid: nextUid(), kind: "pay", payId: prev.payId };
      } else {
        cell = randomCell(rng, ante, live);
      }
      g[r][c] = cell;
      prev = cell;
    }
  }
  return g;
}

/** Same distribution as a natural 4-scatter land, so the buy pays like PARKNET. */
export function generateBuyGrid(rng: () => number): Cell[][] {
  for (let i = 0; i < 5000; i++) {
    const g = generateGrid(rng, false);
    let n = 0;
    for (const row of g) for (const cell of row) if (cell.kind === "scatter") n += 1;
    if (n >= 4) return g;
  }
  const g = generateGrid(rng, false);
  const spots: [number, number][] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (g[r][c].kind !== "scatter") spots.push([r, c]);
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = spots[i];
    spots[i] = spots[j];
    spots[j] = tmp;
  }
  let have = 0;
  for (const row of g) for (const cell of row) if (cell.kind === "scatter") have += 1;
  for (let i = 0; have < 4 && i < spots.length; i++) {
    const [r, c] = spots[i];
    g[r][c] = { uid: nextUid(), kind: "scatter" };
    have += 1;
  }
  return g;
}

export function zeusDropCount(rng: () => number, fs: boolean, afterTumble: boolean): number {
  // One throw chance per mode. Opening screen and post-tumble use the same chance.
  void afterTumble;
  const p = fs ? mathTune.fsThrow : mathTune.baseThrow;
  if (rng() >= p) return 0;
  const r = rng();
  if (r < 0.86) return 1;
  if (r < 0.97) return 2;
  return 3;
}

export function zeusDrop(
  grid: Cell[][],
  rng: () => number,
  n: number,
  fs = false,
): { grid: Cell[][]; drops: { r: number; c: number; mult: number }[] } {
  if (n <= 0) return { grid, drops: [] };
  const spots: { r: number; c: number }[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c].kind === "pay") spots.push({ r, c });
    }
  }
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = spots[i];
    spots[i] = spots[j];
    spots[j] = tmp;
  }
  const next = cloneGrid(grid);
  const drops: { r: number; c: number; mult: number }[] = [];
  const take = Math.min(n, spots.length);
  for (let i = 0; i < take; i++) {
    const { r, c } = spots[i];
    const orb = randomOrb(rng, fs);
    orb.fall = r + 1;
    next[r][c] = orb;
    drops.push({ r, c, mult: orb.mult ?? 2 });
  }
  return { grid: next, drops };
}

export interface LineWin {
  payId: PayId | "scatter";
  count: number;
  payX: number;
  cells: { r: number; c: number }[];
}

export interface NearMiss {
  payId: PayId;
  count: number;
}

export function evaluate(grid: Cell[][]): {
  wins: LineWin[];
  winX: number;
  scatterCount: number;
  multipliers: number[];
  winMask: boolean[][];
  nearMiss: NearMiss | null;
} {
  const counts = new Map<PayId, { n: number; cells: { r: number; c: number }[] }>();
  const scatterCells: { r: number; c: number }[] = [];
  const multipliers: number[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c];
      if (cell.kind === "mult" && cell.mult) multipliers.push(cell.mult);
      if (cell.kind === "scatter") scatterCells.push({ r, c });
      if (cell.kind === "pay" && cell.payId) {
        const cur = counts.get(cell.payId) ?? { n: 0, cells: [] };
        cur.n += 1;
        cur.cells.push({ r, c });
        counts.set(cell.payId, cur);
      }
    }
  }

  const wins: LineWin[] = [];
  let winX = 0;
  const winMask = Array.from({ length: ROWS }, () => Array(COLS).fill(false));

  for (const sym of PAY_SYMBOLS) {
    const info = counts.get(sym.id);
    if (!info || info.n < 8) continue;
    const payX = payForCount(sym.pays, info.n);
    wins.push({ payId: sym.id, count: info.n, payX, cells: info.cells });
    winX += payX;
    for (const p of info.cells) winMask[p.r][p.c] = true;
  }

  const scatterCount = scatterCells.length;
  const sPay = scatterPay(scatterCount);
  if (sPay > 0) {
    wins.push({ payId: "scatter", count: scatterCount, payX: sPay, cells: scatterCells });
    winX += sPay;
    for (const p of scatterCells) winMask[p.r][p.c] = true;
  }

  let nearMiss: NearMiss | null = null;
  if (winX <= 0) {
    for (const sym of PAY_SYMBOLS) {
      const info = counts.get(sym.id);
      if (!info || info.n !== 7) continue;
      if (!nearMiss || info.n > nearMiss.count) nearMiss = { payId: sym.id, count: info.n };
    }
  }

  return { wins, winX, scatterCount, multipliers, winMask, nearMiss };
}

export function punchHoles(grid: Cell[][], winMask: boolean[][]): Cell[][] {
  return grid.map((row, r) => row.map((cell, c) => (winMask[r][c] ? { ...cell, gone: true } : { ...cell, gone: false })));
}

export function findTicket(grid: Cell[][]): { r: number; c: number; ticket: TicketId } | null {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c];
      if (cell.kind === "park" && cell.ticket) return { r, c, ticket: cell.ticket };
    }
  }
  return null;
}

export function plantTicket(grid: Cell[][], ticket: TicketId, rng: () => number): Cell[][] {
  if (findTicket(grid)) return grid;
  const low = new Set(["rj45", "router", "hap", "roof"]);
  const spots: { r: number; c: number; low: boolean }[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c];
      if (cell.kind === "scatter" || cell.kind === "mult" || cell.kind === "park") continue;
      spots.push({ r, c, low: Boolean(cell.payId && low.has(cell.payId)) });
    }
  }
  const bag = spots.filter((s) => s.low);
  const pool = bag.length ? bag : spots;
  if (!pool.length) return grid;
  const pick = pool[Math.floor(rng() * pool.length)];
  const next = cloneGrid(grid);
  next[pick.r][pick.c] = { uid: nextUid(), kind: "park", ticket };
  return next;
}

export function countParks(grid: Cell[][]): number {
  let n = 0;
  for (const row of grid) for (const cell of row) if (cell.kind === "park") n += 1;
  return n;
}

export function tumble(grid: Cell[][], winMask: boolean[][], rng: () => number, ante: boolean, fs = false): Cell[][] {
  const next: Cell[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(null as unknown as Cell));
  for (let c = 0; c < COLS; c++) {
    const surviving: { cell: Cell; from: number }[] = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      if (!winMask[r][c]) surviving.push({ cell: grid[r][c], from: r });
    }
    let dest = ROWS - 1;
    for (const item of surviving) {
      next[dest][c] = { ...item.cell, fall: dest - item.from };
      dest -= 1;
    }
    const spawnOffset = dest + 1;
    let prev: Cell | null = null;
    for (let r = 0; r <= dest; r++) {
      let cell: Cell;
      if (prev?.kind === "pay" && prev.payId && rng() < mathTune.sticky) {
        cell = { uid: nextUid(), kind: "pay", payId: prev.payId };
      } else {
        cell = randomCell(rng, ante, fs);
      }
      cell.fall = spawnOffset;
      next[r][c] = cell;
      prev = cell;
    }
  }
  return next;
}

export function sumMultipliers(grid: Cell[][]): number {
  let s = 0;
  for (const row of grid) for (const cell of row) if (cell.kind === "mult" && cell.mult) s += cell.mult;
  return s;
}

export function listOrbs(grid: Cell[][]): { uid: number; r: number; c: number; mult: number }[] {
  const out: { uid: number; r: number; c: number; mult: number }[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c];
      if (cell.kind === "mult" && cell.mult) out.push({ uid: cell.uid, r, c, mult: cell.mult });
    }
  }
  return out;
}

export function expireOrbs(grid: Cell[][], rng: () => number): { grid: Cell[][]; expired: number[] } {
  const next = cloneGrid(grid);
  const expired: number[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (next[r][c].kind === "mult") {
        expired.push(next[r][c].uid);
        const fresh = randomPayCell(rng);
        fresh.fall = 1;
        next[r][c] = fresh;
      }
    }
  }
  return { grid: next, expired };
}

export function cloneGrid(grid: Cell[][]): Cell[][] {
  return grid.map((row) => row.map((c) => ({ ...c })));
}

export function countScatters(grid: Cell[][]): number {
  let n = 0;
  for (const row of grid) for (const cell of row) if (cell.kind === "scatter") n += 1;
  return n;
}

export interface PaidSpin {
  sequenceX: number;
  orbSum: number;
  applied: number;
  paidX: number;
  scatterPeak: number;
  triggeredFs: boolean;
  retrigger: boolean;
  hitMax: boolean;
  nearMiss: NearMiss | null;
  deadOrbs: number;
  globalMult: number;
  tumbles: number;
  /** Cans actually placed this spin (opening + tumbles). */
  orbs: number;
  /** Bit i set when PAY_SYMBOLS[i] paid 8+ at any tumble. */
  symbolMask: number;
  /** Pay-symbol counts on the grid before the first throw. */
  open: number[];
}

export function resolvePaidSpin(
  rng: () => number,
  opts: { ante: boolean; buy?: boolean; free?: boolean; globalMult: number; capRemain?: number },
): PaidSpin {
  const ante = opts.buy || opts.free ? false : opts.ante;
  let board = opts.buy ? generateBuyGrid(rng) : generateGrid(rng, ante, !!opts.free);
  const open = PAY_SYMBOLS.map(() => 0);
  for (const row of board) {
    for (const cell of row) {
      if (cell.kind !== "pay" || !cell.payId) continue;
      const idx = PAY_SYMBOLS.findIndex((p) => p.id === cell.payId);
      if (idx >= 0) open[idx] += 1;
    }
  }
  // Buy is a natural 4-scatter trigger: base cans, not the free-spin throw, not a dead screen.
  let orbs = 0;
  const n0 = zeusDropCount(rng, !!opts.free, false);
  if (n0) {
    const dropped = zeusDrop(board, rng, n0, !!opts.free);
    board = dropped.grid;
    orbs += dropped.drops.length;
  }

  let sequenceX = 0;
  let scatterPeak = 0;
  let scatterPayLocked = 0;
  let tumbles = 0;
  let symbolMask = 0;
  let nearMiss: NearMiss | null = null;
  for (;;) {
    const ev = evaluate(board);
    scatterPeak = Math.max(scatterPeak, ev.scatterCount);
    for (const w of ev.wins) {
      if (w.payId === "scatter") continue;
      const idx = PAY_SYMBOLS.findIndex((p) => p.id === w.payId);
      if (idx >= 0) symbolMask |= 1 << idx;
    }
    const sPay = scatterPay(ev.scatterCount);
    const clusterX = ev.winX - sPay;
    const scatterDelta = Math.max(0, sPay - scatterPayLocked);
    scatterPayLocked = Math.max(scatterPayLocked, sPay);
    const winX = clusterX + scatterDelta;
    if (winX <= 0) {
      nearMiss = ev.nearMiss;
      break;
    }
    sequenceX += winX;
    const mask = ev.winMask.map((row, r) =>
      row.map((v, c) => (board[r][c].kind === "scatter" || board[r][c].kind === "park" ? false : v)),
    );
    if (!mask.some((row) => row.some(Boolean))) break;
    board = tumble(board, mask, rng, ante, !!opts.free);
    const n = zeusDropCount(rng, !!opts.free, true);
    if (n) {
      const dropped = zeusDrop(board, rng, n, !!opts.free);
      board = dropped.grid;
      orbs += dropped.drops.length;
    }
    tumbles += 1;
    if (tumbles > 48) break;
  }

  const orbSum = sumMultipliers(board);
  let globalMult = opts.globalMult;
  let applied = 1;
  // FS total multiplies this sequence only with a new can, added first
  // (50+5 → 55× tumble). A win with no new can pays the raw tumble.
  if (sequenceX > 0 && orbSum > 0) {
    if (opts.free) {
      globalMult += orbSum;
      applied = Math.max(1, globalMult);
    } else applied = orbSum;
  }

  const cap = opts.capRemain ?? MAX_WIN_X;
  let paidX = sequenceX * applied;
  let hitMax = false;
  if (paidX >= cap) {
    paidX = Math.max(0, cap);
    hitMax = true;
  }

  const triggeredFs = !opts.free && scatterPeak >= FS_TRIGGER_SCATTERS;
  const retrigger = !!opts.free && scatterPeak >= FS_RETRIGGER_SCATTERS;
  const deadOrbs = sequenceX <= 0 ? listOrbs(board).length : 0;

  return {
    sequenceX,
    orbSum,
    applied,
    paidX,
    scatterPeak,
    triggeredFs,
    retrigger,
    hitMax,
    nearMiss,
    deadOrbs,
    globalMult,
    tumbles,
    orbs,
    symbolMask,
    open,
  };
}

export function wait(ms: number, signal?: { aborted?: boolean; skip?: boolean }): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    let timer = 0;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      resolve();
    };
    const limit = () => (signal?.skip || signal?.aborted ? Math.min(ms, 40) : ms);
    let start = performance.now();
    let forgiven = false;
    const arm = (left: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(finish, Math.max(16, left) + 48);
    };
    arm(limit());
    const tick = (now: number) => {
      if (done) return;
      if (signal?.aborted) {
        finish();
        return;
      }
      if (signal?.skip) {
        if (now - start >= Math.min(ms, 40)) finish();
        else requestAnimationFrame(tick);
        return;
      }
      const elapsed = now - start;
      const need = limit();
      // A frozen main thread is not reel time — the strips would jump. Grant the duration once.
      if (!forgiven && elapsed > need + 48) {
        forgiven = true;
        start = now;
        arm(need);
        requestAnimationFrame(tick);
        return;
      }
      if (elapsed >= need) {
        finish();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
