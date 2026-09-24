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
import { applyWeeklyDecay, buyTurnoverPunish, buyXOf, dropOneGroup, fsSpinsOf, perkOf, reloadPunish, rpFromDead, rpFromJob, rpFromSpin, settleBuyRank, standing, WEEK_MS } from "./ranks.ts";
import { pityGain } from "./pick-bonus.ts";
import { startDuel, tickDuel, confirmSwap, duelWinner, applyPeerTick, duelPot, duelCreditDelta, canDuelSpin, duelView, forfeitDuel } from "./duel.ts";
import { canSpend, dealJobs, hydraSplit, jobChip, jobClock, jobLcd, jobLeft, jobParknetBroke, jobStatus, symbolNeed, tickJob, spinWord, JOB_BANK, JOB_TEMPLATE_IDS, type JobCard } from "./spend.ts";
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
    const huge = rpFromSpin({ cash: 500, bet: 1, mult: 1, tumbles: 0, streak: 1, banner: null, kind: "base" });
    assert.ok(chip.total <= 4, `chip ${chip.total}`);
    assert.ok(fat.total >= 36 && fat.total <= 55, `fat ${fat.total}`);
    assert.ok(huge.total >= 90 && huge.total <= 140, `500€ ${huge.total}`);
    assert.ok(fat.total >= chip.total * 8);
  });

  it("published extras match the curve", () => {
    const m2 = rpFromSpin({ cash: 10, bet: 1, mult: 2, tumbles: 0, streak: 1, banner: null, kind: "base" });
    const m10 = rpFromSpin({ cash: 10, bet: 1, mult: 10, tumbles: 0, streak: 1, banner: null, kind: "base" });
    const m50 = rpFromSpin({ cash: 10, bet: 1, mult: 50, tumbles: 0, streak: 1, banner: null, kind: "base" });
    assert.equal(m2.fromMult, 4);
    assert.equal(m10.fromMult, 12);
    assert.ok(m50.fromMult >= 18 && m50.fromMult <= 20);
    const s2 = rpFromSpin({ cash: 10, bet: 1, mult: 1, tumbles: 0, streak: 2, banner: null, kind: "base" });
    const s5 = rpFromSpin({ cash: 10, bet: 1, mult: 1, tumbles: 0, streak: 5, banner: null, kind: "base" });
    assert.equal(s2.fromStreak, 2);
    assert.equal(s5.fromStreak, 14);
    const t = rpFromSpin({ cash: 10, bet: 1, mult: 1, tumbles: 5, streak: 1, banner: null, kind: "base" });
    assert.equal(t.fromTumble, 5);
    const big = rpFromSpin({ cash: 10, bet: 1, mult: 1, tumbles: 0, streak: 1, banner: "big", kind: "base" });
    const max = rpFromSpin({ cash: 10, bet: 1, mult: 1, tumbles: 0, streak: 1, banner: "max", kind: "base" });
    assert.equal(big.fromBanner, 4);
    assert.equal(max.fromBanner, 18);
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
  it("jobs open at 100 credit and scale with bank and bet", () => {
    assert.equal(JOB_BANK, 100);
    assert.equal(canSpend(99.99), false);
    assert.equal(canSpend(100), true);
    assert.equal(canSpend(150, 1), true);
    let s = 1;
    const rng = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
    const small = dealJobs(rng, 200, 1);
    s = 1;
    const fat = dealJobs(rng, 20000, 1);
    s = 1;
    const highBet = dealJobs(rng, 200, 100);
    assert.equal(small.length, 4);
    assert.deepEqual(
      small.slice(0, 3).map((j) => j.floor),
      ["lacna", "stred", "draha"],
    );
    assert.equal(small[3].mystery, true);
    assert.ok(small[0].stake < small[1].stake);
    assert.ok(small[1].stake < small[2].stake);
    assert.ok(small[2].stake < 200);
    assert.ok(small.every((j) => j.payout > j.stake));
    assert.ok(small.every((j) => j.lockBet === 1));
    assert.ok(fat[0].stake > small[0].stake);
    assert.ok(highBet[0].stake > small[0].stake);
    for (const j of small.slice(0, 3)) {
      assert.equal(j.limit % 5, 0);
      assert.ok(j.limit >= 15 && j.limit <= 100);
      assert.ok(j.need >= 1 && j.need <= j.limit);
      assert.equal(jobLeft(j), j.limit);
      const clock = jobClock(j);
      assert.ok(clock === `ešte ${j.limit} ${spinWord(j.limit)}` || clock === "ČAKÁ NA PARKNET");
    }
    s = 99;
    const other = dealJobs(rng, 200, 1);
    const same = small.map((j) => `${j.template}:${j.need}:${j.limit}:${j.title}`).join("|");
    const alt = other.map((j) => `${j.template}:${j.need}:${j.limit}:${j.title}`).join("|");
    assert.notEqual(same, alt);
  });

  it("OTRS rolls every job template in the game", () => {
    let s = 7;
    const rng = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
    const seen = new Set<string>();
    for (let i = 0; i < 800; i++) {
      const otrs = dealJobs(rng, 5000, 2).find((j) => j.mystery);
      if (otrs) seen.add(otrs.template);
    }
    const missing = JOB_TEMPLATE_IDS.filter((id) => !seen.has(id));
    assert.deepEqual(missing, []);
  });

  it("Slovak spin words and SPLNENÁ", () => {
    assert.equal(spinWord(1), "točenie");
    assert.equal(spinWord(2), "točenia");
    assert.equal(spinWord(4), "točenia");
    assert.equal(spinWord(5), "točení");
    assert.equal(spinWord(12), "točení");
    assert.equal(spinWord(22), "točenia");
  });

  it("a paid job awards RP from the payout", () => {
    const tiny = rpFromJob(35, 20);
    const fat = rpFromJob(35000, 18000);
    assert.ok(tiny.total >= 1);
    assert.ok(fat.total > tiny.total);
  });

  it("REŤAZ is 3 wins in a row, a dead spin resets", () => {
    const chain: ReturnType<typeof dealJobs>[number] = {
      id: "retaz",
      floor: "lacna",
      template: "retaz",
      title: "REŤAZ",
      detail: "3× výhier v rade",
      stake: 20,
      payout: 35,
      need: 8,
      have: 5,
      limit: 25,
      spun: 0,
      kind: "wins",
      lockBet: 1,
    };
    const patched = tickJob(chain, {
      win: true,
      dead: false,
      tumbles: 0,
      live: false,
      ticket: null,
      pdf: false,
      signal: 0,
      clusters: 1,
      orbs: false,
    });
    assert.equal(patched.need, 3);
    assert.equal(patched.limit, 50);
    assert.equal(patched.have, 3);
    const dead = tickJob({ ...patched, have: 2 }, {
      win: false,
      dead: true,
      tumbles: 0,
      live: false,
      ticket: null,
      pdf: false,
      signal: 0,
      clusters: 0,
      orbs: false,
    });
    assert.equal(dead.have, 0);
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
      lockBet: 1,
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
    const job = dealJobs(() => 0.1, 5000, 1).find((j) => j.kind === "ticket") ?? {
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
      lockBet: 1,
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

  it("WifiPRO / STB / multi tumble / cestou tick on the right events", () => {
    const wifi = dealJobs(() => 0.11, 500, 1).find((j) => j.template === "wifipro") ?? {
      id: "wifipro",
      floor: "lacna" as const,
      template: "wifipro",
      title: "DOPOJ WIFIPRO",
      detail: "",
      stake: 10,
      payout: 20,
      need: 1,
      have: 0,
      limit: 35,
      spun: 0,
      kind: "symbol" as const,
      lockBet: 1,
      payId: "router" as const,
    };
    const miss = tickJob(wifi, {
      win: true,
      dead: false,
      tumbles: 0,
      live: false,
      ticket: null,
      pdf: false,
      signal: 0,
      clusters: 1,
      orbs: false,
      pays: ["dacia"],
    });
    assert.equal(miss.have, 0);
    const hit = tickJob(wifi, {
      win: true,
      dead: false,
      tumbles: 1,
      live: false,
      ticket: null,
      pdf: false,
      signal: 0,
      clusters: 1,
      orbs: false,
      pays: ["router"],
    });
    assert.equal(hit.have, 1);
    const stb = tickJob(
      { ...wifi, id: "stb", template: "stb", title: "BOX DO OBÝVAČKY", payId: "arris", have: 0 },
      {
        win: true,
        dead: false,
        tumbles: 1,
        live: false,
        ticket: null,
        pdf: false,
        signal: 0,
        clusters: 1,
        orbs: false,
        pays: ["arris"],
      },
    );
    assert.equal(stb.have, 1);
    const missCase = tickJob(
      { ...stb, have: 0 },
      {
        win: true,
        dead: false,
        tumbles: 1,
        live: false,
        ticket: null,
        pdf: false,
        signal: 0,
        clusters: 1,
        orbs: false,
        pays: ["case"],
      },
    );
    assert.equal(missCase.have, 0);
    const chain = tickJob(
      {
        ...wifi,
        id: "balik",
        template: "balik",
        kind: "chain",
        have: 0,
      },
      {
        win: true,
        dead: false,
        tumbles: 1,
        live: false,
        ticket: null,
        pdf: false,
        signal: 0,
        clusters: 1,
        orbs: false,
        pays: ["router"],
      },
    );
    assert.equal(chain.have, 0);
    const multi = tickJob(
      { ...chain, have: 0 },
      {
        win: true,
        dead: false,
        tumbles: 2,
        live: false,
        ticket: null,
        pdf: false,
        signal: 0,
        clusters: 1,
        orbs: false,
        pays: ["router"],
      },
    );
    assert.equal(multi.have, 1);
    const sum = tickJob(
      { ...wifi, id: "pada", template: "pada", kind: "tumbles", have: 0, need: 10 },
      {
        win: true,
        dead: false,
        tumbles: 3,
        live: false,
        ticket: null,
        pdf: false,
        signal: 0,
        clusters: 1,
        orbs: false,
      },
    );
    assert.equal(sum.have, 3);
    const files = tickJob(
      { ...wifi, id: "prilohy", template: "prilohy", kind: "collect", scope: "any", payId: "dacia", have: 0, need: 40 },
      {
        win: false,
        dead: true,
        tumbles: 0,
        live: false,
        ticket: null,
        pdf: false,
        signal: 0,
        clusters: 0,
        orbs: false,
        shown: 4,
      },
    );
    assert.equal(files.have, 4);
    const liveSkip = tickJob(
      { ...wifi, scope: "base", have: 0 },
      {
        win: true,
        dead: false,
        tumbles: 1,
        live: false,
        ticket: null,
        pdf: false,
        signal: 0,
        clusters: 1,
        orbs: false,
        pays: ["router"],
        liveSpin: true,
      },
    );
    assert.equal(liveSkip.have, 0);
  });

  it("TACHYKARDIA sums multiplier cans across spins", () => {
    const job = {
      id: "tachy",
      floor: "stred" as const,
      template: "signal",
      title: "TACHYKARDIA",
      detail: "15× násobičov súčtom plechoviek",
      stake: 20,
      payout: 40,
      need: 15,
      have: 0,
      limit: 50,
      spun: 0,
      kind: "signal" as const,
      lockBet: 1,
    };
    const a = tickJob(job, {
      win: true,
      dead: false,
      tumbles: 1,
      live: false,
      ticket: null,
      pdf: false,
      signal: 20,
      clusters: 1,
      orbs: true,
      orbSum: 5,
    });
    assert.equal(a.have, 5);
    const b = tickJob(a, {
      win: true,
      dead: false,
      tumbles: 0,
      live: false,
      ticket: null,
      pdf: false,
      signal: 0,
      clusters: 1,
      orbs: true,
      orbSum: 10,
    });
    assert.equal(b.have, 15);
    assert.equal(jobStatus(b), "ok");
    const dead = tickJob(job, {
      win: false,
      dead: true,
      tumbles: 0,
      live: false,
      ticket: null,
      pdf: false,
      signal: 0,
      clusters: 0,
      orbs: false,
      orbSum: 0,
    });
    assert.equal(dead.have, 0);
  });

  it("POHOTOVOSŤ counts only bought free spins and fails when the feature ends", () => {
    const job = {
      id: "noc",
      floor: "stred" as const,
      template: "noc",
      title: "POHOTOVOSŤ",
      detail: "",
      stake: 100,
      payout: 180,
      need: 6,
      have: 0,
      limit: 20,
      spun: 0,
      kind: "buy" as const,
      lockBet: 1,
    };
    const base = tickJob(job, {
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
    assert.equal(base.have, 0);
    assert.equal(base.spun, 0);
    const hit = tickJob(job, {
      win: true,
      dead: false,
      tumbles: 1,
      live: false,
      ticket: null,
      pdf: false,
      signal: 0,
      clusters: 1,
      orbs: false,
      bought: true,
    });
    assert.equal(hit.have, 1);
    const over = tickJob(
      { ...hit, have: 2 },
      {
        win: false,
        dead: true,
        tumbles: 0,
        live: false,
        ticket: null,
        pdf: false,
        signal: 0,
        clusters: 0,
        orbs: false,
        bought: true,
        buyOver: true,
        spun: false,
      },
    );
    assert.equal(over.have, 2);
    assert.equal(over.spun, 20);
    assert.equal(jobStatus(over), "fail");
  });

  it("HYDRA needs both symbols and asks more hits from the commoner", () => {
    const split = hydraSplit("rj45", "pdf", 50);
    assert.ok(split.needA > split.needB);
    assert.equal(split.needB, 1);
    const even = hydraSplit("router", "hap", 50);
    assert.ok(Math.abs(even.needA - even.needB) <= 1);
    const dacia = symbolNeed("dacia", 35, 0.5);
    assert.equal(dacia, 1);
    const job = {
      id: "hydra",
      floor: "stred" as const,
      template: "hydra",
      title: "HYDRA",
      detail: "",
      stake: 20,
      payout: 40,
      need: 3,
      needB: 2,
      have: 0,
      haveB: 0,
      limit: 50,
      spun: 0,
      kind: "hydra" as const,
      lockBet: 1,
      payId: "rj45" as const,
      payIdB: "pdf" as const,
    };
    const a = tickJob(job, {
      win: true,
      dead: false,
      tumbles: 0,
      live: false,
      ticket: null,
      pdf: false,
      signal: 0,
      clusters: 1,
      orbs: false,
      pays: ["rj45"],
    });
    assert.equal(a.have, 1);
    assert.equal(a.haveB, 0);
    assert.equal(jobStatus(a), "run");
    let cur = a;
    for (let i = 0; i < 2; i++) {
      cur = tickJob(cur, {
        win: true,
        dead: false,
        tumbles: 0,
        live: false,
        ticket: null,
        pdf: false,
        signal: 0,
        clusters: 1,
        orbs: false,
        pays: ["rj45"],
      });
    }
    assert.equal(cur.have, 3);
    assert.equal(jobStatus(cur), "run");
    const both = tickJob(cur, {
      win: true,
      dead: false,
      tumbles: 1,
      live: false,
      ticket: null,
      pdf: true,
      signal: 0,
      clusters: 2,
      orbs: false,
      pays: ["rj45", "pdf"],
    });
    assert.equal(both.have, 3);
    assert.equal(both.haveB, 1);
    const done = tickJob(both, {
      win: true,
      dead: false,
      tumbles: 0,
      live: false,
      ticket: null,
      pdf: true,
      signal: 0,
      clusters: 1,
      orbs: false,
      pays: ["pdf"],
    });
    assert.equal(done.haveB, 2);
    assert.equal(jobStatus(done), "ok");
    assert.equal(jobClock({ ...job, have: 0, spun: 50 }), "NEÚSPEŠNÝ TIKET");
  });
});

describe("tiket meter", () => {
  const blank = (over: Partial<JobCard> & Pick<JobCard, "template" | "kind">): JobCard => ({
    id: "t",
    floor: "stred",
    title: "T",
    detail: "",
    goal: "4× PDF 8+",
    stake: 50,
    payout: 90,
    need: 4,
    have: 0,
    limit: 10,
    spun: 0,
    lockBet: 1,
    ...over,
  });
  const miss = {
    win: false,
    dead: true,
    tumbles: 0,
    live: false,
    ticket: null,
    pdf: false,
    signal: 0,
    clusters: 0,
    orbs: false,
  };

  it("fails SUCHO when the dead spins left cannot cover the gap", () => {
    const next = tickJob(blank({ template: "sucho", kind: "deads", need: 8, have: 4, limit: 10, spun: 6 }), miss);
    assert.equal(next.have, 5);
    assert.equal(jobLeft(next), 3);
    assert.equal(jobStatus(next), "run");
    const early = tickJob(blank({ template: "sucho", kind: "deads", need: 8, have: 4, limit: 10, spun: 6 }), {
      ...miss,
      dead: false,
      win: false,
    });
    assert.equal(early.have, 4);
    assert.equal(jobStatus(early), "fail");
  });

  it("kills SUCHO the moment a win or 4tv lands", () => {
    const won = tickJob(blank({ template: "sucho", kind: "deads", need: 8, have: 6, limit: 20, spun: 1 }), {
      ...miss,
      win: true,
      dead: false,
    });
    assert.equal(jobStatus(won), "fail");
    const tv = tickJob(blank({ template: "sucho", kind: "deads", need: 8, have: 6, limit: 20, spun: 1 }), {
      ...miss,
      live: true,
    });
    assert.equal(jobStatus(tv), "fail");
  });

  it("fails a symbol ticket as soon as the remaining spins are short", () => {
    const pdf = tickJob(blank({ template: "vynos", kind: "pdf", need: 4, have: 1, limit: 10, spun: 7 }), miss);
    assert.equal(pdf.have, 1);
    assert.equal(jobStatus(pdf), "fail");
    const sym = tickJob(
      blank({ template: "wifipro", kind: "symbol", payId: "rj45", goal: "4× RJ45 8+", need: 4, have: 1, limit: 10, spun: 7 }),
      { ...miss, pays: ["pdf"] },
    );
    assert.equal(jobStatus(sym), "fail");
  });

  it("does not treat a jackpot ticket as a ZBER hit", () => {
    const next = tickJob(blank({ template: "zber", kind: "wins", goal: "4× výherných spinov", need: 4, have: 1, limit: 30, spun: 2 }), {
      ...miss,
      ticket: "ulica",
    });
    assert.equal(next.have, 1);
    assert.equal(jobStatus(next), "run");
  });

  it("keeps REŤAZ alive until the clock actually ends", () => {
    const next = tickJob(blank({ template: "retaz", kind: "wins", need: 3, have: 2, limit: 5, spun: 2 }), miss);
    assert.equal(next.have, 0);
    assert.equal(jobLeft(next), 2);
    assert.equal(jobStatus(next), "run");
  });

  it("fails PLECHOVKY only above 6 cans per remaining spin", () => {
    const alive = tickJob(
      blank({ template: "plechovky", kind: "tumbles", scope: "live", need: 8, have: 1, limit: 4, spun: 1 }),
      { ...miss, liveSpin: true, orbs: true, orbCount: 1 },
    );
    assert.equal(alive.have, 2);
    assert.equal(jobStatus(alive), "run");
    const dead = tickJob(
      blank({ template: "plechovky", kind: "tumbles", scope: "live", need: 8, have: 1, limit: 3, spun: 1 }),
      { ...miss, liveSpin: true, orbCount: 0 },
    );
    assert.equal(jobStatus(dead), "fail");
  });

  it("fails DUO/HYDRA when either branch can no longer land", () => {
    const next = tickJob(
      blank({
        template: "hydra",
        kind: "hydra",
        payId: "rj45",
        payIdB: "pdf",
        need: 3,
        have: 3,
        needB: 2,
        haveB: 0,
        limit: 10,
        spun: 8,
      }),
      miss,
    );
    assert.equal(jobStatus(next), "fail");
  });

  it("holds SIGNÁL until the LIVE feature closes", () => {
    const mid = tickJob(blank({ template: "signal", kind: "signal", scope: "live", need: 10, have: 1, limit: 2, spun: 1 }), {
      ...miss,
      liveSpin: true,
      orbSum: 2,
    });
    assert.equal(mid.seal, true);
    assert.equal(jobStatus(mid), "run");
    const over = tickJob(mid, { ...miss, featureOver: true, spun: false });
    assert.equal(jobStatus(over), "fail");
  });

  it("draws PASS and FAIL on the same seven rows", () => {
    const job = blank({ template: "wifipro", kind: "symbol", have: 1, need: 4, limit: 31, spun: 28, goal: "4× RJ45 8+" });
    assert.equal(jobChip(job), "TIKET 1/4 · 3");
    const run = jobLcd(job, "run");
    assert.equal(run.header, "TIKET");
    assert.equal(run.rows[1]?.value, "3 / 31");
    assert.equal(run.rows[4]?.value, "3");
    assert.equal(run.rows[5]?.value, "----");
    const pass = jobLcd({ ...job, have: 4 }, "ok");
    assert.equal(pass.header, "PASS");
    assert.equal(pass.rows[5]?.value, "+90");
    const fail = jobLcd(job, "fail");
    assert.equal(fail.header, "FAIL");
    assert.equal(fail.rows[0]?.value, "----");
    assert.equal(fail.rows[5]?.value, "0.0");
    assert.match(fail.rows[6]?.value ?? "", /50/);
  });

  it("drops a PARKNET ticket when the wallet can no longer enter", () => {
    const live = blank({ template: "plechovky", kind: "tumbles", scope: "live", need: 4, have: 0, limit: 12, spun: 0 });
    assert.equal(jobParknetBroke(live, 0.1, 1, 100), true);
    assert.equal(jobParknetBroke(live, 5, 1, 100), false);
    assert.equal(jobParknetBroke(live, 120, 1, 100), false);
    const buy = blank({ template: "noc", kind: "buy", scope: "live", need: 6, have: 0, limit: 15, spun: 0 });
    assert.equal(jobParknetBroke(buy, 40, 1, 100), true);
    assert.equal(jobParknetBroke(buy, 100, 1, 100), false);
    const trigger = blank({ template: "siet", kind: "live", scope: "base", need: 1, have: 0, limit: 30, spun: 4 });
    assert.equal(jobParknetBroke(trigger, 0.05, 0.2, 20), true);
    assert.equal(jobParknetBroke(trigger, 1, 0.2, 20), false);
    const base = blank({ template: "zber", kind: "wins", scope: "base", need: 4, have: 1, limit: 20, spun: 3 });
    assert.equal(jobParknetBroke(base, 0, 1, 100), false);
  });
});

describe("duel", () => {
  it("hot-seat 10 spins, higher score wins, tie is remíza", () => {
    let d = startDuel({ mode: "spins", a: "A", b: "B", bet: 1 });
    assert.equal(d.need, 10);
    assert.equal(d.turn, 0);
    for (let i = 0; i < 10; i++) d = tickDuel(d, 2);
    assert.equal(d.phase, "swap");
    assert.equal(d.seats[0].score, 20);
    d = confirmSwap(d);
    assert.equal(d.turn, 1);
    assert.equal(d.have, 0);
    for (let i = 0; i < 9; i++) d = tickDuel(d, 1);
    d = tickDuel(d, 1);
    assert.equal(d.phase, "done");
    assert.equal(duelWinner(d), 0);
    let t = startDuel({ mode: "live", a: "A", b: "B", bet: 10 });
    assert.equal(t.need, 1);
    t = tickDuel(t, 50);
    t = confirmSwap(t);
    t = tickDuel(t, 50);
    assert.equal(duelWinner(t), null);
    let o = startDuel({ mode: "spins", a: "A", b: "B", bet: 1, kind: "online", you: 0 });
    for (let i = 0; i < 10; i++) o = tickDuel(o, 3);
    assert.equal(o.phase, "play");
    assert.equal(o.seats[0].have, 10);
    for (let i = 0; i < 10; i++) o = applyPeerTick(o, i + 1, (i + 1) * 2);
    assert.equal(o.phase, "done");
    assert.equal(duelWinner(o), 0);
    assert.equal(duelPot(o), 50);
    assert.equal(duelCreditDelta(o, 0), 50);
    assert.equal(duelCreditDelta(o, 1), 0);
    assert.equal(duelCreditDelta(t, 0), 50);
    assert.equal(duelCreditDelta(t, 1), 50);
    const ahead = tickDuel(startDuel({ mode: "spins", a: "A", b: "B", bet: 1, kind: "online", you: 0, need: 10 }), 5);
    assert.equal(canDuelSpin(ahead), false);
    assert.equal(duelView(ahead).waiting, true);
    assert.equal(duelView(ahead).k, 0);
    assert.equal(duelView(ahead).mine, 0);
    const caught = applyPeerTick(ahead, 1, 2);
    assert.equal(canDuelSpin(caught), true);
    assert.equal(duelView(caught).k, 1);
    assert.equal(duelView(caught).mine, 5);
    const folded = forfeitDuel(caught, 0);
    assert.equal(duelCreditDelta(folded, 0), 0);
    assert.equal(duelCreditDelta(folded, 1), duelPot(folded));
  });
});
