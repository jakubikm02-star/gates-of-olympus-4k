import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { braDay, braOffsetMs } from "./server-day.ts";
import { sanitizePlayerSave } from "./player-save.ts";
import { packSeat, setPackedRibbon, unpackSeat } from "./duel-api.ts";
import { duelRibbonId, noteDuelRibbon, notePeerRibbon, peerRibbon, resetPeers } from "./ribbon-peers.ts";
import {
  RIBBONS,
  braHour,
  emptyRibbonLog,
  isRibbonId,
  noteRibbon,
  ribbonFromStat,
  sanitizeRibbonLog,
  type RibbonEvent,
  type RibbonLog,
} from "./ribbons.ts";

function atLocal(y: number, m: number, d: number, h: number, min = 0): number {
  const utc = Date.UTC(y, m - 1, d, h, min, 30);
  let t = utc - braOffsetMs(utc);
  t = utc - braOffsetMs(t);
  return t;
}

function spin(over: Partial<Extract<RibbonEvent, { t: "spin" }>> = {}): Extract<RibbonEvent, { t: "spin" }> {
  return {
    t: "spin",
    free: false,
    buy: false,
    cost: 1,
    bet: 1,
    cash0: 0,
    x: 0,
    tumbles: 0,
    hitMax: false,
    turbo: false,
    auto: false,
    ...over,
  };
}

function play(log: RibbonLog, ev: RibbonEvent, now: number): RibbonLog {
  return noteRibbon(log, ev, now).log;
}

const NIGHT = atLocal(2026, 10, 23, 1, 15);
const DAY = atLocal(2026, 10, 23, 18, 0);

describe("ribbon catalog", () => {
  it("has about forty unique ids the server will accept", () => {
    assert.ok(RIBBONS.length >= 40 && RIBBONS.length <= 48);
    assert.equal(new Set(RIBBONS.map((r) => r.id)).size, RIBBONS.length);
    assert.equal(new Set(RIBBONS.map((r) => r.name)).size, RIBBONS.length);
    for (const r of RIBBONS) {
      assert.equal(isRibbonId(r.id), true);
      assert.ok(r.name.length > 0 && r.name.length <= 24);
      assert.ok(r.line.length > 8 && r.line.length < 120);
    }
  });
});

describe("ribbon triggers", () => {
  it("earns dead-spin titles once, then the longer streaks", () => {
    let log = emptyRibbonLog("2026-10-23", DAY);
    for (let i = 0; i < 7; i++) log = play(log, spin(), DAY + i);
    assert.deepEqual(log.earned.map((e) => e.id), []);
    const eighth = noteRibbon(log, spin(), DAY + 8);
    assert.deepEqual(eighth.fresh, ["mrtvy-spin"]);
    log = eighth.log;
    for (let i = 0; i < 12; i++) log = play(log, spin(), DAY + 20 + i);
    assert.ok(log.earned.some((e) => e.id === "sucha-seria"));
    assert.equal(log.earned.filter((e) => e.id === "mrtvy-spin").length, 1);
    const win = noteRibbon(log, spin({ cash0: 5, x: 2 }), DAY + 40);
    assert.equal(win.log.c.deadRun, 0);
    assert.deepEqual(win.fresh, []);
    for (let i = 0; i < 8; i++) log = play(win.log, spin(), DAY + 50 + i);
    assert.equal(log.earned.filter((e) => e.id === "mrtvy-spin").length, 1);
  });

  it("counts a cascade, a max-bet rage and an autospin marathon from real spin fields", () => {
    let log = emptyRibbonLog("2026-10-23", DAY);
    const fall = noteRibbon(log, spin({ cash0: 10, x: 4, tumbles: 10, bet: 2 }), DAY);
    assert.ok(fall.fresh.includes("kaskada"));
    assert.ok(fall.fresh.includes("lavina"));
    assert.equal(fall.log.earned.at(-1)?.id, "lavina");
    log = fall.log;
    for (let i = 0; i < 5; i++) log = play(log, spin({ bet: 1000 }), DAY + i);
    assert.ok(log.earned.some((e) => e.id === "max-rage"));
    for (let i = 0; i < 7; i++) log = play(log, spin({ bet: 1000, cash0: 1, x: 1 }), DAY + 10 + i);
    assert.ok(log.earned.some((e) => e.id === "stavka-na-dno"));
    for (let i = 0; i < 60; i++) log = play(log, spin({ auto: true, cash0: 1, x: 1 }), DAY + 30 + i);
    assert.ok(log.earned.some((e) => e.id === "auto-maraton"));
    const cap = noteRibbon(log, spin({ cash0: 5000, x: 5000, hitMax: true, tumbles: 1 }), DAY + 100);
    assert.ok(cap.fresh.includes("strop"));
    assert.ok(cap.fresh.includes("masiv"));
  });

  it("reads bonus, zásah, koleso, ž-box, duel, ticket, sucho and jackpot events", () => {
    let log = emptyRibbonLog("2026-10-23", DAY);
    log = play(log, { t: "fsEnd", total: 0, trigger: 0, bought: true, buyCost: 100, empty: true }, DAY);
    assert.ok(log.earned.some((e) => e.id === "prazdny-bonus"));
    assert.ok(log.earned.some((e) => e.id === "kupil-vzduch"));
    const resumed = noteRibbon(log, { t: "fsEnd", resumed: true, total: 0, trigger: 0, bought: true, buyCost: 100, empty: true }, DAY);
    assert.deepEqual(resumed.fresh, []);
    log = resumed.log;
    for (let i = 0; i < 3; i++) log = play(log, { t: "fsStart", bought: true }, DAY);
    assert.ok(log.earned.some((e) => e.id === "buy-streak"));
    log = play(log, { t: "fsStart", bought: false }, DAY);
    assert.equal(log.c.buyRun, 0);
    for (let i = 0; i < 6; i++) log = play(log, { t: "chaseWindow", result: "miss" }, DAY);
    assert.ok(log.earned.some((e) => e.id === "same-mimo"));
    log = play(log, { t: "chaseEnd", outcome: "unik" }, DAY);
    assert.ok(log.earned.some((e) => e.id === "danovy-unik"));
    log = play(log, { t: "koleso", bankrot: 2, solved: true }, DAY);
    assert.ok(log.earned.some((e) => e.id === "bankrot"));
    assert.ok(log.earned.some((e) => e.id === "znova-bankrot"));
    assert.ok(log.earned.some((e) => e.id === "tajnicka"));
    log = play(log, { t: "zbox", full: false, found: 0 }, DAY);
    assert.ok(log.earned.some((e) => e.id === "zbox-prazdny"));
    log = play(log, { t: "gold", paid: false }, DAY);
    log = play(log, { t: "gold", paid: true }, DAY);
    assert.ok(log.earned.some((e) => e.id === "zlato-nula"));
    assert.ok(log.earned.some((e) => e.id === "zlaty-bonus"));
    log = play(log, { t: "rank", src: "sucho" }, DAY);
    assert.ok(log.earned.some((e) => e.id === "sucho"));
    log = play(log, { t: "jackpot", tier: "stat" }, DAY);
    assert.ok(log.earned.some((e) => e.id === "jackpot"));
    assert.ok(log.earned.some((e) => e.id === "statny"));
    log = play(log, { t: "duel", result: "loss", forfeit: "me" }, DAY);
    assert.ok(log.earned.some((e) => e.id === "versus-loss"));
    assert.ok(log.earned.some((e) => e.id === "vzdal-som"));
    for (let i = 0; i < 3; i++) log = play(log, { t: "duel", result: "win", forfeit: null }, DAY);
    assert.ok(log.earned.some((e) => e.id === "lobby-moje"));
    log = play(log, { t: "job", phase: "fail" }, DAY);
    log = play(log, { t: "job", phase: "fail" }, DAY);
    log = play(log, { t: "job", phase: "ok" }, DAY);
    assert.ok(log.earned.some((e) => e.id === "pretrhnuty"));
    assert.ok(log.earned.some((e) => e.id === "listok-sedy"));
    log = play(log, { t: "bust" }, DAY);
    log = play(log, { t: "ego" }, DAY);
    assert.ok(log.earned.some((e) => e.id === "exekucia"));
    assert.ok(log.earned.some((e) => e.id === "smrt-ega"));
  });

  it("maps stat events and ignores noise", () => {
    const spinEv = ribbonFromStat({ t: "spin", free: false, buy: false, cost: 2, bet: 1000, cash0: 0, x: 0, tumbles: 3, hitMax: false, turbo: true, auto: true });
    assert.equal(spinEv?.t, "spin");
    assert.equal(ribbonFromStat({ t: "session", phase: "start" }), null);
    assert.equal(ribbonFromStat({ t: "ui", what: "mute" }), null);
    assert.equal(ribbonFromStat({ t: "chaseWindow", result: "banana" }), null);
  });
});

describe("Bratislava day rollover", () => {
  it("treats midnight as the next day in summer and in winter", () => {
    const late = atLocal(2026, 10, 23, 23, 50);
    const early = atLocal(2026, 10, 24, 0, 10);
    assert.equal(braDay(late), "2026-10-23");
    assert.equal(braDay(early), "2026-10-24");
    assert.equal(braHour(early), 0);
    assert.ok(braHour(late) >= 23);
    const winterLate = atLocal(2026, 1, 19, 23, 40);
    const winterEarly = atLocal(2026, 1, 20, 0, 5);
    assert.equal(braDay(winterLate), "2026-01-19");
    assert.equal(braDay(winterEarly), "2026-01-20");
    assert.equal(braHour(winterEarly), 0);
    const dstLate = atLocal(2026, 3, 28, 23, 50);
    const dstEarly = atLocal(2026, 3, 29, 0, 10);
    assert.equal(braDay(dstLate), "2026-03-28");
    assert.equal(braDay(dstEarly), "2026-03-29");
  });

  it("drops today's titles at the next Bratislava midnight and can earn them again", () => {
    let log = emptyRibbonLog(braDay(NIGHT), NIGHT);
    const first = noteRibbon(log, spin(), NIGHT);
    assert.deepEqual(first.fresh, ["po-polnoci"]);
    log = first.log;
    for (let i = 0; i < 14; i++) log = play(log, spin(), NIGHT + i);
    assert.ok(log.earned.some((e) => e.id === "nocny-vtak"));
    const next = atLocal(2026, 10, 24, 0, 20);
    const rolled = noteRibbon(log, spin(), next);
    assert.equal(rolled.log.day, "2026-10-24");
    assert.equal(rolled.log.c.deadRun, 1);
    assert.equal(rolled.log.c.night, 1);
    assert.deepEqual(
      rolled.log.earned.map((e) => e.id),
      ["po-polnoci"],
    );
    const afternoon = noteRibbon(rolled.log, spin({ cash0: 3, x: 2 }), atLocal(2026, 10, 24, 15, 0));
    assert.equal(afternoon.log.day, "2026-10-24");
    assert.equal(afternoon.log.c.night, 1);
    assert.ok(!afternoon.fresh.includes("po-polnoci"));
  });

  it("keeps the same calendar day, including a save that predates ribbons", () => {
    let log = emptyRibbonLog("2026-10-23", DAY);
    log = play(log, { t: "ego" }, DAY);
    const later = noteRibbon(log, { t: "ego" }, atLocal(2026, 10, 23, 23, 10));
    assert.equal(later.log.day, "2026-10-23");
    assert.equal(later.log.earned.length, 1);
    assert.deepEqual(later.fresh, []);
    const old = sanitizePlayerSave({ balance: 42, betIndex: 3, updatedAt: 10, playerId: "abcdefghij" });
    assert.equal(old.balance, 42);
    assert.equal(old.ribbons, null);
    assert.equal(old.playerId, "abcdefghij");
    const junk = sanitizePlayerSave({
      balance: 7,
      updatedAt: 10,
      playerId: "abcdefghij",
      ribbons: { day: "nope", earned: [{ id: "mrtvy-spin" }, { id: "drop-table" }], c: { deadRun: -4, evil: 9 } },
    });
    assert.equal(junk.balance, 7);
    assert.equal(junk.ribbons, null);
    const kept = sanitizeRibbonLog({ day: "2026-10-23", at: 5, earned: [{ id: "mrtvy-spin", at: 5 }, { id: "mrtvy-spin", at: 6 }, { id: "nope", at: 1 }], c: { deadRun: 8.9 } });
    assert.equal(kept?.earned.length, 1);
    assert.equal(kept?.c.deadRun, 8);
  });
});

describe("duel seat pack", () => {
  it("keeps the old name string until a ribbon exists", () => {
    setPackedRibbon("");
    try {
      assert.equal(packSeat("Jožo", false, true, 50), "Jožo|0|1|50");
      assert.equal(unpackSeat("Jožo|0|1|50").ribbon, "");
      setPackedRibbon("mrtvy-spin");
      assert.equal(packSeat("Jožo", false, true, 50), "Jožo|0|1|50|mrtvy-spin");
      const back = unpackSeat("Jožo|0|1|50|mrtvy-spin");
      assert.equal(back.name, "Jožo");
      assert.equal(back.ribbon, "mrtvy-spin");
      assert.equal(back.net, true);
      assert.equal(unpackSeat("Jožo|0|1|50|DROP TABLE").ribbon, "");
    } finally {
      setPackedRibbon("");
    }
  });
});

describe("peer ribbons", () => {
  it("keeps a unique nick when the hash and the duel seat are separate keys", () => {
    resetPeers();
    try {
      notePeerRibbon("player-12345678", "Miso", "bankrot");
      notePeerRibbon("aabbccddeeff0011", "", "bankrot");
      assert.equal(peerRibbon({ id: "aabbccddeeff0011" }), "bankrot");
      assert.equal(peerRibbon({ nick: "Miso" }), "bankrot");
      noteDuelRibbon("Miso", "versus-win");
      assert.equal(peerRibbon({ id: duelRibbonId("Miso") }), "versus-win");
      assert.equal(peerRibbon({ nick: "Miso" }), "bankrot");
      notePeerRibbon("other-12345678", "Miso", "jackpot");
      assert.equal(peerRibbon({ nick: "Miso" }), "");
      assert.equal(peerRibbon({ id: "player-12345678" }), "bankrot");
    } finally {
      resetPeers();
    }
  });
});
