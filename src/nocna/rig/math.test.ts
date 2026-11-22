import assert from "node:assert/strict";
import test from "node:test";
import { rotVec, sample, solveTwoBone, spineBezier } from "./math.ts";

test("bezier eases inside the unit square", () => {
  const mid = spineBezier(0.5, [0.4, 0, 0.2, 1]);
  assert.ok(mid > 0.5 && mid < 1);
  assert.equal(spineBezier(0, [0.4, 0, 0.2, 1]).toFixed(3), "0.000");
});

test("rotate key samples the absolute angle", () => {
  const v = sample(
    [
      { time: 0, value: 0, curve: [0.4, 0, 0.2, 1] },
      { time: 1, value: 10 },
    ],
    1,
    0,
  );
  assert.equal(v, 10);
});

test("y-up local (10,20) lands 20px above the parent when rotation is 0", () => {
  const ly = -20;
  const p = rotVec(10, ly, 0);
  assert.equal(p.x, 10);
  assert.equal(p.y, -20);
});

test("spine +90 aims a (10,0) local vector up the screen", () => {
  const pixi = -90;
  const p = rotVec(10, 0, pixi);
  assert.ok(Math.abs(p.x) < 1e-6);
  assert.ok(Math.abs(p.y + 10) < 1e-6);
});

test("a straight arm solves to a flat chain", () => {
  const s = solveTwoBone(40, 30, 70, 0, true);
  assert.ok(Math.abs(s.a) < 1);
  assert.ok(Math.abs(s.b) < 1);
});

test("a target straight up points the first bone up", () => {
  const s = solveTwoBone(40, 30, 0, 70, false);
  assert.ok(Math.abs(s.a - 90) < 1);
});
