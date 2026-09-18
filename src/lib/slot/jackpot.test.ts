import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyDrop, contribution, dropChance, POOL_ADD_MAX, POOL_SEED, shouldDrop } from "./jackpot.ts";
import { perkOf, rpFromSpin } from "./ranks.ts";

describe("park pool", () => {
  it("takes 1.2% of stake, capped", () => {
    assert.equal(contribution(1), 0.01);
    assert.equal(contribution(10), 0.12);
    assert.equal(contribution(100), 1.2);
    assert.equal(contribution(2000), POOL_ADD_MAX);
  });

  it("must drop at cap", () => {
    assert.equal(shouldDrop(18000, 1, 1, () => 1), true);
    assert.equal(shouldDrop(2500, 1, 1, () => 1), false);
  });

  it("pays pool minus seed and resets", () => {
    const { payout, next } = applyDrop(4312.5);
    assert.equal(payout, 1812.5);
    assert.equal(next, POOL_SEED);
  });

  it("tickets raise drop chance", () => {
    assert.ok(dropChance(4, 10) > dropChance(1, 10));
    assert.ok(dropChance(1, 100) > dropChance(1, 1));
  });
});

describe("rank stake + perk", () => {
  it("higher stake yields more RP at the same multiple", () => {
    const low = rpFromSpin({
      cash: 10,
      bet: 1,
      mult: 1,
      tumbles: 0,
      streak: 1,
      banner: null,
      kind: "base",
    });
    const high = rpFromSpin({
      cash: 1000,
      bet: 100,
      mult: 1,
      tumbles: 0,
      streak: 1,
      banner: null,
      kind: "base",
    });
    assert.equal(low.fromSum, high.fromSum);
    assert.ok(high.fromStake > low.fromStake);
    assert.ok(high.total > low.total);
  });

  it("rank does not multiply RP", () => {
    const base = {
      cash: 50,
      bet: 1,
      mult: 2,
      tumbles: 2,
      streak: 2,
      banner: null,
      kind: "base" as const,
    };
    const kredit = rpFromSpin({ ...base, rankId: "kredit" });
    const top = rpFromSpin({ ...base, rankId: "nekonecno" });
    assert.equal(top.total, kredit.total);
    assert.equal(perkOf("nekonecno").jackTicket, 4);
    assert.equal(perkOf("sloboda").streakHold, true);
  });

  it("buy FS ranks net of 100× cost, not gross FS", () => {
    const bet = 1;
    const gross = rpFromSpin({
      cash: 250,
      bet,
      mult: 8,
      tumbles: 0,
      streak: 1,
      banner: null,
      kind: "fs",
    });
    const net = rpFromSpin({
      cash: 250 + 12 - 100,
      bet,
      mult: 8,
      tumbles: 0,
      streak: 1,
      banner: null,
      kind: "fs",
    });
    assert.equal(net.fromSum, Math.round(9 * Math.log2(1 + 162)));
    assert.ok(net.fromSum < gross.fromSum);
    const loss = rpFromSpin({
      cash: 40 - 100,
      bet,
      mult: 1,
      tumbles: 0,
      streak: 1,
      banner: null,
      kind: "fs",
    });
    assert.equal(loss.total, 0);
  });
});
