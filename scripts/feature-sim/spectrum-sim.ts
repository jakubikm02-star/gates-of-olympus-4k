/**
 * PARKVOLT SPEKTRUM — CRN session sim (navrh v3, B.5).
 * Same engine stream with and without the colour layer. Colour rolls use a side seed,
 * so a base spin's symbols match. Heat and the KONTROLA bar that the colours add or
 * remove are valued at the baseline's own average ZÁSAH / bar net (they must not
 * steal numbers from the engine stream).
 *
 *   npx tsx scripts/feature-sim/spectrum-sim.ts <rank> <ante 0|1> <spins> <seed>
 * One JSON line. Ranks below NEKONEČNO leave the layer off, so the delta is 0.
 */
import { createRng, listOrbs, resolvePaidSpin } from "../../src/lib/slot/engine.ts";
import { FS_RETRIGGER, MAX_WIN_X, fsTriggerSpins } from "../../src/lib/slot/symbols.ts";
import { HEAT_MAX, heatFromWin } from "../../src/lib/slot/heat.ts";
import { advanceChase, ZASAH, ZASAH_FS_MUL, rollFsSymbol, rollTarget, rollWindows, windowCount, type ChaseState } from "../../src/lib/slot/zasah.ts";
import { PITY_GOAL, pityGain } from "../../src/lib/slot/pick-bonus.ts";
import { drawBonusMode } from "../../src/lib/slot/bonus-mode.ts";
import { kontrolaRun } from "../../src/lib/slot/bonus-ev.ts";
import { takeCashback } from "../../src/lib/slot/cashback.ts";
import { playZbox, zboxVipOf } from "../../src/lib/slot/zbox.ts";
import { kolesoVipOf, playKoleso } from "../../src/lib/slot/koleso.ts";
import { RANK_PERKS, RANKS, bannerFromX, fsSpinsOf, rpFromDead, rpFromSpin } from "../../src/lib/slot/ranks.ts";
import { SPECTRUM_TUNE, ULICA_ECHO, applySpectrum, emptySpectrum, hash32 } from "../../src/lib/slot/spectrum.ts";
import { TICKET_ODDS } from "../../src/lib/slot/jackpot.ts";

const rankId = process.argv[2] ?? "nekonecno";
const ante = process.argv[3] === "1";
const n = Number(process.argv[4] ?? 2_000_000);
const seed = Number(process.argv[5] ?? 1);

const perk = RANK_PERKS.find((p) => p.id === rankId) ?? RANK_PERKS[0];
const entry = RANKS.find((r) => r.id === rankId)?.entry ?? 0;
const active = rankId === "nekonecno";
const rng = createRng(seed * 7919 + 17);
const stakeX = ante ? perk.anteMul : 1;
const fsBase = fsSpinsOf(rankId);
const playerId = "sim-park";
// SPEK_HOLE_P overrides the ČIERNA DIERA chance for tuning runs. The default is the shipped tune.
// SPEK_P="a,b,c,d,e,f,g" overrides the seven good-face chances.
const tune = {
  ...SPECTRUM_TUNE,
  ...(process.env.SPEK_HOLE_P ? { holeP: Number(process.env.SPEK_HOLE_P) } : {}),
  ...(process.env.SPEK_P ? { p: process.env.SPEK_P.split(",").map(Number) } : {}),
};
// 1-FTTB, outside the acceptance RTP. Valued analytically (no draws), so the CRN streams stay paired.
// echo: the local 2nd ulica roll during ČIERNA DIERA's 10 spins pays ULICA_ECHO credits (+ pending).
// orange: PRÍPLATOK parks 10 % of the win; it comes back with the next real 1-FTTB or an echo.
const P_ULICA = TICKET_ODDS.ulica;
let echoHits = 0;
let echoCredits = 0;
let pendingX = 0;
let parkedX = 0;
let returnedX = 0;
let blackDays = 0;

let heat = 0;
let specHeat = 0;
let pity = 0;
let specPity = 0;
let chase: ChaseState | null = null;
let stake = 0;
let paidB = 0;
let paidS = 0;
let rpB = 0;
let rpS = 0;
let capB = 0;
let capS = 0;
let white = 0;
let black = 0;
let colored = 0;
let cancel = 0;
let pair = 0;
let triad = 0;
let blackToday = 0;
let maxBlackDay = 0;
let dayKey = "";
const spec = emptySpectrum();
// CASHBACK BONUS (VERNOSŤ): stored multiplier used by the next paying bar bonus (S side only).
let cbUsed = 0;
let cbExtra = 0;
let cbGood = 0;
let streakB = 0;
let streakS = 0;
let holdB = false;
let holdS = false;
let chaseNet = 0;
let chaseN = 0;
let chaseRun = 0;
let chaseCost = 0;
let barNet = 0;
let barN = 0;
let specChase = 0;
let specBar = 0;

let meanD = 0;
let m2D = 0;
let meanB = 0;
let m2B = 0;
let meanS = 0;
let m2S = 0;
let seen = 0;
let meanBb = 0;
let m2Bb = 0;
let meanSb = 0;
let m2Sb = 0;
let seenBase = 0;

function pushBase(b: number, s: number): void {
  seenBase += 1;
  const bb = b - meanBb;
  meanBb += bb / seenBase;
  m2Bb += bb * (b - meanBb);
  const sb = s - meanSb;
  meanSb += sb / seenBase;
  m2Sb += sb * (s - meanSb);
}

function push(b: number, s: number): void {
  seen += 1;
  const d = s - b;
  const db = d - meanD;
  meanD += db / seen;
  m2D += db * (d - meanD);
  const bb = b - meanB;
  meanB += bb / seen;
  m2B += bb * (b - meanB);
  const sb = s - meanS;
  meanS += sb / seen;
  m2S += sb * (s - meanS);
}

function noteStreak(streak: number, win: boolean, hold: { v: boolean }): number {
  if (win) {
    hold.v = false;
    return streak + 1;
  }
  if (perk.streakHold && streak >= 2 && !hold.v) {
    hold.v = true;
    return streak;
  }
  hold.v = false;
  return 0;
}

const holdBoxB = { v: false };
const holdBoxS = { v: false };

function dayOf(i: number): string {
  const nDay = Math.floor(i / 1000);
  const t = Date.UTC(2026, 0, 1) + nDay * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

function rpOf(x: number, applied: number, tumbles: number, streak: number, hitMax: boolean): number {
  if (!(x > 0)) return rpFromDead(1, entry).total;
  return rpFromSpin({
    cash: x,
    bet: 1,
    mult: Math.max(1, applied),
    tumbles,
    streak,
    banner: bannerFromX(x, hitMax),
    kind: "base",
  }).total;
}

for (let i = 0; i < n; i++) {
  const day = dayOf(i);
  if (day !== dayKey) {
    if (dayKey) {
      maxBlackDay = Math.max(maxBlackDay, blackToday);
      if (blackToday > 0) blackDays += 1;
    }
    dayKey = day;
    blackToday = 0;
  }
  if (!chase && heat >= HEAT_MAX) {
    heat = 0;
    chase = { spin: 0, target: null, hits: 0, strikes: 0, fsSym: rollFsSymbol(rng), sticky: [] };
    chaseN += 1;
    chaseRun = 0;
  }
  while (specHeat >= HEAT_MAX) {
    specHeat -= HEAT_MAX;
    specChase += 1;
  }
  const chasing = chase != null;
  const stakeHere = chasing ? ZASAH.COST_X : stakeX;
  stake += stakeHere;
  const sp = resolvePaidSpin(rng, {
    ante: ante && !chasing,
    globalMult: 0,
    blockScatter: chasing && chase!.fsSym === "scatter",
    orbBonus: !chasing && !false ? perk.orbBonus : 0,
    sticky: chasing ? chase!.sticky : undefined,
  });
  let spinB = sp.paidX * (chasing ? ZASAH.BOOST : 1);
  let spinS = spinB;
  if (sp.hitMax) {
    capB += 1;
    capS += 1;
  }
  if (active) {
    // Real server 1-FTTB (any paid spin) returns the parked orange credits.
    let back = P_ULICA;
    if (!chasing && spec.fttb > 0) {
      echoHits += P_ULICA;
      echoCredits += P_ULICA * ULICA_ECHO;
      back += P_ULICA;
    }
    const ret = pendingX * Math.min(1, back);
    returnedX += ret;
    pendingX -= ret;
  }
  if (active && !chasing) {
    const side = createRng(hash32(`${playerId}|${i}|${seed}|sp`));
    const fx = applySpectrum(
      spec,
      {
        sequenceX: sp.sequenceX,
        orbSum: sp.orbSum,
        tumbles: sp.tumbles,
        orbs: listOrbs(sp.board).map((o) => ({ uid: o.uid, mult: o.mult })),
        hitMax: sp.hitMax,
        basePaidX: sp.paidX,
      },
      side,
      { day, playerId },
      undefined,
      tune,
    );
    if (fx.ulicaX > 0) {
      pendingX += fx.ulicaX;
      parkedX += fx.ulicaX;
    }
    spinS = fx.paidX;
    if (fx.paidX >= MAX_WIN_X - 1e-6 && !sp.hitMax) capS += 1;
    if (fx.event === "white") white += 1;
    if (fx.event === "pair") pair += 1;
    if (fx.event === "triad") triad += 1;
    if (fx.event === "black") {
      black += 1;
      blackToday += 1;
    }
    if (fx.event === "cancel") cancel += 1;
    if (fx.touched || fx.event === "cancel" || fx.event === "tint" || fx.color != null) colored += 1;
    specPity += fx.pity;
    specHeat += fx.heat;
    const hb = { v: holdB };
    const hs = { v: holdS };
    streakB = noteStreak(streakB, spinB > 0, hb);
    streakS = noteStreak(streakS, spinS > 0, hs);
    holdB = hb.v;
    holdS = hs.v;
    if (fx.cashbackDelta > 0) cbGood += 1;
    if (fx.streak === -1) streakS = 0;
    rpB += rpOf(spinB, sp.applied, sp.tumbles, streakB, sp.hitMax);
    rpS += rpOf(spinS, fx.appliedSum || sp.applied, sp.tumbles, streakS, sp.hitMax) + fx.rp;
  }
  paidB += spinB;
  paidS += spinS;
  pushBase(spinB, spinS);
  if (chasing) {
    chaseRun += spinB - ZASAH.COST_X;
    chaseCost += stakeHere;
  }
  if (!chasing && spinB > 0) heat = Math.min(HEAT_MAX, heat + heatFromWin(spinB));
  if (!chasing) {
    if (spinS > 0) specHeat += heatFromWin(spinS);
    // The live meter stops at 100. Overflow does not start a second ZÁSAH.
    specHeat = Math.min(HEAT_MAX, specHeat);
  }
  pity += pityGain(sp.scatterPeak, spinB <= 0);
  specPity += pityGain(sp.scatterPeak, (active && !chasing ? spinS : spinB) <= 0);

  if (chasing && chase) {
    const rolled = rollWindows(rng, sp.board, chase, windowCount(chase.spin));
    const played = chase.spin + 1;
    if (rolled.outcome || played >= ZASAH.SPINS) {
      chaseNet += chaseRun;
      chase = null;
    } else chase = advanceChase(rng, sp.board, chase, rolled);
  }

  if (sp.triggeredFs) {
    let left = fsTriggerSpins(sp.scatterPeak, fsBase);
    let gm = 0;
    let tot = spinB;
    while (left > 0) {
      left -= 1;
      const fs = resolvePaidSpin(rng, { ante: false, free: true, globalMult: gm, capRemain: MAX_WIN_X - tot });
      gm = fs.globalMult;
      const x = fs.paidX * (chasing ? ZASAH_FS_MUL : 1);
      tot += x;
      spinB += x;
      spinS += x;
      paidB += x;
      paidS += x;
      if (fs.hitMax) {
        capB += 1;
        capS += 1;
      }
      if (x > 0 && !chase) {
        const h = heatFromWin(x);
        heat = Math.min(HEAT_MAX, heat + h);
        specHeat = Math.min(HEAT_MAX, specHeat + h);
      }
      if (fs.retrigger) left += FS_RETRIGGER;
      if (fs.hitMax || tot >= MAX_WIN_X) break;
    }
  }

  if (pity >= PITY_GOAL) {
    pity = 0;
    const mode = drawBonusMode(rng);
    let x = 0;
    if (mode === "zbox") x = playZbox(rng, { vip: zboxVipOf(rankId) }).totalX;
    else if (mode === "koleso") x = playKoleso(rng, { vip: kolesoVipOf(rankId) }).totalX;
    else x = kontrolaRun(rng, perk.peekCap, perk.peekCount).x;
    barN += 1;
    barNet += x;
    spinB += x;
    spinS += x;
    paidB += x;
    paidS += x;
    if (active) {
      const cb = takeCashback(spec.cashback, { rankId, enabled: true, duel: false, natural: true }, x);
      if (cb.extra > 0) {
        cbUsed += 1;
        cbExtra += cb.extra;
        spinS += cb.extra;
        paidS += cb.extra;
      }
      spec.cashback = cb.stored;
    }
    if (!chase && x > 0) {
      const h = heatFromWin(x);
      heat = Math.min(HEAT_MAX, heat + h);
      specHeat = Math.min(HEAT_MAX, specHeat + h);
    }
  }
  // Live spendPity zeros the meter. A spin that overshoots does not bank a second bar.
  if (specPity >= PITY_GOAL) {
    specPity = 0;
    specBar += 1;
  }
  push(spinB, spinS);
}
maxBlackDay = Math.max(maxBlackDay, blackToday);
if (blackToday > 0) blackDays += 1;
if (chase) chaseNet += chaseRun;

const chaseEv = chaseN > 0 ? chaseNet / chaseN : 0;
const barEv = barN > 0 ? barNet / barN : 0;
// Extra or missing ZÁSAH changes both the payout and the stake. Value the count
// difference at the baseline average; the shared chase spins stay in both totals.
const dChase = specChase - chaseN;
const avgCost = chaseN > 0 ? chaseCost / chaseN : ZASAH.COST_X * ZASAH.SPINS;
const avgPaid = chaseEv + avgCost;
const dBar = specBar - barN;
const directS = paidS;
const featurePaid = dChase * avgPaid + dBar * barEv;
paidS += featurePaid;
const stakeS = stake + dChase * avgCost;

const sd = (m2: number) => Math.sqrt(m2 / Math.max(1, seen - 1));
const sdB = sd(m2B);
const sdS = sd(m2S);
const se = Math.sqrt(m2D / Math.max(1, seen - 1) / seen);
const stakePer = stake / n;
const rtpB = paidB / stake;
const rtpS = stakeS > 0 ? paidS / stakeS : 0;
const delta = rtpS - rtpB;
const ciPp = (1.96 * se / stakePer) * 100;
const days = n / 1000;

const out = {
  cbGood,
  cbUsed,
  cbExtraX: +cbExtra.toFixed(2),
  cbPp: +((cbExtra / Math.max(1, stake)) * 100).toFixed(4),
  rank: rankId,
  ante,
  n,
  seed,
  active,
  rtpB: +rtpB.toFixed(5),
  rtpS: +rtpS.toFixed(5),
  deltaPp: +(delta * 100).toFixed(4),
  directPp: +(((directS - paidB) / stake) * 100).toFixed(4),
  ci95Pp: +ciPp.toFixed(4),
  rpPerSpinB: +(rpB / n).toFixed(4),
  rpPerSpinS: +(rpS / n).toFixed(4),
  deltaRp: +((rpS - rpB) / n).toFixed(4),
  sdB: +sdB.toFixed(4),
  sdS: +sdS.toFixed(4),
  sdUp: sdB > 0 ? +((sdS - sdB) / sdB).toFixed(4) : 0,
  sdBaseUp: meanBb > 0 || m2Bb > 0 ? +((sd(m2Sb) - sd(m2Bb)) / Math.max(1e-9, sd(m2Bb))).toFixed(4) : 0,
  capB,
  capS,
  whitePerWeek: +((white / days) * 7).toFixed(3),
  blackPerDay: +(black / days).toFixed(4),
  holeP: tune.holeP ?? null,
  p: tune.p,
  blackPerWeek: +((black / days) * 7).toFixed(3),
  blackDayShare: +(blackDays / days).toFixed(4),
  // 1-FTTB (outside RTP). Credits at bet 1; the echo is a flat 500, so its pp scale with 1/bet.
  echoPerWeek: +((echoHits / days) * 7).toFixed(4),
  echoCreditsPerWeek: +((echoCredits / days) * 7).toFixed(3),
  echoPpBet1: +((echoCredits / stake) * 100).toFixed(4),
  orangeParkedPp: +((parkedX / stake) * 100).toFixed(4),
  orangeReturnedPp: +((returnedX / stake) * 100).toFixed(4),
  orangeStillParkedX: +pendingX.toFixed(3),
  maxBlackDay,
  colored,
  cancel,
  pair,
  triad,
  chaseN,
  specChase,
  barN,
  specBar,
  chaseEv: +chaseEv.toFixed(3),
  barEv: +barEv.toFixed(3),
  featurePp: +((rtpS - directS / stake) * 100).toFixed(4),
  stakeS: +stakeS.toFixed(2),
};
console.log(JSON.stringify(out));
