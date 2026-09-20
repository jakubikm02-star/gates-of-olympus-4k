import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  contribution,
  hiddenFloor,
  isEligibleBet,
  MUST_HIT_SPINS,
  reserveTake,
  rollHidden,
  rollTicket,
  simulateTable,
  ticketResolve,
  TIER_BY_ID,
  TIERS,
  TICKET_ODDS,
} from "./jackpot.ts";
import { applyWeeklyDecay, buyTurnoverPunish, buyXOf, dropOneGroup, fsSpinsOf, perkOf, reloadPunish, rpFromDead, rpFromSpin, settleBuyRank, standing, WEEK_MS } from "./ranks.ts";
import { pityGain } from "./pick-bonus.ts";
import { canSpend, dealJobs, jobClock, jobLeft, jobStatus, tickJob, SURPLUS_X } from "./spend.ts";
import { ORB_TABLE, ORB_VALUES } from "./symbols.ts";

describe("park jackpots", () => {
  it("takes 2.3% visible + 0.3% reserve", () => {
    assert.equal(contribution(100), 2.3);
    assert.equal(reserveTake(100), 0.3);
    assert.equal(contribution(0), 0);
    assert.ok(isEligibleBet(100));
    assert.ok(!isEligibleBet(99));
  });

  it("hidden sits between seed+15% range and cap", () => {
    const t = TIER_BY_ID.stat;
    const lo = hiddenFloor(t);
    assert.equal(lo, 135_000);
    for (let i = 0; i < 40; i++) {
      const h = rollHidden(t, () => i / 39);
      assert.ok(h >= lo && h <= t.cap, `h=${h}`);
    }
  });

  it("1 spin × 3 players: ŠTÁT stays on hundreds of thousands, ULICA ticks", () => {
    const pots = simulateTable(1, 3, 100, () => 0.5);
    const ulica = pots.find((p) => p.id === "ulica")!;
    const stat = pots.find((p) => p.id === "stat")!;
    assert.equal(stat.hits, 0);
    assert.ok(stat.pool >= 120_000 && stat.pool < 121_000, `stat ${stat.pool}`);
    assert.ok(ulica.pool > 500 && ulica.pool < 520, `ulica ${ulica.pool}`);
  });

  it("500 spins × 3: ULICA drops, ŠTÁT does not", () => {
    let s = 1;
    const rng = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
    const pots = simulateTable(500, 3, 100, rng);
    const ulica = pots.find((p) => p.id === "ulica")!;
    const stat = pots.find((p) => p.id === "stat")!;
    assert.ok(ulica.hits >= 1, `ulica hits ${ulica.hits}`);
    assert.equal(stat.hits, 0);
    assert.ok(stat.pool >= 120_000, `stat ${stat.pool}`);
    assert.ok(stat.pool < 140_000, `stat grew too fast ${stat.pool}`);
  });

  it("tier contrib rates match the table", () => {
    assert.equal(TIERS[0].contrib, 0.008);
    assert.equal(TIERS[1].contrib, 0.006);
    assert.equal(TIERS[2].contrib, 0.005);
    assert.equal(TIERS[3].contrib, 0.004);
    assert.equal(TIERS[3].winnerShare, 0.7);
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

describe("kontrola pity", () => {
  it("dead spin is always +2, wins give 0, 3 scatters +30", () => {
    assert.equal(pityGain(0, false), 0);
    assert.equal(pityGain(1, false), 0);
    assert.equal(pityGain(0, true), 2);
    assert.equal(pityGain(3, false), 30);
    assert.equal(pityGain(4, true), 0);
    assert.equal(perkOf("nekonecno").pityBonus, 0);
    assert.equal(perkOf("fiveg").pityBonus, 0);
    assert.equal(perkOf("telka").pityBonus, 0);
    assert.equal(perkOf("telka").jackTicket, 2);
  });
});

describe("plechovky", () => {
  const tot = ORB_TABLE.reduce((s, o) => s + o.w, 0);
  const share = (lo: number, hi: number) =>
    ORB_TABLE.filter((o) => o.value >= lo && o.value <= hi).reduce((s, o) => s + o.w, 0) / tot;
  const mean = ORB_TABLE.reduce((s, o) => s + o.value * o.w, 0) / tot;

  it("uses the official 15-value pool", () => {
    assert.deepEqual(ORB_TABLE.map((o) => o.value), [...ORB_VALUES]);
    assert.equal(new Set(ORB_VALUES).size, 15);
  });

  it("low cans dominate, mean ~7×, 500× rarer than PDF 8+", () => {
    assert.ok(share(2, 5) > 0.68 && share(2, 5) < 0.76, `2-5 ${share(2, 5)}`);
    assert.ok(share(6, 15) > 0.16 && share(6, 15) < 0.26, `6-15 ${share(6, 15)}`);
    assert.ok(share(50, 100) < 0.04, `50-100 ${share(50, 100)}`);
    assert.ok(share(250, 500) < 0.008, `250-500 ${share(250, 500)}`);
    assert.ok(mean > 6 && mean < 9, `mean ${mean}`);
    const p500 = (ORB_TABLE.find((o) => o.value === 500)?.w ?? 0) / tot;
    assert.ok(p500 < 1 / 100);
  });
});

describe("lístok", () => {
  it("grey is rarer than PDF 8+ anchor 1/100", () => {
    assert.ok(TICKET_ODDS.ulica < 1 / 100);
    assert.ok(TICKET_ODDS.ulica <= 1 / 2400 + 1e-12);
    assert.ok(TICKET_ODDS.stat <= 1 / 80000 + 1e-12);
  });

  it("rollTicket returns at most one color", () => {
    assert.equal(rollTicket(() => 0), "ulica");
    assert.equal(rollTicket(() => 0.999), null);
    assert.equal(rollTicket(() => 0.5, "stat"), "stat");
  });

  it("4tv trigger stashes the ticket, LIVE defers claim", () => {
    assert.equal(ticketResolve(true, false, "ulica"), "stash");
    assert.equal(ticketResolve(false, true, "kraj"), "stash");
    assert.equal(ticketResolve(false, false, "okres"), "claim");
    assert.equal(ticketResolve(false, false, null), "none");
  });

  it("crossing hidden does not pay until the window + force", () => {
    const rng = () => 0.999;
    const pots = simulateTable(80, 1, 100, rng);
    const ulica = pots.find((p) => p.id === "ulica")!;
    assert.equal(ulica.hits, 0, "80 spins without tickets must not mystery-pay");
    const forced = simulateTable(2000, 1, 100, rng);
    const hit = forced.find((p) => p.id === "ulica")!;
    assert.ok(hit.hits >= 1, `must-hit should force after window, hits=${hit.hits}`);
  });

  it("must-hit window is 15 then force on 16", () => {
    assert.equal(MUST_HIT_SPINS, 15);
  });
});

describe("míňať", () => {
  it("surplus is 500× bet and jobs use three floors", () => {
    assert.equal(SURPLUS_X, 500);
    assert.equal(canSpend(49999, 100), false);
    assert.equal(canSpend(50000, 100), true);
    let s = 1;
    const rng = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
    const jobs = dealJobs(rng);
    assert.equal(jobs.length, 3);
    assert.deepEqual(
      jobs.map((j) => j.floor),
      ["lacna", "stred", "draha"],
    );
    const titles = new Set(jobs.map((j) => j.template));
    assert.equal(titles.size, 3);
    const cheap = jobs[0].stake;
    const mid = jobs[1].stake;
    const dear = jobs[2].stake;
    assert.ok(cheap >= 1000 && cheap <= 2500);
    assert.ok(mid >= 8000 && mid <= 15000);
    assert.ok(dear >= 40000 && dear <= 90000);
    for (const j of jobs) {
      assert.equal(j.limit % 5, 0);
      assert.ok(j.limit >= 25 && j.limit <= 50);
      assert.equal(jobLeft(j), j.limit);
      assert.equal(jobClock(j), `ešte ${j.limit} točení`);
    }
  });

  it("DUO counts two clusters on one spin, including sequential tumbles", () => {
    const duo: ReturnType<typeof dealJobs>[number] = {
      id: "duo",
      floor: "lacna",
      template: "duo",
      title: "DUO",
      detail: "2× dva clustre na spine",
      stake: 1000,
      payout: 2000,
      need: 2,
      have: 0,
      limit: 30,
      spun: 0,
      kind: "wins",
    };
    const one = tickJob(duo, {
      win: true,
      dead: false,
      tumbles: 1,
      live: false,
      ticket: null,
      pdf: false,
      signal: 0,
      clusters: 1,
      orbs: false,
    });
    assert.equal(one.have, 0);
    const two = tickJob(duo, {
      win: true,
      dead: false,
      tumbles: 1,
      live: false,
      ticket: null,
      pdf: false,
      signal: 0,
      clusters: 2,
      orbs: false,
    });
    assert.equal(two.have, 1);
    assert.equal(two.spun, 1);
  });

  it("POT job needs a grey ticket, not a silent must-hit", () => {
    const job = dealJobs(() => 0.1).find((j) => j.kind === "ticket") ?? {
      id: "pot",
      floor: "lacna" as const,
      template: "pot",
      title: "POT",
      detail: "",
      stake: 1000,
      payout: 2000,
      need: 1,
      have: 0,
      limit: 40,
      spun: 0,
      kind: "ticket" as const,
    };
    const miss = tickJob(job, {
      win: true,
      dead: false,
      tumbles: 0,
      live: false,
      ticket: "stat",
      pdf: false,
      signal: 0,
      clusters: 1,
      orbs: false,
    });
    assert.equal(miss.have, 0);
    const hit = tickJob(job, {
      win: false,
      dead: true,
      tumbles: 0,
      live: false,
      ticket: "ulica",
      pdf: false,
      signal: 0,
      clusters: 0,
      orbs: false,
    });
    assert.equal(hit.have, 1);
    assert.equal(jobStatus(hit), "ok");
  });
});
