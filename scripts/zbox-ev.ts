/**
 * Ž-BOX vs KONTROLA EV per rank (navrh.md 4.5). Same createRng as the game.
 *   npx tsx scripts/zbox-ev.ts [rounds=1000000] [seed=20261004]
 *   npx tsx scripts/zbox-ev.ts tune      — bisect P_PARCEL (blind) and the VIP values per rank
 */
import { createRng } from "../src/lib/slot/engine.ts";
import { RANK_PERKS } from "../src/lib/slot/ranks.ts";
import { kontrolaPlay, kontrolaTargets } from "../src/lib/slot/bonus-ev.ts";
import { P_PARCEL, ZBOX_CAP_X, playZbox, zboxVipOf } from "../src/lib/slot/zbox.ts";

function zboxStats(n: number, seed: number, vip: readonly number[], p = P_PARCEL) {
  const rng = createRng(seed);
  let s = 0, s2 = 0, full = 0, cap = 0, rounds = 0, cans = 0, mx = 0;
  const xs = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const r = playZbox(rng, { vip, p });
    s += r.totalX; s2 += r.totalX * r.totalX; xs[i] = r.totalX;
    if (r.full) full++;
    if (r.capped || r.totalX >= ZBOX_CAP_X) cap++;
    if (r.canSum) cans++;
    rounds += r.rounds.length;
    if (r.totalX > mx) mx = r.totalX;
  }
  const mean = s / n;
  xs.sort();
  return { mean, sd: Math.sqrt(s2 / n - mean * mean), se: Math.sqrt((s2 / n - mean * mean) / n), full: full / n, cap: cap / n, cans: cans / n, rounds: rounds / n, max: mx, p50: xs[n >> 1], p90: xs[Math.floor(n * 0.9)], p99: xs[Math.floor(n * 0.99)] };
}

function kontrolaStats(n: number, seed: number, cap: number, cnt: number) {
  const rng = createRng(seed);
  let s = 0, s2 = 0, z = 0;
  for (let i = 0; i < n; i++) { const x = kontrolaPlay(rng, cap, cnt); s += x; s2 += x * x; if (x === 0) z++; }
  const mean = s / n;
  return { mean, sd: Math.sqrt(s2 / n - mean * mean), zero: z / n };
}

const target = kontrolaTargets();
const args = process.argv.slice(2);

if (args[0] === "tune") {
  const N = Number(args[1] || 400000);
  const seed = 777;
  const bisect = (f: (v: number) => number, goal: number, lo: number, hi: number) => {
    for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (f(mid) < goal) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };
  const p = bisect((v) => zboxStats(N, seed, [], v).mean, target.kredit, 0.01, 0.1);
  console.log(`P_PARCEL ≈ ${p.toFixed(5)} (blind target ${target.kredit.toFixed(4)})`);
  const pr = Math.round(p * 10000) / 10000;
  for (const perk of RANK_PERKS) {
    if (perk.peekCount === 0) continue;
    const k = perk.peekCount;
    const v = bisect((x) => zboxStats(N, seed, Array(k).fill(x), pr).mean, target[perk.id], 0, 3);
    console.log(`${perk.id}: vip ${k}× ${v.toFixed(4)}`);
  }
  process.exit(0);
}

const N = Number(args[0] || 1_000_000);
const seed = Number(args[1] || 20261004);
console.log(`Ž-BOX vs KONTROLA, ${N.toLocaleString("sk-SK")} kôl na rank, seed ${seed}, P_PARCEL ${P_PARCEL}`);
console.log("| rank | KONTROLA presne | KONTROLA sim | Ž-BOX sim | ±SE | Δ % | Ž sd | P(plná) | P(cap) | P(príplatok) | kolá | p50 | p90 | p99 | max | VIP |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
let worst = 0;
for (const perk of RANK_PERKS) {
  const vip = zboxVipOf(perk.id);
  const k = kontrolaStats(N, seed + 1, perk.peekCap, perk.peekCount);
  const z = zboxStats(N, seed, vip);
  const d = (z.mean / target[perk.id] - 1) * 100;
  worst = Math.max(worst, Math.abs(d));
  console.log(`| ${perk.id} | ${target[perk.id].toFixed(4)} | ${k.mean.toFixed(4)} (sd ${k.sd.toFixed(2)}, P0 ${(k.zero * 100).toFixed(1)} %) | ${z.mean.toFixed(4)} | ${z.se.toFixed(4)} | ${d >= 0 ? "+" : ""}${d.toFixed(2)} | ${z.sd.toFixed(2)} | ${(z.full * 100).toFixed(3)} % | ${(z.cap * 100).toFixed(3)} % | ${(z.cans * 100).toFixed(1)} % | ${z.rounds.toFixed(2)} | ${z.p50} | ${z.p90} | ${z.p99} | ${z.max} | ${vip.join(" + ") || "—"} |`);
}
console.log(`najhoršia odchýlka ${worst.toFixed(2)} %`);
