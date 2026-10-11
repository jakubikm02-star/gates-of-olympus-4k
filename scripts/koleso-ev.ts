/**
 * KOLESO NEŠŤASTIA vs KONTROLA EV per rank and player type. Same createRng as the game.
 *   npx tsx scripts/koleso-ev.ts [rounds=1000000] [seed=4242]   — table per rank × player
 *   npx tsx scripts/koleso-ev.ts tune [rounds=1000000]           — solve bonus + Sponzorský šek per rank
 *
 * Players (the letter is chosen out of KOLESO_OFFER random letters, lib/slot/koleso kolesoOffer):
 *   jozo   — Jožo / auto / timeout / autoplay: offer[0] (the old single host pick)
 *   naive  — a random one of the 3
 *   freq   — the most frequent Slovak letter of the 3 (no phrase knowledge)
 *   strong — perfect knowledge of the phrase (memorised): max over a greedy "most tiles" pick and "hold back"
 *            variants that avoid solving while ≥ L spins are left (L = 1, 2, 3); the upper bound we tune to.
 */
import { createRng } from "../src/lib/slot/engine.ts";
import { RANK_PERKS } from "../src/lib/slot/ranks.ts";
import { kontrolaTargets } from "../src/lib/slot/bonus-ev.ts";
import { KOLESO_CAP_X, KOLESO_FREQ, KOLESO_SOLVE_AT, KOLESO_SOLVE_FLAT, kolesoVipOf, playKoleso, type KPicker } from "../src/lib/slot/koleso.ts";

const greedy: KPicker = (o, i) => [...o].sort((a, b) => (i.cnt[b] ?? 0) - (i.cnt[a] ?? 0) || KOLESO_FREQ[b] - KOLESO_FREQ[a])[0];
const hold = (L: number): KPicker => (o, i) => {
  if (i.left >= L) {
    const keep = o.filter((c) => (i.shown + (i.cnt[c] ?? 0)) / i.letters < KOLESO_SOLVE_AT);
    if (keep.length) return greedy(keep, i);
  }
  return greedy(o, i);
};
export const PLAYERS: Record<string, () => KPicker | undefined> = {
  jozo: () => undefined,
  naive: () => {
    const r = createRng(99);
    return (o) => o[Math.floor(r() * o.length)];
  },
  freq: () => (o) => [...o].sort((a, b) => KOLESO_FREQ[b] - KOLESO_FREQ[a])[0],
  greedy: () => greedy,
  hold1: () => hold(1),
  hold2: () => hold(2),
  hold3: () => hold(3),
};
const STRONG = ["greedy", "hold1", "hold2", "hold3"];

interface St { mean: number; se: number; solve: number; spins: number; P: number; cap: number; p50: number; p90: number; p99: number; max: number }
function stats(n: number, seed: number, who: string, solveFlat = KOLESO_SOLVE_FLAT, vip = 0): St {
  const rng = createRng(seed);
  const picker = PLAYERS[who]();
  let s = 0, s2 = 0, sol = 0, sp = 0, cap = 0;
  const xs = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const r = playKoleso(rng, { vip, solveFlat, picker });
    s += r.totalX; s2 += r.totalX * r.totalX; xs[i] = r.totalX;
    if (r.solved) sol++;
    if (r.capped || r.grossX >= KOLESO_CAP_X) cap++;
    sp += r.steps.length;
  }
  const mean = s / n;
  xs.sort();
  return { mean, se: Math.sqrt((s2 / n - mean * mean) / n), solve: sol / n, P: sol / n, spins: sp / n, cap: cap / n, p50: xs[n >> 1], p90: xs[Math.floor(n * 0.9)], p99: xs[Math.floor(n * 0.99)], max: xs[n - 1] };
}

const target = kontrolaTargets();
const args = process.argv.slice(2);
const f = (x: number, d = 4) => x.toFixed(d);
const pc = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)} %`;

if (args[0] === "tune") {
  // EV(F) = EV(0) + F · P(solve) per player (linear: the solve bonus is flat, bank × KOLESO_SOLVE_MUL fixed).
  const N = Number(args[1] || 1_000_000);
  const z: Record<string, St> = {};
  for (const w of Object.keys(PLAYERS)) z[w] = stats(N, 777, w, 0);
  for (const w of Object.keys(z)) console.log(`${w}: EV(F=0) ${f(z[w].mean)}  P(solve) ${f(z[w].P, 3)}  spins ${f(z[w].spins, 2)}`);
  const ev = (w: string, F: number) => z[w].mean + F * z[w].P;
  const strong = (F: number) => Math.max(...STRONG.map((w) => ev(w, F)));
  // šek centres the band: naive and strong sit symmetric around KONTROLA (naive −x %, strong +x %)
  let best: { F: number; x: number } | null = null;
  for (let F = 0; F <= 3; F += 0.01) {
    let worst = 0;
    let ok = true;
    for (const p of RANK_PERKS) {
      const t = target[p.id];
      const vip = Math.max(0, t - (ev("naive", F) + strong(F)) / 2);
      const lo = (ev("naive", F) + vip) / t - 1;
      const hi = (strong(F) + vip) / t - 1;
      if (lo < -0.05 || hi > 0.05) ok = false;
      worst = Math.max(worst, -lo, hi);
    }
    if (ok && (!best || F > best.F)) best = { F: +F.toFixed(2), x: worst };
  }
  if (!best) {
    console.log("no solve bonus keeps every rank inside ±5 % — lower the slice values");
    process.exit(1);
  }
  const F = Math.min(best.F, Number(args[2] ?? best.F));
  console.log(`solve bonus F = ${F} (largest inside ±5 %: ${best.F}, worst ${pc(best.x)})`);
  for (const p of RANK_PERKS) {
    const t = target[p.id];
    console.log(`${p.id}: šek ≈ ${f(Math.max(0, t - (ev("naive", F) + strong(F)) / 2), 3)}`);
  }
  process.exit(0);
}

const N = Number(args[0] || 1_000_000);
const seed = Number(args[1] || 4242);
const base: Record<string, St> = {};
for (const w of Object.keys(PLAYERS)) base[w] = stats(N, seed, w);
const sw = STRONG.reduce((a, b) => (base[b].mean > base[a].mean ? b : a));
console.log(`KOLESO NEŠŤASTIA (voľba z 3 písmen) vs KONTROLA, ${N.toLocaleString("sk")} kôl na hráča, seed ${seed}`);
console.log(`hráči bez šeku: ${Object.entries(base).map(([w, s]) => `${w} ${f(s.mean)} (vylúštené ${f(s.solve * 100, 1)} %, ${f(s.spins, 2)} točení)`).join(" · ")}`);
console.log(`strong = ${sw} (najlepšia stratégia s dokonalou znalosťou tajničky)`);
console.log("| rank | KONTROLA | šek | JOŽO / auto | Δ | naivný (náhodne z 3) | Δ | častý (najčastejšie písmeno) | Δ | silný (pozná tajničku) | Δ |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
let worst = 0;
for (const p of RANK_PERKS) {
  const t = target[p.id];
  const vip = kolesoVipOf(p.id);
  const e = (w: string) => base[w].mean + vip;
  const d = (w: string) => e(w) / t - 1;
  worst = Math.max(worst, Math.abs(d("naive")), Math.abs(d(sw)));
  console.log(`| ${p.id} | ${f(t)} | ${f(vip, 2)}× | ${f(e("jozo"))} | ${pc(d("jozo"))} | ${f(e("naive"))} | ${pc(d("naive"))} | ${f(e("freq"))} | ${pc(d("freq"))} | ${f(e(sw))} | ${pc(d(sw))} |`);
}
console.log(`najhoršia odchýlka (naivný / silný) ${f(worst * 100, 2)} %, SE ≈ ${f(base.jozo.se, 4)}`);
const j = base.jozo;
console.log(`JOŽO bez šeku: p50 ${f(j.p50, 2)} · p90 ${f(j.p90, 2)} · p99 ${f(j.p99, 2)} · max ${f(j.max, 2)} · strop ${f(j.cap * 100, 3)} %`);
