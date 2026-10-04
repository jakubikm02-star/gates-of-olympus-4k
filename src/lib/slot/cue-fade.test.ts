import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_FADE,
  FADE_LOCAL_KEY,
  STOP_FADE_MIN_MS,
  clampFadeMs,
  clampMaxS,
  cutPlan,
  fadePayload,
  formatSec,
  isDefaultFade,
  normFade,
  parseFadeRows,
  payloadRows,
  playedLength,
  sameFade,
  stopFadeSec,
  type CueFade,
} from "./cue-fade.ts";
import { isLegacyVolumeKey } from "./cue-volume.ts";

describe("cue fade", () => {
  it("max length: off by default, clamps, accepts a decimal comma", () => {
    assert.equal(clampMaxS(null), null);
    assert.equal(clampMaxS(""), null);
    assert.equal(clampMaxS("vyp."), null);
    assert.equal(clampMaxS(0), null);
    assert.equal(clampMaxS(-3), null);
    assert.equal(clampMaxS("1,5"), 1.5);
    assert.equal(clampMaxS("2.04"), 2);
    assert.equal(clampMaxS(0.01), 0.1);
    assert.equal(clampMaxS(9999), 120);
    assert.deepEqual(normFade(undefined), DEFAULT_FADE);
    assert.ok(isDefaultFade(undefined));
  });

  it("fade ms: whole ms 0 … 3000, garbage = 0", () => {
    assert.equal(clampFadeMs("250"), 250);
    assert.equal(clampFadeMs(12.6), 13);
    assert.equal(clampFadeMs(-5), 0);
    assert.equal(clampFadeMs(99999), 3000);
    assert.equal(clampFadeMs("abc"), 0);
    assert.equal(clampFadeMs(""), 0);
  });

  it("no cut when off or when the sound ends on its own first", () => {
    assert.equal(cutPlan(4, 1, DEFAULT_FADE), null);
    assert.equal(cutPlan(4, 1, { maxS: 5, fadeMs: 500 }), null);
    assert.equal(cutPlan(4, 1, { maxS: 4, fadeMs: 500 }), null);
    // Played faster: a 4 s file at rate 2 lasts 2 s, a 3 s cap never triggers.
    assert.equal(cutPlan(4, 2, { maxS: 3, fadeMs: 0 }), null);
  });

  it("cuts long sounds with the fade ending exactly at the cut", () => {
    assert.deepEqual(cutPlan(6, 1, { maxS: 2, fadeMs: 500 }), { cutAt: 2, fadeStart: 1.5, fadeLen: 0.5 });
    // Fade longer than what plays: ramps over the whole played part.
    assert.deepEqual(cutPlan(6, 1, { maxS: 1, fadeMs: 3000 }), { cutAt: 1, fadeStart: 0, fadeLen: 1 });
    // 0 ms still gets the anti-click floor.
    const p = cutPlan(6, 1, { maxS: 2, fadeMs: 0 });
    assert.ok(p);
    assert.equal(p.fadeLen, STOP_FADE_MIN_MS / 1000);
    // Loops and unknown lengths are cut too when a max is set.
    assert.equal(cutPlan(1, 1, { maxS: 3, fadeMs: 200 }, true)?.cutAt, 3);
    assert.equal(cutPlan(Infinity, 1, { maxS: 3, fadeMs: 200 })?.cutAt, 3);
  });

  it("early stop ramps at least the anti-click floor, else the slot's fade", () => {
    assert.equal(stopFadeSec(undefined), STOP_FADE_MIN_MS / 1000);
    assert.equal(stopFadeSec({ maxS: null, fadeMs: 10 }), STOP_FADE_MIN_MS / 1000);
    assert.equal(stopFadeSec({ maxS: null, fadeMs: 1200 }), 1.2);
  });

  it("played length for the label", () => {
    assert.equal(playedLength(6, { maxS: 2, fadeMs: 0 }), 2);
    assert.equal(playedLength(1.5, { maxS: 2, fadeMs: 0 }), 1.5);
    assert.equal(playedLength(3, DEFAULT_FADE), 3);
  });

  it("parses server rows: clamps, skips junk, unknown slots and defaults", () => {
    const known = new Set(["coin", "bed", "win"]);
    assert.deepEqual(
      parseFadeRows(
        [
          { key: "coin", max_s: 1.25, fade_ms: 300 },
          { key: "bed", max_s: null, fade_ms: "800" },
          { key: "win", max_s: null, fade_ms: 0 },
          { key: "nope", max_s: 1, fade_ms: 1 },
          { key: 4, max_s: 1 },
          null,
          "x",
        ],
        known,
      ),
      { coin: { maxS: 1.3, fadeMs: 300 }, bed: { maxS: null, fadeMs: 800 } },
    );
    assert.deepEqual(parseFadeRows({ not: "rows" }, known), {});
  });

  it("payload has every slot and round-trips through the local copy", () => {
    const keys = ["coin", "bed"];
    const payload = fadePayload({ coin: { maxS: 2, fadeMs: 9000 } }, keys);
    assert.deepEqual(payload, { coin: { max_s: 2, fade_ms: 3000 }, bed: { max_s: null, fade_ms: 0 } });
    const back: Record<string, CueFade> = parseFadeRows(JSON.parse(JSON.stringify(payloadRows(payload))), new Set(keys));
    assert.ok(sameFade(back.bed, undefined));
    assert.deepEqual(back, { coin: { maxS: 2, fadeMs: 3000 } });
  });

  it("local fallback key is not swept as a legacy volume key", () => {
    assert.ok(!isLegacyVolumeKey(FADE_LOCAL_KEY));
  });

  it("formats durations in Slovak", () => {
    assert.equal(formatSec(null), "—");
    assert.equal(formatSec(0.42), "420 ms");
    assert.equal(formatSec(2.44), "2,4 s");
    assert.equal(formatSec(72.4), "1:12");
  });
});
