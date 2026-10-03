import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyStat,
  emptyStats,
  mergeStats,
  sanitizeStats,
  formatDuration,
  pct,
  cget,
  type PlayerStats,
  type StatEvent,
} from "./stats.ts";

describe("stats sanitize", () => {
  it("rejects garbage and negative numbers", () => {
    const s = sanitizeStats({
      v: 1,
      since: -1,
      c: { spins: -3, "evil.payload": 1, wagered: 10 },
      hi: { "win.cash": Infinity },
      hours: [1, "x"],
      weekdays: null,
    });
    assert.equal(s.v, 1);
    assert.ok(s.since > 0);
    assert.equal(s.c.spins, undefined);
    assert.equal(s.c.wagered, 10);
    assert.equal(s.c["evil.payload"], undefined);
    assert.equal(s.hi["win.cash"], undefined);
    assert.equal(s.hours.length, 24);
    assert.equal(s.weekdays.length, 7);
  });
});

describe("applyStat spin", () => {
  it("counts paid spins, wagered, wins and dead", () => {
    let s = emptyStats(1_700_000_000_000);
    s = applyStat(s, {
      t: "spin",
      cost: 2,
      bet: 2,
      ante: true,
      chase: false,
      buy: false,
      free: false,
      cash: 10,
      cash0: 10,
      x: 5,
      tumbles: 2,
      clusters: 1,
      orbs: [2, 10],
      orbSum: 12,
      applied: 12,
      pays: [{ id: "dacia", count: 10 }],
      scatters: 1,
      nearMiss: false,
      taxDelta: 0,
      hitMax: false,
      turbo: true,
      quick: false,
      auto: false,
      chain: true,
      rankId: "kredit",
    }, 1_700_000_000_000);
    assert.equal(cget(s, "spins"), 1);
    assert.equal(cget(s, "wagered"), 2);
    assert.equal(cget(s, "ante.spins"), 1);
    assert.equal(cget(s, "paid"), 10);
    assert.equal(cget(s, "win.spins"), 1);
    assert.equal(cget(s, "win.1-5"), 1);
    assert.equal(cget(s, "chain"), 1);
    assert.equal(cget(s, "turbo"), 1);
    assert.equal(cget(s, "sym.dacia.wins"), 1);
    assert.equal(cget(s, "sym.dacia.cells"), 10);
    assert.equal(s.hi["win.cash"], 10);
    assert.ok(s.first["win.first"]);

    s = applyStat(s, {
      t: "spin",
      cost: 2,
      bet: 2,
      ante: false,
      chase: false,
      buy: false,
      free: false,
      cash: 0,
      cash0: 0,
      x: 0,
      tumbles: 0,
      clusters: 0,
      orbs: [],
      orbSum: 0,
      applied: 0,
      pays: [],
      scatters: 0,
      nearMiss: true,
      taxDelta: 0,
      hitMax: false,
      turbo: false,
      quick: true,
      auto: true,
    }, 1_700_000_000_000 + 1000);
    assert.equal(cget(s, "dead"), 1);
    assert.equal(cget(s, "near"), 1);
    assert.equal(cget(s, "auto"), 1);
    assert.equal(cget(s, "quick"), 1);
    assert.equal(s.run.dead, 1);
  });

  it("tracks MASÍVNA and MAX and tax", () => {
    let s = emptyStats();
    s = applyStat(s, {
      t: "spin",
      cost: 1,
      bet: 1,
      ante: false,
      chase: false,
      buy: false,
      free: false,
      cash: 250,
      cash0: 300,
      x: 250,
      tumbles: 0,
      clusters: 0,
      orbs: [500],
      orbSum: 500,
      applied: 500,
      pays: [{ id: "pdf", count: 12 }],
      scatters: 0,
      nearMiss: false,
      taxDelta: -50,
      hitMax: true,
      turbo: false,
      quick: false,
      auto: false,
      pdfHit: true,
    });
    assert.equal(cget(s, "win.massive"), 1);
    assert.equal(cget(s, "win.max"), 1);
    assert.equal(cget(s, "tax.paid"), 50);
    assert.equal(cget(s, "can.500"), 1);
    assert.equal(cget(s, "pdf.8"), 1);
    assert.ok(s.first["can.500"]);
    assert.ok(s.first["pdf.12"]);
  });
});

describe("applyStat fs / pick / chase / job", () => {
  it("fs bought profit and empty", () => {
    let s = emptyStats();
    s = applyStat(s, { t: "fsStart", bought: true, ante: false, scatters: 4, spins: 15 });
    s = applyStat(s, {
      t: "fsEnd",
      total: 100,
      trigger: 5,
      played: 15,
      extra: 5,
      peak: 20,
      bought: true,
      buyCost: 79,
      modMul: 1,
      gross: 100,
      ms: 12_000,
    });
    assert.equal(cget(s, "fs.bought"), 1);
    assert.equal(cget(s, "buy.profit"), 1);
    assert.equal(cget(s, "retrigger"), 1);
    assert.equal(s.hi["fs.best"], 100);
  });

  it("chase escape then unik resets streak", () => {
    let s = emptyStats();
    s = applyStat(s, { t: "chaseStart", fsSym: "rj45" });
    s = applyStat(s, { t: "chaseWindow", result: "hit", lock: true });
    s = applyStat(s, { t: "chaseEnd", outcome: "escape", spins: 3, strikes: 0, ms: 5000 });
    assert.equal(cget(s, "escape"), 1);
    assert.equal(cget(s, "escape.early"), 1);
    assert.equal(s.run.chaseNoUnik, 1);
    s = applyStat(s, { t: "chaseEnd", outcome: "unik", spins: 10, strikes: 3, ms: 8000 });
    assert.equal(cget(s, "unik"), 1);
    assert.equal(s.run.chaseNoUnik, 0);
    assert.equal(cget(s, "tep"), 1);
  });

  it("pick clear and job ok/fail", () => {
    let s = emptyStats();
    s = applyStat(s, { t: "pick", cash: 40, safes: 9, clear: true, fines: 2 });
    assert.equal(cget(s, "pick.clear"), 1);
    assert.ok(s.first["pick.clear"]);
    const card = {
      floor: "lacna" as const,
      kind: "wins" as const,
      stake: 10,
      payout: 20,
      spun: 5,
      limit: 10,
      mystery: false,
    };
    s = applyStat(s, { t: "job", phase: "take", card });
    s = applyStat(s, { t: "job", phase: "ok", card });
    assert.equal(cget(s, "job.ok"), 1);
    assert.equal(cget(s, "ticket.paid"), 20);
    s = applyStat(s, { t: "job", phase: "fail", card: { ...card, kind: "live" }, reason: "parknet" });
    assert.equal(cget(s, "fail.parknet"), 1);
  });
});

describe("mergeStats", () => {
  it("takes max counters and min firsts", () => {
    const a = emptyStats(100);
    const b = emptyStats(50);
    a.c.spins = 3;
    b.c.spins = 5;
    a.first["win.first"] = 200;
    b.first["win.first"] = 150;
    a.hi["win.cash"] = 10;
    b.hi["win.cash"] = 20;
    a.hours[3] = 2;
    b.hours[3] = 7;
    const m = mergeStats(a, b);
    assert.equal(m.c.spins, 5);
    assert.equal(m.first["win.first"], 150);
    assert.equal(m.hi["win.cash"], 20);
    assert.equal(m.hours[3], 7);
    assert.equal(m.since, 50);
  });
});

describe("helpers", () => {
  it("formatDuration and pct", () => {
    assert.equal(formatDuration(0), "0 min");
    assert.equal(formatDuration(90 * 60 * 1000), "1 h 30 min");
    assert.equal(pct(1, 4), "25.0 %");
    assert.equal(pct(0, 0), "—");
  });
});

describe("session + bust survive", () => {
  it("bust does not clear lifetime counters", () => {
    let s = emptyStats();
    s = applyStat(s, {
      t: "spin",
      cost: 1,
      bet: 1,
      ante: false,
      chase: false,
      buy: false,
      free: false,
      cash: 5,
      cash0: 5,
      x: 5,
      tumbles: 0,
      clusters: 0,
      orbs: [],
      orbSum: 0,
      applied: 0,
      pays: [],
      scatters: 0,
      nearMiss: false,
      taxDelta: 0,
      hitMax: false,
      turbo: false,
      quick: false,
      auto: false,
    });
    s = applyStat(s, { t: "bust", rpLost: 400 });
    assert.equal(cget(s, "spins"), 1);
    assert.equal(cget(s, "bust"), 1);
    assert.ok(s.first["bust"]);
  });
});
