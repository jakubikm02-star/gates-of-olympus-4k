import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { jobStatus, tickJob, type JobCard, type JobEvent } from "./spend.ts";
import { SUCHO_GRACE, suchoStep } from "./rp-tickets.ts";
import { shields, ticketShield, ticketWaitsBuy } from "./sucho-guard.ts";
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

/** Paid base spins with this ticket open, as the hook runs them: shield decided before the spin, SUCHO steps when not held, a closed ticket leaves. */
function play(job: JobCard, spins: number, e: JobEvent, idle0 = 0) {
  let idle = idle0;
  let cur: JobCard | null = job;
  let held = 0;
  let life = 0;
  for (let i = 0; i < spins; i++) {
    if (cur && shields(ticketShield(cur, false))) held += 1;
    else idle = suchoStep(idle, 5000, "telka").idle;
    if (cur) {
      life += 1;
      const next = tickJob(cur, e);
      cur = jobStatus(next) === "run" ? next : null;
    }
  }
  return { idle, held, life, cur };
}

describe("sucho fix · which ticket holds SUCHO", () => {
  it("Martin's case: a spin-limited ticket waiting for a random symbol (OLP) holds SUCHO for its whole life", () => {
    const olp = card({ id: "olp", template: "olp", kind: "symbol", payId: "meter", need: 1, limit: 60, spun: 37 });
    const r = play(olp, 100, ev());
    assert.equal(r.held, 23, "all 23 spins left are held, dead or not");
    assert.equal(r.cur, null, "then it fails on its own clock");
    assert.equal(r.idle, 100 - 23, "SUCHO counts again only after the ticket is gone");
  });

  it("any ticket that moves on normal paid spins holds SUCHO for its whole life, no matter how unlucky", () => {
    for (const t of [card({ need: 22, limit: 65 }), card({ template: "pot", kind: "ticket", need: 1, limit: 50 }), zbox(), card({ id: "otrs", mystery: true, kindB: "symbol", templateB: "vyherne", need: 100, needB: 100, haveB: 0, limit: 300 })]) {
      const r = play(t, 2000, ev());
      assert.equal(r.held, r.life, `${t.template}: held every spin it was open`);
      assert.ok(r.life <= t.limit, `${t.template}: bounded by its own spins (${r.life} ≤ ${t.limit})`);
    }
  });

  it("the abuse stays closed: a buy ticket never holds SUCHO on base spins; the buy spin itself is held", () => {
    assert.equal(ticketWaitsBuy(noc()), true);
    assert.equal(ticketShield(noc(), false), "buy");
    assert.equal(ticketShield(noc(), false, true), "run");
    const r = play(noc(), 100, ev());
    assert.equal(r.held, 0);
    assert.equal(r.idle, 100, "every base spin counts for SUCHO");
  });

  it("OTRS / dual with a KÚPA leg: holds while the base goal is open, stops once only the buy is left", () => {
    const d = dualBuy();
    assert.equal(ticketWaitsBuy(d), false);
    assert.equal(ticketShield(d, false), "run");
    const baseDone = dualBuy({ have: 5 });
    assert.equal(ticketWaitsBuy(baseDone), true);
    assert.equal(ticketShield(baseDone, false), "buy");
    assert.equal(play(baseDone, 80, ev({ win: true, dead: false })).held, 0);
  });

  it("a 4KA TV-only ticket holds while waiting for a natural 4KA TV, and the 4KA TV spins burn it", () => {
    const p = plechovky();
    assert.equal(play(p, 200, ev()).held, 200);
    let cur: JobCard | null = p;
    let n = 0;
    while (cur && n < 100) {
      const next = tickJob(cur, ev({ liveSpin: true }));
      cur = jobStatus(next) === "run" ? next : null;
      n++;
    }
    assert.ok(cur === null && n <= p.limit, `ends after ≤ ${p.limit} 4KA TV spins (${n})`);
  });

  it("seal holds, a paused ticket (duel) or no ticket does not", () => {
    assert.equal(ticketShield(card({ seal: true }), false), "run");
    assert.equal(ticketShield(card({}), true), "none");
    assert.equal(ticketShield(null, false), "none");
  });

  it("a loaded save is judged by the current rule at once (old stall record is dropped)", () => {
    const olp = card({ id: "olp", template: "olp", kind: "symbol", payId: "meter", need: 1, limit: 60, spun: 37 });
    const s = sanitizePlayerSave(JSON.parse(JSON.stringify({ ...emptyPlayerSave(), rp: 1500, rpIdle: 64, job: olp, ticketStall: { id: "olp", n: 30 } })));
    assert.equal((s as unknown as Record<string, unknown>).ticketStall, undefined);
    assert.ok(s.job);
    assert.equal(ticketShield(s.job, false), "run");
    assert.equal(suchoActive({ rankId: "telka", idle: s.rpIdle ?? 0, shielded: shields(ticketShield(s.job, false)) }), false, "SUCHO stands on load");
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

  it("saves keep the locked 4KA TV multiplier and the bar bonus multiplier", () => {
    const raw = { ...emptyPlayerSave(), inFs: true, fsLeft: 5, fsSucho: 0.6512, fsSuchoDelta: -3.2 };
    const s = sanitizePlayerSave(JSON.parse(JSON.stringify(raw)));
    assert.equal(s.fsSucho, 0.6512);
    assert.equal(s.fsSuchoDelta, -3.2);
    const old = sanitizePlayerSave({ balance: 50 });
    assert.equal(old.fsSucho, 1);
    assert.equal(sanitizeSuchoMul(1.5), 1);
    assert.equal(sanitizeSuchoMul("x"), 1);
    const pb = sanitizePendingBonus({ mode: "kontrola", bet: 1, mod: null, modLeft: 0, at: 1, sucho: 0.7 });
    assert.equal(pb?.sucho, 0.7);
    assert.equal(sanitizePendingBonus({ mode: "kontrola", bet: 1, mod: null, modLeft: 0, at: 1, sucho: 2 })?.sucho, undefined);
  });
});
