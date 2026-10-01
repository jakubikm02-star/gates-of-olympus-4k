import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COLS, PAY_SYMBOLS, type Cell } from "./symbols.ts";
import { modMul, readChaseFields, rollTarget, rollWindows, tickMod, windowCount, ZASAH, type ChaseState } from "./zasah.ts";

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

  it("rng 0 is a financial-office strike and beats the target", () => {
    const board = boardOf(rngOf(1));
    const rolled = rollWindows(() => 0, board, { spin: 0, target: "pdf", hits: 0, strikes: 0 }, 1);
    assert.equal(rolled.windows[0].result, "fs");
    assert.equal(rolled.next.strikes, 1);
  });

  it("stops the rest of the windows on the deciding one", () => {
    const board = boardOf(rngOf(2));
    const hitRng = (() => {
      const seq = [0, 0, 0, 0, 0.9, 0.01];
      let i = 0;
      return () => seq[Math.min(i++, seq.length - 1)];
    })();
    const hit = rollWindows(hitRng, board, { spin: 7, target: null, hits: 3, strikes: 0 }, 3);
    assert.equal(hit.outcome, "escape");
    assert.equal(hit.windows.length, 1);
    const fs = rollWindows(() => 0, board, { spin: 7, target: null, hits: 0, strikes: 2 }, 3);
    assert.equal(fs.outcome, "unik");
    assert.equal(fs.windows.length, 1);
  });

  it("matches the chase split", () => {
    const rng = rngOf(7);
    let escape = 0;
    let unik = 0;
    const n = 20000;
    for (let i = 0; i < n; i += 1) {
      let s: ChaseState = { spin: 0, target: rollTarget(rng), hits: 0, strikes: 0 };
      let outcome: "escape" | "unik" | "neutral" = "neutral";
      while (s.spin < ZASAH.SPINS) {
        const rolled = rollWindows(rng, boardOf(rng), s, windowCount(s.spin));
        if (rolled.outcome) {
          outcome = rolled.outcome;
          break;
        }
        s = { ...rolled.next, spin: s.spin + 1, target: rollTarget(rng) };
      }
      if (outcome === "escape") escape += 1;
      else if (outcome === "unik") unik += 1;
    }
    assert.ok(Math.abs(escape / n - 0.507) < 0.03, `escape ${escape / n}`);
    assert.ok(Math.abs(unik / n - 0.113) < 0.02, `unik ${unik / n}`);
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
    const bad = readChaseFields({ chaseSpin: 4, chaseTarget: "nope" });
    assert.equal(bad.chaseSpin, 4);
    assert.equal(bad.chaseTarget, null);
  });
});
