import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanRoomCode, duelSummary } from "./duel-setup.ts";
import { canAffordDuel, duelEntryCost } from "./duel-deposit.ts";

describe("duel setup: room code input", () => {
  it("uppercases, strips junk and keeps 4 chars (paste-safe)", () => {
    assert.equal(cleanRoomCode("a7k2"), "A7K2");
    assert.equal(cleanRoomCode(" #a7-k2 "), "A7K2");
    assert.equal(cleanRoomCode("DUEL · kód: a7k2"), "A7K2");
    assert.equal(cleanRoomCode("Poď na duel, kód je Q9ZX!"), "Q9ZX");
    assert.equal(cleanRoomCode("a7k2x"), "A7K2");
    assert.equal(cleanRoomCode("ab"), "AB");
    assert.equal(cleanRoomCode(""), "");
  });
});

describe("duel setup: summary line", () => {
  it("stakes + kaucia, min. credit = the game's own entry check", () => {
    const s = duelSummary({ bet: 1000, need: 10, ante: false, anteMul: 1.13, seats: 1 });
    assert.equal(s.stakes, 10000);
    assert.equal(s.deposit, 10000);
    assert.equal(s.total, 20000);
    assert.equal(s.minCredit, 22000);
    assert.equal(s.minCredit, duelEntryCost({ bet: 1000, need: 10 }).perSeat);
    assert.equal(canAffordDuel(s.minCredit, { bet: 1000, need: 10 }), true);
    assert.equal(canAffordDuel(s.minCredit - 0.01, { bet: 1000, need: 10 }), false);
  });
  it("ante raises the stakes by the player's multiplier, not the kaucia", () => {
    const s = duelSummary({ bet: 1, need: 10, ante: true, anteMul: 1.13, seats: 1 });
    assert.equal(s.stakes, 11.3);
    assert.equal(s.deposit, 10);
    assert.equal(s.total, 21.3);
  });
  it("hot-seat pays both seats from one wallet", () => {
    const s = duelSummary({ bet: 2, need: 5, ante: false, anteMul: 1.13, seats: 2 });
    assert.equal(s.stakes, 20);
    assert.equal(s.deposit, 40);
    assert.equal(s.minCredit, duelEntryCost({ bet: 2, need: 5, seats: 2 }).total);
  });
});
