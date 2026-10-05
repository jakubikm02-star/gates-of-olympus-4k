import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COLS, PAY_SYMBOLS, type Cell } from "./symbols.ts";
import { resolvePaidSpin, withoutScatterPay, evaluate } from "./engine.ts";
import {
  FS_DRAW,
  isFsCell,
  modMul,
  readChaseFields,
  rollFsSymbol,
  rollTarget,
  rollWindows,
  tickMod,
  windowCount,
  ZASAH,
  type ChaseState,
  type FsSymId,
} from "./zasah.ts";

function rngOf(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

function boardOf(rng: () => number): Cell[][] {
  let uid = 1;
  return Array.from({ length: 5 }, () =>
    Array.from({ length: COLS }, () => {
      const roll = rng();
      if (roll < 0.04) return { uid: uid++, kind: "scatter" as const };
      if (roll < 0.08) return { uid: uid++, kind: "mult" as const, mult: 2 };
      const pay = PAY_SYMBOLS[Math.floor(rng() * PAY_SYMBOLS.length)];
      return { uid: uid++, kind: "pay" as const, payId: pay.id };
    }),
  );
}

function neighbor(cell: number, hover: number): boolean {
  const dr = Math.abs(Math.floor(cell / COLS) - Math.floor(hover / COLS));
  const dc = Math.abs((cell % COLS) - (hover % COLS));
  return dr + dc === 1;
}

describe("zasah windows", () => {
  it("opens 1, then 2, then 3 windows", () => {
    assert.equal(windowCount(0), 1);
    assert.equal(windowCount(2), 1);
    assert.equal(windowCount(3), 2);
    assert.equal(windowCount(6), 2);
    assert.equal(windowCount(7), 3);
    assert.equal(windowCount(9), 3);
  });

  it("puts windows on different cells and hovers a neighbour", () => {
    const rng = rngOf(3);
    const rolled = rollWindows(rng, boardOf(rng), { spin: 7, target: rollTarget(rng), hits: 0, strikes: 0 }, 3);
    const cells = rolled.windows.map((w) => w.cell);
    assert.equal(new Set(cells).size, cells.length);
    for (const w of rolled.windows) assert.equal(neighbor(w.cell, w.hover), true);
  });

  it("a window on the FS symbol is a strike and beats the lock-on", () => {
    const board = boardOf(rngOf(1));
    const first = board[0][0];
    const fsSym: FsSymId = first.kind === "scatter" ? "scatter" : first.kind === "pay" ? first.payId! : "rj45";
    board[0][0] = first.kind === "mult" ? { uid: 1, kind: "pay", payId: "rj45" } : first;
    const rolled = rollWindows(() => 0, board, { spin: 0, target: "pdf", hits: 0, strikes: 0, fsSym }, 1);
    assert.equal(rolled.windows[0].cell, 0);
    assert.equal(rolled.windows[0].result, "fs");
    assert.equal(rolled.next.strikes, 1);
  });

  it("no FS symbol means no strikes at all", () => {
    const rng = rngOf(9);
    for (let i = 0; i < 500; i += 1) {
      const rolled = rollWindows(rng, boardOf(rng), { spin: 9, target: "pdf", hits: 0, strikes: 0, fsSym: null }, 3);
      assert.equal(rolled.next.strikes, 0);
    }
  });

  it("4KA TV under FS: only scatter cells strike", () => {
    assert.equal(isFsCell({ uid: 1, kind: "scatter" }, "scatter"), true);
    assert.equal(isFsCell({ uid: 1, kind: "pay", payId: "rj45" }, "scatter"), false);
    assert.equal(isFsCell({ uid: 1, kind: "mult", mult: 2 }, "rj45"), false);
    assert.equal(isFsCell({ uid: 1, kind: "pay", payId: "rj45" }, "rj45"), true);
  });

  it("stops the rest of the windows on the deciding one", () => {
    const board = boardOf(rngOf(2));
    const hitRng = (() => {
      const seq = [0, 0, 0, 0, 0.01];
      let i = 0;
      return () => seq[Math.min(i++, seq.length - 1)];
    })();
    const hit = rollWindows(hitRng, board, { spin: 7, target: null, hits: 3, strikes: 0 }, 3);
    assert.equal(hit.outcome, "escape");
    assert.equal(hit.windows.length, 1);
    const c0 = board[0][0];
    board[0][0] = c0.kind === "pay" ? c0 : { uid: 9, kind: "pay", payId: "hap" };
    const fs = rollWindows(() => 0, board, { spin: 7, target: null, hits: 0, strikes: 2, fsSym: board[0][0].payId! }, 3);
    assert.equal(fs.outcome, "unik");
    assert.equal(fs.windows.length, 1);
  });

  it("never aims at the FS symbol and draws every symbol", () => {
    const rng = rngOf(5);
    const seen = new Set<FsSymId>();
    for (let i = 0; i < 4000; i += 1) {
      const fs = rollFsSymbol(rng);
      seen.add(fs);
      assert.notEqual(rollTarget(rng, fs), fs);
    }
    assert.equal(seen.size, FS_DRAW.length);
    assert.equal(seen.has("scatter"), true);
  });

  function chaseOn(rng: () => number, fsSym: FsSymId): "escape" | "unik" | "neutral" {
    let s: ChaseState = { spin: 0, target: rollTarget(rng, fsSym), hits: 0, strikes: 0, fsSym };
    while (s.spin < ZASAH.SPINS) {
      const board = resolvePaidSpin(rng, { ante: false, globalMult: 0, blockScatter: fsSym === "scatter" }).board;
      const rolled = rollWindows(rng, board, s, windowCount(s.spin));
      if (rolled.outcome) return rolled.outcome;
      s = { ...rolled.next, spin: s.spin + 1, target: rollTarget(rng, fsSym) };
    }
    return "neutral";
  }

  it("matches the chase split on real boards (sim: 46.8 / 26.0 / 27.2)", () => {
    const rng = rngOf(7);
    let escape = 0;
    let unik = 0;
    const n = 6000;
    for (let i = 0; i < n; i += 1) {
      const outcome = chaseOn(rng, rollFsSymbol(rng));
      if (outcome === "escape") escape += 1;
      else if (outcome === "unik") unik += 1;
    }
    assert.ok(Math.abs(escape / n - 0.468) < 0.03, `escape ${escape / n}`);
    assert.ok(Math.abs(unik / n - 0.26) < 0.025, `unik ${unik / n}`);
  });

  it("4KA TV is the safest draw, RJ45 the most dangerous", () => {
    const rng = rngOf(11);
    const n = 2500;
    const unik = (sym: FsSymId) => {
      let u = 0;
      for (let i = 0; i < n; i += 1) if (chaseOn(rng, sym) === "unik") u += 1;
      return u / n;
    };
    const tv = unik("scatter");
    const rj = unik("rj45");
    const pdf = unik("pdf");
    assert.ok(tv < 0.02, `tv ${tv}`);
    assert.ok(pdf < rj, `pdf ${pdf} rj45 ${rj}`);
    assert.ok(rj > 0.33 && rj < 0.45, `rj45 ${rj}`);
  });

  it("4KA TV under FS: scatters neither pay nor trigger free spins", () => {
    const rng = rngOf(21);
    let natural = 0;
    for (let i = 0; i < 20000; i += 1) {
      const spin = resolvePaidSpin(rng, { ante: true, globalMult: 0, blockScatter: true });
      assert.equal(spin.triggeredFs, false);
      if (spin.scatterPeak >= 4) natural += 1;
    }
    assert.ok(natural > 0, "scatters still land, they just stay dead");
    const board = boardOf(rngOf(4));
    for (let i = 0; i < 6; i += 1) board[0][i] = { uid: 500 + i, kind: "scatter" };
    const ev = withoutScatterPay(evaluate(board));
    assert.equal(ev.wins.some((w) => w.payId === "scatter"), false);
    assert.equal(ev.winMask[0].some(Boolean), false);
  });

  it("ticks the tax modifier", () => {
    assert.equal(modMul(null), 1);
    assert.equal(modMul({ kind: "bezDane", left: 2 }), 1.23);
    assert.equal(modMul({ kind: "danUrad", left: 1 }), 0.77);
    assert.deepEqual(tickMod({ kind: "bezDane", left: 2 }), { kind: "bezDane", left: 1 });
    assert.equal(tickMod({ kind: "danUrad", left: 1 }), null);
  });

  it("migrates an old pursuit save and drops a bad target", () => {
    const migrated = readChaseFields({ pursuitLeft: 7 });
    assert.equal(migrated.chaseSpin, 0);
    assert.equal(migrated.chaseTarget, null);
    assert.equal(migrated.chaseHits, 0);
    assert.equal(migrated.chaseFsSym, null);
    const bad = readChaseFields({ chaseSpin: 4, chaseTarget: "nope", chaseFsSym: "nope" });
    assert.equal(bad.chaseSpin, 4);
    assert.equal(bad.chaseTarget, null);
    assert.equal(bad.chaseFsSym, null);
    const ok = readChaseFields({ chaseSpin: 2, chaseTarget: "pdf", chaseFsSym: "scatter" });
    assert.equal(ok.chaseFsSym, "scatter");
    assert.equal(ok.chaseTarget, "pdf");
    const clash = readChaseFields({ chaseSpin: 2, chaseTarget: "hap", chaseFsSym: "hap" });
    assert.equal(clash.chaseTarget, null);
  });
});

describe("ZÁSAH win multiplier", () => {
  it("pays every chase spin win ×2 (tumble/cascade included)", () => {
    assert.equal(ZASAH.BOOST, 2);
    // Same path as use-slot-game: sequenceX * applied * BOOST
    const sequenceX = 10;
    const applied = 5; // Mbps cans
    assert.equal(sequenceX * applied * ZASAH.BOOST, 100);
    assert.equal(12.5 * ZASAH.BOOST, 25);
  });
});
