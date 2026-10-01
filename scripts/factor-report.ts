import { ANTE_COST, BUY_COST_X, FS_RETRIGGER, FS_SPINS, MAX_WIN_X, PAY_SYMBOLS, SCATTER } from "../src/lib/slot/symbols.ts";
import { createRng, mathTune, resolvePaidSpin, type PaidSpin } from "../src/lib/slot/engine.ts";

mathTune.baseThrow = 0.0585;
mathTune.fsThrow = 0.135;
mathTune.sticky = 0.197;
SCATTER.weight = 2.34;
SCATTER.weightAnte = 2.93;

const P500 = 7 / 10000;

function playFeature(rng: () => number, trigger: PaidSpin) {
  let paid = trigger.paidX;
  let gm = 0;
  let spins = 0;
  let wins = 0;
  let orbs = 0;
  let retriggers = 0;
  if (trigger.hitMax) return { paid, gm, spins, wins, orbs, retriggers };
  let left = FS_SPINS;
  while (left > 0) {
    left -= 1;
    spins += 1;
    const fs = resolvePaidSpin(rng, { ante: false, free: true, globalMult: gm, capRemain: MAX_WIN_X - paid });
    gm = fs.globalMult;
    paid += fs.paidX;
    orbs += fs.orbs;
    if (fs.sequenceX > 0) wins += 1;
    if (fs.retrigger) {
      left += FS_RETRIGGER;
      retriggers += 1;
    }
    if (fs.hitMax || paid >= MAX_WIN_X) break;
  }
  return { paid, gm, spins, wins, orbs, retriggers };
}

function run(n: number, ante: boolean, seed: number) {
  const rng = createRng(seed);
  let stake = 0;
  let paid = 0;
  let basePaid = 0;
  let featPaid = 0;
  let hits = 0;
  let bonus = 0;
  let orbs = 0;
  let orbSpins = 0;
  let deadOrb = 0;
  let tumbles = 0;
  let chain = 0;
  let duo = 0;
  let maxHits = 0;
  let over1000 = 0;
  let featSum = 0;
  const sym = PAY_SYMBOLS.map(() => 0);
  for (let i = 0; i < n; i++) {
    stake += ante ? ANTE_COST : 1;
    const s = resolvePaidSpin(rng, { ante, free: false, globalMult: 0 });
    orbs += s.orbs;
    tumbles += s.tumbles;
    if (s.tumbles >= 2) chain += 1;
    if (s.sequenceX > 0) hits += 1;
    if (s.orbs > 0) {
      orbSpins += 1;
      if (s.sequenceX <= 0) deadOrb += 1;
    }
    let clusters = 0;
    for (let k = 0; k < PAY_SYMBOLS.length; k++) {
      if (s.symbolMask & (1 << k)) {
        sym[k] += 1;
        clusters += 1;
      }
    }
    if (clusters >= 2) duo += 1;
    if (s.triggeredFs) {
      bonus += 1;
      const feat = playFeature(rng, s);
      paid += feat.paid;
      featPaid += feat.paid;
      featSum += feat.paid;
      if (feat.paid >= 1000) over1000 += 1;
      if (feat.paid >= MAX_WIN_X - 1e-6) maxHits += 1;
    } else {
      paid += s.paidX;
      basePaid += s.paidX;
      if (s.paidX >= 1000) over1000 += 1;
      if (s.hitMax) maxHits += 1;
    }
  }
  return {
    n,
    rtp: +(paid / stake).toFixed(4),
    baseRtp: +(basePaid / stake).toFixed(4),
    featureRtp: +(featPaid / stake).toFixed(4),
    hit: +(hits / n).toFixed(4),
    bonusEvery: bonus ? +(n / bonus).toFixed(1) : null,
    avgFeature: bonus ? +(featSum / bonus).toFixed(1) : 0,
    orbs: +(orbs / n).toFixed(4),
    every500: +((n / (orbs * P500))).toFixed(0),
    deadOrb: orbSpins ? +(deadOrb / orbSpins).toFixed(3) : null,
    tumbles: +(tumbles / n).toFixed(3),
    pChain: +(chain / n).toFixed(4),
    pDuo: +(duo / n).toFixed(4),
    over1000,
    maxHits,
    sym: Object.fromEntries(PAY_SYMBOLS.map((p, k) => [p.id, +(sym[k] / n).toFixed(4)])),
  };
}

const t0 = Date.now();
const base = run(30000, false, 42);
const ante = run(16000, true, 99);
const rng = createRng(7);
let buyPaid = 0;
let buyN = 2500;
let buySpins = 0;
let buyOrbs = 0;
let buyWins = 0;
let buyGm = 0;
let buyGmN = 0;
let buyRet = 0;
for (let i = 0; i < buyN; i++) {
  const s = resolvePaidSpin(rng, { ante: false, buy: true, globalMult: 0 });
  const f = playFeature(rng, s);
  buyPaid += f.paid;
  buySpins += f.spins;
  buyOrbs += f.orbs;
  buyWins += f.wins;
  buyRet += f.retriggers;
  if (f.gm > 0) {
    buyGm += f.gm;
    buyGmN += 1;
  }
}
console.log(
  JSON.stringify(
    {
      ms: Date.now() - t0,
      tune: { ...mathTune, weight: SCATTER.weight, weightAnte: SCATTER.weightAnte },
      base,
      ante: { rtp: ante.rtp, hit: ante.hit, bonusEvery: ante.bonusEvery, baseRtp: ante.baseRtp, featureRtp: ante.featureRtp },
      buy: {
        avg: +(buyPaid / buyN).toFixed(1),
        ev: +(buyPaid / buyN / BUY_COST_X).toFixed(4),
        spins: +(buySpins / buyN).toFixed(2),
        orbs: +(buyOrbs / buyN).toFixed(2),
        wins: +(buyWins / buyN).toFixed(2),
        gm: buyGmN ? +(buyGm / buyGmN).toFixed(1) : 0,
        retriggers: +(buyRet / buyN).toFixed(2),
      },
    },
    null,
    2,
  ),
);
