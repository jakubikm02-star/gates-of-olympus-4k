import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DAILY_FLOOR,
  RP_PROTECT_FLOOR,
  SUCHO_GRACE,
  TICKET_RP_CAP,
  dailyDecay,
  freshRpDay,
  leagueMult,
  mysteryRpRange,
  rollRpDay,
  rpParts,
  sanitizeIdle,
  sanitizeRpDay,
  scaleSpinGain,
  scaledParts,
  spinGainMult,
  stakeFactor,
  suchoLeague,
  suchoLeft,
  suchoStep,
  ticketRp,
  type TicketRpCard,
} from "./rp-tickets.ts";
import { RANKS, RANK_REWARDS, rankBits } from "./ranks.ts";
import { dealJobs, dealOtrs } from "./spend.ts";
import { emptyPlayerSave, sanitizePlayerSave } from "./player-save.ts";
import { applyStat, cget, emptyStats } from "./stats.ts";

const plain = (over: Partial<TicketRpCard> = {}): TicketRpCard => ({ floor: "stred", stake: 1000, template: "zber", mystery: false, ...over });

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("ticket RP (TIER ×2)", () => {
  it("base by tier at KREDIT, 1 000 € stake, daily single goal", () => {
    // ×1.5 daily, stake factor 1 at 1 000 €.
    assert.equal(ticketRp(plain({ floor: "lacna" }), "kredit").ok, 150);
    assert.equal(ticketRp(plain({ floor: "stred" }), "kredit").ok, 300);
    assert.equal(ticketRp(plain({ floor: "draha" }), "kredit").ok, 690);
  });

  it("league multiplier ×1.0 … ×2.0 from the rank entry", () => {
    assert.equal(leagueMult(0), 1);
    assert.equal(leagueMult(5), 1.5);
    assert.equal(leagueMult(10), 2);
    const byId = Object.fromEntries(RANKS.map((r) => [r.id, +ticketRp(plain({ floor: "lacna" }), r.id).league.toFixed(6)]));
    assert.deepEqual(byId, { kredit: 1, sloboda: 1.3, smart: 1.4, telka: 1.5, optika: 1.6, duo: 1.7, fiveg: 1.8, nekonecno: 2 });
    assert.equal(ticketRp(plain({ floor: "lacna" }), "nekonecno").ok, 300);
  });

  it("type multipliers: two goals, dual, feature, mystery, daily", () => {
    const k = (c: Partial<TicketRpCard>) => ticketRp(plain({ floor: "lacna", ...c }), "kredit");
    assert.equal(k({}).type, 1.5); // daily
    assert.equal(k({ mystery: true }).type, 1.2);
    assert.ok(Math.abs(k({ mystery: true, kindB: "wins" }).type - 1.2 * 1.5) < 1e-9);
    assert.ok(Math.abs(k({ mystery: true, kindB: "live", tries: 3 }).type - 1.2 * 1.75) < 1e-9, "dual beats two-goal, not both");
    assert.ok(Math.abs(k({ template: "zasah" }).type - 1.5 * 1.25) < 1e-9);
    assert.ok(Math.abs(k({ mystery: true, templateB: "hack", kindB: "zasahBest" }).type - 1.2 * 1.5 * 1.25) < 1e-9);
    assert.deepEqual(k({ mystery: true, kindB: "live", tries: 3, template: "zasah" }).tags, ["základ + 4KA TV", "feature", "OTRS"]);
  });

  it("small stakes give less, capped at ×1 from 1 000 €", () => {
    assert.ok(Math.abs(stakeFactor(0) - 0.6) < 1e-9);
    assert.ok(stakeFactor(0.2) > 0.6 && stakeFactor(0.2) < 0.62);
    assert.ok(stakeFactor(10) < stakeFactor(100));
    assert.equal(stakeFactor(1000), 1);
    assert.equal(stakeFactor(50_000), 1);
    assert.ok(ticketRp(plain({ stake: 2 }), "telka").ok < ticketRp(plain({ stake: 200 }), "telka").ok);
  });

  it("cap 2 000 per ticket and fail is −25 % of the capped value", () => {
    const top = ticketRp(plain({ floor: "draha", mystery: true, kindB: "live", tries: 2, template: "zasah" }), "nekonecno");
    assert.equal(top.ok, TICKET_RP_CAP);
    assert.equal(top.capped, true);
    assert.equal(top.fail, -500);
    const mid = ticketRp(plain({ floor: "stred" }), "telka");
    assert.equal(mid.ok, 450);
    assert.equal(mid.fail, -113);
    assert.equal(mid.capped, false);
  });

  it("every dealt card gets 1…cap RP and a negative fail", () => {
    const r = rng(7);
    for (let i = 0; i < 40; i++) {
      for (const card of [...dealJobs(r, 5000, 2), dealOtrs(r, 5000, 2)]) {
        for (const id of ["kredit", "telka", "nekonecno"]) {
          const t = ticketRp(card, id);
          assert.ok(t.ok >= 1 && t.ok <= TICKET_RP_CAP, `${card.template} ${t.ok}`);
          assert.ok(t.fail < 0 && t.fail >= -TICKET_RP_CAP / 4);
        }
      }
    }
  });

  it("OTRS range spans one goal to dual + feature", () => {
    const [lo, hi] = mysteryRpRange("stred", 100, "duo");
    assert.ok(lo < hi);
    assert.ok(hi <= TICKET_RP_CAP);
  });
});

describe("spin RP scaling", () => {
  it("idle multiplier by league, ×0.7 floor with a ticket", () => {
    const idle = Object.fromEntries(RANKS.map((r) => [r.id, spinGainMult(r.id, false)]));
    assert.deepEqual(idle, { kredit: 1, sloboda: 1, smart: 0.8, telka: 0.6, optika: 0.55, duo: 0.5, fiveg: 0.45, nekonecno: 0.4 });
    assert.equal(spinGainMult("kredit", true), 1);
    assert.equal(spinGainMult("smart", true), 0.8);
    assert.equal(spinGainMult("telka", true), 0.7);
    assert.equal(spinGainMult("nekonecno", true), 0.7);
  });

  it("gains are scaled with a minimum of 1, losses untouched", () => {
    assert.equal(scaleSpinGain(10, "nekonecno", false), 4);
    assert.equal(scaleSpinGain(10, "nekonecno", true), 7);
    assert.equal(scaleSpinGain(1, "nekonecno", false), 1);
    assert.equal(scaleSpinGain(-12, "nekonecno", false), -12);
    assert.equal(scaleSpinGain(0, "nekonecno", false), 0);
    assert.equal(scaleSpinGain(37, "kredit", false), 37);
  });

  it("scaled breakdown keeps the parts and records the cut", () => {
    const p = scaledParts(null, 10, 4)!;
    assert.equal(p.total, 4);
    assert.equal(p.fromScale, -6);
    assert.ok(rankBits(p).includes("bez tiketu -6"));
    const same = rpParts(5, "fromTicket");
    assert.equal(scaledParts(same, 5, 5), same);
  });
});

describe("SUCHO", () => {
  it("only from 4KA TV league up", () => {
    assert.deepEqual(
      RANKS.filter((r) => suchoLeague(r.id)).map((r) => r.id),
      ["telka", "optika", "duo", "fiveg", "nekonecno"],
    );
    const low = suchoStep(100, 5000, "smart");
    assert.equal(low.tax, 0);
    assert.equal(low.warn, null);
    assert.equal(low.idle, 101);
  });

  it("40 spins grace, then −1 RP per spin, with warnings at 30 / 40 / start", () => {
    let idle = 0;
    let lost = 0;
    const warns: [number, string][] = [];
    for (let i = 0; i < 60; i++) {
      const st = suchoStep(idle, 20_000, "duo");
      idle = st.idle;
      lost += st.tax;
      if (st.warn) warns.push([idle, st.warn]);
    }
    assert.equal(lost, -(60 - SUCHO_GRACE));
    assert.deepEqual(warns, [
      [30, "soon"],
      [40, "last"],
      [41, "start"],
    ]);
    assert.equal(suchoLeft(0), 40);
    assert.equal(suchoLeft(35), 5);
    assert.equal(suchoLeft(80), 0);
  });

  it("never below the 1 200 RP protection floor", () => {
    assert.equal(suchoStep(50, RP_PROTECT_FLOOR, "telka").tax, 0);
    assert.equal(suchoStep(50, RP_PROTECT_FLOOR + 1, "telka").tax, -1);
  });
});

describe("daily decay", () => {
  it("1 % above 2 700 for a played day without a cleared ticket", () => {
    assert.equal(dailyDecay(27_000, { day: "2026-10-03", played: true, ok: false }), -243);
    assert.equal(dailyDecay(27_000, { day: "2026-10-03", played: true, ok: true }), 0);
    assert.equal(dailyDecay(27_000, { day: "2026-10-03", played: false, ok: false }), 0);
    assert.equal(dailyDecay(DAILY_FLOOR, { day: "2026-10-03", played: true, ok: false }), 0);
    assert.equal(dailyDecay(2750, { day: "2026-10-03", played: true, ok: false }), -1);
  });

  it("roll: same day no-op, new day decays once and starts a fresh record", () => {
    const rec = { day: "2026-10-03", played: true, ok: false };
    assert.deepEqual(rollRpDay(10_000, rec, "2026-10-03"), { loss: 0, rec, rolled: false });
    const r = rollRpDay(10_000, rec, "2026-10-05");
    assert.equal(r.loss, -73);
    assert.deepEqual(r.rec, freshRpDay("2026-10-05"));
    assert.equal(rollRpDay(10_000, r.rec, "2026-10-05").rolled, false);
  });

  it("old saves (no record) take nothing retroactively", () => {
    const r = rollRpDay(50_000, sanitizeRpDay(undefined, ""), "2026-10-04");
    assert.equal(r.loss, 0);
    assert.equal(r.rec.day, "2026-10-04");
  });
});

describe("save migration", () => {
  it("old save keeps RP and gets empty SUCHO / day records", () => {
    const old = { ...emptyPlayerSave(), rp: 27_000, rankPeak: 27_500 } as Record<string, unknown>;
    delete old.rpIdle;
    delete old.rpDay;
    const s = sanitizePlayerSave(old);
    assert.equal(s.rp, 27_000);
    assert.equal(s.rankPeak, 27_500);
    assert.equal(s.rpIdle, 0);
    assert.deepEqual(s.rpDay, { day: "", played: false, ok: false });
  });

  it("round-trips and rejects junk", () => {
    const s = sanitizePlayerSave({ rp: 9000, rpIdle: 37, rpDay: { day: "2026-10-04", played: true, ok: false } });
    assert.equal(s.rpIdle, 37);
    assert.deepEqual(s.rpDay, { day: "2026-10-04", played: true, ok: false });
    const bad = sanitizePlayerSave({ rp: 9000, rpIdle: -5, rpDay: { day: "yesterday", played: "yes" } });
    assert.equal(bad.rpIdle, 0);
    assert.deepEqual(bad.rpDay, { day: "", played: false, ok: false });
    assert.equal(sanitizeIdle(Number.NaN), 0);
    assert.equal(sanitizeIdle(1e9), 100_000);
  });
});

describe("stats + copy", () => {
  it("stats count ticket / SUCHO / daily RP", () => {
    let st = emptyStats();
    st = applyStat(st, { t: "rank", applied: 540, event: null, after: "telka", parts: rpParts(540, "fromTicket"), src: "ticket" });
    st = applyStat(st, { t: "rank", applied: -135, event: null, after: "telka", parts: rpParts(-135, "fromTicket"), src: "ticket" });
    st = applyStat(st, { t: "rank", applied: -1, event: null, after: "telka", parts: rpParts(-1, "fromSucho"), src: "sucho" });
    st = applyStat(st, { t: "rank", applied: -243, event: "day", after: "telka", parts: rpParts(-243, "fromDaily"), src: "daily" });
    assert.equal(cget(st, "rp.ticket"), 540);
    assert.equal(cget(st, "rp.ticketFail"), 135);
    assert.equal(cget(st, "rp.sucho"), 1);
    assert.equal(cget(st, "rp.daily"), 243);
    assert.equal(cget(st, "rp.gain"), 540);
    assert.equal(cget(st, "rp.loss"), 379);
  });

  it("rank rules text matches the constants", () => {
    const t = RANK_REWARDS.map((r) => r.detail).join(" ");
    for (const s of ["100", "200", "460", "2 000", "−25 %", "40 platených", "1 200", "2 700", "×0,7", "×0,4"]) assert.ok(t.includes(s), s);
  });
});
