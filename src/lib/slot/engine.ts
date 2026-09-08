import {
  COLS,
  ROWS,
  MULT_TABLE,
  BASE_MULT_TABLE,
  PAY_SYMBOLS,
  SCATTER,
  MAX_WIN_X,
  FS_TRIGGER_SCATTERS,
  FS_RETRIGGER_SCATTERS,
  payForCount,
  scatterPay,
  type Cell,
  type PayId,
} from "./symbols";

let uidSeq = 1000;
function nextUid(): number {
  uidSeq += 1;
  return uidSeq;
}

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

function randomPayCell(rng: () => number): Cell {
  const s = pickWeighted(
    PAY_SYMBOLS.map((p) => ({ w: p.weight, id: p.id })),
    rng,
  );
  return { uid: nextUid(), kind: "pay", payId: s.id };
}

export function randomOrb(rng: () => number, fs = false): Cell {
  const m = pickWeighted(fs ? MULT_TABLE : BASE_MULT_TABLE, rng).value;
  return { uid: nextUid(), kind: "mult", mult: m };
}

/** Orbs are Zeus-drops, not fill-bag competitors. */
export function randomCell(rng: () => number, ante: boolean): Cell {
  const scatterW = ante ? SCATTER.weightAnte : SCATTER.weight;
  const payW = PAY_SYMBOLS.reduce((s, p) => s + p.weight, 0);
  if (rng() * (payW + scatterW) < scatterW) return { uid: nextUid(), kind: "scatter" };
  return randomPayCell(rng);
}

export function generateGrid(rng: () => number, ante: boolean): Cell[][] {
  const g: Cell[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < COLS; c++) row.push(randomCell(rng, ante));
    g.push(row);
  }
  return g;
}

/** Force 4 scatters. Buy is always 100× base bet; ante is off for this grid. */
export function generateBuyGrid(rng: () => number): Cell[][] {
  const g = generateGrid(rng, false);
  const spots: [number, number][] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) spots.push([r, c]);
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = spots[i];
    spots[i] = spots[j];
    spots[j] = tmp;
  }
  for (let i = 0; i < 4; i++) {
    const [r, c] = spots[i];
    g[r][c] = { uid: nextUid(), kind: "scatter" };
  }
  return g;
}

export function zeusDropCount(rng: () => number, fs: boolean, afterTumble: boolean): number {
  const p = afterTumble ? (fs ? 0.22 : 0.082) : fs ? 0.155 : 0.05;
  if (rng() > p) return 0;
  const r = rng();
  if (fs) {
    if (r < 0.7) return 1;
    if (r < 0.92) return 2;
    return 3;
  }
  if (r < 0.84) return 1;
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

export function tumble(grid: Cell[][], winMask: boolean[][], rng: () => number, ante: boolean): Cell[][] {
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
    for (let r = dest; r >= 0; r--) {
      const cell = randomCell(rng, ante);
      cell.fall = spawnOffset;
      next[r][c] = cell;
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
        next[r][c] = randomPayCell(rng);
      }
    }
  }
  return { grid: next, expired };
}

export function cloneGrid(grid: Cell[][]): Cell[][] {
  return grid.map((row) => row.map((c) => ({ ...c })));
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
}

export function resolvePaidSpin(
  rng: () => number,
  opts: { ante: boolean; buy?: boolean; free?: boolean; globalMult: number; capRemain?: number },
): PaidSpin {
  const ante = opts.buy || opts.free ? false : opts.ante;
  let board = opts.buy ? generateBuyGrid(rng) : generateGrid(rng, ante);
  const n0 = zeusDropCount(rng, !!opts.free, false);
  if (n0) board = zeusDrop(board, rng, n0, !!opts.free).grid;

  let sequenceX = 0;
  let scatterPeak = 0;
  let tumbles = 0;
  let nearMiss: NearMiss | null = null;
  for (;;) {
    const ev = evaluate(board);
    scatterPeak = Math.max(scatterPeak, ev.scatterCount);
    if (ev.winX <= 0) {
      nearMiss = ev.nearMiss;
      break;
    }
    sequenceX += ev.winX;
    board = tumble(board, ev.winMask, rng, ante);
    const n = zeusDropCount(rng, !!opts.free, true);
    if (n) board = zeusDrop(board, rng, n, !!opts.free).grid;
    tumbles += 1;
    if (tumbles > 48) break;
  }

  const orbSum = sumMultipliers(board);
  let globalMult = opts.globalMult;
  let applied = 1;
  if (sequenceX > 0 && orbSum > 0) {
    if (opts.free) {
      globalMult += orbSum;
      applied = Math.max(1, globalMult);
    } else applied = orbSum;
  } else if (opts.free && sequenceX > 0 && globalMult > 1) {
    applied = globalMult;
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
  };
}

export function wait(ms: number, signal?: { aborted?: boolean; skip?: boolean }): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = (t: number) => {
      const cap = signal?.skip ? Math.min(ms, 40) : ms;
      if (signal?.aborted || t - t0 >= cap) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
