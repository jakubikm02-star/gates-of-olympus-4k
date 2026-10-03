import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { COLS, ROWS, type Cell } from "./symbols.ts";
import {
  ReelScatterTracker,
  SAME_REEL_GAP_MS,
  cascadeCue,
  colScatters,
  countScatters,
  emptySettle,
  landCue,
  settleReports,
  thirdScatterCue,
} from "./scatter-sfx.ts";

/** Grid with scatters at the given [row, col] spots, pay symbols elsewhere. */
function grid(spots: [number, number][]): Cell[][] {
  let uid = 1;
  return Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c): Cell =>
      spots.some(([sr, sc]) => sr === r && sc === c) ? { uid: uid++, kind: "scatter" } : { uid: uid++, kind: "pay", payId: "dacia" },
    ),
  );
}

describe("third scatter cue", () => {
  it("only on exactly 3 scatters on the settled board", () => {
    assert.equal(thirdScatterCue(0), false);
    assert.equal(thirdScatterCue(2), false);
    assert.equal(thirdScatterCue(3), true);
    assert.equal(thirdScatterCue(4), false);
    assert.equal(thirdScatterCue(6), false);
  });

  it("3 from the reels + 1 from a cascade is 4: no third-scatter cue", () => {
    const reels = grid([[0, 0], [1, 2], [4, 5]]);
    assert.equal(countScatters(reels), 3);
    const after = grid([[0, 0], [1, 2], [4, 5], [0, 3]]);
    assert.equal(thirdScatterCue(countScatters(after)), false);
  });

  it("2 from the reels + 1 from a cascade is 3: cue after the cascade settles", () => {
    assert.equal(thirdScatterCue(countScatters(grid([[0, 0], [2, 4], [0, 1]]))), true);
  });
});

describe("land cue", () => {
  it("one step per scatter with the running count, spaced when landing together", () => {
    assert.deepEqual(landCue(0, 1), { steps: [{ n: 1, delayMs: 0 }], thunder: false });
    assert.deepEqual(landCue(1, 2), {
      steps: [
        { n: 2, delayMs: 0 },
        { n: 3, delayMs: SAME_REEL_GAP_MS },
      ],
      thunder: false,
    });
    assert.deepEqual(landCue(2, 0), { steps: [], thunder: false });
  });

  it("thunder once on the land that reaches 4+", () => {
    assert.equal(landCue(3, 1).thunder, true);
    assert.equal(landCue(2, 2).thunder, true);
    assert.equal(landCue(4, 1).thunder, true);
    assert.equal(landCue(2, 1).thunder, false);
  });

  it("cascade cue covers only the scatters that dropped in", () => {
    assert.deepEqual(cascadeCue(2, 3).steps, [{ n: 3, delayMs: 0 }]);
    assert.deepEqual(cascadeCue(3, 3).steps, []);
    assert.deepEqual(cascadeCue(3, 1).steps, []);
  });
});

describe("reel scatter tracker", () => {
  it("plays each reel once, in the order the reels stop, with the running count", () => {
    const g = grid([[0, 1], [3, 1], [2, 4], [4, 5]]);
    assert.equal(colScatters(g, 1), 2);
    const t = new ReelScatterTracker(g);
    assert.deepEqual(t.reel(0)?.steps, []);
    assert.deepEqual(t.reel(4)?.steps, [{ n: 1, delayMs: 0 }], "a slammed/fast reel may stop out of order");
    assert.deepEqual(
      t.reel(1)?.steps.map((s) => s.n),
      [2, 3],
    );
    assert.equal(t.reel(1), null, "a reel reports once");
    assert.equal(t.settled, false);
    t.reel(2);
    t.reel(3);
    const last = t.reel(5);
    assert.deepEqual(last, { steps: [{ n: 4, delayMs: 0 }], thunder: true });
    assert.equal(t.heard, 4);
    assert.equal(t.settled, true);
    assert.equal(t.reel(6), null);
    assert.equal(t.reel(-1), null);
  });
});

describe("grid settle reports", () => {
  const all = (v: boolean) => Array(COLS).fill(v) as boolean[];
  it("reports a reel only after it was seen spinning in this spin, once, in column order", () => {
    const st = emptySettle();
    assert.deepEqual(settleReports(st, 7, all(true)), [], "idle board after load: nothing");
    assert.deepEqual(settleReports(st, 8, all(false)), [], "new spin: all reels spinning");
    assert.deepEqual(settleReports(st, 8, [true, false, false, false, false, false]), [0]);
    assert.deepEqual(settleReports(st, 8, [true, true, true, false, false, false]), [1, 2]);
    assert.deepEqual(settleReports(st, 8, all(true)), [3, 4, 5], "slam: rest land in the same frame, column order");
    assert.deepEqual(settleReports(st, 8, all(true)), [], "tumbles later in the spin report nothing");
  });

  it("a stale settled frame at the start of a new spin does not report", () => {
    const st = emptySettle();
    settleReports(st, 1, all(false));
    settleReports(st, 1, all(true));
    assert.deepEqual(settleReports(st, 2, all(true)), [], "token changed but reels not seen spinning yet");
    assert.deepEqual(settleReports(st, 2, all(false)), []);
    assert.deepEqual(settleReports(st, 2, all(true)), [0, 1, 2, 3, 4, 5]);
  });
});
