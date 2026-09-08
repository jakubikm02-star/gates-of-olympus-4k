import { ANTE_COST, BUY_COST_X, FS_RETRIGGER, FS_SPINS, MAX_WIN_X } from "../src/lib/slot/symbols.ts";
import { createRng, resolvePaidSpin } from "../src/lib/slot/engine.ts";

function run(n: number, ante: boolean, seed = 1) {
  const rng = createRng(seed);
  let stakeOut = 0;
  let paid = 0;
  let hits = 0;
  let bonus = 0;
  let maxHits = 0;
  let fsSpins = 0;
  let fsPaid = 0;
  let retriggers = 0;
  let fsMultSum = 0;
  let fsMultN = 0;
  let dead = 0;
  let near = 0;
  let seqSum = 0;
  let orbOnWin = 0;
  let orbOnWinN = 0;
  let featureSum = 0;

  for (let i = 0; i < n; i++) {
    const stake = ante ? ANTE_COST : 1;
    stakeOut += stake;
    const spin = resolvePaidSpin(rng, { ante, free: false, globalMult: 0 });
    paid += spin.paidX;
    seqSum += spin.sequenceX;
    if (spin.paidX > 0) {
      hits += 1;
      if (spin.orbSum > 0) {
        orbOnWin += spin.orbSum;
        orbOnWinN += 1;
      }
    } else dead += 1;
    if (spin.nearMiss) near += 1;
    if (spin.hitMax) maxHits += 1;

    if (spin.triggeredFs) {
      bonus += 1;
      let left = FS_SPINS;
      let gm = 0;
      let feature = spin.paidX;
      while (left > 0) {
        left -= 1;
        fsSpins += 1;
        const fs = resolvePaidSpin(rng, { ante: false, free: true, globalMult: gm });
        gm = fs.globalMult;
        feature += fs.paidX;
        paid += fs.paidX;
        fsPaid += fs.paidX;
        if (fs.retrigger) {
          left += FS_RETRIGGER;
          retriggers += 1;
        }
        if (fs.hitMax) {
          maxHits += 1;
          break;
        }
      }
      featureSum += feature;
      if (gm > 0) {
        fsMultSum += gm;
        fsMultN += 1;
      }
      if (feature > MAX_WIN_X) {
        /* already capped per-spin */
      }
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
    avgSeqX: +(seqSum / n).toFixed(3),
    avgOrbOnWin: orbOnWinN ? +(orbOnWin / orbOnWinN).toFixed(2) : 0,
    avgFsMult: fsMultN ? +(fsMultSum / fsMultN).toFixed(2) : 0,
    avgFeature: bonus ? +(featureSum / bonus).toFixed(1) : 0,
    fsSpins,
    retriggers,
    buyEv: null as number | null,
  };
}

function buyEv(n: number, seed = 9) {
  const rng = createRng(seed);
  let paid = 0;
  for (let i = 0; i < n; i++) {
    const spin = resolvePaidSpin(rng, { ante: false, buy: true, globalMult: 0 });
    paid += spin.paidX;
    let left = FS_SPINS;
    let gm = 0;
    while (left > 0) {
      left -= 1;
      const fs = resolvePaidSpin(rng, { ante: false, free: true, globalMult: gm });
      gm = fs.globalMult;
      paid += fs.paidX;
      if (fs.retrigger) left += FS_RETRIGGER;
      if (fs.hitMax) break;
    }
  }
  return +(paid / n / BUY_COST_X).toFixed(4);
}

const n = Number(process.argv[2] ?? 40000);
const t0 = Date.now();
const base = run(n, false, 42);
base.buyEv = buyEv(Math.min(6000, Math.max(800, Math.floor(n / 8))), 7);
const ante = run(Math.floor(n / 2), true, 99);
const ms = Date.now() - t0;
console.log(JSON.stringify({ ms, base, ante }, null, 2));
