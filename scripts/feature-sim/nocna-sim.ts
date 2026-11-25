/**
 * Nočná smena — decent-bot survey.
 *   node --experimental-strip-types scripts/feature-sim/nocna-sim.ts [runs] [seed]
 * Prints one text report. Does not touch the classic automat or the network.
 */
import { bucketCause, DECENT, playCareer, playRun } from "../../src/lib/revier/bot.ts";

const runs = Math.max(1, Math.floor(Number(process.argv[2] ?? 400)));
const seed = Math.floor(Number(process.argv[3] ?? 20261122));

const floors = [0, 0, 0, 0, 0, 0, 0];
const causes = new Map<string, number>();
let turns = 0;
let fights = 0;
let cleared = 0;
let reached4 = 0;
let cleared4 = 0;
let kills = 0;

for (let i = 0; i < runs; i++) {
  const row = playRun(seed + i * 997, DECENT);
  const slot = Math.min(6, Math.max(1, row.bestFloor));
  floors[slot] = (floors[slot] ?? 0) + 1;
  if (row.cleared5) cleared += 1;
  if (row.bestFloor >= 4) reached4 += 1;
  if (row.bestFloor >= 5) cleared4 += 1;
  turns += row.turns;
  fights += row.fights;
  kills += row.kills;
  const cause = bucketCause(row.cause);
  causes.set(cause, (causes.get(cause) ?? 0) + 1);
}

const pct = (n: number) => `${((100 * n) / runs).toFixed(1)}%`;
const lines = [
  `nocna-sim runs=${runs} seed=${seed} bot=${DECENT.id}`,
  `avg turns/fight=${fights ? (turns / fights).toFixed(2) : "0"} avg kills=${(kills / runs).toFixed(2)}`,
  `cleared F5 (reached Ranná špička)=${cleared} (${pct(cleared)})`,
  `reached F4=${reached4} (${pct(reached4)}) cleared F4=${cleared4} (${pct(cleared4)}) F4 clear among those who arrived=${reached4 ? ((100 * cleared4) / reached4).toFixed(1) : "0"}%`,
  "max floor reached:",
];
for (let f = 1; f <= 6; f++) {
  const label = f === 6 ? "F6 Ranná špička" : `F${f}`;
  lines.push(`  ${label}: ${floors[f]} (${pct(floors[f] ?? 0)})`);
}
lines.push("death causes:");
const ordered = [...causes.entries()].sort((a, b) => b[1] - a[1]);
for (const [cause, n] of ordered) lines.push(`  ${cause}: ${n} (${pct(n)})`);
let m1 = 0;
let m10 = 0;
let m30 = 0;
for (let i = 0; i < runs; i++) {
  const career = playCareer(seed + i * 997, 30, DECENT);
  if (career.mornings[0]) m1 += 1;
  if (career.mornings[9]) m10 += 1;
  if (career.mornings[29]) m30 += 1;
}
lines.push(`meta mornings run1=${m1} (${pct(m1)}) run10=${m10} (${pct(m10)}) run30=${m30} (${pct(m30)})`);
console.log(lines.join("\n"));
