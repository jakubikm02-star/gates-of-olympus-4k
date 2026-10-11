/**
 * ZLATÝ BONUS tuning + acceptance on the production bonus code (lib/slot/zlaty, zbox, koleso, bonus-ev).
 *   npx tsx scripts/feature-sim/zlaty-sim.ts tune [zboxRuns]          → V (exact) and k (sim) per rank, KOLESO uplift
 *   npx tsx scripts/feature-sim/zlaty-sim.ts ev <rank> <runs> <seed> [modes] → EV per mode: normal (cap 30) vs golden (cap 100)
 *   npx tsx scripts/feature-sim/zlaty-sim.ts session <rank> <ante 0|1> <spinsPerDay> <days> <seed>
 *        → whole base game (engine, ZÁSAH, 4KA TV, bar) with the first bar bonus of every day golden; RTP with and
 *          without gold on the same spins (common random numbers).
 * Output: one JSON line.
 */
import { createRng, resolvePaidSpin } from "../../src/lib/slot/engine.ts";
import { FS_RETRIGGER, MAX_WIN_X, fsTriggerSpins } from "../../src/lib/slot/symbols.ts";
import { HEAT_MAX, heatFromWin } from "../../src/lib/slot/heat.ts";
import { ZASAH, ZASAH_FS_MUL, rollFsSymbol, rollTarget, rollWindows, windowCount, type ChaseState } from "../../src/lib/slot/zasah.ts";
import { PITY_GOAL, dealPickBoard, pityGain } from "../../src/lib/slot/pick-bonus.ts";
import { drawBonusMode, type BonusModeId } from "../../src/lib/slot/bonus-mode.ts";
import { kontrolaExactEv, kontrolaRun } from "../../src/lib/slot/bonus-ev.ts";
import { P_CAN, playZbox, zboxVipOf } from "../../src/lib/slot/zbox.ts";
import { kolesoVipOf, playKoleso } from "../../src/lib/slot/koleso.ts";
import { RANK_PERKS, fsSpinsOf } from "../../src/lib/slot/ranks.ts";
import { ZLATE_VYSEKY_G, ZLATY_CAP_X, ZLATY_TARGET_UP, goldBoard, zlataPokutaOf, zlatyKurierOf } from "../../src/lib/slot/zlaty.ts";

const perkOf = (id: string) => RANK_PERKS.find((p) => p.id === id)!;

/** One bonus, normal and golden, from the same seed. */
export function bonusPair(mode: BonusModeId, rank: string, seed: number, over?: { v?: number; k?: number; g?: number }) {
  const perk = perkOf(rank);
  if (mode === "kontrola") {
    const v = over?.v ?? zlataPokutaOf(rank);
    const a = kontrolaRun(createRng(seed), perk.peekCap, perk.peekCount);
    const b = kontrolaRun(createRng(seed), perk.peekCap, perk.peekCount, (t) => goldBoard(t, perk.peekCap, perk.peekCount, v));
    return { reg: a.x, gold: Math.min(ZLATY_CAP_X, b.x) };
  }
  if (mode === "zbox") {
    const vip = zboxVipOf(rank);
    const k = over?.k ?? zlatyKurierOf(rank);
    const a = playZbox(createRng(seed), { vip });
    const b = playZbox(createRng(seed), { vip, q: Math.min(1, P_CAN * k), cap: ZLATY_CAP_X });
    return { reg: a.totalX, gold: b.totalX };
  }
  const vip = kolesoVipOf(rank);
  const g = over?.g ?? ZLATE_VYSEKY_G;
  const a = playKoleso(createRng(seed), { vip });
  const b = playKoleso(createRng(seed), { vip, gain: g, cap: ZLATY_CAP_X });
  return { reg: a.totalX, gold: b.totalX };
}

function evMode(mode: BonusModeId, rank: string, runs: number, seed: number, over?: { v?: number; k?: number; g?: number }) {
  const seeds = createRng(seed * 104729 + 7);
  let r = 0, g = 0, g2 = 0, d2 = 0, ge30 = 0, max = 0;
  for (let i = 0; i < runs; i++) {
    const p = bonusPair(mode, rank, Math.floor(seeds() * 0x100000000), over);
    r += p.reg; g += p.gold; g2 += p.gold * p.gold; d2 += (p.gold - p.reg) ** 2;
    if (p.gold >= 30) ge30++;
    if (p.gold > max) max = p.gold;
  }
  const up = (g - r) / runs;
  const sd = Math.sqrt(Math.max(0, d2 / runs - up * up));
  return { runs, reg: r / runs, gold: g / runs, up, se: sd / Math.sqrt(runs), pGe30: ge30 / runs, max };
}

function tune(zboxRuns: number, only?: string) {
  const ranks = RANK_PERKS.filter((p) => !only || p.id === only);
  const out: Record<string, unknown> = { target: ZLATY_TARGET_UP };
  const v: Record<string, number> = {};
  const exact: Record<string, number> = {};
  for (const p of RANK_PERKS) {
    const base = kontrolaExactEv(p.peekCap, p.peekCount);
    const tiles = dealPickBoard(() => 0);
    const upOf = (x: number) => kontrolaExactEv(p.peekCap, p.peekCount, goldBoard(tiles, p.peekCap, p.peekCount, x)) - base;
    let lo = 0.2, hi = 40;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (upOf(m) < ZLATY_TARGET_UP) lo = m; else hi = m; }
    v[p.id] = +((lo + hi) / 2).toFixed(3);
    exact[p.id] = +upOf(Math.round(v[p.id] * 100) / 100).toFixed(4);
  }
  out.kontrolaV = v;
  out.kontrolaUpAtV2dp = exact;
  const k: Record<string, number> = {};
  for (const p of ranks) {
    let lo = 1, hi = 4;
    for (let i = 0; i < 9; i++) { const m = (lo + hi) / 2; if (evMode("zbox", p.id, zboxRuns, 11, { k: m }).up < ZLATY_TARGET_UP) lo = m; else hi = m; }
    k[p.id] = +((lo + hi) / 2).toFixed(3);
  }
  out.zboxK = k;
  if (!only) out.kolesoUpKredit = evMode("koleso", "kredit", zboxRuns, 13).up;
  return out;
}

function session(rank: string, ante: boolean, perDay: number, days: number, seed: number) {
  const perk = perkOf(rank);
  const rng = createRng(seed * 7919 + 17);
  const bonusSeeds = createRng(seed * 31337 + 5);
  const fsBase = fsSpinsOf(rank);
  const stakeX = ante ? perk.anteMul : 1;
  let heat = 0, pity = 0, chase: ChaseState | null = null;
  let stake = 0, paid = 0, extra = 0, bonuses = 0, goldDays = 0;
  const gByMode: Record<string, { n: number; up: number }> = { kontrola: { n: 0, up: 0 }, zbox: { n: 0, up: 0 }, koleso: { n: 0, up: 0 } };
  for (let d = 0; d < days; d++) {
    let goldLeft = true;
    for (let s = 0; s < perDay; s++) {
      if (!chase && heat >= HEAT_MAX) { heat = 0; chase = { spin: 0, target: null, hits: 0, strikes: 0, fsSym: rollFsSymbol(rng) }; }
      const chasing = chase != null;
      stake += chasing ? ZASAH.COST_X : stakeX;
      const sp = resolvePaidSpin(rng, { ante: ante && !chasing, globalMult: 0, blockScatter: chasing && chase!.fsSym === "scatter" });
      const p = sp.paidX * (chasing ? ZASAH.BOOST : 1);
      paid += p;
      if (chasing) {
        const rolled = rollWindows(rng, sp.board, chase!, windowCount(chase!.spin));
        const played: number = chase!.spin + 1;
        if (rolled.outcome || played >= ZASAH.SPINS) chase = null;
        else chase = { ...rolled.next, spin: played, target: rollTarget(rng, rolled.next.fsSym) };
      } else if (p > 0) heat = Math.min(HEAT_MAX, heat + heatFromWin(p));
      pity += pityGain(sp.scatterPeak, p <= 0);
      if (sp.triggeredFs) {
        let left = fsTriggerSpins(sp.scatterPeak, fsBase), gm = 0, tot = p;
        while (left > 0) {
          left--;
          const fs = resolvePaidSpin(rng, { ante: false, free: true, globalMult: gm, capRemain: MAX_WIN_X - tot });
          gm = fs.globalMult;
          const x = fs.paidX * (chasing ? ZASAH_FS_MUL : 1);
          tot += x; paid += x;
          if (x > 0 && !chase) heat = Math.min(HEAT_MAX, heat + heatFromWin(x));
          if (fs.retrigger) left += FS_RETRIGGER;
          if (fs.hitMax || tot >= MAX_WIN_X) break;
        }
      }
      if (pity >= PITY_GOAL) {
        pity = 0;
        bonuses++;
        const mode = drawBonusMode(rng);
        const pr = bonusPair(mode, rank, Math.floor(bonusSeeds() * 0x100000000));
        paid += pr.reg;
        if (goldLeft) {
          goldLeft = false;
          goldDays++;
          extra += pr.gold - pr.reg;
          gByMode[mode].n++;
          gByMode[mode].up += pr.gold - pr.reg;
        }
        if (!chase && pr.reg > 0) heat = Math.min(HEAT_MAX, heat + heatFromWin(pr.reg));
      }
    }
  }
  return {
    rank, ante, perDay, days, spins: perDay * days, seed,
    rtp: paid / stake, rtpGold: (paid + extra) / stake, deltaPp: (extra / stake) * 100,
    goldDayShare: goldDays / days, upPerGold: extra / Math.max(1, goldDays), spinsPerBar: (perDay * days) / bonuses,
    byMode: Object.fromEntries(Object.entries(gByMode).map(([m, v]) => [m, { n: v.n, up: v.n ? v.up / v.n : 0 }])),
  };
}

const [cmd, ...a] = process.argv.slice(2);
if (cmd === "tune") console.log(JSON.stringify(tune(Number(a[0] ?? 400000), a[1])));
else if (cmd === "ev") {
  const rank = a[0] ?? "kredit", runs = Number(a[1] ?? 1e6), seed = Number(a[2] ?? 1);
  const out: Record<string, unknown> = { rank, runs, seed };
  const modes = a[3] ? (a[3].split(",") as BonusModeId[]) : (["kontrola", "zbox", "koleso"] as const);
  for (const m of modes) out[m] = evMode(m, rank, runs, seed);
  console.log(JSON.stringify(out));
} else if (cmd === "session") console.log(JSON.stringify(session(a[0] ?? "kredit", a[1] === "1", Number(a[2] ?? 1000), Number(a[3] ?? 1000), Number(a[4] ?? 1))));
else console.error("usage: tune | ev <rank> <runs> <seed> | session <rank> <ante> <spinsPerDay> <days> <seed>");
