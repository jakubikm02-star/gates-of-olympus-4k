import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyDrop, contribution, dropChance, POOL_ADD_MAX, POOL_SEED, shouldDrop } from "./jackpot.ts";
import { applyWeeklyDecay, buyTurnoverPunish, buyXOf, dropOneGroup, fsSpinsOf, perkOf, reloadPunish, rpFromDead, rpFromSpin, settleBuyRank, standing, WEEK_MS } from "./ranks.ts";

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

  it("pays the full jackpot and resets to seed", () => {
    const { payout, next } = applyDrop(4312.5);
    assert.equal(payout, 4312.5);
    assert.equal(next, POOL_SEED);
    const seedHit = applyDrop(2500);
    assert.equal(seedHit.payout, 2500);
    assert.equal(seedHit.next, POOL_SEED);
  });

  it("tickets raise drop chance", () => {
    assert.ok(dropChance(4, 10) > dropChance(1, 10));
    assert.ok(dropChance(1, 100) > dropChance(1, 1));
  });
});

describe("rank stake + perk", () => {
  it("higher stake at the same multiple yields more RP because cash is larger", () => {
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
    assert.ok(high.fromSum > low.fromSum);
    assert.ok(high.fromStake > low.fromStake);
    assert.ok(high.total > low.total);
  });

  it("36 cents is far less RP than 75 euros", () => {
    const chip = rpFromSpin({ cash: 0.36, bet: 100, mult: 1, tumbles: 0, streak: 1, banner: null, kind: "base" });
    const fat = rpFromSpin({ cash: 75, bet: 100, mult: 1, tumbles: 0, streak: 1, banner: null, kind: "base" });
    assert.ok(chip.total <= 8, `chip ${chip.total}`);
    assert.ok(fat.total >= 40, `fat ${fat.total}`);
    assert.ok(fat.total >= chip.total * 5);
  });

  it("dead spin is free in KREDIT and expensive at 100€ NEKONEČNO", () => {
    assert.equal(rpFromDead(1, 0).total, 0);
    const nekOne = rpFromDead(1, 10);
    const nekMax = rpFromDead(100, 10);
    assert.ok(nekMax.total <= -50, `max dead ${nekMax.total}`);
    assert.ok(nekOne.total > nekMax.total);
    assert.ok(nekOne.total < 0);
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
    assert.ok(win.parts.fromSum > 20);
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

  it("weekly drop sends 4KA TV II to SMART IV", () => {
    const tv2 = standing(1400);
    assert.equal(tv2.id, "telka");
    assert.equal(tv2.roman, "II");
    const next = standing(dropOneGroup(1400));
    assert.equal(next.id, "smart");
    assert.equal(next.roman, "IV");
    const kredit = dropOneGroup(50);
    assert.equal(kredit, 0);
    const now = 1_000_000_000_000;
    const fresh = applyWeeklyDecay(1400, 0, now);
    assert.equal(fresh.drops, 0);
    assert.equal(fresh.rp, 1400);
    const week = applyWeeklyDecay(1400, now - WEEK_MS - 1000, now);
    assert.equal(week.drops, 1);
    assert.equal(week.after.id, "smart");
    const afk = applyWeeklyDecay(1400, now - WEEK_MS * 10, now);
    assert.equal(afk.drops, 3);
  });
});
