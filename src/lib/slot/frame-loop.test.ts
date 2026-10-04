import assert from "node:assert/strict";
import { test } from "node:test";
import { createFrameLoop, estimateHz, nominalHz } from "./frame-loop.ts";

/** Manual rAF: `frame(t)` runs whatever is queued, counting native callbacks per frame. */
function fakeRaf() {
  let q = new Map<number, (t: number) => void>();
  let id = 1;
  const native: number[] = [];
  return {
    get: () => ({
      raf: (cb: (t: number) => void) => {
        q.set(id, cb);
        return id++;
      },
      caf: (i: number) => void q.delete(i),
    }),
    frame(t: number) {
      const cbs = [...q.values()];
      q = new Map();
      native.push(cbs.length);
      for (const cb of cbs) cb(t);
    },
    pending: () => q.size,
    native,
  };
}

test("many jobs share one native rAF callback per frame and the same timestamp", () => {
  const r = fakeRaf();
  const loop = createFrameLoop(r.get);
  const seen: [string, number, number][] = [];
  const offs = ["reels", "wait", "hud", "bed"].map((name) => loop.onFrame((now, dt) => void seen.push([name, now, dt])));
  assert.equal(r.pending(), 1);
  r.frame(1000);
  r.frame(1008.33);
  assert.deepEqual(r.native, [1, 1]);
  assert.equal(loop.stats().ranLast, 4);
  const f2 = seen.filter((s) => s[1] === 1008.33);
  assert.equal(f2.length, 4);
  for (const s of f2) assert.ok(Math.abs(s[2] - 8.33) < 1e-9);
  // first frame after start reports dt 0 (no fake jump)
  assert.ok(seen.filter((s) => s[1] === 1000).every((s) => s[2] === 0));
  offs.forEach((off) => off());
  assert.equal(r.pending(), 0, "idle loop requests no frames");
});

test("returning false / nextFrame unsubscribe; jobs added mid-frame start next frame", () => {
  const r = fakeRaf();
  const loop = createFrameLoop(r.get);
  let n = 0;
  let late = 0;
  loop.onFrame(() => {
    n++;
    if (n === 1) loop.onFrame(() => void late++);
    return n < 3;
  });
  let once = 0;
  loop.nextFrame(() => void once++);
  r.frame(0);
  assert.equal(late, 0);
  r.frame(16);
  r.frame(32);
  r.frame(48);
  assert.equal(n, 3);
  assert.equal(once, 1);
  assert.equal(late, 3);
});

test("a throwing job does not stop the others", () => {
  const r = fakeRaf();
  const errs: unknown[] = [];
  const loop = createFrameLoop(r.get, (e) => errs.push(e));
  let ok = 0;
  const off1 = loop.onFrame(() => {
    throw new Error("boom");
  });
  const off2 = loop.onFrame(() => void ok++);
  r.frame(0);
  r.frame(16);
  assert.equal(ok, 2);
  off1();
  off2();
  assert.equal(errs.length, 2);
});

test("refresh estimate: median interval, robust to long frames", () => {
  const r = fakeRaf();
  const loop = createFrameLoop(r.get);
  const off = loop.onFrame(() => {});
  let t = 0;
  for (let i = 0; i < 60; i++) {
    t += i % 10 === 9 ? 25 : 1000 / 120;
    r.frame(t);
  }
  const s = loop.stats();
  assert.equal(nominalHz(s.hz), 120);
  off();
  assert.equal(nominalHz(estimateHz([16.6, 16.7, 16.8, 33]).hz), 60);
  assert.equal(nominalHz(estimateHz([11.1, 11.1, 11.2]).hz), 90);
  assert.equal(nominalHz(estimateHz([6.94, 6.95]).hz), 144);
  assert.equal(estimateHz([]).hz, 0);
});
