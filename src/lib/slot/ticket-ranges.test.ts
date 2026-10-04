import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMBO_RANGES,
  DUAL_BASE_X,
  DUAL_TRIES,
  JOB_RANGES,
  PAY_RANGES,
  dealJobs,
  dealOtrs,
  jobSplit,
  jobStatus,
  payTilt,
  tickJob,
  type JobCard,
} from "./spend.ts";
import { sanitizePlayerSave } from "./player-save.ts";

const lcg = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

const FIXED_NEED = new Set(["siet", "pot", "vynos", "retaz"]);
const DERIVED = new Set(["vyherne", "nevyherne", "hydra", "odpis"]);

test("every dealt single ticket draws need and window from its od–do range", () => {
  const rng = lcg(3);
  for (let i = 0; i < 4000; i++) {
    for (const c of dealJobs(rng, 5000, 2)) {
      if (c.kindB) continue;
      const r = JOB_RANGES[c.template]![c.floor];
      assert.equal(c.limit % 5, 0);
      if (c.template === "vyherne") {
        assert.ok(c.need >= r.need[0] && c.need <= r.need[1], `${c.template} need ${c.need}`);
        assert.ok(c.limit >= r.window[0] && c.limit <= r.window[1], `${c.template} limit ${c.limit}`);
        continue;
      }
      if (c.template === "hydra") {
        assert.ok(c.limit >= r.window[0] && c.limit <= Math.max(r.window[1], 75), `hydra limit ${c.limit}`);
        continue;
      }
      if (DERIVED.has(c.template)) {
        assert.ok(c.limit >= r.window[0] && c.limit <= r.window[1], `${c.template} limit ${c.limit}`);
        continue;
      }
      assert.ok(c.need >= r.need[0] && c.need <= r.need[1], `${c.template}/${c.floor} need ${c.need}`);
      const slackMin = Math.max(5, Math.round((c.need + (c.scope === "live" ? 3 : 8)) / 5) * 5);
      assert.ok(c.limit >= r.window[0] && c.limit <= Math.max(r.window[1], slackMin), `${c.template}/${c.floor} limit ${c.limit}`);
    }
  }
});

test("combinations vary: each template × floor deals many need/window pairs", () => {
  const rng = lcg(5);
  const seen = new Map<string, Set<string>>();
  for (let i = 0; i < 6000; i++) {
    for (const c of dealJobs(rng, 5000, 2)) {
      if (c.kindB) continue;
      const k = `${c.template}/${c.floor}`;
      if (!seen.has(k)) seen.set(k, new Set());
      seen.get(k)!.add(`${c.need}:${c.limit}`);
    }
  }
  for (const [k, s] of seen) {
    const t = k.split("/")[0]!;
    const fixedFeature = JOB_RANGES[t]?.[k.split("/")[1] as "lacna"]?.need[0] === JOB_RANGES[t]?.[k.split("/")[1] as "lacna"]?.need[1];
    const min = t === "pot" || t === "sucho" ? 2 : FIXED_NEED.has(t) || fixedFeature ? 4 : 6;
    assert.ok(s.size >= min, `${k}: only ${s.size} combinations`);
  }
});

test("dual OTRS: N and M come from their ranges and vary", () => {
  const rng = lcg(9);
  const ms = new Set<number>();
  let n = 0;
  for (let i = 0; i < 4000; i++) {
    const c = dealOtrs(rng, 5000, 2);
    if (!jobSplit(c)) continue;
    n++;
    const [lo, hi] = DUAL_TRIES[c.floor][c.templateB!]!;
    assert.ok(c.tries! >= lo && c.tries! <= hi);
    assert.ok(c.limit >= 5 && c.limit <= 400 && c.limit % 5 === 0);
    ms.add(c.tries!);
  }
  assert.ok(n > 400);
  assert.ok(ms.size >= 3, "rounds budget varies");
  for (const f of ["lacna", "stred", "draha"] as const) {
    for (const span of Object.values(DUAL_BASE_X[f])) assert.ok(span[0] < span[1]);
    for (const span of Object.values(DUAL_TRIES[f])) assert.ok(span[0] < span[1]);
    assert.ok(COMBO_RANGES.same[f][0] < COMBO_RANGES.same[f][1]);
  }
});

test("payout follows drawn difficulty: harder end pays more, band unchanged at the center", () => {
  assert.equal(payTilt([], "stred"), 1);
  assert.ok(payTilt([1, 1], "stred") > payTilt([0, 0], "stred"));
  const c = PAY_RANGES.center.single.stred;
  assert.ok(Math.abs(payTilt([c], "stred") - 1) < 1e-9);
  assert.ok(payTilt([1], "lacna") <= 1 + PAY_RANGES.tilt);
  assert.ok(payTilt([0], "draha") >= 1 - PAY_RANGES.tilt);
  const rng = lcg(13);
  for (let i = 0; i < 500; i++) for (const c of dealJobs(rng, 5000, 2)) assert.ok(c.payout > c.stake);
});

test("old saved tickets (old fixed values, no new fields) still load and tick", () => {
  const old: JobCard = {
    id: "zber-stred-pick-1", floor: "stred", template: "zber", title: "ZBER", detail: "18× výherných spinov dokopy · 65 točení",
    goal: "18× výherných spinov dokopy", stake: 150, payout: 280, need: 18, have: 17, limit: 65, spun: 10,
    kind: "wins", scope: "base", lockBet: 2, mystery: false,
  };
  const saved = sanitizePlayerSave({ job: old });
  for (const k of ["need", "have", "limit", "spun", "stake", "payout", "template", "floor"] as const) assert.equal(saved.job?.[k], old[k]);
  const next = tickJob(saved.job!, { win: true, dead: false, tumbles: 0, live: false, ticket: null, pdf: false, signal: 0, clusters: 1, orbs: false });
  assert.equal(jobStatus(next), "ok");
  const dualOld: JobCard = {
    ...old, id: "otrs-stred-1", template: "zber", templateB: "plechovky", kindB: "tumbles", scopeB: "live",
    needB: 6, haveB: 0, have: 0, limit: 75, tries: 3, triesUsed: 0, mystery: true,
  };
  const s2 = sanitizePlayerSave({ job: dualOld });
  assert.equal(s2.job?.tries, 3);
  assert.ok(jobSplit(s2.job!));
});
