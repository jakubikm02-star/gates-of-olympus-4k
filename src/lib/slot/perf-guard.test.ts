import { test } from "node:test";
import assert from "node:assert/strict";
import { initialPerfGuard, isPerfLite, LITE_ENTER, LITE_EXIT, reportSpinFrames, resetPerfGuard, stepPerfGuard, subscribePerfLite } from "./perf-guard.ts";

test("lite switches on only after consecutive slow spins", () => {
  let s = initialPerfGuard;
  s = stepPerfGuard(s, 30, 40);
  s = stepPerfGuard(s, 30, 40);
  assert.equal(s.lite, false);
  s = stepPerfGuard(s, 16, 40); // a fast spin resets the streak
  for (let i = 0; i < LITE_ENTER - 1; i++) s = stepPerfGuard(s, 30, 40);
  assert.equal(s.lite, false);
  s = stepPerfGuard(s, 30, 40);
  assert.equal(s.lite, true);
});

test("short samples and garbage are ignored", () => {
  let s = initialPerfGuard;
  for (let i = 0; i < 10; i++) s = stepPerfGuard(s, 80, 5);
  for (let i = 0; i < 10; i++) s = stepPerfGuard(s, Number.NaN, 40);
  assert.deepEqual(s, initialPerfGuard);
});

test("lite switches off only after a long fast streak", () => {
  let s = { lite: true, slow: 0, fast: 0 };
  for (let i = 0; i < LITE_EXIT - 1; i++) s = stepPerfGuard(s, 16, 40);
  assert.equal(s.lite, true);
  s = stepPerfGuard(s, 22, 40); // medium spin resets
  assert.equal(s.fast, 0);
  for (let i = 0; i < LITE_EXIT; i++) s = stepPerfGuard(s, 16, 40);
  assert.equal(s.lite, false);
});

test("store notifies on flips only", () => {
  resetPerfGuard();
  let n = 0;
  const off = subscribePerfLite(() => n++);
  for (let i = 0; i < LITE_ENTER + 5; i++) reportSpinFrames(40, 30);
  assert.equal(isPerfLite(), true);
  assert.equal(n, 1);
  off();
  resetPerfGuard();
});
