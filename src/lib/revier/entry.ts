import type { NocnaRecord, Stats } from "./types.ts";

export type { NocnaRecord };

/** 1 % of the classic credit, clamped. Integer crowns, same unit the automat already shows. */
export const ENTRY_MIN = 250;
export const ENTRY_MAX = 50_000;

export function entryPrice(credit: number): number {
  const c = Number.isFinite(credit) ? Math.max(0, credit) : 0;
  const pct = Math.round(c * 0.01);
  return Math.min(ENTRY_MAX, Math.max(ENTRY_MIN, pct));
}

/** Short reason for a disabled tile. Null when the run can start. */
export function entryBlock(credit: number): string | null {
  const price = entryPrice(credit);
  if (!(credit + 1e-9 >= price)) return "MÁLO KREDITU";
  return null;
}

export function emptyNocna(): NocnaRecord {
  return { runs: 0, bestFloor: 0, bestKills: 0 };
}

export function sanitizeNocna(raw: unknown): NocnaRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const n = (v: unknown, max: number) => {
    const x = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (!Number.isFinite(x)) return 0;
    return Math.min(max, Math.max(0, Math.floor(x)));
  };
  const rec: NocnaRecord = {
    runs: n(r.runs, 100_000),
    bestFloor: n(r.bestFloor, 99),
    bestKills: n(r.bestKills, 100_000),
  };
  if (rec.runs === 0 && rec.bestFloor === 0 && rec.bestKills === 0) return null;
  return rec;
}

export function foldNocna(prev: NocnaRecord | null, stats: Stats): NocnaRecord {
  const base = prev ?? emptyNocna();
  return {
    runs: base.runs + 1,
    bestFloor: Math.max(base.bestFloor, stats.bestFloor),
    bestKills: Math.max(base.bestKills, stats.kills),
  };
}
