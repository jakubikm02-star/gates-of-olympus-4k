import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyPlayerSave, type PlayerSave } from "./player-save.ts";
import { packSave, saveGlance, unpackSave } from "./save-port.ts";

function played(): PlayerSave {
  return {
    ...emptyPlayerSave(),
    balance: 1840.5,
    rp: 640,
    playerId: "11111111-2222-4333-8444-555555555555",
    updatedAt: Date.parse("2026-10-10T14:05:00"),
  };
}

describe("save export", () => {
  it("round-trips credit, rank progress and player id, including a broken line", () => {
    const text = packSave(played());
    const broken = text.replace(/\n/, "\n") + "";
    const wrapped = `${text.slice(0, 20)}\n${text.slice(20)}`;
    const back = unpackSave(wrapped);
    assert.equal(back.ok, true);
    if (!back.ok) return;
    assert.equal(back.save.balance, 1840.5);
    assert.equal(back.save.rp, 640);
    assert.equal(back.save.playerId, played().playerId);
    assert.match(saveGlance(back.save), /Kredit 1[\s\u00a0]?840,50/);
    assert.match(saveGlance(back.save), /SLOBODA/);
    assert.equal(broken.startsWith("PARKIZMUS1"), true);
  });

  it("accepts a raw save and the wrapped form", () => {
    const save = played();
    const raw = unpackSave(JSON.stringify(save));
    const wrapped = unpackSave(JSON.stringify({ parkizmus: 1, save }));
    assert.equal(raw.ok && raw.save.balance, 1840.5);
    assert.equal(wrapped.ok && wrapped.save.balance, 1840.5);
  });

  it("rejects a fresh start, garbage and a huge paste", () => {
    assert.equal(unpackSave("").ok, false);
    assert.equal(unpackSave("nie je to save").ok, false);
    assert.equal(unpackSave("{}").ok, false);
    assert.equal(unpackSave(JSON.stringify({ balance: 9, updatedAt: 1 })).ok, false);
    assert.equal(unpackSave("x".repeat(80_001)).ok, false);
    const bad = unpackSave("PARKIZMUS1\n!!!!");
    assert.equal(bad.ok, false);
  });
});
