/**
 * CASHBACK BONUS (VERNOSŤ multiplier). Pure, no network: nothing here touches Supabase.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CASHBACK_CAP,
  addCashback,
  applyCashback,
  cashbackLabel,
  cashbackMulFor,
  cutCashback,
  sanitizeCashback,
  takeCashback,
} from "./cashback.ts";
import { applySpectrum, emptySpectrum, spectrumHud, syncSpectrumDay, type SpectrumInput, type SpectrumState } from "./spectrum.ts";
import { sanitizePlayerSave } from "./player-save.ts";
import { spektrumSummary } from "./spektrum-summary.ts";
import { BONUS_GROUP_LABEL } from "./bonus-mode.ts";

const VERNOST = 6;
const low = () => 0.01;
const ctx = { day: "2026-10-28", playerId: "hrac-test" };

function spin(): SpectrumInput {
  return { sequenceX: 10, orbSum: 5, tumbles: 1, orbs: [{ uid: 7, mult: 5 }], hitMax: false, basePaidX: 50 };
}

function fresh(): SpectrumState {
  const s = emptySpectrum();
  s.day = ctx.day;
  s.mood = VERNOST;
  s.support = 1;
  s.opponent = 5;
  s.weather = 1;
  s.sinceCombo = 0;
  return s;
}

function face(s: SpectrumState, f: "good" | "bad") {
  s.badId = -1;
  s.badN = 0;
  s.debt = 0;
  s.lit = [0, 0, 0, 0, 0, 0, 0];
  return applySpectrum(s, spin(), low, ctx, { forceColor: VERNOST, forceFace: f });
}

const nek = { rankId: "nekonecno", enabled: true, duel: false, natural: true };

describe("cashback store (VERNOSŤ)", () => {
  it("good side adds +0,5× per hit", () => {
    const s = fresh();
    const fx = face(s, "good");
    assert.equal(s.cashback, 0.5);
    assert.equal(fx.cashbackDelta, 0.5);
    assert.equal(fx.label, "CASHBACK +0,5×");
    assert.equal(fx.streak, 0, "the good side no longer touches the win streak");
    face(s, "good");
    assert.equal(s.cashback, 1);
  });

  it("caps at +2,0× (bonus pays at most ×3)", () => {
    const s = fresh();
    for (let i = 0; i < 9; i++) face(s, "good");
    assert.equal(s.cashback, CASHBACK_CAP);
    const fx = face(s, "good");
    assert.equal(fx.cashbackDelta, 0);
    assert.equal(fx.label, "CASHBACK MAX ×3");
    assert.equal(addCashback(2).next, 2);
    assert.equal(cashbackLabel(2), "×3");
  });

  it("bad side takes −0,5× and floors at 0", () => {
    const s = fresh();
    face(s, "good");
    face(s, "good");
    const fx = face(s, "bad");
    assert.equal(s.cashback, 0.5);
    assert.equal(fx.cashbackDelta, -0.5);
    assert.equal(fx.label, "CASHBACK −0,5×");
    assert.equal(fx.streak, 0, "with something stored the streak stays");
    face(s, "bad");
    assert.equal(s.cashback, 0);
    assert.deepEqual(cutCashback(0.5), { next: 0, delta: -0.5, streakReset: false });
  });

  it("with nothing stored the bad side falls back to the streak reset (SÉRIA 0)", () => {
    const s = fresh();
    const fx = face(s, "bad");
    assert.equal(s.cashback, 0);
    assert.equal(fx.streak, -1);
    assert.equal(fx.label, "SÉRIA 0");
    assert.equal(cutCashback(0).streakReset, true);
  });

  it("persists across day change, reload (JSON) and old saves", () => {
    const s = fresh();
    face(s, "good");
    face(s, "good");
    face(s, "good");
    syncSpectrumDay(s, ctx.playerId, "2026-10-29");
    assert.equal(s.day, "2026-10-29");
    assert.equal(s.cashback, 1.5);
    const back = sanitizePlayerSave(JSON.parse(JSON.stringify({ spectrum: s })));
    assert.equal(back?.spectrum?.cashback, 1.5);
    const old = sanitizePlayerSave(JSON.parse(JSON.stringify({ spectrum: { ...s, cashback: undefined } })));
    assert.equal(old?.spectrum?.cashback, 0);
    assert.equal(sanitizeCashback(99), 2);
    assert.equal(sanitizeCashback(-1), 0);
    assert.equal(sanitizeCashback("1.4"), 1.5);
  });
});

describe("cashback payout", () => {
  it("is consumed once, by the first bar bonus that pays", () => {
    let stored = 1;
    const first = takeCashback(stored, nek, 10);
    assert.equal(first.gross, 20);
    assert.equal(first.extra, 10);
    stored = first.stored;
    assert.equal(stored, 0);
    const second = takeCashback(stored, nek, 10);
    assert.equal(second.gross, 10);
    assert.equal(second.extra, 0);
  });

  it("a bonus that pays 0 leaves it stored", () => {
    const r = takeCashback(1.5, nek, 0);
    assert.equal(r.gross, 0);
    assert.equal(r.stored, 1.5);
  });

  it("is never used in a duel, on a bought / granted bonus, below NEKONEČNO or with Spektrum off", () => {
    for (const gate of [
      { ...nek, duel: true },
      { ...nek, natural: false },
      { ...nek, rankId: "duo" },
      { ...nek, rankId: "kredit" },
      { ...nek, enabled: false },
    ]) {
      assert.equal(cashbackMulFor({ ...gate, stored: 2 }), 1);
      const r = takeCashback(2, gate, 12);
      assert.equal(r.gross, 12);
      assert.equal(r.stored, 2, "kept for later");
    }
    assert.equal(cashbackMulFor({ ...nek, stored: 0 }), 1);
    assert.equal(cashbackMulFor({ ...nek, stored: 1.5 }), 2.5);
  });

  it("multiplies the capped gross and rounds to cents", () => {
    assert.deepEqual(applyCashback(30, 3), { gross: 90, extra: 60, used: true, mul: 3 });
    assert.deepEqual(applyCashback(0.34, 1.5), { gross: 0.51, extra: 0.17, used: true, mul: 1.5 });
    assert.deepEqual(applyCashback(5, 1), { gross: 5, extra: 0, used: false, mul: 1 });
  });
});

describe("cashback UI text", () => {
  it("HUD and DNES V AUTOMATE show the stored multiplier", () => {
    const s = fresh();
    face(s, "good");
    const hud = spectrumHud(s, true);
    assert.equal(hud.cashback, 0.5);
    const line = spektrumSummary(hud).lines.find((l) => l.key === "cb");
    assert.ok(line);
    assert.equal(line.lead, "Cashback ×1,5");
    assert.ok(`${line.lead} ${line.text}`.length <= 110);
    const none = spektrumSummary(spectrumHud(fresh(), true)).lines.find((l) => l.key === "cb");
    assert.equal(none, undefined);
    assert.equal(BONUS_GROUP_LABEL, "CASHBACK BONUS");
  });
});
