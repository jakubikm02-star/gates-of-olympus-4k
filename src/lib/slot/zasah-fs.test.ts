import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ZASAH, ZASAH_FS_MUL, applyMod, fsSpinX, fsZasahArmed, roundModScope } from "./zasah.ts";
import { emptyPlayerSave, sanitizePlayerSave } from "./player-save.ts";
import { applyStat, emptyStats } from "./stats.ts";

describe("4KA TV spustena v ZASAHU (x2)", () => {
  it("is armed only by a ZÁSAH trigger spin, never bought, never in a duel", () => {
    assert.equal(ZASAH_FS_MUL, 2);
    assert.equal(fsZasahArmed({ triggerChasing: true, bought: false, duel: false }), true);
    assert.equal(fsZasahArmed({ triggerChasing: false, bought: false, duel: false }), false);
    assert.equal(fsZasahArmed({ triggerChasing: true, bought: true, duel: false }), false);
    assert.equal(fsZasahArmed({ triggerChasing: true, bought: false, duel: true }), false);
  });

  it("doubles a free-spin win once; without ZÁSAH nothing changes", () => {
    assert.deepEqual(fsSpinX(12.5, true, 5000), { paidX: 25, hitMax: false });
    assert.deepEqual(fsSpinX(12.5, false, 5000), { paidX: 12.5, hitMax: false });
    assert.deepEqual(fsSpinX(0, true, 5000), { paidX: 0, hitMax: false });
  });

  it("x2 comes before the MAX WIN cap (the cap still holds)", () => {
    assert.deepEqual(fsSpinX(300, true, 500), { paidX: 500, hitMax: true });
    assert.deepEqual(fsSpinX(240, true, 500), { paidX: 480, hitMax: false });
    assert.deepEqual(fsSpinX(260, false, 500), { paidX: 260, hitMax: false });
  });

  it("order: x2 first, then the tax period on the doubled amount (free spins are in 'fs' scope)", () => {
    const scope = roundModScope({ chasing: false, duel: false, free: true, buy: false });
    assert.equal(scope, "fs");
    const bet = 1;
    const gross = fsSpinX(10, true, 5000).paidX * bet;
    assert.equal(applyMod(gross, { kind: "bezDane", left: 5 }, scope).net, 24.6);
    assert.equal(applyMod(gross, { kind: "danUrad", left: 5 }, scope).net, 15.4);
    // Multiplication commutes, so the order only matters for the cap: 2 x 1.23 = 2.46 x the gross either way.
    assert.equal(+(10 * 2 * ZASAH.ESCAPE_MUL).toFixed(2), 24.6);
  });

  it("a duel free spin is never in ZÁSAH scope (duel scope wins, no tax, no x2 armed)", () => {
    assert.equal(roundModScope({ chasing: false, duel: true, free: true, buy: false }), "duel");
  });

  it("save keeps the flag only while a 4KA TV is running", () => {
    const run = sanitizePlayerSave({ ...emptyPlayerSave(), inFs: true, fsLeft: 7, fsZasah: true });
    assert.equal(run.fsZasah, true);
    const idle = sanitizePlayerSave({ ...emptyPlayerSave(), inFs: false, fsLeft: 0, fsZasah: true });
    assert.equal(idle.fsZasah, false);
    assert.equal(sanitizePlayerSave({}).fsZasah, false);
  });

  it("stats count ZÁSAH bonuses and their payout", () => {
    let st = emptyStats();
    st = applyStat(st, { t: "fsStart", bought: false, ante: false, scatters: 4, spins: 10, zasah: true });
    st = applyStat(st, {
      t: "fsEnd",
      total: 42,
      trigger: 1,
      played: 10,
      extra: 0,
      peak: 2,
      bought: false,
      buyCost: 0,
      modMul: 1,
      gross: 42,
      ms: 1000,
      zasah: true,
    });
    assert.equal(st.c["fs.zasah"], 1);
    assert.equal(st.c["fs.zasah.paid"], 42);
  });
});
