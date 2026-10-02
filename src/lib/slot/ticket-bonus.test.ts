import { test } from "node:test";
import assert from "node:assert/strict";
import { dealJobs, dealOtrs, jobShownGoal, type JobCard } from "./spend.ts";
import { legNeed, ticketBonus } from "./ticket-bonus.ts";

const J = (o: Partial<JobCard>): JobCard => ({
  id: "t", floor: "stred", template: "zber", title: "T", detail: "", stake: 10, payout: 20,
  need: 5, have: 0, limit: 40, spun: 0, kind: "wins", scope: "base", lockBet: 1, ...o,
});

test("leg needs follow the counting rules", () => {
  assert.equal(legNeed("buy", "live"), "buy");
  assert.equal(legNeed("tumbles", "live"), "fs");
  assert.equal(legNeed("signal", "live"), "fs");
  assert.equal(legNeed("live", "base"), "trigger");
  assert.equal(legNeed("wins", "base"), null);
  assert.equal(legNeed("ticket", "base"), null);
});

test("single tickets", () => {
  assert.equal(ticketBonus(J({ template: "noc", kind: "buy", scope: "live" })).cta, "buy");
  assert.equal(ticketBonus(J({ template: "plechovky", kind: "tumbles", scope: "live" })).need, "fs");
  const siet = ticketBonus(J({ template: "siet", kind: "live", scope: "base" }));
  assert.equal(siet.need, "trigger");
  assert.equal(siet.cta, "ante");
  const plain = ticketBonus(J({}));
  assert.equal(plain.need, null);
  assert.equal(plain.cta, null);
  assert.equal(plain.dual, false);
});

test("dual ticket: base leg first, two counters", () => {
  const t = ticketBonus(
    J({ kind: "tumbles", template: "plechovky", scope: "live", need: 4, have: 1, kindB: "wins", templateB: "zber", scopeB: "base", needB: 14, haveB: 5 }),
  );
  assert.equal(t.dual, true);
  assert.equal(t.need, "fs");
  assert.deepEqual(t.legs.map((l) => [l.where, l.meter]), [["base", "5/14"], ["bonus", "1/4"]]);
  const both = ticketBonus(J({ kind: "signal", scope: "live", kindB: "buy", scopeB: "live", needB: 2, haveB: 0 }));
  assert.equal(both.dual, false);
  assert.equal(both.need, "buy");
});

test("read-only: never mutates a dealt ticket", () => {
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 200; i++) {
    for (const card of dealJobs(rng, 5000, 2)) {
      const copy = JSON.stringify(card);
      ticketBonus(card);
      assert.equal(JSON.stringify(card), copy);
    }
  }
});

test("two-goal ticket names both goals even when goal A is a symbol goal", () => {
  // Martin's ticket: 37× nevýherných Kufrík + sivý lístok, 7/37 + 0/1.
  const job = J({
    kind: "collect", template: "nevyherne", payId: "case", need: 37, have: 7,
    kindB: "ticket", templateB: "pot", scopeB: "base", needB: 1, haveB: 0,
    goal: "37× nevýherných Kufrík + 1× sivý lístok 1-FTTB",
  });
  assert.equal(jobShownGoal(job), "37× nevýherných Kufrík + 1× sivý lístok 1-FTTB");
  const t = ticketBonus(job);
  assert.deepEqual(
    t.legs.map((l) => [l.goal, l.meter, Math.round(l.pct * 100), l.done]),
    [["37× nevýherných Kufrík", "7/37", 19, false], ["1× sivý lístok 1-FTTB", "0/1", 0, false]],
  );
  for (let s = 1; s < 400; s++) {
    let x = s;
    const rng = () => ((x = (x * 16807) % 2147483647) / 2147483647);
    const otrs = dealOtrs(rng, 5000, 1);
    const legs = ticketBonus(otrs).legs;
    assert.equal(legs.length, 2);
    for (const l of legs) assert.ok(l.goal.length > 3, `seed ${s}: empty goal in ${otrs.goal}`);
  }
});
