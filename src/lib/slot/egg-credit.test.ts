import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { claimEndedFsCash, emptyPlayerSave, sanitizePlayerSave } from "./player-save.ts";

describe("egg / massive: credit survives leave mid-celebration", () => {
  it("claimEndedFsCash folds unpaid fsCash into balance when the bonus is no longer running", () => {
    const base = {
      ...emptyPlayerSave(),
      balance: 5753.97,
      inFs: false,
      fsLeft: 0,
      fsCash: 16455,
      fsTriggerCash: 200,
      fsModMul: 1,
      fsBought: false,
      pendingLiveTicket: "okres" as const,
    };
    const { save, claimed } = claimEndedFsCash(base);
    assert.equal(claimed, 16455);
    assert.equal(save.balance, 22208.97);
    assert.equal(save.fsCash, 0);
    assert.equal(save.fsTriggerCash, 0);
    assert.equal(save.inFs, false);
    // Stashed ticket must survive — only the unpaid cash is claimed.
    assert.equal(save.pendingLiveTicket, "okres");
  });

  it("applies the legacy end multiplier (bezDane 1.23) when folding orphaned cash", () => {
    const { save, claimed } = claimEndedFsCash({
      ...emptyPlayerSave(),
      balance: 100,
      inFs: false,
      fsLeft: 0,
      fsCash: 1000,
      fsModMul: 1.23,
      fsBought: false,
    });
    assert.equal(claimed, 1230);
    assert.equal(save.balance, 1330);
    assert.equal(save.fsModMul, 1);
  });

  it("does not touch a still-running 4KA TV", () => {
    const run = {
      ...emptyPlayerSave(),
      balance: 50,
      inFs: true,
      fsLeft: 7,
      fsCash: 900,
    };
    const { save, claimed } = claimEndedFsCash(run);
    assert.equal(claimed, 0);
    assert.equal(save.fsCash, 900);
    assert.equal(save.balance, 50);
    assert.equal(save.inFs, true);
  });

  it("sanitizePlayerSave recovers orphaned mid-celebration cash on boot", () => {
    const s = sanitizePlayerSave({
      balance: 5753.97,
      inFs: false,
      fsLeft: 0,
      fsCash: 16255,
      fsTriggerCash: 200,
      pendingLiveTicket: "kraj",
    });
    assert.equal(s.balance, 22008.97);
    assert.equal(s.fsCash, 0);
    assert.equal(s.fsTriggerCash, 0);
    assert.equal(s.pendingLiveTicket, "kraj");
  });

  it("sanitize clears a dead fsZasah flag without wiping a running bonus cash", () => {
    const run = sanitizePlayerSave({ inFs: true, fsLeft: 3, fsCash: 40, fsZasah: true });
    assert.equal(run.fsZasah, true);
    assert.equal(run.fsCash, 40);
    const idle = sanitizePlayerSave({ inFs: false, fsLeft: 0, fsCash: 0, fsZasah: true });
    assert.equal(idle.fsZasah, false);
  });
});
