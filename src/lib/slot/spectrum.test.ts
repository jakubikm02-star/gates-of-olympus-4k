import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizePlayerSave } from "./player-save.ts";
import {
  COLORS,
  applySpectrum,
  emptySpectrum,
  hash32,
  rollDay,
  rollWeather,
  sanitizeSpectrum,
  type SpectrumInput,
  type SpectrumState,
} from "./spectrum.ts";

function scripted(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i] ?? values[values.length - 1] ?? 0;
    i += 1;
    return v;
  };
}

function spin(over: Partial<SpectrumInput> = {}): SpectrumInput {
  return {
    sequenceX: 10,
    orbSum: 5,
    tumbles: 1,
    orbs: [{ uid: 7, mult: 5 }],
    hitMax: false,
    basePaidX: 50,
    ...over,
  };
}

function fresh(): SpectrumState {
  const s = emptySpectrum();
  s.day = "2026-10-23";
  s.mood = 0;
  s.support = 1;
  s.opponent = 5;
  s.weather = 1;
  s.sinceCombo = 0;
  return s;
}

describe("spektrum seed", () => {
  it("is stable for the same player and Bratislava day", () => {
    const a = rollDay("hrac-1", "2026-10-23", [], []);
    const b = rollDay("hrac-1", "2026-10-23", [], []);
    assert.deepEqual(a, b);
    assert.notEqual(hash32("hrac-1|2026-10-23|den"), hash32("hrac-2|2026-10-23|den"));
  });

  it("changes with the player, the day and the last three moods", () => {
    const base = rollDay("hrac-1", "2026-10-23", [], []);
    const other = rollDay("hrac-2", "2026-10-23", [], []);
    const tomorrow = rollDay("hrac-1", "2026-10-24", [], []);
    const heavy = rollDay("hrac-1", "2026-10-23", [base.mood, base.mood, base.mood], []);
    assert.notDeepEqual(base, other);
    assert.notDeepEqual(base, tomorrow);
    assert.ok(heavy.mood >= 0 && heavy.mood <= 6);
    const supportNeigh =
      Math.abs(base.support - base.mood) === 1 || Math.abs(base.support - base.mood) === 6;
    assert.equal(supportNeigh, true);
    assert.notEqual(base.support, COLORS[base.mood].opposite);
    assert.notEqual(base.opponent, base.mood);
    assert.notEqual(base.opponent, base.support);
  });

  it("replays a spin from the same state", () => {
    const a = fresh();
    const b = fresh();
    const fxA = applySpectrum(a, spin(), scripted([0.1, 0.2, 0.99]), { day: a.day, playerId: "p" });
    const fxB = applySpectrum(b, spin(), scripted([0.1, 0.2, 0.99]), { day: b.day, playerId: "p" });
    assert.equal(fxA.paidX, fxB.paidX);
    assert.equal(fxA.label, fxB.label);
    assert.equal(fxA.event, fxB.event);
  });
});

describe("spektrum grammar", () => {
  it("bans a storm when one of the last three days was a storm", () => {
    for (let i = 0; i < 40; i++) {
      const w = rollWeather(scripted([i / 40]), [1, 0, 0]);
      assert.notEqual(w, 2);
    }
    const open = rollWeather(scripted([0.99]), [0, 0, 0], {
      p: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      comboP: 1,
      calmW: 0.3,
      normalW: 0.55,
      stormW: 0.15,
      whiteP: 0,
      amp: 1,
    });
    assert.equal(open, 2);
  });

  it("support is a neighbour and never the opposite", () => {
    for (let mood = 0; mood < 7; mood++) {
      for (let k = 0; k < 10; k++) {
        const plan = rollDay(`m${mood}`, `2026-04-${String(k + 1).padStart(2, "0")}`, [], []);
        const opp = COLORS[plan.mood].opposite;
        assert.notEqual(plan.support, opp);
        const dist = Math.min(Math.abs(plan.support - plan.mood), 7 - Math.abs(plan.support - plan.mood));
        assert.equal(dist, 1);
      }
    }
  });
});

describe("spektrum caps", () => {
  it("forces the third identical bad effect to be good", () => {
    const s = fresh();
    const tune = {
      p: [0, 0, 0, 0, 0, 0, 0],
      comboP: 0,
      calmW: 0,
      normalW: 1,
      stormW: 0,
      whiteP: 0,
      amp: 1,
    };
    const faces: string[] = [];
    for (let i = 0; i < 3; i++) {
      const fx = applySpectrum(s, spin(), scripted([0, 0.99]), { day: s.day, playerId: "p" }, { forceColor: 0 }, tune);
      faces.push(fx.label);
    }
    assert.equal(faces[0], "ZAMIETNUTÉ");
    assert.equal(faces[1], "ZAMIETNUTÉ");
    assert.notEqual(faces[2], "ZAMIETNUTÉ");
  });

  it("allows one combination per 20 spins", () => {
    const s = fresh();
    s.sinceCombo = 20;
    s.lit = [0, 12, 0, 0, 0, 0, 0];
    const tune = {
      p: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      comboP: 1,
      calmW: 0,
      normalW: 1,
      stormW: 0,
      whiteP: 0,
      amp: 1,
    };
    const first = applySpectrum(s, spin(), scripted([0, 0]), { day: s.day, playerId: "p" }, { forceColor: 0, forceFace: "good" }, tune);
    assert.equal(first.event, "pair");
    s.lit[1] = 12;
    const second = applySpectrum(s, spin(), scripted([0, 0]), { day: s.day, playerId: "p" }, { forceColor: 0, forceFace: "good" }, tune);
    assert.notEqual(second.event, "pair");
  });
});

describe("spektrum opposites", () => {
  it("puts both slots out and pays nothing extra", () => {
    const s = fresh();
    s.lit[5] = 8;
    const fx = applySpectrum(s, spin(), scripted([0]), { day: s.day, playerId: "p" }, { forceColor: 0 });
    assert.equal(fx.event, "cancel");
    assert.equal(fx.label, "NEUTRALIZOVANÉ");
    assert.equal(fx.paidX, 50);
    assert.equal(s.lit[0], 0);
    assert.equal(s.lit[5], 0);
    assert.equal(fx.touched, false);
  });
});

describe("spektrum once a day", () => {
  it("fires ŽIVÁ VODA from a rolling window, once per day", () => {
    const tune = {
      p: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      comboP: 1,
      calmW: 0,
      normalW: 1,
      stormW: 0,
      whiteP: 1,
      triadSpan: 40,
      amp: 1,
    };
    const s = fresh();
    s.sinceCombo = 20;
    s.lit = [0, 0, 0, 0, 0, 0, 0];
    s.ringAge = [4, 12, 999, 999, 999, 9, 999];
    const first = applySpectrum(s, spin(), scripted([0, 0]), { day: s.day, playerId: "p" }, { forceColor: 0 }, tune);
    assert.equal(first.event, "white");
    assert.equal(first.label, "ŽIVÁ VODA");
    assert.ok(first.paidX > 50);
    assert.equal(s.lit.filter((n) => n > 0).length, 1);
    s.sinceCombo = 20;
    s.lit = [0, 0, 0, 0, 0, 0, 0];
    s.ringAge = [1, 2, 999, 999, 999, 3, 999];
    const second = applySpectrum(s, spin(), scripted([0, 0]), { day: s.day, playerId: "p" }, { forceColor: 0 }, tune);
    assert.notEqual(second.event, "white");
    assert.equal(s.white, 1);
    const stale = fresh();
    stale.sinceCombo = 20;
    stale.ringAge = [4, 80, 999, 999, 999, 9, 999];
    const missed = applySpectrum(stale, spin(), scripted([0, 0]), { day: stale.day, playerId: "p" }, { forceColor: 0 }, tune);
    assert.notEqual(missed.event, "white");
  });

  it("clears the window when the day changes", () => {
    const tune = {
      p: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      comboP: 1,
      calmW: 0,
      normalW: 1,
      stormW: 0,
      whiteP: 1,
      triadSpan: 40,
      amp: 1,
    };
    const s = fresh();
    s.white = 1;
    s.sinceCombo = 20;
    s.ringAge = [1, 1, 999, 999, 999, 1, 999];
    const fx = applySpectrum(s, spin(), scripted([0, 0]), { day: "2026-10-24", playerId: "p" }, { forceColor: 0 }, tune);
    assert.notEqual(fx.event, "white");
    assert.equal(s.white, 0);
    assert.ok(s.ringAge[1] === 999 || s.ringAge[1] > 40);
  });

  it("fires ŽIVÁ VODA at most once", () => {
    const tune = {
      p: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      comboP: 1,
      calmW: 0,
      normalW: 1,
      stormW: 0,
      whiteP: 1,
      amp: 1,
    };
    const s = fresh();
    s.sinceCombo = 20;
    s.lit = [0, 12, 12, 0, 0, 0, 0];
    const first = applySpectrum(s, spin(), scripted([0, 0]), { day: s.day, playerId: "p" }, { forceColor: 4, forceWhite: true }, tune);
    assert.equal(first.event, "white");
    assert.ok(first.paidX > 50);
    s.sinceCombo = 20;
    s.lit = [0, 12, 12, 0, 0, 0, 0];
    const second = applySpectrum(s, spin(), scripted([0, 0, 0.2]), { day: s.day, playerId: "p" }, { forceColor: 4, forceWhite: true }, tune);
    assert.notEqual(second.event, "white");
    assert.equal(s.white, 1);
  });

  it("fires ČIERNA DIERA at most once", () => {
    const s = fresh();
    s.neutrals = [1, 2];
    s.lit[5] = 6;
    const first = applySpectrum(s, spin(), scripted([0]), { day: s.day, playerId: "p" }, { forceColor: 0 });
    assert.equal(first.event, "black");
    assert.equal(first.paidX, 10);
    assert.equal(s.fttb, 10);
    assert.equal(first.pity, 10);
    s.neutrals = [1, 2];
    s.lit[5] = 6;
    const second = applySpectrum(s, spin(), scripted([0]), { day: s.day, playerId: "p" }, { forceColor: 0 });
    assert.equal(second.event, "cancel");
    assert.equal(second.paidX, 50);
    assert.equal(s.black, 1);
  });
});

describe("spektrum save", () => {
  it("loads an old save that has no spectrum block", () => {
    const s = sanitizePlayerSave({ balance: 50, rp: 2700 });
    assert.equal(s.balance, 50);
    assert.equal(s.rp, 2700);
    assert.equal(s.spectrum?.day, "");
    assert.equal(s.spectrum?.fttb, 0);
    assert.equal(s.spectrum?.pending, 0);
    assert.equal(sanitizeSpectrum({ lit: [99, -3, "x", 4], pending: -8, day: "2026-10-23" }).lit[0], 12);
    assert.equal(sanitizeSpectrum({ pending: -8 }).pending, 0);
    assert.equal(sanitizeSpectrum({ day: "2026-10-23" }).ringAge[0], 999);
    assert.equal(sanitizeSpectrum({ ringAge: [3, 1000, -1] }).ringAge[0], 3);
    assert.equal(sanitizeSpectrum({ ringAge: [3, 1000, -1] }).ringAge[1], 999);
    assert.equal(sanitizeSpectrum({ ringAge: [3, 1000, -1] }).ringAge[2], 999);
  });
});
