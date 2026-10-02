import { test } from "node:test";
import assert from "node:assert/strict";
import { dealJobs, type JobCard } from "./spend.ts";
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
