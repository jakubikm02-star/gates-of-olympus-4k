import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LIVE_HIT_MIN_X, liveHitOk } from "./live-hit.ts";

describe("live massive hit", () => {
  it("posts only a real massive win outside VERSUS", () => {
    assert.equal(LIVE_HIT_MIN_X, 250);
    assert.equal(liveHitOk(250, 10), true);
    assert.equal(liveHitOk(5000, 1), true);
    assert.equal(liveHitOk(249.99, 100), false);
    assert.equal(liveHitOk(250, 0), false);
    assert.equal(liveHitOk(800, 40, true), false);
  });
});
