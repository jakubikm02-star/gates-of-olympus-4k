import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizePlayerSave } from "./player-save.ts";
import { ZASAH, applyMod, modApplies, modTicks, stepMod, type ChaseMod, type ModScope } from "./zasah.ts";

const free = (left: number): ChaseMod => ({ kind: "bezDane", left });
const unik = (left: number): ChaseMod => ({ kind: "danUrad", left });

/** Plays a sequence of spins through the period like the hook does: pay with the current mod, then step it. */
function play(mod: ChaseMod | null, spins: { scope: ModScope; gross: number }[]) {
  const paid: number[] = [];
  for (const s of spins) {
    paid.push(applyMod(s.gross, mod, s.scope).net);
    mod = stepMod(mod, s.scope).next;
  }
  return { paid, mod };
}

describe("tax period (BEZ DANE / DAŇOVÝ ÚNIK)", () => {
  it("applies to base, free, bought spins and KONTROLA, not to ZÁSAH or duel spins", () => {
    for (const s of ["base", "fs", "buy", "pick"] as const) assert.equal(modApplies(s), true, s);
    for (const s of ["chase", "duel"] as const) assert.equal(modApplies(s), false, s);
    assert.deepEqual(applyMod(10, free(3), "pick"), { net: 12.3, delta: 2.3 });
    assert.deepEqual(applyMod(10, unik(3), "pick"), { net: 7.7, delta: -2.3 });
    assert.deepEqual(applyMod(10, free(3), "fs"), { net: 12.3, delta: 2.3 });
    assert.deepEqual(applyMod(10, unik(3), "buy"), { net: 7.7, delta: -2.3 });
    assert.deepEqual(applyMod(10, free(3), "chase"), { net: 10, delta: 0 });
    assert.deepEqual(applyMod(10, unik(3), "duel"), { net: 10, delta: 0 });
    assert.deepEqual(applyMod(10, null, "fs"), { net: 10, delta: 0 });
  });

  it("counts down on every played spin (free spins included), not on KONTROLA, ZÁSAH or duel", () => {
    for (const s of ["base", "fs", "buy"] as const) assert.deepEqual(stepMod(free(5), s).next, free(4), s);
    for (const s of ["pick", "chase", "duel"] as const) assert.deepEqual(stepMod(free(5), s).next, free(5), s);
    assert.equal(modTicks("pick"), false);
    assert.equal(stepMod(unik(1), "fs").next, null);
  });

  it("runs out inside 4KA TV: free spins after the last period spin pay unmodified", () => {
    // 3 period spins left: the trigger spin + 2 free spins get +23 %, the remaining 8 free spins do not.
    const spins = [{ scope: "base" as const, gross: 1 }, ...Array.from({ length: 10 }, () => ({ scope: "fs" as const, gross: 2 }))];
    const r = play(free(3), spins);
    assert.deepEqual(r.paid, [1.23, 2.46, 2.46, 2, 2, 2, 2, 2, 2, 2, 2]);
    assert.equal(r.mod, null);
  });

  it("a full 15-spin period fits a bought 4KA TV: buy spin + 14 free spins", () => {
    const spins = [{ scope: "buy" as const, gross: 0 }, ...Array.from({ length: 15 }, () => ({ scope: "fs" as const, gross: 1 }))];
    const r = play(unik(ZASAH.MOD_SPINS), spins);
    assert.equal(r.paid.filter((p) => p === 0.77).length, 14);
    assert.equal(r.paid[15], 1);
    assert.equal(r.mod, null);
  });

  it("KONTROLA pays with the mod of the spin that armed it, even if that spin was the last one", () => {
    let mod: ChaseMod | null = free(1);
    const armed = mod; // captured when the pity bar fills on this spin
    mod = stepMod(mod, "base").next;
    assert.equal(mod, null);
    assert.equal(applyMod(5, armed, "pick").net, 6.15);
  });

  it("save/resume keeps a period that spans a running bonus", () => {
    const s = sanitizePlayerSave({
      inFs: true,
      fsLeft: 6,
      fsTotal: 10,
      fsCash: 12.3,
      fsPlayed: 4,
      chaseMod: "danUrad",
      chaseModLeft: 7,
      fsModMul: 1,
      fsTaxDelta: -3.67,
    });
    assert.equal(s.inFs, true);
    assert.equal(s.chaseMod, "danUrad");
    assert.equal(s.chaseModLeft, 7);
    assert.equal(s.fsModMul, 1);
    assert.equal(s.fsTaxDelta, -3.67);
    // Resumed spins keep counting from 7.
    const r = play({ kind: s.chaseMod!, left: s.chaseModLeft }, Array.from({ length: 6 }, () => ({ scope: "fs" as const, gross: 1 })));
    assert.deepEqual(r.paid, [0.77, 0.77, 0.77, 0.77, 0.77, 0.77]);
    assert.deepEqual(r.mod, unik(1));
  });

  it("an old save (end multiplier) still loads, and a new one defaults the tax delta to 0", () => {
    const old = sanitizePlayerSave({ inFs: true, fsLeft: 3, fsModMul: 1.23, chaseMod: "bezDane", chaseModLeft: 4 });
    assert.equal(old.fsModMul, 1.23);
    assert.equal(old.fsTaxDelta, 0);
    assert.equal(sanitizePlayerSave({ fsTaxDelta: "x" }).fsTaxDelta, 0);
  });
});
