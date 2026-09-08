import {
  COLS,
  ROWS,
  MULT_TABLE,
  MULT_WEIGHT,
  PAY_SYMBOLS,
  SCATTER,
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

export function randomCell(rng: () => number, ante: boolean): Cell {
  const scatterW = SCATTER.weight * (ante ? 2 : 1);
  const table: { w: number; kind: "pay" | "scatter" | "mult"; id?: PayId }[] = [
    ...PAY_SYMBOLS.map((p) => ({ w: p.weight, kind: "pay" as const, id: p.id })),
    { w: scatterW, kind: "scatter" },
    { w: MULT_WEIGHT, kind: "mult" },
  ];
  const pick = pickWeighted(table, rng);
  if (pick.kind === "scatter") return { uid: nextUid(), kind: "scatter" };
  if (pick.kind === "mult") {
    const m = pickWeighted(MULT_TABLE, rng).value;
    return { uid: nextUid(), kind: "mult", mult: m };
  }
  return { uid: nextUid(), kind: "pay", payId: pick.id };
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

/** Force 4 scatters for bonus buy opening. */
export function generateBuyGrid(rng: () => number, ante: boolean): Cell[][] {
  const g = generateGrid(rng, ante);
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

export interface LineWin {
  payId: PayId | "scatter";
  count: number;
  payX: number;
  cells: { r: number; c: number }[];
}

export function evaluate(grid: Cell[][]): {
  wins: LineWin[];
  winX: number;
  scatterCount: number;
  multipliers: number[];
  winMask: boolean[][];
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

  return { wins, winX, scatterCount, multipliers, winMask };
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

export function cloneGrid(grid: Cell[][]): Cell[][] {
  return grid.map((row) => row.map((c) => ({ ...c })));
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
