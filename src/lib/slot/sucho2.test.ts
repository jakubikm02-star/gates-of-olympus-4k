import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tickJob, type JobCard, type JobEvent } from "./spend.ts";
import { SUCHO_GRACE, suchoStep } from "./rp-tickets.ts";
import {
  TICKET_STALL,
  emptyStall,
  sanitizeStall,
  stallAfter,
  stallLeft,
  stallOf,
  stallTick,
  ticketMoved,
  ticketShield,
  ticketWaitsBuy,
} from "./sucho-guard.ts";
import { SUCHO_RTP, SUCHO_RTP_MEASURED, sanitizeSuchoMul, suchoActive, suchoCash, suchoPayMul } from "./sucho-rtp.ts";
import { emptyPlayerSave, sanitizePlayerSave } from "./player-save.ts";
import { sanitizePendingBonus } from "./bonus-mode.ts";

const card = (over: Partial<JobCard>): JobCard => ({
  id: "t1",
  floor: "stred",
  template: "zber",
  title: "T",
  detail: "",
  stake: 10,
  payout: 20,
  need: 10,
  have: 0,
  limit: 60,
  spun: 0,
  kind: "wins",
  scope: "base",
  lockBet: 1,
  ...over,
});

const ev = (over: Partial<JobEvent> = {}): JobEvent => ({
  win: false,
  dead: true,
  tumbles: 0,
  live: false,
  ticket: null,
  pdf: false,
  signal: 0,
  clusters: 0,
  orbs: false,
  ...over,
});

const noc = () => card({ id: "noc", template: "noc", kind: "buy", scope: "live", need: 3, limit: 25 });
const plechovky = () => card({ id: "pl", template: "plechovky", kind: "tumbles", scope: "live", need: 6, limit: 25 });
const zbox = () => card({ id: "zb", template: "zasielky", kind: "bonusBest", need: 4, limit: 300 });
const dualBuy = (over: Partial<JobCard> = {}) =>
  card({ id: "du", mystery: true, kindB: "buy", templateB: "noc", scopeB: "live", need: 5, needB: 2, haveB: 0, tries: 2, triesUsed: 0, ...over });

/** Paid base spins with this ticket open, as the hook runs them: shield decided before the spin, stall ticks, SUCHO steps when not held. */
function play(job: JobCard, spins: number, e: JobEvent, idle0 = 0) {
  let rec = emptyStall();
  let idle = idle0;
  let cur = job;
  let held = 0;
  for (let i = 0; i < spins; i++) {
    const st = ticketShield(cur, stallOf(rec, cur), false);
    rec = stallTick(rec, cur);
    if (st === "run") held += 1;
    else idle = suchoStep(idle, 5000, "telka").idle;
    const next = tickJob(cur, e);
    rec = stallAfter(rec, cur, next, e);
    cur = next;
  }
  return { idle, held, rec, cur };
}

describe("sucho2 · ticket guard (park a ticket to dodge SUCHO)", () => {
  it("a buy ticket never holds SUCHO on base spins; the buy spin itself is held and is progress", () => {
    assert.equal(ticketWaitsBuy(noc()), true);
    assert.equal(ticketShield(noc(), 0, false), "buy");
    assert.equal(ticketShield(noc(), 0, false, true), "run");
    const r = play(noc(), 100, ev());
    assert.equal(r.held, 0);
    assert.equal(r.idle, 100, "every base spin counts for SUCHO");
    assert.equal(ticketMoved(noc(), noc(), ev({ bought: true })), true);
  });

  it("OTRS / dual with a KÚPA leg: holds while the base goal moves, stops once only the buy is left", () => {
    const d = dualBuy();
    assert.equal(ticketWaitsBuy(d), false);
    assert.equal(ticketShield(d, 0, false), "run");
    const baseDone = dualBuy({ have: 5 });
    assert.equal(ticketWaitsBuy(baseDone), true);
    assert.equal(ticketShield(baseDone, 0, false), "buy");
    const r = play(baseDone, 80, ev({ win: true, dead: false }));
    assert.equal(r.held, 0, "a done base goal + open buy goal is parked: no shield");
  });

  it("a 4KA TV-only ticket waiting for a natural 4KA TV holds SUCHO for 30 spins, then stands", () => {
    const r = play(plechovky(), 200, ev());
    assert.equal(r.held, TICKET_STALL);
    assert.equal(r.idle, 200 - TICKET_STALL);
    assert.equal(ticketShield(r.cur, stallOf(r.rec, r.cur), false), "stall");
    assert.equal(r.cur.spun, 0, "the ticket itself is still open (no clock on base spins)");
  });

  it("a Ž-BOX-only ticket: KONTROLA from the bar is no progress, a Ž-BOX is (even below its best)", () => {
    const z = zbox();
    const kontrola = ev({ spun: false, bonus: { mode: "kontrola", x: 3, safes: 4, cleared: false, canSum: 0, rounds: 0 } });
    assert.equal(ticketMoved(z, tickJob(z, kontrola), kontrola), false);
    const zb = ev({ spun: false, bonus: { mode: "zbox", x: 1, safes: 1, cleared: false, canSum: 0, rounds: 3 } });
    const best = { ...z, have: 3 };
    assert.equal(ticketMoved(best, tickJob(best, zb), zb), true, "a played Ž-BOX is a try");
    // Dead base spins only: it stands after 30 although its clock still runs.
    const r = play(z, 120, ev());
    assert.equal(r.held, TICKET_STALL);
    assert.equal(r.idle, 120 - TICKET_STALL);
  });

  it("a ticket that progresses keeps holding SUCHO as before (no regression for honest play)", () => {
    const r = play(card({ need: 1000, limit: 1000 }), 200, ev({ win: true, dead: false }));
    assert.equal(r.held, 200);
    assert.equal(r.idle, 0);
  });

  it("progress resets the count: one win every 25 spins keeps a 2-goal OTRS alive", () => {
    let rec = emptyStall();
    let cur = card({ id: "otrs", mystery: true, kindB: "symbol", templateB: "vyherne", need: 100, needB: 100, haveB: 0, limit: 1000 });
    let held = 0;
    for (let i = 1; i <= 300; i++) {
      if (ticketShield(cur, stallOf(rec, cur), false) === "run") held++;
      rec = stallTick(rec, cur);
      const e = i % 25 === 0 ? ev({ win: true, dead: false }) : ev();
      const next = tickJob(cur, e);
      rec = stallAfter(rec, cur, next, e);
      cur = next;
    }
    assert.equal(held, 300);
  });

  it("seal and duel pause: seal holds, a paused ticket does not", () => {
    assert.equal(ticketShield(card({ seal: true }), 999, false), "run");
    assert.equal(ticketShield(card({}), 0, true), "none");
    assert.equal(ticketShield(null, 0, false), "none");
  });

  it("ZÁSAH goals: a finished ZÁSAH is progress for best-of-one", () => {
    const hack = card({ id: "h", template: "hack", kind: "zasahBest", need: 4, have: 2, limit: 200 });
    const e = ev({ chasing: true, chaseOver: true, chaseHits: 1, spun: true });
    assert.equal(ticketMoved(hack, tickJob(hack, e), e), true);
  });

  it("stall record: per ticket id, sanitized, left counter", () => {
    const rec = stallTick(stallTick(emptyStall(), card({})), card({}));
    assert.deepEqual(rec, { id: "t1", n: 2 });
    assert.equal(stallOf(rec, card({ id: "other" })), 0);
    assert.deepEqual(sanitizeStall({ id: "x", n: -5 }), { id: "x", n: 0 });
    assert.deepEqual(sanitizeStall("junk"), emptyStall());
    assert.equal(stallLeft(card({}), 10), TICKET_STALL - 10);
    assert.equal(stallLeft(noc(), 0), 0);
  });
});

describe("sucho2 · RTP 96 % during SUCHO", () => {
  it("SUCHO is active from the grace on, in 4KA TV league up, not while a ticket holds it", () => {
    assert.equal(suchoActive({ rankId: "telka", idle: SUCHO_GRACE, shielded: false }), true);
    assert.equal(suchoActive({ rankId: "telka", idle: SUCHO_GRACE - 1, shielded: false }), false);
    assert.equal(suchoActive({ rankId: "telka", idle: 500, shielded: true }), false);
    assert.equal(suchoActive({ rankId: "smart", idle: 500, shielded: false }), false);
  });

  it("multiplier = 96 % / measured RTP per rank and kind, never above 1, 1 below 4KA TV", () => {
    for (const [rank, m] of Object.entries(SUCHO_RTP_MEASURED)) {
      for (const kind of ["base", "ante", "buy"] as const) {
        const mul = suchoPayMul(rank, kind);
        assert.ok(mul > 0 && mul <= 1, `${rank} ${kind}`);
        assert.ok(Math.abs(mul * m[kind] - Math.min(SUCHO_RTP, m[kind])) < 0.0006, `${rank} ${kind} → ${mul * m[kind]}`);
      }
      assert.ok(m.base > 1.2 && m.ante > 1.2, `${rank}: normal RTP is the ~137–179 % from the sims`);
    }
    assert.equal(suchoPayMul("kredit", "base"), 1);
    assert.equal(suchoPayMul("smart", "ante"), 1);
  });

  it("cents and display delta", () => {
    assert.deepEqual(suchoCash(10, 0.7), { net: 7, delta: -3 });
    assert.deepEqual(suchoCash(0, 0.7), { net: 0, delta: 0 });
    assert.deepEqual(suchoCash(5, 1), { net: 5, delta: 0 });
    assert.equal(suchoCash(0.33, 0.6612).net, 0.22);
  });

  it("saves keep the stall record, the locked 4KA TV multiplier and the bar bonus multiplier", () => {
    const raw = { ...emptyPlayerSave(), ticketStall: { id: "abc", n: 12 }, inFs: true, fsLeft: 5, fsSucho: 0.6512, fsSuchoDelta: -3.2 };
    const s = sanitizePlayerSave(JSON.parse(JSON.stringify(raw)));
    assert.deepEqual(s.ticketStall, { id: "abc", n: 12 });
    assert.equal(s.fsSucho, 0.6512);
    assert.equal(s.fsSuchoDelta, -3.2);
    const old = sanitizePlayerSave({ balance: 50 });
    assert.deepEqual(old.ticketStall, emptyStall());
    assert.equal(old.fsSucho, 1);
    assert.equal(sanitizeSuchoMul(1.5), 1);
    assert.equal(sanitizeSuchoMul("x"), 1);
    const pb = sanitizePendingBonus({ mode: "kontrola", bet: 1, mod: null, modLeft: 0, at: 1, sucho: 0.7 });
    assert.equal(pb?.sucho, 0.7);
    assert.equal(sanitizePendingBonus({ mode: "kontrola", bet: 1, mod: null, modLeft: 0, at: 1, sucho: 2 })?.sucho, undefined);
  });
});
