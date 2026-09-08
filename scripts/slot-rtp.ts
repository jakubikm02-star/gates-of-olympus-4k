import { ANTE_COST, BUY_COST_X, FS_RETRIGGER, FS_SPINS, MAX_WIN_X } from "../src/lib/slot/symbols.ts";
import { createRng, resolvePaidSpin, type PaidSpin } from "../src/lib/slot/engine.ts";

function playFeature(
  rng: () => number,
  trigger: PaidSpin,
): { paid: number; gm: number; retriggers: number; fsSpins: number; hitMax: boolean } {
  let paid = trigger.paidX;
  let gm = 0;
  let retriggers = 0;
  let fsSpins = 0;
  if (trigger.hitMax) return { paid, gm, retriggers, fsSpins, hitMax: true };
  let left = FS_SPINS;
  while (left > 0) {
    left -= 1;
    fsSpins += 1;
    const remain = MAX_WIN_X - paid;
    const fs = resolvePaidSpin(rng, { ante: false, free: true, globalMult: gm, capRemain: remain });
    gm = fs.globalMult;
    paid += fs.paidX;
    if (fs.retrigger) {
      left += FS_RETRIGGER;
      retriggers += 1;
    }
    if (fs.hitMax || paid >= MAX_WIN_X) return { paid, gm, retriggers, fsSpins, hitMax: true };
  }
  return { paid, gm, retriggers, fsSpins, hitMax: false };
}

function run(n: number, ante: boolean, seed = 1) {
  const rng = createRng(seed);
  let stakeOut = 0;
  let paid = 0;
  let hits = 0;
  let bonus = 0;
  let maxHits = 0;
  let fsSpins = 0;
  let retriggers = 0;
  let fsMultSum = 0;
  let fsMultN = 0;
  let dead = 0;
  let near = 0;
  let seqSum = 0;
  let orbOnWin = 0;
  let orbOnWinN = 0;
  let featureSum = 0;
  let feat100 = 0;
  let feat500 = 0;
  let feat1000 = 0;
  let biggest = 0;

  for (let i = 0; i < n; i++) {
    const stake = ante ? ANTE_COST : 1;
    stakeOut += stake;
    const spin = resolvePaidSpin(rng, { ante, free: false, globalMult: 0 });
    seqSum += spin.sequenceX;
    if (spin.paidX > 0) {
      hits += 1;
      if (spin.orbSum > 0) {
        orbOnWin += spin.orbSum;
        orbOnWinN += 1;
      }
    } else dead += 1;
    if (spin.nearMiss) near += 1;

    if (spin.triggeredFs) {
      bonus += 1;
      const feat = playFeature(rng, spin);
      paid += feat.paid;
      fsSpins += feat.fsSpins;
      retriggers += feat.retriggers;
      featureSum += feat.paid;
      if (feat.gm > 0) {
        fsMultSum += feat.gm;
        fsMultN += 1;
      }
      if (feat.paid >= 100) feat100 += 1;
      if (feat.paid >= 500) feat500 += 1;
      if (feat.paid >= 1000) feat1000 += 1;
      if (feat.paid > biggest) biggest = feat.paid;
      if (feat.hitMax) maxHits += 1;
    } else {
      paid += spin.paidX;
      if (spin.paidX > biggest) biggest = spin.paidX;
      if (spin.hitMax) maxHits += 1;
    }
  }

  const rtp = paid / stakeOut;
  return {
    n,
    ante,
    rtp: +rtp.toFixed(4),
    hitRate: +(hits / n).toFixed(4),
    deadRate: +(dead / n).toFixed(4),
    nearRate: +(near / n).toFixed(4),
    bonusEvery: bonus ? +(n / bonus).toFixed(1) : null,
    maxEvery: maxHits ? +(n / maxHits).toFixed(0) : null,
    maxHits,
    biggest: +biggest.toFixed(1),
    avgSeqX: +(seqSum / n).toFixed(3),
    avgOrbOnWin: orbOnWinN ? +(orbOnWin / orbOnWinN).toFixed(2) : 0,
    avgFsMult: fsMultN ? +(fsMultSum / fsMultN).toFixed(2) : 0,
    avgFeature: bonus ? +(featureSum / bonus).toFixed(1) : 0,
    pFeat100: bonus ? +(feat100 / bonus).toFixed(4) : 0,
    pFeat500: bonus ? +(feat500 / bonus).toFixed(4) : 0,
    pFeat1000: bonus ? +(feat1000 / bonus).toFixed(4) : 0,
    fsSpins,
    retriggers,
    buyEv: null as number | null,
  };
}

function buyEv(n: number, seed = 9) {
  const rng = createRng(seed);
  let paid = 0;
  let maxHits = 0;
  for (let i = 0; i < n; i++) {
    const spin = resolvePaidSpin(rng, { ante: false, buy: true, globalMult: 0 });
    const feat = playFeature(rng, spin);
    paid += feat.paid;
    if (feat.hitMax) maxHits += 1;
  }
  return { ev: +(paid / n / BUY_COST_X).toFixed(4), maxHits };
}

const n = Number(process.argv[2] ?? 40000);
const t0 = Date.now();
const base = run(n, false, 42);
const buy = buyEv(Math.min(6000, Math.max(800, Math.floor(n / 8))), 7);
base.buyEv = buy.ev;
const ante = run(Math.floor(n / 2), true, 99);
const ms = Date.now() - t0;
console.log(JSON.stringify({ ms, base, ante, buyMaxHits: buy.maxHits }, null, 2));
