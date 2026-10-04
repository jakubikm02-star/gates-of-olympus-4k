/**
 * KOLESO NEŠŤASTIA vs KONTROLA EV per rank. Same createRng as the game.
 *   npx tsx scripts/koleso-ev.ts [rounds=2000000] [seed=4242]
 *   npx tsx scripts/koleso-ev.ts tune [rounds=4000000]   — base gap + Sponzorský šek per rank
 */
import { createRng } from "../src/lib/slot/engine.ts";
import { RANK_PERKS } from "../src/lib/slot/ranks.ts";
import { kontrolaTargets } from "../src/lib/slot/bonus-ev.ts";
import { KOLESO_CAP_X, KOLESO_SOLVE_FLAT, kolesoVipOf, playKoleso } from "../src/lib/slot/koleso.ts";

function stats(n: number, seed: number, vip: number, solveFlat = KOLESO_SOLVE_FLAT) {
  const rng = createRng(seed);
  let s = 0, s2 = 0, z = 0, sol = 0, cap = 0, spins = 0, mx = 0, bank = 0;
  const xs = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const r = playKoleso(rng, { vip, solveFlat });
    s += r.totalX; s2 += r.totalX * r.totalX; xs[i] = r.totalX;
    if (r.totalX - vip <= 1e-9) z++;
    if (r.solved) sol++;
    if (r.capped || r.grossX >= KOLESO_CAP_X) cap++;
    if (r.steps.some((st) => st.kind === "bankrot" && st.bankBefore > 0)) bank++;
    spins += r.steps.length;
    if (r.totalX > mx) mx = r.totalX;
  }
  const mean = s / n;
  const v = s2 / n - mean * mean;
  xs.sort();
  return { mean, sd: Math.sqrt(v), se: Math.sqrt(v / n), zero: z / n, solve: sol / n, cap: cap / n, bankrot: bank / n, spins: spins / n, max: mx, p50: xs[n >> 1], p90: xs[Math.floor(n * 0.9)], p99: xs[Math.floor(n * 0.99)] };
}

const target = kontrolaTargets();
const args = process.argv.slice(2);
const f = (x: number, d = 4) => x.toFixed(d);

if (args[0] === "tune") {
  const N = Number(args[1] || 4_000_000);
  const base = stats(N, 777, 0);
  console.log(`base (kredit, no šek): ${f(base.mean)} ± ${f(base.se)} vs KONTROLA ${f(target.kredit)} (${f((base.mean / target.kredit - 1) * 100, 2)} %)`);
  for (const p of RANK_PERKS) console.log(`${p.id}: šek ≈ ${f(Math.max(0, target[p.id] - base.mean), 3)}`);
  process.exit(0);
}

const N = Number(args[0] || 2_000_000);
const seed = Number(args[1] || 4242);
console.log(`KOLESO NEŠŤASTIA vs KONTROLA, ${N.toLocaleString("sk")} kôl na rank, seed ${seed}`);
console.log("| rank | KONTROLA presne | šek | KOLESO sim | ±SE | Δ % | sd | P(0 bez šeku) | P(vylúštené) | P(cap) | ťahy | p50 | p90 | p99 | max |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
let worst = 0;
for (const p of RANK_PERKS) {
  const vip = kolesoVipOf(p.id);
  const r = stats(N, seed, vip);
  const d = (r.mean / target[p.id] - 1) * 100;
  worst = Math.max(worst, Math.abs(d));
  console.log(`| ${p.id} | ${f(target[p.id])} | ${vip ? f(vip, 2) + "×" : "—"} | ${f(r.mean)} | ${f(r.se)} | ${d >= 0 ? "+" : ""}${f(d, 2)} | ${f(r.sd, 2)} | ${f(r.zero * 100, 1)} % | ${f(r.solve * 100, 1)} % | ${f(r.cap * 100, 3)} % | ${f(r.spins, 2)} | ${f(r.p50, 2)} | ${f(r.p90, 2)} | ${f(r.p99, 2)} | ${f(r.max, 2)} |`);
}
console.log(`najhoršia odchýlka ${f(worst, 2)} %`);
