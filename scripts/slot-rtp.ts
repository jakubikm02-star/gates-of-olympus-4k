import { ANTE_COST, BUY_COST_X, FS_RETRIGGER, FS_SPINS, MAX_WIN_X } from "../src/lib/slot/symbols.ts";
import { createRng, resolvePaidSpin, type PaidSpin } from "../src/lib/slot/engine.ts";
import { heatFromWin } from "../src/lib/slot/heat.ts";
import { ZASAH, modMul, rollTarget, rollWindows, stepMod, tickMod, windowCount, type ChaseMod, type ChaseState } from "../src/lib/slot/zasah.ts";

function playFeature(
  rng: () => number,
  trigger: PaidSpin,
  onFs?: (paidX: number) => void,
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
    onFs?.(fs.paidX);
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
  let triggerSum = 0;
  let basePaid = 0;
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
      triggerSum += spin.paidX;
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
      basePaid += spin.paidX;
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
    avgTrigger: bonus ? +(triggerSum / bonus).toFixed(1) : 0,
    baseRtp: +(basePaid / stakeOut).toFixed(4),
    featureRtp: +((featureSum) / stakeOut).toFixed(4),
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
  let trigger = 0;
  let maxHits = 0;
  for (let i = 0; i < n; i++) {
    const spin = resolvePaidSpin(rng, { ante: false, buy: true, globalMult: 0 });
    const feat = playFeature(rng, spin);
    paid += feat.paid;
    trigger += spin.paidX;
    if (feat.hitMax) maxHits += 1;
  }
  return {
    ev: +(paid / n / BUY_COST_X).toFixed(4),
    avg: +(paid / n).toFixed(1),
    avgTrigger: +(trigger / n).toFixed(1),
    maxHits,
  };
}

const noZasah = process.argv.includes("--no-zasah");
/** --tax=v3: old rule (period only on base spins, triggered bonus × the trigger spin's mod, free spins don't count). Default v4. */
const taxRule = process.argv.find((a) => a.startsWith("--tax="))?.slice("--tax=".length) === "v3" ? "v3" : "v4";
const n = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 40000);
function zasahRun(spins: number, seed = 5) {
  const rng = createRng(seed);
  let stakeOut = 0;
  let paid = 0;
  let heat = 0;
  let chase: ChaseState | null = null;
  let mod: ChaseMod | null = null;
  let chases = 0;
  let esc = 0;
  let unik = 0;
  let neu = 0;
  let chaseStake = 0;
  let chasePaid = 0;
  let reward = 0;
  let penalty = 0;
  for (let i = 0; i < spins; i += 1) {
    let chasing = false;
    if (!chase && heat >= 100) {
      chase = { spin: 0, target: null, hits: 0, strikes: 0 };
      heat = 0;
      chases += 1;
    }
    if (chase) {
      chasing = true;
      if (!chase.target) chase = { ...chase, target: rollTarget(rng) };
    }
    const cost = chasing ? ZASAH.COST_X : 1;
    stakeOut += cost;
    if (chasing) chaseStake += cost;
    const spin = resolvePaidSpin(rng, { ante: false, free: false, globalMult: 0 });
    const boosted = chasing ? spin.paidX * ZASAH.BOOST : spin.paidX;
    const mul = chasing ? 1 : modMul(mod);
    const basePaid = boosted * mul;
    reward += Math.max(0, basePaid - boosted);
    penalty += Math.max(0, boosted - basePaid);
    if (!chasing && mod) mod = tickMod(mod);
    let extra = 0;
    const note = (x: number) => {
      if (x > 0) heat = Math.min(100, heat + heatFromWin(x));
    };
    if (spin.triggeredFs) {
      if (taxRule === "v3") {
        const feat = playFeature(rng, spin, (fsX) => {
          if (!chasing) note(fsX * mul);
        });
        extra = Math.max(0, feat.paid - spin.paidX) * mul;
        reward += Math.max(0, extra - Math.max(0, feat.paid - spin.paidX));
        penalty += Math.max(0, Math.max(0, feat.paid - spin.paidX) - extra);
      } else {
        // v4: every free spin pays with the period as it stands and counts it down.
        playFeature(rng, spin, (fsX) => {
          const step = stepMod(mod, "fs");
          mod = step.next;
          const got = fsX * step.mul;
          extra += got;
          if (got > fsX) reward += got - fsX;
          else penalty += fsX - got;
          if (!chasing) note(got);
        });
      }
    }
    const got = basePaid + extra;
    paid += got;
    if (chasing) chasePaid += got;
    if (chasing && chase) {
      const rolled = rollWindows(rng, spin.board, chase, windowCount(chase.spin));
      const played = chase.spin + 1;
      if (rolled.outcome || played >= ZASAH.SPINS) {
        if (rolled.outcome === "escape") {
          esc += 1;
          mod = { kind: "bezDane", left: ZASAH.MOD_SPINS };
        } else if (rolled.outcome === "unik") {
          unik += 1;
          mod = { kind: "danUrad", left: ZASAH.MOD_SPINS };
        } else neu += 1;
        chase = null;
      } else {
        chase = { ...rolled.next, spin: played, target: rollTarget(rng) };
      }
    } else {
      note(basePaid);
    }
  }
  return {
    chasesPer1000: +((chases / spins) * 1000).toFixed(2),
    escPct: chases ? +((esc / chases) * 100).toFixed(1) : 0,
    unikPct: chases ? +((unik / chases) * 100).toFixed(1) : 0,
    neutralPct: chases ? +((neu / chases) * 100).toFixed(1) : 0,
    chaseRtp: chaseStake ? +(chasePaid / chaseStake).toFixed(3) : 0,
    rtpReward: +(reward / stakeOut).toFixed(4),
    rtpPenalty: +(penalty / stakeOut).toFixed(4),
    rtpWithZasah: +(paid / stakeOut).toFixed(4),
    taxRule,
  };
}

const t0 = Date.now();
const base = run(n, false, 42);
const buy = buyEv(Math.min(6000, Math.max(800, Math.floor(n / 8))), 7);
base.buyEv = buy.ev;
const ante = run(Math.floor(n / 2), true, 99);
const zasahArg = process.argv.find((a) => a.startsWith("--zasah="));
const zasahN = zasahArg ? Number(zasahArg.slice("--zasah=".length)) : Math.max(n, 2_000_000);
const zasah = noZasah ? null : zasahRun(Number.isFinite(zasahN) && zasahN > 0 ? zasahN : n, 5);
const ms = Date.now() - t0;
console.log(JSON.stringify({ ms, n, zasahN: noZasah ? 0 : zasahN, base, ante, buy, zasah }, null, 2));
