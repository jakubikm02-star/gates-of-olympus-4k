import { test } from "node:test";
import assert from "node:assert/strict";
import { dealJobs, dealOtrs, jobMeter, shownOnGrid, tickJob, type JobCard, type JobEvent } from "./spend.ts";
import type { PayId } from "./symbols.ts";

const lcg = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

type G = { kind: string; payId?: PayId }[][];
const pay = (payId: PayId) => ({ kind: "pay", payId });
/** 5 rows × 6 reels: four OLP-87 (meter), one scatter, rest mixed. */
const GRID: G = [
  [pay("meter"), pay("rj45"), pay("router"), pay("hap"), pay("roof"), { kind: "scatter" }],
  [pay("arris"), pay("meter"), pay("case"), pay("dacia"), pay("pdf"), pay("rj45")],
  [pay("router"), pay("hap"), pay("meter"), pay("roof"), pay("arris"), pay("case")],
  [pay("dacia"), pay("pdf"), pay("rj45"), pay("router"), pay("hap"), pay("meter")],
  [pay("roof"), pay("arris"), pay("case"), pay("dacia"), pay("pdf"), pay("rj45")],
];

/** The event exactly as use-slot-game builds it after the reel stop. */
const spinEv = (job: JobCard, grid: G, o: Partial<JobEvent> = {}): JobEvent => {
  const shownBy = shownOnGrid(grid);
  return {
    win: false, dead: true, tumbles: 0, live: false, ticket: null, pdf: false, signal: 0, clusters: 0, orbs: false,
    pays: [], liveSpin: false, shown: job.payId ? (shownBy[job.payId] ?? 0) : 0, shownBy, ...o,
  };
};

/** The reported ticket: KOMBINÁCIA, 8× spinov s 2+ Cluster tumble (goal A) + 102× nevýherných OLP-87 (goal B). */
const combo = (o: Partial<JobCard> = {}): JobCard => ({
  id: "otrs-olp", floor: "stred", template: "balik", templateB: "nevyherne", title: "KOMBINÁCIA", detail: "",
  stake: 50, payout: 120, kind: "chain", kindB: "collect", scope: "base", scopeB: "base",
  need: 8, have: 0, needB: 102, haveB: 0, limit: 200, spun: 0, lockBet: 1, mystery: true,
  payId: undefined, payIdB: "meter", ...o,
});

test("shownOnGrid counts every pay symbol, skips non-pay cells", () => {
  const by = shownOnGrid(GRID);
  assert.equal(by.meter, 4);
  assert.equal(by.rj45, 4);
  assert.equal(Object.values(by).reduce((a, b) => a + (b ?? 0), 0), 29);
});

test("OTRS second goal nevýherných OLP-87 counts landed OLP-87 (was stuck at 0/102)", () => {
  let job = combo();
  job = tickJob(job, spinEv(job, GRID, { tumbles: 2, win: true, dead: false, pays: ["rj45"] }));
  assert.equal(job.have, 1, "2+ Cluster tumble goal still counts");
  assert.equal(job.haveB, 4, "four OLP-87 that did not pay");
  job = tickJob(job, spinEv(job, GRID));
  assert.equal(job.haveB, 8);
  assert.match(jobMeter(job), /8\/102/);
});

test("OLP-87 that paid on the spin adds nothing, on either goal", () => {
  const b = combo();
  assert.equal(tickJob(b, spinEv(b, GRID, { win: true, dead: false, pays: ["meter"] })).haveB, 0);
  const a = combo({ template: "nevyherne", templateB: "balik", kind: "collect", kindB: "chain", payId: "meter", payIdB: undefined, need: 102, needB: 8 });
  assert.equal(tickJob(a, spinEv(a, GRID, { win: true, dead: false, pays: ["meter"] })).have, 0);
  assert.equal(tickJob(a, spinEv(a, GRID)).have, 4);
});

test("a winning-symbol first goal does not leak its count into the nevýherných second goal", () => {
  const j = combo({ template: "vyherne", kind: "symbol", payId: "pdf", need: 3, payIdB: "meter" });
  assert.equal(shownOnGrid(GRID).pdf, 3);
  const n = tickJob(j, spinEv(j, GRID));
  assert.equal(n.haveB, 4, "meter count (4), not the pdf count (3) of goal A");
});

test("every dealt nevýherných variant (single, OTRS goal A, OTRS goal B, split) counts its own symbol", () => {
  const seen = new Set<string>();
  for (let seed = 1; seed <= 400; seed++) {
    const rng = lcg(seed);
    const deals = [...dealJobs(rng, 5000, 1), dealOtrs(rng, 5000, 1), dealOtrs(rng, 5000, 1)];
    for (const j of deals) {
      const legA = j.kind === "collect";
      const legB = Boolean(j.kindB) && j.kindB === "collect";
      if (!legA && !legB) continue;
      const id = (legA ? j.payId : j.payIdB) as PayId;
      assert.ok(id, `${j.id} has a symbol`);
      const grid: G = GRID.map((row) => row.map((c) => (c.kind === "pay" && c.payId === "meter" ? pay(id) : c.payId === id ? pay(id === "rj45" ? "router" : "rj45") : c)));
      const want = shownOnGrid(grid)[id] ?? 0;
      assert.equal(want, 4);
      const n = tickJob(j, spinEv(j, grid));
      assert.equal(legA ? n.have : n.haveB, 4, `${j.id} ${legA ? "A" : "B"} ${id}`);
      seen.add(`${j.kindB ? (j.tries != null ? "split" : "combo") : "single"}-${legA ? "A" : "B"}`);
    }
  }
  for (const k of ["single-A", "combo-A", "combo-B"]) assert.ok(seen.has(k), `dealt ${k}`);
});

test("old saves / events without shownBy still use shown for goal A", () => {
  const j = combo({ template: "nevyherne", templateB: "balik", kind: "collect", kindB: "chain", payId: "meter", payIdB: undefined, need: 102, needB: 8 });
  const ev = spinEv(j, GRID);
  delete ev.shownBy;
  assert.equal(tickJob(j, ev).have, 4);
});
