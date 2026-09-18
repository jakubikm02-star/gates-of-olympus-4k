import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyDrop, contribution, dropChance, POOL_ADD_MAX, POOL_SEED, shouldDrop } from "./jackpot.ts";
import { buyTurnoverPunish, buyXOf, fsSpinsOf, perkOf, reloadPunish, rpFromSpin, settleBuyRank } from "./ranks.ts";

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
    assert.equal(perkOf("smart").anteMul, 1.2);
    assert.equal(perkOf("optika").deadRebate, 0.05);
    assert.equal(perkOf("nekonecno").stickyOrbs, true);
    assert.equal(buyXOf("fiveg"), 95);
    assert.equal(buyXOf("nekonecno"), 90);
    assert.equal(fsSpinsOf("duo"), 16);
    assert.equal(fsSpinsOf("nekonecno"), 18);
  });

  it("buy FS ranks against the 100× turnover, not the 1€ bet", () => {
    const extras = { mult: 8, tumbles: 0, streak: 1, banner: null };
    const win = settleBuyRank({
      returned: 250,
      bet: 1,
      buyX: 100,
      entry: 5,
      extras,
    });
    const asBase = rpFromSpin({ cash: 250, bet: 1, ...extras, kind: "fs" });
    const vsBuy = rpFromSpin({ cash: 250, bet: 100, ...extras, kind: "fs" });
    assert.equal(win.delta, vsBuy.total);
    assert.ok(win.delta < asBase.total);
    assert.equal(win.parts.fromSum, Math.round(9 * Math.log2(1 + 2.5)));
  });

  it("losing buy takes dead-spin turnover, capped at one division", () => {
    assert.equal(buyTurnoverPunish(0, 100), 0);
    assert.equal(buyTurnoverPunish(5, 100), 100);
    const loss = settleBuyRank({
      returned: 40,
      bet: 1,
      buyX: 100,
      entry: 5,
      extras: { mult: 1, tumbles: 0, streak: 0, banner: null },
    });
    assert.ok(loss.delta < 0);
    assert.ok(loss.delta >= -100);
    const half = settleBuyRank({
      returned: 50,
      bet: 1,
      buyX: 100,
      entry: 5,
      extras: { mult: 1, tumbles: 0, streak: 0, banner: null },
    });
    assert.ok(half.delta > loss.delta);
    assert.ok(half.delta < 0);
  });

  it("reload at max bet costs more RP than one 5000 dump can farm", () => {
    const max = reloadPunish({ bet: 100, rp: 0, streak: 1, maxBet: 100 });
    const min = reloadPunish({ bet: 0.2, rp: 0, streak: 1, maxBet: 100 });
    const mid = reloadPunish({ bet: 1, rp: 0, streak: 1, maxBet: 100 });
    const farm =
      50 *
      0.3467 *
      (9 * Math.log2(1 + 0.9769 / 0.3467) + 2.8 * Math.log2(101));
    assert.ok(-max.delta > farm, `${-max.delta} should exceed farm ${farm}`);
    assert.ok(-min.delta < 120);
    assert.ok(-max.delta > -mid.delta);
    assert.ok(-mid.delta > -min.delta);
    const second = reloadPunish({ bet: 100, rp: 0, streak: 2, maxBet: 100 });
    assert.ok(-second.delta > -max.delta);
    const high = reloadPunish({ bet: 100, rp: 2700, streak: 1, maxBet: 100 });
    assert.ok(-high.delta > -max.delta);
  });
});
