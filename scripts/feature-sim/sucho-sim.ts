/**
 * SUCHO RTP (sucho2): whole paid game on the production code (engine, ZÁSAH + BEZ DANE / DAŇOVÝ ÚRAD period,
 * natural 4KA TV incl. ZÁSAH ×2, bonus bar KONTROLA / Ž-BOX / KOLESO, dead-spin rebate, NEKONEČNO extra cans),
 * normal RTP and the RTP with the SUCHO payout multiplier (lib/slot/sucho-rtp) on the same spins.
 * Jackpots, tickets, rank drops and the daily ZLATÝ BONUS are not game RTP and are left out.
 *   npx tsx scripts/feature-sim/sucho-sim.ts session <rank> <ante 0|1> <spins> <seed>
 *   npx tsx scripts/feature-sim/sucho-sim.ts buy <rank> <bonuses> <seed>
 * Output: one JSON line. SE = standard error from 200 batch means.
 */
import { createRng, resolvePaidSpin } from "../../src/lib/slot/engine.ts";
import { FS_RETRIGGER, MAX_WIN_X, fsTriggerSpins } from "../../src/lib/slot/symbols.ts";
import { HEAT_MAX, heatFromWin } from "../../src/lib/slot/heat.ts";
import { advanceChase, ZASAH, ZASAH_FS_MUL, modMul, rollFsSymbol, rollTarget, rollWindows, tickMod, windowCount, type ChaseMod, type ChaseState } from "../../src/lib/slot/zasah.ts";
import { PITY_GOAL, pityGain } from "../../src/lib/slot/pick-bonus.ts";
import { drawBonusMode } from "../../src/lib/slot/bonus-mode.ts";
import { kontrolaRun } from "../../src/lib/slot/bonus-ev.ts";
import { playZbox, zboxVipOf } from "../../src/lib/slot/zbox.ts";
import { kolesoVipOf, playKoleso } from "../../src/lib/slot/koleso.ts";
import { RANK_PERKS, buyXOf, fsSpinsOf, REBATE_WINDOW, REBATE_CAP_BETS } from "../../src/lib/slot/ranks.ts";
import { suchoPayMul } from "../../src/lib/slot/sucho-rtp.ts";

const BATCHES = 200;

function se(batches: { paid: number; stake: number }[]): number {
  const r = batches.filter((b) => b.stake > 0).map((b) => b.paid / b.stake);
  const m = r.reduce((s, v) => s + v, 0) / r.length;
  const v = r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1);
  return Math.sqrt(v / r.length);
}

function session(rank: string, ante: boolean, n: number, seed: number) {
  const perk = RANK_PERKS.find((p) => p.id === rank)!;
  const rng = createRng(seed * 7919 + 17);
  const fsBase = fsSpinsOf(rank);
  const stakeX = ante ? perk.anteMul : 1;
  const m = suchoPayMul(rank, ante ? "ante" : "base");
  const orbBonus = perk.orbBonus || undefined;
  let heat = 0, pity = 0;
  let chase: ChaseState | null = null;
  let mod: ChaseMod | null = null;
  let rebPaid = 0, rebSpins = 0;
  let stake = 0, paid = 0;
  const part = { base: 0, chase: 0, fs: 0, bar: 0, rebate: 0 };
  const per = Math.ceil(n / BATCHES);
  const batches: { paid: number; stake: number }[] = [];
  let bPaid = 0, bStake = 0;
  const pay = (x: number, k: keyof typeof part) => { paid += x; bPaid += x; part[k] += x; };
  for (let i = 0; i < n; i++) {
    if (!chase && heat >= HEAT_MAX) {
      heat = 0;
      chase = { spin: 0, target: null, hits: 0, strikes: 0, fsSym: rollFsSymbol(rng) };
    }
    const chasing = chase != null;
    // Live game: a ZÁSAH spin costs the full stake × COST_X (ante included) and keeps the ante reels.
    const cost = chasing ? stakeX * ZASAH.COST_X : stakeX;
    stake += cost; bStake += cost;
    const sp = resolvePaidSpin(rng, { ante, globalMult: 0, blockScatter: chasing && chase!.fsSym === "scatter", sticky: chasing ? chase!.sticky : undefined, orbBonus });
    const gross = sp.paidX * (chasing ? ZASAH.BOOST : 1);
    // Tax period: base spins pay with it and count it down; ZÁSAH spins neither.
    const mul = chasing ? 1 : modMul(mod);
    if (!chasing) mod = tickMod(mod);
    pay(gross * mul, chasing ? "chase" : "base");
    if (chasing) {
      const rolled = rollWindows(rng, sp.board, chase!, windowCount(chase!.spin));
      const played: number = chase!.spin + 1;
      if (rolled.outcome || played >= ZASAH.SPINS) {
        const out = rolled.outcome ?? "neutral";
        if (out === "escape") mod = { kind: "bezDane", left: ZASAH.MOD_SPINS };
        else if (out === "unik") mod = { kind: "danUrad", left: ZASAH.MOD_SPINS };
        chase = null;
      } else chase = advanceChase(rng, sp.board, chase!, rolled);
    } else if (gross > 0) heat = Math.min(HEAT_MAX, heat + heatFromWin(gross * mul));
    pity += pityGain(sp.scatterPeak, gross <= 0);
    // Dead-spin rebate (perk), the spin that triggers 4KA TV is no dead spin.
    if (perk.deadRebate > 0 && gross <= 0 && !sp.triggeredFs) {
      rebSpins += 1;
      if (rebSpins > REBATE_WINDOW) { rebSpins = 1; rebPaid = 0; }
      const p = Math.min(perk.deadRebate, Math.max(0, REBATE_CAP_BETS - rebPaid));
      rebPaid += p;
      pay(p, "rebate");
    } else if (perk.deadRebate > 0 && !sp.triggeredFs) {
      rebSpins += 1;
      if (rebSpins > REBATE_WINDOW) { rebSpins = 1; rebPaid = 0; }
    }
    if (sp.triggeredFs) {
      let left = fsTriggerSpins(sp.scatterPeak, fsBase), gm = 0, tot = gross;
      while (left > 0) {
        left--;
        const fs = resolvePaidSpin(rng, { ante: false, free: true, globalMult: gm, capRemain: MAX_WIN_X - tot, orbBonus });
        gm = fs.globalMult;
        const x = Math.min(fs.paidX * (chasing ? ZASAH_FS_MUL : 1), Math.max(0, MAX_WIN_X - tot));
        const fm = modMul(mod);
        mod = tickMod(mod);
        tot += x;
        pay(x * fm, "fs");
        if (x > 0 && !chase) heat = Math.min(HEAT_MAX, heat + heatFromWin(x * fm));
        if (fs.retrigger) left += FS_RETRIGGER;
        if (fs.hitMax || tot >= MAX_WIN_X) break;
      }
    }
    if (pity >= PITY_GOAL) {
      pity = 0;
      const mode = drawBonusMode(rng);
      let x = 0;
      if (mode === "zbox") x = playZbox(rng, { vip: zboxVipOf(rank) }).totalX;
      else if (mode === "koleso") x = playKoleso(rng, { vip: kolesoVipOf(rank) }).totalX;
      else x = kontrolaRun(rng, perk.peekCap, perk.peekCount).x;
      x *= modMul(mod);
      pay(x, "bar");
      if (!chase && x > 0) heat = Math.min(HEAT_MAX, heat + heatFromWin(x));
    }
    if ((i + 1) % per === 0) { batches.push({ paid: bPaid, stake: bStake }); bPaid = 0; bStake = 0; }
  }
  const rtp = paid / stake;
  const s = se(batches);
  return {
    rank, ante, spins: n, seed, stakeX,
    rtp: +rtp.toFixed(5), se: +s.toFixed(5),
    parts: Object.fromEntries(Object.entries(part).map(([k, v]) => [k, +(v / stake).toFixed(5)])),
    suchoMul: m, rtpSucho: +(rtp * m).toFixed(5), seSucho: +(s * m).toFixed(5),
  };
}

function buy(rank: string, n: number, seed: number) {
  const perk = RANK_PERKS.find((p) => p.id === rank)!;
  const rng = createRng(seed * 104729 + 3);
  const fsBase = fsSpinsOf(rank);
  const price = buyXOf(rank);
  const m = suchoPayMul(rank, "buy");
  const orbBonus = perk.orbBonus || undefined;
  let paid = 0;
  const per = Math.ceil(n / BATCHES);
  const batches: { paid: number; stake: number }[] = [];
  let bPaid = 0, bStake = 0;
  for (let i = 0; i < n; i++) {
    const sp = resolvePaidSpin(rng, { ante: false, buy: true, globalMult: 0, orbBonus });
    let tot = sp.paidX, gm = 0, left = fsTriggerSpins(Math.max(4, sp.scatterPeak), fsBase);
    if (sp.hitMax) left = 0;
    while (left > 0) {
      left--;
      const fs = resolvePaidSpin(rng, { ante: false, free: true, globalMult: gm, capRemain: MAX_WIN_X - tot, orbBonus });
      gm = fs.globalMult;
      tot += fs.paidX;
      if (fs.retrigger) left += FS_RETRIGGER;
      if (fs.hitMax || tot >= MAX_WIN_X) break;
    }
    paid += tot; bPaid += tot; bStake += price;
    if ((i + 1) % per === 0) { batches.push({ paid: bPaid, stake: bStake }); bPaid = 0; bStake = 0; }
  }
  const rtp = paid / (n * price);
  const s = se(batches);
  return { rank, bonuses: n, seed, price, rtp: +rtp.toFixed(5), se: +s.toFixed(5), suchoMul: m, rtpSucho: +(rtp * m).toFixed(5), seSucho: +(s * m).toFixed(5) };
}

const [cmd, ...a] = process.argv.slice(2);
if (cmd === "session") console.log(JSON.stringify(session(a[0] ?? "telka", a[1] === "1", Number(a[2] ?? 1e6), Number(a[3] ?? 1))));
else if (cmd === "buy") console.log(JSON.stringify(buy(a[0] ?? "telka", Number(a[1] ?? 1e5), Number(a[2] ?? 1))));
else console.error("usage: session <rank> <ante 0|1> <spins> <seed> | buy <rank> <bonuses> <seed>");
