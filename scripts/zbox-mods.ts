/**
 * Ž-BOX special parcels: how often each lands and what it is worth (blind rank).
 *   npx tsx scripts/zbox-mods.ts [runs=1000000] [seed=4243]
 */
import { createRng } from "../src/lib/slot/engine.ts";
import { ZBOX_MODS, playZbox, type ZMod } from "../src/lib/slot/zbox.ts";

const N = Number(process.argv[2] || 1_000_000);
const rng = createRng(Number(process.argv[3] || 4243));
const cnt: Record<string, number> = {};
const runs: Record<string, number> = {};
const gain: Record<string, number> = {};
let any = 0, parcels = 0, rounds = 0;
for (let i = 0; i < N; i++) {
  const p = playZbox(rng);
  const seen = new Set<ZMod>();
  for (const r of p.rounds) {
    rounds++;
    parcels += r.parcels.length;
    for (const f of r.fx) {
      if (!f.tick) cnt[f.mod] = (cnt[f.mod] ?? 0) + 1;
      seen.add(f.mod);
    }
  }
  for (const m of seen) runs[m] = (runs[m] ?? 0) + 1;
  if (seen.size) any++;
}
console.log(`${N.toLocaleString("sk-SK")} Ž-BOXov (KREDIT), priemerne ${(rounds / N).toFixed(2)} kôl, ${(parcels / N).toFixed(2)} nových balíkov / Ž-BOX`);
console.log(`P(aspoň 1 špeciál v Ž-BOXe) ${((any / N) * 100).toFixed(2)} %`);
console.log("| špeciál | váha | na Ž-BOX | P(aspoň 1 v Ž-BOXe) | 1 z |");
console.log("|---|---|---|---|---|");
for (const m of ZBOX_MODS) {
  const c = cnt[m.mod] ?? 0, r = runs[m.mod] ?? 0;
  console.log(`| ${m.name} | ${m.w} | ${(c / N).toFixed(4)} | ${((r / N) * 100).toFixed(2)} % | ${r ? Math.round(N / r) : "—"} |`);
}
void gain;
