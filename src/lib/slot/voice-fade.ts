/**
 * Web Audio scheduling of a voice's end (cut-off / natural-end fade, lib/slot/cue-fade endPlan) and of an early
 * stop. Takes minimal structural types so it runs against a real AudioParam / AudioBufferSourceNode in the browser
 * and against a recording mock in node tests. All times are AudioContext time (ctx.currentTime base).
 */

export interface ParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  cancelScheduledValues(time: number): unknown;
}

export interface StopLike {
  stop(when?: number): void;
}

export type EndPlan = { endAt: number; fadeStart: number; fadeLen: number };

/** Small tail after the ramp reached 0 before the source is stopped (never stops while still audible). */
export const STOP_TAIL = 0.005;

/**
 * Voice started at `t0` (ctx time) with a fader `param` at 1: hold 1 until the fade starts, ramp linearly to 0
 * exactly at the end, stop the source just after. Returns the ctx time the source stops.
 */
export function scheduleEnd(param: ParamLike, src: StopLike | null, t0: number, plan: EndPlan): number {
  const start = t0 + Math.max(0, plan.fadeStart);
  const end = t0 + Math.max(plan.fadeStart + 0.001, plan.endAt);
  param.setValueAtTime(1, start);
  param.linearRampToValueAtTime(0, end);
  const stopAt = end + STOP_TAIL;
  src?.stop(stopAt);
  return stopAt;
}

/**
 * Early stop at `now` (= ctx.currentTime): pin the fader to its current value (also mid-way through a scheduled
 * fade, without jumping back to 1), ramp to 0 over `len` s, stop the source after it. Returns the stop time.
 * Deliberately not cancelAndHoldAtTime: Chrome inserts no hold event when `now` falls in a constant segment, so
 * the following ramp would start from the PREVIOUS event (measured: half level at the stop instant).
 */
export function rampOut(param: ParamLike, src: StopLike | null, now: number, len: number): number {
  const v = param.value;
  param.cancelScheduledValues(now);
  param.setValueAtTime(v, now);
  const end = now + Math.max(0.001, len);
  param.linearRampToValueAtTime(0, end);
  const stopAt = end + STOP_TAIL;
  if (src) {
    try {
      src.stop(stopAt);
    } catch {
      /* already ended */
    }
  }
  return stopAt;
}
