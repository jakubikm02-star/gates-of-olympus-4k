/**
 * Nočná smena — decent-bot survey.
 *   node --experimental-strip-types scripts/feature-sim/nocna-sim.ts [runs] [seed]
 * Prints one text report. Does not touch the classic automat or the network.
 */
import { bucketCause, DECENT, playRun } from "../../src/lib/revier/bot.ts";

const runs = Math.max(1, Math.floor(Number(process.argv[2] ?? 400)));
const seed = Math.floor(Number(process.argv[3] ?? 20261122));

const floors = [0, 0, 0, 0, 0, 0, 0];
const causes = new Map<string, number>();
let turns = 0;
let fights = 0;
let cleared = 0;
let kills = 0;

for (let i = 0; i < runs; i++) {
  const row = playRun(seed + i * 997, DECENT);
  const slot = Math.min(6, Math.max(1, row.bestFloor));
  floors[slot] = (floors[slot] ?? 0) + 1;
  if (row.cleared5) cleared += 1;
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
  "max floor reached:",
];
for (let f = 1; f <= 6; f++) {
  const label = f === 6 ? "F6 Ranná špička" : `F${f}`;
  lines.push(`  ${label}: ${floors[f]} (${pct(floors[f] ?? 0)})`);
}
lines.push("death causes:");
const ordered = [...causes.entries()].sort((a, b) => b[1] - a[1]);
for (const [cause, n] of ordered) lines.push(`  ${cause}: ${n} (${pct(n)})`);
console.log(lines.join("\n"));
