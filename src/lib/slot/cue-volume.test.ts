import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CUE_LEVEL_MAX,
  clampCueLevel,
  MASTER_KEY,
  directElementVolume,
  effectiveCueGain,
  globalLevelsPayload,
  isLegacyVolumeKey,
  parseCueLevel,
  parseGlobalLevels,
} from "./cue-volume.ts";

describe("cue volume", () => {
  it("recognises the old per-device localStorage keys (to drop them)", () => {
    assert.ok(isLegacyVolumeKey("p4k.volume"));
    assert.ok(isLegacyVolumeKey("p4k.volume.bed"));
    assert.ok(!isLegacyVolumeKey("p4k.volumeX"));
    assert.ok(!isLegacyVolumeKey("p4k.muted"));
    assert.ok(!isLegacyVolumeKey(null));
  });

  it("parses global levels from the server: clamps, skips junk and unknown slots", () => {
    const known = new Set(["bed", "coin"]);
    assert.deepEqual(
      parseGlobalLevels(
        [
          { key: MASTER_KEY, level: 1.5 },
          { key: "bed", level: 0.4 },
          { key: "coin", level: 9 },
          { key: "nope", level: 0.1 },
          { key: "bed2" },
          null,
          { key: "coin2", level: "x" },
        ],
        known,
      ),
      { [MASTER_KEY]: 1.5, bed: 0.4, coin: 2 },
    );
    assert.deepEqual(parseGlobalLevels({ message: "boom" }, known), {});
    assert.deepEqual(parseGlobalLevels(null, known), {});
    assert.deepEqual(parseGlobalLevels([{ key: "bed", level: "0.25" }], known), { bed: 0.25 });
  });

  it("saves the master and every slot (missing ones as 100 %)", () => {
    assert.deepEqual(globalLevelsPayload(0.8, { bed: 1.3333 }, ["bed", "coin"]), {
      [MASTER_KEY]: 0.8,
      bed: 1.33,
      coin: 1,
    });
  });

  it("defaults to 100 % for missing or broken values", () => {
    assert.equal(parseCueLevel(null), 1);
    assert.equal(parseCueLevel(undefined), 1);
    assert.equal(parseCueLevel(""), 1);
    assert.equal(parseCueLevel("abc"), 1);
    assert.equal(parseCueLevel("0.5"), 0.5);
    assert.equal(parseCueLevel("0"), 0);
  });

  it("clamps to 0 … 200 % in whole percent", () => {
    assert.equal(CUE_LEVEL_MAX, 2);
    assert.equal(clampCueLevel(-1), 0);
    assert.equal(clampCueLevel(5), 2);
    assert.equal(clampCueLevel(0.123), 0.12);
    assert.equal(clampCueLevel(Number.NaN), 1);
    assert.equal(parseCueLevel("9"), 2);
  });

  it("multiplies cue by master", () => {
    assert.equal(effectiveCueGain(0.5, 2), 1);
    assert.equal(effectiveCueGain(2, 2), 4);
    assert.equal(effectiveCueGain(1, 1), 1);
    assert.equal(effectiveCueGain(0, 2), 0);
  });

  it("caps a direct HTMLAudio element at 1.0", () => {
    assert.equal(directElementVolume(0.62, 0.5, 2), 0.62);
    assert.equal(directElementVolume(0.62, 2, 2), 1);
    assert.equal(directElementVolume(0.62, 0, 1), 0);
  });
});
