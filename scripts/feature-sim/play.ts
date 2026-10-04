/**
 * Feature-ticket end-to-end check: real dealFeature (spend.ts) + real tickJob over the engine stream.
 *   npx tsx scripts/feature-sim/play.ts [spinsPerSeed] [seeds] [ticketsPerCell]
 * Per template × floor: clear rate and return per € (payout / stake, failed = 0), the same measure as
 * /workspace/ticket-ranges/sim-table.md. Also checks no ticket outlives its budget + one run.
 */
import { makeStream, type Stream } from "./stream.ts";
import { createRng } from "../../src/lib/slot/engine.ts";
import { dealFeature, featureOf, jobStatus, tickJob, FEATURE_TEMPLATE_IDS, JOB_RANGES, type JobCard, type JobEvent, type JobFloor } from "../../src/lib/slot/spend.ts";

export function spinEvent(s: Stream, i: number): JobEvent {
  const f = s.flags[i];
  const win = (f & 1) !== 0;
  return {
    win,
    dead: !win,
    tumbles: 0,
    live: (f & 16) !== 0,
    ticket: null,
    pdf: false,
    signal: 0,
    clusters: 0,
    orbs: false,
    cash: s.winX[i],
    chasing: (f & 2) !== 0,
    chaseStart: (f & 4) !== 0,
    chaseHits: (f & 2) !== 0 ? s.chaseHits[i] : undefined,
    chaseX: (f & 2) !== 0 ? s.chaseWinX[i] : undefined,
    chaseOver: (f & 8) !== 0,
    pityAdd: s.pityAdd[i] || undefined,
    bonusArmed: (f & 64) !== 0,
  };
}

export function bonusEvent(s: Stream, i: number): JobEvent {
  return {
    win: s.bonusX[i] > 0,
    dead: false,
    tumbles: 0,
    live: false,
    ticket: null,
    pdf: false,
    signal: 0,
    clusters: 0,
    orbs: false,
    spun: false,
    bonus: {
      mode: s.bonusMode[i] === 2 ? "zbox" : s.bonusMode[i] === 3 ? "koleso" : "kontrola",
      x: s.bonusX[i],
      safes: s.safes[i],
      cleared: s.cleared[i] === 1,
      canSum: s.canSum[i],
      rounds: s.rounds[i],
    },
  };
}

/** Plays one ticket from `start`. Returns the final card and how many stream spins it took. */
export function playTicket(s: Stream, start: number, job: JobCard): { job: JobCard; used: number } {
  let j = job;
  for (let k = 0; k < 5000; k++) {
    const i = (start + k) % s.n;
    j = tickJob(j, spinEvent(s, i));
    if (s.flags[i] & 64) j = tickJob(j, bonusEvent(s, i));
    if (jobStatus(j) !== "run") return { job: j, used: k + 1 };
  }
  return { job: j, used: 5000 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const per = Number(process.argv[2] ?? 400000);
  const seeds = Number(process.argv[3] ?? 4);
  const nT = Number(process.argv[4] ?? 6000);
  const streams: Stream[] = [];
  for (let k = 11; k < 11 + seeds; k++) streams.push(makeStream(per, k));
  const rng = createRng(2026);
  const rows: string[] = ["| šablóna | funkcia | pásmo | cieľ | točenia | úspešnosť | návratnosť/€ | max. presah |", "|---|---|---|---|---|---|---|---|"];
  const tot: Record<string, { ok: number; n: number; ret: number }> = {};
  for (const id of FEATURE_TEMPLATE_IDS) {
    for (const floor of ["lacna", "stred", "draha"] as JobFloor[]) {
      if (id === "priplatok" && floor !== "draha") continue;
      let ok = 0, ret = 0, over = 0;
      for (let t = 0; t < nT; t++) {
        const s = streams[t % streams.length];
        const card = dealFeature(id, floor, rng, 5000, 1);
        const r = playTicket(s, Math.floor(rng() * s.n), card);
        if (jobStatus(r.job) === "ok") { ok++; ret += r.job.payout / r.job.stake; }
        over = Math.max(over, r.used - card.limit);
      }
      const R = JOB_RANGES[id][floor];
      rows.push(`| ${id} | ${featureOf(id)} | ${floor} | ${R.need[0]}–${R.need[1]} | ${R.window[0]}–${R.window[1]} | ${((ok / nT) * 100).toFixed(1)} % | ${(ret / nT).toFixed(3)} | ${over} |`);
      const k = floor;
      tot[k] = tot[k] ?? { ok: 0, n: 0, ret: 0 };
      tot[k].ok += ok; tot[k].n += nT; tot[k].ret += ret;
    }
  }
  console.log(rows.join("\n"));
  console.log("\n| pásmo | úspešnosť (všetky feature) | návratnosť/€ |\n|---|---|---|");
  for (const [k, v] of Object.entries(tot)) console.log(`| ${k} | ${((v.ok / v.n) * 100).toFixed(1)} % | ${(v.ret / v.n).toFixed(3)} |`);
}
