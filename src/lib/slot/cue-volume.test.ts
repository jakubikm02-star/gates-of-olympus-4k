import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CUE_LEVEL_MAX,
  clampCueLevel,
  cueLevelKey,
  directElementVolume,
  effectiveCueGain,
  parseCueLevel,
} from "./cue-volume.ts";

describe("cue volume", () => {
  it("stores each slot under p4k.volume.<key>", () => {
    assert.equal(cueLevelKey("bed"), "p4k.volume.bed");
    assert.equal(cueLevelKey("massive"), "p4k.volume.massive");
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
