/**
 * Feature-ticket tuning on the real engine stream (stream.ts).
 *   npx tsx scripts/feature-sim/tune.ts [spinsPerSeed] [seeds] [starts]
 * For every feature template and floor: the spin budget (od–do, steps of 5) whose average clear rate over the
 * drawn goal × window hits the base tickets' clear rate for that floor (single tickets, no POT:
 * lacná 76.6 %, stred 59.3 %, drahá 39.6 % — /workspace/ticket-ranges/sim-table.md). Prints a JOB_RANGES block.
 */
import { makeStream, summarize, type Stream } from "./stream.ts";
import { createRng } from "../../src/lib/slot/engine.ts";

export const TARGET = { lacna: 0.766, stred: 0.593, draha: 0.396 } as const;
type Floor = keyof typeof TARGET;

/** Goal spans per template and floor (the window is what gets tuned). */
export const NEEDS: Record<string, Partial<Record<Floor, [number, number]>>> = {
  zasah: { lacna: [1, 1], stred: [1, 2], draha: [2, 2] },
  hack: { lacna: [2, 3], stred: [3, 4], draha: [4, 4] },
  lup: { lacna: [2, 3], stred: [3, 5], draha: [5, 8] },
  kvota: { lacna: [45, 65], stred: [65, 100], draha: [115, 155] },
  urad: { lacna: [1, 1], stred: [1, 2], draha: [2, 3] },
  uradvyhra: { lacna: [2, 3], stred: [3, 4], draha: [4, 6] },
  // KONTROLA / Ž-BOX-only goals lowered when KOLESO joined the draw (each mode 1/3, ~1 in 162 spins), so the
  // windows stay within the 400-spin card limit.
  listky: { lacna: [1, 2], stred: [2, 2], draha: [2, 3] },
  pokuta: { lacna: [1, 1], stred: [2, 3], draha: [3, 4] },
  zasielky: { lacna: [2, 3], stred: [3, 4], draha: [4, 5] },
  priplatok: { draha: [2, 2] },
  okna: { lacna: [3, 4], stred: [4, 5], draha: [5, 7] },
};

/** Spins (from the start) at which a goal of `need` qualifies, or Infinity within `horizon`. */
export function qualify(s: Stream, start: number, tpl: string, needs: number[], horizon: number): number[] {
  const out = needs.map(() => Infinity);
  let left = needs.length;
  let count = 0;
  let chaseStartAt = -1;
  let chaseBest = 0;
  for (let k = 0; k < horizon && left > 0; k++) {
    const i = (start + k) % s.n;
    const f = s.flags[i];
    const spun = k + 1;
    const hit = (v: number, at: number) => {
      for (let j = 0; j < needs.length; j++) if (out[j] === Infinity && v >= needs[j]) { out[j] = at; left--; }
    };
    if (tpl === "zasah" && f & 4) hit(++count, spun);
    if (tpl === "kvota" && s.pityAdd[i]) hit((count += s.pityAdd[i]), spun);
    if (tpl === "urad" && f & 64) hit(++count, spun);
    if (tpl === "hack" || tpl === "lup") {
      if (f & 4) { chaseStartAt = spun; chaseBest = 0; }
      if (f & 2 && chaseStartAt < 0) chaseStartAt = spun; // stream started mid-ZÁSAH
      if (f & 8) {
        const v = tpl === "hack" ? s.chaseHits[i] : Math.floor(s.chaseWinX[i] + 1e-9);
        chaseBest = v;
        hit(v, chaseStartAt);
        chaseStartAt = -1;
      }
    }
    if (f & 64) {
      const m = s.bonusMode[i];
      let v = -1;
      if (tpl === "uradvyhra") v = Math.floor(s.bonusX[i] + 1e-9);
      if (tpl === "listky" && m === 1) v = s.safes[i];
      if (tpl === "pokuta" && m === 1) v = Math.floor(s.bonusX[i] + 1e-9);
      if (tpl === "zasielky" && m === 2) v = s.safes[i];
      if (tpl === "priplatok" && m === 2) v = s.canSum[i];
      if (tpl === "okna" && m === 2) v = s.rounds[i];
      if (v >= 0) hit(v, spun);
    }
  }
  void chaseBest;
  return out;
}

function range(a: number, b: number): number[] {
  const o: number[] = [];
  for (let x = a; x <= b; x++) o.push(x);
  return o;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const per = Number(process.argv[2] ?? 400000);
  const seeds = Number(process.argv[3] ?? 4);
  const starts = Number(process.argv[4] ?? 6000);
  const streams: Stream[] = [];
  for (let k = 1; k <= seeds; k++) streams.push(makeStream(per, k));
  console.log(JSON.stringify(summarize(streams[0])));
  const rng = createRng(99);
  const out: string[] = [];
  const only = process.argv[5]?.split(",");
  for (const [tpl, floors] of Object.entries(NEEDS)) {
    if (only && !only.includes(tpl)) continue;
    const cells: string[] = [];
    for (const floor of ["lacna", "stred", "draha"] as Floor[]) {
      const span = floors[floor];
      if (!span) continue;
      const needs = range(...span);
      // Q samples per need
      const qs: number[][] = needs.map(() => []);
      for (let k = 0; k < starts; k++) {
        const s = streams[k % streams.length];
        const q = qualify(s, Math.floor(rng() * s.n), tpl, needs, 3000);
        q.forEach((v, j) => qs[j].push(v));
      }
      const cdf = (j: number, w: number) => qs[j].filter((v) => v <= w).length / qs[j].length;
      const rate = (c: number) => {
        const lo = Math.max(5, Math.round((c * 0.8) / 5) * 5);
        const hi = Math.max(lo, Math.round((c * 1.2) / 5) * 5);
        let sum = 0, n = 0;
        for (let j = 0; j < needs.length; j++) for (let w = lo; w <= hi; w += 5) { sum += cdf(j, w); n++; }
        return { r: sum / n, lo, hi };
      };
      let a = 5, b = 2000;
      for (let it = 0; it < 30; it++) {
        const m = (a + b) / 2;
        if (rate(m).r < TARGET[floor]) a = m; else b = m;
      }
      const best = rate((a + b) / 2);
      cells.push(`${floor}: { need: [${span[0]}, ${span[1]}], window: [${best.lo}, ${best.hi}] } /* ${(best.r * 100).toFixed(1)} % */`);
    }
    out.push(`  ${tpl}: { ${cells.join(", ")} },`);
  }
  console.log(out.join("\n"));
}
