import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { endPlan } from "./cue-fade.ts";
import { STOP_TAIL, rampOut, scheduleEnd, type ParamLike } from "./voice-fade.ts";

/** Records AudioParam automation and evaluates it like Web Audio (setValue steps, linear ramps). */
class MockParam implements ParamLike {
  events: { type: "set" | "ramp"; v: number; t: number }[] = [];
  calls: string[] = [];
  value: number;
  constructor(value = 1) {
    this.value = value;
  }
  setValueAtTime(v: number, t: number) {
    this.calls.push(`set ${v}@${t.toFixed(3)}`);
    this.events = this.events.filter((e) => e.t !== t);
    this.events.push({ type: "set", v, t });
    this.events.sort((a, b) => a.t - b.t);
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.calls.push(`ramp ${v}@${t.toFixed(3)}`);
    this.events.push({ type: "ramp", v, t });
    this.events.sort((a, b) => a.t - b.t);
  }
  cancelScheduledValues(t: number) {
    this.calls.push(`cancel@${t.toFixed(3)}`);
    this.events = this.events.filter((e) => e.t < t);
  }
  /** Value at ctx time t. */
  at(t: number): number {
    let v = 1;
    let tPrev = 0;
    for (const e of this.events) {
      if (e.t <= t) {
        v = e.v;
        tPrev = e.t;
        continue;
      }
      if (e.type === "ramp") return v + ((e.v - v) * (t - tPrev)) / (e.t - tPrev);
      break;
    }
    return v;
  }
}

class MockSource {
  stops: number[] = [];
  stop(when = 0) {
    this.stops.push(when);
  }
}

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

describe("voice fade scheduling (mock AudioContext)", () => {
  it("cut at Max. dĺžka: holds full level, ramps to 0 exactly at maxLen, stops the source there", () => {
    const t0 = 10; // ctx.currentTime base, not 0
    const plan = endPlan(6, 1, { maxS: 2, fadeMs: 500 });
    assert.ok(plan?.cut);
    const p = new MockParam();
    const src = new MockSource();
    const stopAt = scheduleEnd(p, src, t0, plan);
    assert.deepEqual(p.calls, ["set 1@11.500", "ramp 0@12.000"]);
    assert.deepEqual(src.stops, [stopAt]);
    near(stopAt, 12 + STOP_TAIL);
    near(p.at(11.0), 1);
    near(p.at(11.5), 1);
    near(p.at(11.75), 0.5);
    near(p.at(12.0), 0);
    near(p.at(13), 0);
  });

  it("Fade out without Max. dĺžka fades into the natural end (the reported bug)", () => {
    const plan = endPlan(3, 1, { maxS: null, fadeMs: 1500 });
    assert.ok(plan && !plan.cut);
    const p = new MockParam();
    const src = new MockSource();
    scheduleEnd(p, src, 0, plan);
    near(p.at(1.4), 1);
    near(p.at(2.25), 0.5);
    near(p.at(3), 0);
    near(src.stops[0], 3 + STOP_TAIL);
    // Max longer than the sound: same, fade into the end instead of nothing.
    assert.equal(endPlan(3, 1, { maxS: 10, fadeMs: 1000 })?.endAt, 3);
    // Playback rate shortens the sound.
    assert.equal(endPlan(4, 2, { maxS: null, fadeMs: 500 })?.endAt, 2);
    // Nothing set / loops without a max: untouched.
    assert.equal(endPlan(3, 1, { maxS: null, fadeMs: 0 }), null);
    assert.equal(endPlan(3, 1, { maxS: null, fadeMs: 800 }, true), null);
    assert.equal(endPlan(3, 1, { maxS: 2, fadeMs: 800 }, true)?.endAt, 2);
  });

  it("early stop mid-fade freezes the current level (no jump back to 1) and ramps to 0", () => {
    const p = new MockParam();
    const src = new MockSource();
    const plan = endPlan(6, 1, { maxS: 2, fadeMs: 1000 });
    assert.ok(plan);
    scheduleEnd(p, src, 0, plan); // fade 1.0 → 2.0
    p.value = p.at(1.5); // what the render thread reports at 1.5 s
    const stopAt = rampOut(p, src, 1.5, 0.2);
    near(p.at(1.5), 0.5);
    near(p.at(1.6), 0.25);
    near(p.at(1.7), 0);
    near(stopAt, 1.7 + STOP_TAIL);
    assert.equal(src.stops.at(-1), stopAt);
  });

  it("early stop pins the current value at `now` before the ramp (does not rely on cancelAndHoldAtTime)", () => {
    const p = new MockParam(1);
    const src = new MockSource();
    p.value = 0.8;
    rampOut(p, src, 4, 0.5);
    assert.deepEqual(p.calls, ["cancel@4.000", "set 0.8@4.000", "ramp 0@4.500"]);
    near(p.at(4.0), 0.8);
    near(p.at(4.25), 0.4);
  });

  it("a source that already ended does not throw on the early stop", () => {
    const p = new MockParam();
    const dead = { stop: () => { throw new Error("InvalidStateError"); } };
    assert.doesNotThrow(() => rampOut(p, dead, 1, 0.03));
  });
});
