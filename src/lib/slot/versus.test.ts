import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allFinished,
  applyPeerTick,
  canDuelSpin,
  clampPlayers,
  confirmSwap,
  duelCreditDelta,
  duelLeaders,
  duelOutcome,
  duelPot,
  duelWinner,
  forfeitDuel,
  nextSeat,
  reconcileDuel,
  startDuel,
  tickDuel,
  type Duel,
} from "./duel.ts";
import { claimQuery, forfeitQuery, roomFull, seatPrefix } from "./duel-api.ts";
import { newDeposit, settleDeposit } from "./duel-deposit.ts";
import { duelSummary } from "./duel-setup.ts";

const hot = (n: number, need = 2) => startDuel({ mode: "spins", names: ["A", "B", "C", "D"].slice(0, n), bet: 1, need });
const online = (n: number, you: number, need = 2) =>
  startDuel({ mode: "spins", names: ["A", "B", "C", "D"].slice(0, n), bet: 1, need, kind: "online", you });

function play(d: Duel, cash: number[]): Duel {
  let x = d;
  for (const c of cash) {
    x = tickDuel(x, c);
    if (x.phase === "swap") x = confirmSwap(x);
  }
  return x;
}

describe("versus: sizes", () => {
  it("clamps the room size to 2..4", () => {
    assert.equal(clampPlayers(1), 2);
    assert.equal(clampPlayers("3"), 3);
    assert.equal(clampPlayers(9), 4);
    assert.equal(clampPlayers(undefined), 2);
  });
  it("2-seat duels still start with a/b names", () => {
    const d = startDuel({ mode: "spins", a: "X", b: "Y", bet: 1 });
    assert.deepEqual(d.seats.map((s) => s.name), ["X", "Y"]);
  });
});

describe("versus: hot-seat with 3 and 4 seats", () => {
  it("passes the phone seat by seat and ends after the last one", () => {
    let d = hot(3);
    d = tickDuel(d, 1);
    d = tickDuel(d, 2);
    assert.equal(d.phase, "swap");
    assert.equal(nextSeat(d), 1);
    d = confirmSwap(d);
    assert.equal(d.turn, 1);
    d = play(d, [5, 5, 1, 0]);
    assert.equal(d.phase, "done");
    assert.deepEqual(d.seats.map((s) => s.score), [3, 10, 1]);
    assert.equal(duelWinner(d), 1);
    assert.equal(duelPot(d), 14);
    // one wallet: the whole bank comes back to it
    assert.equal(duelOutcome(d).credit, 14);
  });

  it("a seat that folds is skipped and its stack stays in the bank", () => {
    let d = hot(4);
    d = play(d, [1, 1]); // A done -> B
    d = tickDuel(d, 50); // B 1/2
    d = forfeitDuel(d, 1); // B folds
    assert.equal(d.phase, "swap");
    assert.equal(nextSeat(d), 2);
    d = confirmSwap(d);
    d = play(d, [3, 0, 0, 1]);
    assert.equal(d.phase, "done");
    assert.ok(d.seats[1]!.out);
    assert.equal(duelWinner(d), 2);
    assert.equal(duelPot(d), 2 + 50 + 3 + 1);
  });
});

describe("versus: payout split", () => {
  const done = (scores: number[], outs: number[] = []): Duel => ({
    ...online(scores.length, 0),
    phase: "done",
    seats: scores.map((s, i) => ({ name: `P${i}`, score: s, have: 2, out: outs.includes(i) })),
  });
  it("the winner takes the whole bank, losers nothing", () => {
    const d = done([5, 20, 7, 1]);
    assert.equal(duelCreditDelta(d, 1), 33);
    assert.equal(duelCreditDelta(d, 0), 0);
    assert.equal(duelCreditDelta(d, 3), 0);
  });
  it("a tie at the top splits the bank between the tied seats; shares add up to the bank", () => {
    const d = done([10, 10, 0.01]);
    assert.deepEqual(duelLeaders(d), [0, 1]);
    const a = duelCreditDelta(d, 0);
    const b = duelCreditDelta(d, 1);
    assert.equal(+(a + b).toFixed(2), 20.01);
    assert.equal(duelCreditDelta(d, 2), 0);
    assert.equal(duelOutcome({ ...d, you: 0 }).result, "draw");
    assert.equal(duelOutcome({ ...d, you: 2 }).result, "loss");
  });
  it("2 seats: a tie still gives each seat its own stack back", () => {
    const d = done([4, 4]);
    assert.equal(duelCreditDelta(d, 0), 4);
    assert.equal(duelCreditDelta(d, 1), 4);
  });
  it("an out seat can not win even with the best score", () => {
    const d = done([100, 3, 2], [0]);
    assert.equal(duelWinner(d), 1);
    assert.equal(duelCreditDelta(d, 1), 105);
    assert.equal(duelCreditDelta(d, 0), 0);
  });
});

describe("versus: online with 3-4 seats", () => {
  it("finishes only when every seat played (out seats count as finished)", () => {
    let d = online(3, 1);
    d = tickDuel(d, 2);
    d = tickDuel(d, 2);
    assert.equal(d.phase, "play");
    assert.equal(canDuelSpin(d), false);
    d = applyPeerTick(d, 2, 9, 0);
    assert.equal(d.phase, "play");
    d = applyPeerTick(d, 1, 1, 2);
    d = forfeitDuel(d, 2);
    assert.equal(d.phase, "done");
    assert.equal(duelWinner(d), 0);
    assert.equal(duelOutcome(d).result, "loss");
    assert.equal(duelOutcome(d).forfeit, "peer");
  });
  it("my own fold ends the duel for me with nothing to collect, the others play on", () => {
    let d = online(4, 3);
    d = tickDuel(d, 30);
    d = forfeitDuel(d, 3);
    assert.equal(d.phase, "done");
    assert.equal(duelOutcome(d).credit, 0);
    assert.equal(duelOutcome(d).forfeit, "me");
  });
  it("the last seat standing takes the bank at once", () => {
    let d = online(3, 0);
    d = tickDuel(d, 1);
    d = forfeitDuel(d, 1);
    assert.equal(d.phase, "play");
    d = forfeitDuel(d, 2);
    assert.equal(d.phase, "done");
    assert.ok(allFinished(d));
    assert.equal(duelOutcome(d).result, "win");
  });
  it("reconciles every seat and the out flags from the room row", () => {
    const d = online(3, 0);
    const r = reconcileDuel(d, {
      forfeit: null,
      hostHave: 0,
      hostScore: 0,
      guestHave: 1,
      guestScore: 4,
      seats: [
        { have: 0, score: 0 },
        { have: 1, score: 4 },
        { have: 2, score: 1, out: true },
      ],
    });
    assert.equal(r.seats[1]!.score, 4);
    assert.ok(r.seats[2]!.out);
    assert.equal(r.phase, "play");
  });
});

describe("versus: room queries + money", () => {
  it("seat columns", () => {
    assert.deepEqual([0, 1, 2, 3].map(seatPrefix), ["host", "guest", "p3", "p4"]);
    assert.equal(seatPrefix("guest"), "guest");
  });
  it("a join claims a seat only while it is empty and the room is in the lobby", () => {
    assert.equal(claimQuery("AB12", 2), "duel_rooms?code=eq.AB12&phase=eq.wait&p3_name=eq.");
  });
  it("3-4 seat forfeit filter targets that seat only", () => {
    assert.equal(
      forfeitQuery("AB12", 3, 10, "peer", 4),
      "duel_rooms?code=eq.AB12&phase=eq.play&p4_out=is.false&p4_have=lt.10",
    );
    // 2 seats unchanged
    assert.equal(forfeitQuery("AB12", "host", 5, "self"), "duel_rooms?code=eq.AB12&phase=eq.play&or=(host_have.lt.5,guest_have.lt.5)");
  });
  it("room is full when every seat has a name", () => {
    assert.equal(roomFull({ seats: [{ name: "A" }, { name: "B" }, { name: "" }] as never }), false);
    assert.equal(roomFull({ seats: [{ name: "A" }, { name: "B" }, { name: "C" }] as never }), true);
  });
  it("hot-seat pays one kaucia per seat; each folded seat burns only its own", () => {
    const dep = newDeposit({ kind: "hotseat", bet: 1, now: 1, seats: 4 });
    assert.equal(dep.seats.length, 4);
    const st = settleDeposit(dep, "forfeit", { burnSeats: [1, 3] });
    assert.equal(st.burned, 20);
    assert.equal(st.refund, 20);
  });
  it("setup summary scales with the seats on this phone", () => {
    const s = duelSummary({ bet: 1, need: 10, ante: false, anteMul: 1.25, seats: 3 });
    assert.equal(s.stakes, 30);
    assert.equal(s.deposit, 30);
  });
});
