import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BUY_COST_X, BUY_X_BY_FS, FS_SPINS, MATH_NOTE, buyXForFs } from "./symbols.ts";
import { RANKS, buyXOf, fsSpinsOf } from "./ranks.ts";

/** Bought-feature EV in bets (real engine, /workspace/buyprice/buy-ev.ts): mean and 95 % half-width. */
const EV: Record<number, { mean: number; ci: number }> = {
  15: { mean: 100.7, ci: 1.01 },
  16: { mean: 112.63, ci: 1.6 },
  17: { mean: 121.01, ci: 1.16 },
};

describe("4KA TV buy price (~100 % return, house side)", () => {
  it("each price sits at or above the EV's upper 95 % bound and within 3 % of the EV", () => {
    for (const [fs, ev] of Object.entries(EV)) {
      const x = BUY_X_BY_FS[Number(fs)]!;
      assert.ok(x >= ev.mean + ev.ci, `${fs} spins: ${x}× ≥ ${ev.mean + ev.ci}`);
      assert.ok(ev.mean / x > 0.97 && ev.mean / x < 1, `${fs} spins: RTP ${(ev.mean / x).toFixed(3)}`);
    }
  });
  it("base price is the 15-spin price; more spins never cost less", () => {
    assert.equal(BUY_COST_X, BUY_X_BY_FS[FS_SPINS]);
    assert.ok(buyXForFs(15) < buyXForFs(16) && buyXForFs(16) < buyXForFs(17));
    assert.equal(buyXForFs(18), BUY_X_BY_FS[17]);
    assert.ok(Math.abs(MATH_NOTE.buyEv - EV[15]!.mean / BUY_COST_X) < 0.005);
  });
  it("every rank pays the price of its own free-spin count", () => {
    for (const r of RANKS) assert.equal(buyXOf(r.id), buyXForFs(fsSpinsOf(r.id)), r.id);
    assert.equal(buyXOf(), BUY_COST_X);
  });
});
