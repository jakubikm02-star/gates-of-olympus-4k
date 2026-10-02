import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldRetry, withRetry } from "./net-retry.ts";

const abortError = () => {
  const e = new Error("The operation was aborted.");
  e.name = "AbortError";
  return e;
};

describe("withRetry", () => {
  it("retries once after a network failure", async () => {
    let calls = 0;
    const v = await withRetry(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("Failed to fetch");
      return 7;
    });
    assert.equal(v, 7);
    assert.equal(calls, 2);
  });

  it("does not retry a timeout", async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(async () => {
        calls += 1;
        throw abortError();
      }),
    );
    assert.equal(calls, 1);
  });

  it("does not retry an HTTP error such as 400 bad stake", async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(async () => {
        calls += 1;
        throw new Error("pool rpc park_jackpot_spin 400 bad stake");
      }),
    );
    assert.equal(calls, 1);
  });

  it("classifies errors", () => {
    assert.equal(shouldRetry(new TypeError("x")), true);
    assert.equal(shouldRetry(abortError()), false);
    assert.equal(shouldRetry("x"), false);
  });
});
