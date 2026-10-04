import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dealJobs, dealOtrs, jobStatus, type JobCard, type JobEvent } from "./spend.ts";
import { BETS } from "./symbols.ts";
import { canAffordDuel, duelEntryCost } from "./duel-deposit.ts";
import { emptyPlayerSave, sanitizePlayerSave } from "./player-save.ts";
import {
  pauseTicket,
  resumePlan,
  sanitizeTicketPause,
  ticketCounts,
  ticketReserve,
  tickUnlessPaused,
  type TicketGate,
} from "./ticket-pause.ts";

const lcg = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

const ev = (o: Partial<JobEvent> = {}): JobEvent => ({
  win: true, dead: false, tumbles: 3, live: false, ticket: null, pdf: true, signal: 0, clusters: 2, orbs: false,
  spun: true, pays: [], cash: 50, ...o,
});

const FREE: TicketGate = { duel: false, lobby: false, roundInDuel: false, paused: false };
const IN_DUEL: TicketGate = { duel: true, lobby: false, roundInDuel: true, paused: true };

function someJobs(): JobCard[] {
  const rng = lcg(7);
  const out: JobCard[] = [];
  for (let i = 0; i < 12; i++) out.push(...dealJobs(rng, 5000, 2), dealOtrs(rng, 5000, 2));
  return out.map((j) => ({ ...j, lockBet: j.lockBet || 2 }));
}

describe("ticket paused for a duel: gate", () => {
  it("counts only with no duel, no lobby, no duel round and no open pause", () => {
    assert.equal(ticketCounts(FREE), true);
    for (const k of ["duel", "lobby", "roundInDuel", "paused"] as const) {
      assert.equal(ticketCounts({ ...FREE, [k]: true }), false, k);
    }
  });

  it("no progress, no clock, no payout and no fail from any duel spin", () => {
    for (const job of someJobs()) {
      let cur = job;
      // 200 duel spins of every flavour: wins, deads, 4KA TV rounds, buys.
      for (let i = 0; i < 200; i++) {
        const e = i % 4 === 0 ? ev({ win: false, dead: true, cash: 0 }) : i % 4 === 1 ? ev({ live: true, featureOver: true }) : ev();
        cur = tickUnlessPaused(cur, e, i % 3 === 0 ? { ...FREE, lobby: true } : IN_DUEL);
      }
      assert.deepEqual(cur, job, job.template);
      assert.equal(jobStatus(cur), "run");
    }
  });

  it("a round that started in the duel stays out even when it settles after the duel closed", () => {
    const job = someJobs()[0]!;
    const after = tickUnlessPaused(job, ev(), { duel: false, lobby: false, roundInDuel: true, paused: false });
    assert.equal(after, job);
  });

  it("after the resume the same events count again", () => {
    const job = someJobs().find((j) => j.kind === "wins") ?? someJobs()[0]!;
    const next = tickUnlessPaused(job, ev(), FREE);
    assert.notDeepEqual(next, job);
  });
});

describe("ticket paused for a duel: restore", () => {
  it("resume puts back the ticket's locked bet and ante, with the toast", () => {
    const job = { ...someJobs()[0]!, lockBet: 5 };
    const pause = pauseTicket(job, true, 1000);
    const plan = resumePlan(pause, job);
    assert.ok(plan && !("clear" in plan));
    assert.equal(BETS[plan.betIndex], 5);
    assert.equal(plan.ante, true);
    assert.equal(plan.toast, "Tiket pokračuje · stávka 5.00");
    const off = resumePlan(pauseTicket(job, false, 1000), job);
    assert.ok(off && !("clear" in off) && off.ante === false);
  });

  it("a pause without its ticket is just cleared", () => {
    const job = someJobs()[0]!;
    const pause = pauseTicket(job, false, 1);
    assert.deepEqual(resumePlan(pause, null), { clear: true });
    assert.deepEqual(resumePlan(pause, { ...job, id: "other" }), { clear: true });
    assert.equal(resumePlan(null, job), null);
  });

  it("survives a reload: saved, sanitized, dropped when it belongs to no ticket", () => {
    const job = { ...someJobs()[0]!, lockBet: 2 };
    const save = { ...emptyPlayerSave(), betIndex: BETS.indexOf(1000), ante: false, job, ticketPause: pauseTicket(job, true, 42) };
    const back = sanitizePlayerSave(JSON.parse(JSON.stringify(save)));
    assert.ok(back.job);
    assert.deepEqual(back.ticketPause, { jobId: job.id, lockBet: 2, ante: true, at: 42 });
    const plan = resumePlan(back.ticketPause ?? null, back.job);
    assert.ok(plan && !("clear" in plan) && BETS[plan.betIndex] === 2 && plan.ante);
    const orphan = sanitizePlayerSave(JSON.parse(JSON.stringify({ ...save, job: null })));
    assert.equal(orphan.ticketPause, null);
    assert.equal(sanitizeTicketPause({ jobId: "x", lockBet: 3.3 }), null, "not a bet");
    assert.equal(sanitizeTicketPause("junk"), null);
  });
});

describe("ticket paused for a duel: reserve", () => {
  it("one spin at the locked bet, or the buy for a buy-only ticket", () => {
    const base = { ...someJobs().find((j) => j.kind === "wins")!, lockBet: 4 };
    assert.equal(ticketReserve(base, 100), 4);
    assert.equal(ticketReserve({ ...base, kind: "buy", scope: "live" }, 100), 400);
    assert.equal(ticketReserve({ ...base, kind: "live", scope: "base" }, 100), 4);
  });

  it("entering with the reserve on top, even the worst duel (all stakes + kaucia burned) leaves the ticket playable", () => {
    for (const bet of [1, 10, 100, 1000]) {
      for (const need of [5, 10, 20]) {
        const reserve = 2;
        const cost = duelEntryCost({ bet, need });
        const wallet = +(cost.perSeat + reserve).toFixed(2);
        assert.equal(canAffordDuel(+(wallet - reserve).toFixed(2), { bet, need }), true);
        assert.equal(canAffordDuel(+(wallet - reserve - 0.01).toFixed(2), { bet, need }), false);
        // Worst case: every stake (ante ≤ 1.2×) spent, nothing won, kaucia burned.
        const left = +(wallet - cost.stake - cost.deposit).toFixed(2);
        assert.ok(left >= reserve, `${bet}×${need}`);
      }
    }
  });
});
