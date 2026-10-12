import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ONLINE_LABEL, onlineBlink, onlineDigits, segMask } from "./online.ts";

describe("online counter", () => {
  it("pads the count like a segment display", () => {
    assert.equal(onlineDigits(null), "--");
    assert.equal(onlineDigits(0), "00");
    assert.equal(onlineDigits(4), "04");
    assert.equal(onlineDigits(4.9), "04");
    assert.equal(onlineDigits(99), "99");
    assert.equal(onlineDigits(100), "100");
    assert.equal(onlineDigits(5000), "999");
  });

  it("blinks the green dot only when the count changes", () => {
    assert.equal(onlineBlink(null, 1), false);
    assert.equal(onlineBlink(1, 1), false);
    assert.equal(onlineBlink(1, 2), true);
    assert.equal(onlineBlink(2, null), false);
  });

  it("draws ONLINE and every digit with segments", () => {
    for (const ch of ONLINE_LABEL) assert.ok(segMask(ch).length > 0, ch);
    for (const ch of "0123456789-") assert.ok(segMask(ch).length > 0, ch);
    assert.equal(segMask("?"), "");
  });
});
