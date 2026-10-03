import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyPeerTick,
  blankStep,
  duelBannerMs,
  duelOutcome,
  duelSettleKey,
  forfeitDuel,
  peerFrozen,
  reconcileDuel,
  startDuel,
  tickDuel,
  type Duel,
  type DuelRoomView,
} from "./duel.ts";
import { forfeitQuery } from "./duel-api.ts";

function online(you: 0 | 1, need = 10): Duel {
  return startDuel({ mode: "spins", a: "A", b: "B", bet: 1, kind: "online", you, need });
}

/** Mirror of the PostgREST filter in forfeitQuery, to replay the race on a fake row. */
function forfeitLands(row: DuelRoomView & { phase: string }, out: "host" | "guest", need: number, by: "self" | "peer"): boolean {
  if (row.phase !== "play") return false;
  if (!(row.hostHave < need || row.guestHave < need)) return false;
  if (by === "peer" && !((out === "host" ? row.hostHave : row.guestHave) < need)) return false;
  return true;
}

describe("duel fix: settlement", () => {
  it("a forfeit recorded on the row wins over a local finish", () => {
    let b = online(1);
    for (let i = 0; i < 10; i++) b = tickDuel(b, 1);
    b = applyPeerTick(b, 10, 20);
    assert.equal(b.phase, "done");
    const r = reconcileDuel(b, { forfeit: 1, hostHave: 10, hostScore: 20, guestHave: 10, guestScore: 10 });
    assert.equal(r.forfeit, 1);
    assert.equal(duelOutcome(r).credit, 0);
  });

  it("no row forfeit: the peer seat is refreshed and the result stays a finish", () => {
    let a = online(0);
    for (let i = 0; i < 10; i++) a = tickDuel(a, 2);
    a = applyPeerTick(a, 10, 5);
    const r = reconcileDuel(a, { forfeit: null, hostHave: 10, hostScore: 20, guestHave: 10, guestScore: 7 });
    assert.equal(r.phase, "done");
    assert.equal(r.seats[1].score, 7);
    assert.deepEqual(duelOutcome(r), { result: "win", forfeit: null, pot: 27, credit: 27 });
  });

  it("old race (forfeit vs. last spin) now pays the bank exactly once", () => {
    // A finished 10/10 (20), B at 9/10 (4.5). Case 1: B's last tick lands first -> A's peer forfeit is refused.
    const row = { phase: "play", forfeit: null as 0 | 1 | null, hostHave: 10, hostScore: 20, guestHave: 10, guestScore: 304.5 };
    assert.equal(forfeitLands(row, "guest", 10, "peer"), false);
    // Case 2: A's forfeit lands first -> B's final tick returns the row with guest_out and B accepts it.
    const row2 = { phase: "play", forfeit: null as 0 | 1 | null, hostHave: 10, hostScore: 20, guestHave: 9, guestScore: 4.5 };
    assert.equal(forfeitLands(row2, "guest", 10, "peer"), true);
    let b = online(1);
    for (let i = 0; i < 9; i++) b = tickDuel(b, 0.5);
    b = applyPeerTick(b, 10, 20);
    b = tickDuel(b, 300);
    const settledB = reconcileDuel(b, { forfeit: 1, hostHave: 10, hostScore: 20, guestHave: 10, guestScore: 304.5 });
    let a = online(0);
    for (let i = 0; i < 10; i++) a = tickDuel(a, 2);
    a = applyPeerTick(a, 9, 4.5);
    const settledA = forfeitDuel(a, 1);
    const total = duelOutcome(settledA).credit + duelOutcome(settledB).credit;
    assert.equal(total, 24.5);
  });

  it("forfeit filter: only while in play and nobody (peer: that seat) has finished", () => {
    assert.equal(
      forfeitQuery("AB12", "guest", 10, "peer"),
      "duel_rooms?code=eq.AB12&phase=eq.play&or=(host_have.lt.10,guest_have.lt.10)&guest_have=lt.10",
    );
    assert.equal(forfeitQuery("AB12", "host", 5, "self"), "duel_rooms?code=eq.AB12&phase=eq.play&or=(host_have.lt.5,guest_have.lt.5)");
  });

  it("settle key is per duel, seat and start", () => {
    const a = online(0);
    const b = online(1);
    assert.notEqual(duelSettleKey({ ...a, room: "X" }, 1), duelSettleKey({ ...b, room: "X" }, 1));
    assert.notEqual(duelSettleKey({ ...a, room: "X" }, 1), duelSettleKey({ ...a, room: "X" }, 2));
    assert.equal(duelSettleKey({ ...a, room: "X" }, 1), duelSettleKey({ ...a, room: "X" }, 1));
  });

  it("outcome: tie returns own score, hot-seat credits the whole bank, forfeit flags", () => {
    let t = online(1, 1);
    t = tickDuel(t, 5);
    t = applyPeerTick(t, 1, 5);
    assert.deepEqual(duelOutcome(t), { result: "draw", forfeit: null, pot: 10, credit: 5 });
    let h = startDuel({ mode: "spins", a: "A", b: "B", bet: 1, need: 1 });
    h = tickDuel(h, 1);
    h = { ...h, phase: "play", turn: 1 };
    h = tickDuel(h, 3);
    assert.equal(h.phase, "done");
    assert.deepEqual(duelOutcome(h), { result: "loss", forfeit: null, pot: 4, credit: 4 });
    const f = forfeitDuel(online(0), 0);
    assert.equal(duelOutcome(f).forfeit, "me");
  });
});

describe("duel fix: clocks", () => {
  it("idle timer: two zero spins, the third blank forfeits", () => {
    let b = 0;
    const seen: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      const s = blankStep(b);
      b = s.blanks;
      seen.push(s.forfeit);
    }
    assert.deepEqual(seen, [false, false, true]);
  });

  it("no-progress clock ignores busy time and finished peers", () => {
    const base = { now: 200_000, idleSince: 100_000, mine: 10, theirs: 5, need: 10 };
    assert.equal(peerFrozen({ ...base, peerBusy: false }), true);
    assert.equal(peerFrozen({ ...base, peerBusy: true }), false);
    assert.equal(peerFrozen({ ...base, peerBusy: false, idleSince: 150_000 }), false);
    assert.equal(peerFrozen({ ...base, peerBusy: false, theirs: 10 }), false);
    assert.equal(peerFrozen({ ...base, peerBusy: false, mine: 5 }), false);
  });

  it("duel banners never wait for a tap", () => {
    for (const k of ["big", "mega", "epic", "massive", "max", "fsTotal", null]) {
      const ms = duelBannerMs(k);
      assert.equal(typeof ms, "number");
      assert.ok(ms > 0 && ms <= 6000);
    }
  });
});
