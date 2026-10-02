import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DUAL_TRIES,
  dealJobs,
  dealOtrs,
  dualBonusLeg,
  jobClock,
  jobParknetBroke,
  jobSplit,
  jobStatus,
  tickJob,
  type JobCard,
  type JobEvent,
} from "./spend.ts";
import { ticketBonus } from "./ticket-bonus.ts";
import { sanitizePlayerSave } from "./player-save.ts";

const lcg = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

/** zber (base) + plechovky (4KA TV): 30 base spins, 3 rounds. */
const dual = (o: Partial<JobCard> = {}): JobCard => ({
  id: "otrs-t", floor: "stred", template: "zber", templateB: "plechovky", title: "OTRS", detail: "", stake: 100, payout: 200,
  kind: "wins", kindB: "tumbles", scope: "base", scopeB: "live", need: 3, have: 0, needB: 6, haveB: 0,
  limit: 30, spun: 0, tries: 3, triesUsed: 0, lockBet: 1, mystery: true, ...o,
});
const E = (o: Partial<JobEvent> = {}): JobEvent => ({
  win: false, dead: true, tumbles: 0, live: false, ticket: null, pdf: false, signal: 0, clusters: 0, orbs: false, ...o,
});
const baseWin = E({ win: true, dead: false, clusters: 1 });
const fsSpin = (cans = 0) => E({ liveSpin: true, orbs: cans > 0, orbCount: cans, win: cans > 0, dead: cans === 0 });
const natOver = E({ live: true, spun: false, featureOver: true });
const buyOver = E({ spun: false, bought: true, buyOver: true, featureOver: true });

test("dealt dual OTRS: base goal first, own base spins + 4KA TV rounds; other OTRS keep one clock", () => {
  const rng = lcg(11);
  let split = 0;
  for (let i = 0; i < 3000; i++) {
    const c = dealOtrs(rng, 5000, 2);
    if (!c.kindB) continue;
    if (dualBonusLeg(c)) {
      split += 1;
      assert.equal(dualBonusLeg(c), "B", "base goal is leg A");
      assert.ok(jobSplit(c));
      assert.equal(c.tries, DUAL_TRIES[c.floor][c.templateB!]);
      assert.equal(c.triesUsed, 0);
      assert.equal(c.limit % 5, 0);
      assert.match(c.detail, / v hre \+ \d kol[oá] 4KA TV$/);
    } else {
      assert.equal(c.tries, undefined);
      assert.equal(jobSplit(c), false);
    }
  }
  assert.ok(split > 300);
});

test("dealJobs still deals the same daily cards (no extra rng draws)", () => {
  const a = lcg(5);
  const b = lcg(5);
  for (let i = 0; i < 300; i++) {
    const x = dealJobs(a, 5000, 2);
    const y = dealJobs(b, 5000, 2);
    assert.deepEqual(x, y);
    for (const c of x.slice(0, 3)) assert.equal(c.tries, undefined);
  }
});

test("base spins never touch the 4KA TV rounds, 4KA TV spins never touch base spins", () => {
  let j = dual();
  for (let i = 0; i < 5; i++) j = tickJob(j, E());
  assert.equal(j.spun, 5);
  assert.equal(j.triesUsed, 0);
  for (let i = 0; i < 12; i++) j = tickJob(j, fsSpin(0));
  assert.equal(j.spun, 5, "free spins are not base spins");
  j = tickJob(j, natOver);
  assert.equal(j.triesUsed, 1, "a finished round with the bonus goal open is one attempt");
  assert.equal(j.spun, 5);
  assert.equal(jobStatus(j), "run");
});

test("bonus goal finished inside a round does not spend the round; ticket clears with both goals", () => {
  let j = dual({ have: 3 });
  j = tickJob(j, fsSpin(6));
  assert.equal(j.haveB, 6);
  assert.equal(jobStatus(j), "ok");
  assert.equal(j.triesUsed, 0);
});

test("fails when a goal runs out of its own budget", () => {
  // Base budget gone, rounds left.
  let a = dual({ spun: 29, have: 1 });
  a = tickJob(a, E());
  assert.equal(jobStatus(a), "fail");
  // Cap: 2 wins missing, 1 base spin left -> hopeless at once.
  let h = dual({ spun: 28, have: 0 });
  h = tickJob(h, baseWin);
  assert.equal(jobStatus(h), "fail");
  assert.equal(h.spun, h.limit);
  // Rounds gone, base spins left.
  let b = dual({ triesUsed: 2, haveB: 2 });
  b = tickJob(b, fsSpin(1));
  assert.equal(jobStatus(b), "run");
  b = tickJob(b, natOver);
  assert.equal(b.triesUsed, 3);
  assert.equal(jobStatus(b), "fail");
  assert.equal(jobClock(b), "NEÚSPEŠNÝ TIKET");
});

test("a finished goal ignores its budget; the other keeps going", () => {
  let j = dual({ have: 3, spun: 30 });
  assert.equal(jobStatus(j), "run", "base goal done, base spins used up: still running");
  j = tickJob(j, E());
  assert.equal(j.spun, 30);
  assert.match(jobClock(j), /základ hotový \+ 3 kolá 4KA TV/);
  let k = dual({ haveB: 6, triesUsed: 3 });
  assert.equal(jobStatus(k), "run");
  k = tickJob(k, baseWin);
  assert.equal(k.have, 1);
  assert.equal(k.spun, 1);
});

test("buy goal: only bought rounds are attempts; natural rounds are free", () => {
  let j = dual({ templateB: "noc", kindB: "buy", scopeB: "live", needB: 3, tries: 2 });
  j = tickJob(j, fsSpin(0));
  j = tickJob(j, natOver);
  assert.equal(j.triesUsed, 0);
  j = tickJob(j, E({ bought: true, liveSpin: true, win: true, dead: false }));
  assert.equal(j.haveB, 1);
  j = tickJob(j, buyOver);
  assert.equal(j.triesUsed, 1);
  assert.equal(jobStatus(j), "run", "a bought round that misses no longer kills the ticket on its own");
  // Unaffordable buy with the buy goal open: no way to finish.
  assert.equal(jobParknetBroke(j, 50, 1, 79), true);
  assert.equal(jobParknetBroke(j, 500, 1, 79), false);
});

test("older saves without tries keep the shared clock", () => {
  let j = dual({ tries: undefined, triesUsed: undefined, limit: 40 });
  assert.equal(jobSplit(j), false);
  j = tickJob(j, fsSpin(0));
  assert.equal(j.spun, 1, "legacy: free spins spend the shared clock");
  assert.match(jobClock(j), /^ešte 39 točení$/);
  assert.equal(ticketBonus(j).split, false);
  assert.match(ticketBonus(j).hint, /spoločný/);
});

test("save keeps tries; legacy save stays legacy", () => {
  const s = sanitizePlayerSave({ job: dual({ spun: 7, triesUsed: 1 }) });
  assert.equal(s.job?.tries, 3);
  assert.equal(s.job?.triesUsed, 1);
  assert.equal(s.job?.spun, 7);
  assert.equal(s.job?.limit, 30);
  const old = sanitizePlayerSave({ job: dual({ tries: undefined, triesUsed: undefined }) });
  assert.equal(old.job?.tries, undefined);
  assert.equal(jobSplit(old.job!), false);
  const bad = sanitizePlayerSave({ job: dual({ tries: 99, triesUsed: -4 }) });
  assert.equal(bad.job?.tries, 20);
  assert.equal(bad.job?.triesUsed, 0);
});

test("strip counters: each goal its own budget left", () => {
  const t = ticketBonus(dual({ have: 1, spun: 26, haveB: 2, triesUsed: 2 }));
  assert.equal(t.split, true);
  assert.deepEqual(
    t.legs.map((l) => [l.where, l.meter, l.left, l.late]),
    [["base", "1/3", "4 toč.", true], ["bonus", "2/6", "1 kolo", true]],
  );
  assert.match(t.hint, /vlastný limit/);
  const done = ticketBonus(dual({ have: 3, haveB: 1 }));
  assert.equal(done.legs[0].left, "✓");
  assert.equal(done.legs[1].budget, "3 kolá 4KA TV");
  const buy = ticketBonus(dual({ templateB: "noc", kindB: "buy", scopeB: "live", needB: 3, tries: 2 }));
  assert.equal(buy.legs[1].budget, "2 kolá kúpenej 4KA TV");
});
