/**
 * Feature-ticket simulation, part 1: one long base-game session on the real engine (resolvePaidSpin),
 * with the real ZÁSAH heat bar / chase windows, the real KONTROLA pity bar (dead +2, 3 scatters +30),
 * natural 4KA TV rounds (their wins feed the heat bar) and the bonus mode drawn 1/3 each (KONTROLA / Ž-BOX / KOLESO).
 * Ante off, flat bet, rank Kredit (no peek, no priority parcels): the most conservative player.
 * Every base spin becomes one record; tickets are replayed over it (play.ts) from random start points,
 * so the bar / heat state at ticket start follows the real stationary distribution.
 */
import { createRng, resolvePaidSpin } from "../../src/lib/slot/engine.ts";
import { FS_SPINS, FS_RETRIGGER, MAX_WIN_X, fsTriggerSpins } from "../../src/lib/slot/symbols.ts";
import { HEAT_MAX, heatFromWin } from "../../src/lib/slot/heat.ts";
import { ZASAH, ZASAH_FS_MUL, rollFsSymbol, rollTarget, rollWindows, windowCount, type ChaseState } from "../../src/lib/slot/zasah.ts";
import { PITY_GOAL, pityGain } from "../../src/lib/slot/pick-bonus.ts";
import { drawBonusMode } from "../../src/lib/slot/bonus-mode.ts";
import { kontrolaRun } from "../../src/lib/slot/bonus-ev.ts";
import { playZbox } from "../../src/lib/slot/zbox.ts";
import { kolesoVipOf, playKoleso } from "../../src/lib/slot/koleso.ts";

/** Per base spin. Flags: 1 win, 2 chase spin, 4 chase start, 8 chase over, 16 4KA TV trigger, 32 4KA TV in ZÁSAH,
 * 64 bonus (bar filled → bonus played after this spin), 128 escape. */
export interface Stream {
  n: number;
  flags: Uint8Array;
  winX: Float32Array;
  pityAdd: Uint8Array;
  chaseHits: Uint8Array;
  chaseWinX: Float32Array;
  bonusMode: Uint8Array; // 1 KONTROLA, 2 Ž-BOX, 3 KOLESO
  bonusX: Float32Array;
  safes: Uint8Array; // KONTROLA safe pins / Ž-BOX parcels in the wall
  cleared: Uint8Array; // KONTROLA all 9 / Ž-BOX full wall
  canSum: Uint8Array;
  rounds: Uint8Array;
}

export function makeStream(n: number, seed: number): Stream {
  const rng = createRng(seed * 7919 + 17);
  const s: Stream = {
    n,
    flags: new Uint8Array(n),
    winX: new Float32Array(n),
    pityAdd: new Uint8Array(n),
    chaseHits: new Uint8Array(n),
    chaseWinX: new Float32Array(n),
    bonusMode: new Uint8Array(n),
    bonusX: new Float32Array(n),
    safes: new Uint8Array(n),
    cleared: new Uint8Array(n),
    canSum: new Uint8Array(n),
    rounds: new Uint8Array(n),
  };
  let heat = 0;
  let pity = 0;
  let chase: ChaseState | null = null;
  let chaseX = 0;
  for (let i = 0; i < n; i++) {
    let f = 0;
    if (!chase && heat >= HEAT_MAX) {
      heat = 0;
      chase = { spin: 0, target: null, hits: 0, strikes: 0, fsSym: rollFsSymbol(rng) };
      chaseX = 0;
      f |= 4;
    }
    const chasing = chase != null;
    const sp = resolvePaidSpin(rng, { ante: false, globalMult: 0, blockScatter: chasing && chase!.fsSym === "scatter" });
    let paid = sp.paidX * (chasing ? ZASAH.BOOST : 1);
    if (paid > 0) f |= 1;
    s.winX[i] = paid;
    if (chasing) {
      f |= 2;
      chaseX += paid;
      const rolled = rollWindows(rng, sp.board, chase!, windowCount(chase!.spin));
      const played: number = chase!.spin + 1;
      // Running HACK count and ZÁSAH win after this spin (feature tickets read them live).
      s.chaseHits[i] = rolled.next.hits;
      s.chaseWinX[i] = chaseX;
      if (rolled.outcome || played >= ZASAH.SPINS) {
        f |= 8;
        if (rolled.outcome === "escape") f |= 128;
        chase = null;
      } else {
        chase = { ...rolled.next, spin: played, target: rollTarget(rng, rolled.next.fsSym) };
      }
    } else if (paid > 0) heat = Math.min(HEAT_MAX, heat + heatFromWin(paid));
    const add = pityGain(sp.scatterPeak, paid <= 0);
    if (add > 0) {
      s.pityAdd[i] = add;
      pity += add;
    }
    if (sp.triggeredFs) {
      f |= 16;
      if (chasing) f |= 32;
      let left = fsTriggerSpins(sp.scatterPeak, FS_SPINS);
      let gm = 0;
      let tot = paid;
      while (left > 0) {
        left--;
        const fs = resolvePaidSpin(rng, { ante: false, free: true, globalMult: gm, capRemain: MAX_WIN_X - tot });
        gm = fs.globalMult;
        const x = fs.paidX * (chasing ? ZASAH_FS_MUL : 1);
        tot += x;
        if (x > 0 && !chase) heat = Math.min(HEAT_MAX, heat + heatFromWin(x));
        if (fs.retrigger) left += FS_RETRIGGER;
        if (fs.hitMax || tot >= MAX_WIN_X) break;
      }
    }
    if (pity >= PITY_GOAL) {
      pity = 0;
      f |= 64;
      const mode = drawBonusMode(rng);
      if (mode === "zbox") {
        const z = playZbox(rng);
        s.bonusMode[i] = 2;
        s.bonusX[i] = z.totalX;
        s.safes[i] = z.start.length + z.rounds.reduce((a, r) => a + r.parcels.length, 0);
        s.cleared[i] = z.full ? 1 : 0;
        s.canSum[i] = Math.min(255, z.canSum);
        s.rounds[i] = z.rounds.length;
      } else if (mode === "koleso") {
        const kp = playKoleso(rng, { vip: kolesoVipOf("kredit") });
        s.bonusMode[i] = 3;
        s.bonusX[i] = kp.totalX;
        s.safes[i] = kp.steps.filter((x) => x.letter && x.hits > 0).length;
        s.cleared[i] = kp.solved ? 1 : 0;
        s.rounds[i] = kp.steps.length;
      } else {
        const k = kontrolaRun(rng, 0, 0);
        s.bonusMode[i] = 1;
        s.bonusX[i] = k.x;
        s.safes[i] = k.safes;
        s.cleared[i] = k.cleared ? 1 : 0;
      }
      if (!chase && s.bonusX[i] > 0) heat = Math.min(HEAT_MAX, heat + heatFromWin(s.bonusX[i]));
    }
    s.flags[i] = f;
  }
  return s;
}

export function summarize(s: Stream): Record<string, number> {
  let chaseStarts = 0, chaseSpins = 0, fs = 0, fsChase = 0, bonus = 0, kon = 0, zb = 0, kol = 0, dead = 0, pity = 0;
  const hits = [0, 0, 0, 0, 0];
  for (let i = 0; i < s.n; i++) {
    const f = s.flags[i];
    if (!(f & 1)) dead++;
    if (f & 2) chaseSpins++;
    if (f & 4) chaseStarts++;
    if (f & 8) hits[s.chaseHits[i]]++;
    if (f & 16) fs++;
    if (f & 32) fsChase++;
    if (f & 64) { bonus++; if (s.bonusMode[i] === 1) kon++; else if (s.bonusMode[i] === 3) kol++; else zb++; }
    pity += s.pityAdd[i];
  }
  return {
    spins: s.n, deadRate: dead / s.n, pityPerSpin: pity / s.n, spinsPerBonus: s.n / bonus,
    spinsPerZasah: s.n / chaseStarts, chaseSpinShare: chaseSpins / s.n, spinsPerFs: s.n / fs, fsInChasePerChase: fsChase / chaseStarts,
    kontrola: kon, zbox: zb, koleso: kol, hits0: hits[0], hits1: hits[1], hits2: hits[2], hits3: hits[3], hits4: hits[4],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = Number(process.argv[2] ?? 100000);
  const seed = Number(process.argv[3] ?? 1);
  const t = Date.now();
  const s = makeStream(n, seed);
  console.log(JSON.stringify(summarize(s), null, 1), (Date.now() - t) / 1000, "s");
}
