import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ANTI2_AFTER,
  ANTI3_AFTER,
  ANTI_STREAK_MAX,
  antiAfterSpin,
  antiCue,
  antiFallback,
  antiLevel,
  antiStreak,
  type AntiCue,
} from "./anticipation.ts";
import { emptyPlayerSave, sanitizePlayerSave } from "./player-save.ts";
import { applyStat, cget, emptyStats, sanitizeStats, type StatEvent } from "./stats.ts";

/** Play spins: true = anticipated without bonus, "fs" = anticipated and triggered, false = no tease, "buy" = bonus w/o tease. */
function run(spins: (boolean | "fs" | "buy")[], start = 0): { cues: AntiCue[]; streak: number } {
  let streak = start;
  const cues: AntiCue[] = [];
  for (const s of spins) {
    const anticipated = s === true || s === "fs";
    if (anticipated) cues.push(antiCue(streak));
    streak = antiAfterSpin(streak, { anticipated, bonus: s === "fs" || s === "buy" });
  }
  return { cues, streak };
}
const times = (n: number) => Array.from({ length: n }, () => true as const);

describe("anticipation 2 / 3 streak", () => {
  it("1–4 normal, 5–9 anticipation 2, 10+ anticipation 3", () => {
    assert.equal(ANTI2_AFTER, 4);
    assert.equal(ANTI3_AFTER, 9);
    const { cues, streak } = run(times(12));
    assert.deepEqual(cues, [
      ...Array(4).fill("anticipate"),
      ...Array(5).fill("anticipation2"),
      ...Array(3).fill("anticipation3"),
    ]);
    assert.equal(streak, 12);
  });

  it("keeps the level until a bonus lands, then starts over at 1", () => {
    const { cues, streak } = run([...times(10), "fs", true, true]);
    assert.equal(cues[9], "anticipation3");
    assert.equal(cues[10], "anticipation3", "the triggering tease still plays by the streak before it");
    assert.deepEqual(cues.slice(11), ["anticipate", "anticipate"]);
    assert.equal(streak, 2);
  });

  it("spins without anticipation neither count nor reset", () => {
    const { cues } = run([true, false, true, false, false, true, true, false, true]);
    assert.deepEqual(cues, ["anticipate", "anticipate", "anticipate", "anticipate", "anticipation2"]);
  });

  it("a bonus without anticipation (tumble scatters, ZÁSAH, buy) also resets", () => {
    const { cues } = run([...times(6), "buy", true]);
    assert.equal(cues[6], "anticipate");
    assert.equal(antiAfterSpin(7, { anticipated: false, bonus: true }), 0);
  });

  it("level for stats", () => {
    assert.equal(antiLevel("anticipate"), 1);
    assert.equal(antiLevel("anticipation2"), 2);
    assert.equal(antiLevel("anticipation3"), 3);
  });

  it("sanitizes and caps the streak", () => {
    assert.equal(antiStreak(undefined), 0);
    assert.equal(antiStreak(-3), 0);
    assert.equal(antiStreak(2.9), 2);
    assert.equal(antiStreak(Number.NaN), 0);
    assert.equal(antiStreak(1e9), ANTI_STREAK_MAX);
    assert.equal(antiAfterSpin(ANTI_STREAK_MAX, { anticipated: true, bonus: false }), ANTI_STREAK_MAX);
    assert.equal(antiCue(-5), "anticipate");
  });
});

describe("anticipation fallback chain", () => {
  const has = (...keys: AntiCue[]) => (k: AntiCue) => keys.includes(k);
  it("plays its own slot when uploaded", () => {
    assert.equal(antiFallback("anticipation3", has("anticipation3", "anticipation2")), "anticipation3");
    assert.equal(antiFallback("anticipation2", has("anticipation2")), "anticipation2");
  });
  it("anticipation3 → anticipation2 → anticipate", () => {
    assert.equal(antiFallback("anticipation3", has("anticipation2")), "anticipation2");
    assert.equal(antiFallback("anticipation3", has()), "anticipate");
    assert.equal(antiFallback("anticipation2", has("anticipation3")), "anticipate", "never falls UP the chain");
    assert.equal(antiFallback("anticipate", has("anticipation2", "anticipation3")), "anticipate");
  });
});

describe("anticipation save + stats", () => {
  it("the streak survives the player save", () => {
    assert.equal(sanitizePlayerSave({ ...emptyPlayerSave(), antiStreak: 6 }).antiStreak, 6);
    assert.equal(sanitizePlayerSave({ ...emptyPlayerSave(), antiStreak: "x" as unknown as number }).antiStreak, 0);
    assert.equal(sanitizePlayerSave({}).antiStreak, 0);
    assert.equal(emptyPlayerSave().antiStreak, 0);
  });

  it("counts anticipations per level and their 4KA TV hits; keys survive sanitize", () => {
    const spin = (anti: 1 | 2 | 3, antiFs: boolean): StatEvent => ({
      t: "spin", cost: 1, bet: 1, ante: false, chase: false, buy: false, free: false, cash: 0, cash0: 0, x: 0,
      tumbles: 0, clusters: 0, orbs: [], orbSum: 0, applied: 0, pays: [], scatters: 2, nearMiss: false,
      taxDelta: 0, hitMax: false, turbo: false, quick: false, auto: false, anti, antiFs,
    });
    let s = emptyStats(1_700_000_000_000);
    for (const [lv, fs] of [[1, false], [1, true], [2, false], [2, true], [3, false], [3, true], [3, false]] as const) {
      s = applyStat(s, spin(lv, fs), 1_700_000_000_000);
    }
    s = sanitizeStats(JSON.parse(JSON.stringify(s)));
    assert.equal(cget(s, "anti"), 7);
    assert.equal(cget(s, "anti.fs"), 1);
    assert.equal(cget(s, "anti.2"), 2);
    assert.equal(cget(s, "anti.2.fs"), 1);
    assert.equal(cget(s, "anti.3"), 3);
    assert.equal(cget(s, "anti.3.fs"), 1);
  });
});
