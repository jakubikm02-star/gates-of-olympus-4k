import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APP_RELOAD_FRESH_MS,
  DEPOSIT_REASONS,
  DUEL_DEPOSIT_MULT,
  bootDepositReason,
  canAffordDuel,
  depositAmount,
  depositOutcome,
  depositTotal,
  duelEntryCost,
  forfeitReason,
  newDeposit,
  parseMarker,
  sanitizeDeposit,
  settleDeposit,
  settleOnce,
  type DepositReason,
} from "./duel-deposit.ts";
import { abortDuel, duelCreditDelta, duelOutcome, startDuel, tickDuel } from "./duel.ts";
import { emptyPlayerSave, sanitizePlayerSave } from "./player-save.ts";
import { applyStat, emptyStats } from "./stats.ts";

const T0 = 1_700_000_000_000;

describe("kaucia: amount and entry", () => {
  it("is DUEL_DEPOSIT_MULT (10) x bet", () => {
    assert.equal(DUEL_DEPOSIT_MULT, 10);
    assert.equal(depositAmount(0.5), 5);
    assert.equal(depositAmount(2), 20);
    assert.equal(depositAmount(0.1 + 0.2), 3);
  });

  it("entry cost = stakes reserve + deposit, per seat; hot-seat pays two seats", () => {
    const one = duelEntryCost({ bet: 1, need: 10 });
    assert.deepEqual(one, { stake: 12, deposit: 10, perSeat: 22, total: 22 });
    const two = duelEntryCost({ bet: 1, need: 10, seats: 2 });
    assert.equal(two.total, 44);
  });

  it("blocks entry when the balance cannot cover deposit + stakes", () => {
    assert.equal(canAffordDuel(21.99, { bet: 1, need: 10 }), false);
    assert.equal(canAffordDuel(22, { bet: 1, need: 10 }), true);
    assert.equal(canAffordDuel(43, { bet: 1, need: 10, seats: 2 }), false);
    assert.equal(canAffordDuel(44, { bet: 1, need: 10, seats: 2 }), true);
  });

  it("new deposits: online one seat in the lobby (not started), hot-seat two seats started", () => {
    const on = newDeposit({ kind: "online", room: "AB12", bet: 2, now: T0, id: "x" });
    assert.deepEqual(on.seats, [20]);
    assert.equal(on.started, false);
    assert.equal(depositTotal(on), 20);
    const hs = newDeposit({ kind: "hotseat", bet: 2, now: T0, id: "y" });
    assert.deepEqual(hs.seats, [20, 20]);
    assert.equal(hs.started, true);
    assert.equal(depositTotal(hs), 40);
    assert.notEqual(newDeposit({ kind: "online", bet: 1, now: T0 }).id, newDeposit({ kind: "online", bet: 1, now: T0 }).id);
  });
});

describe("kaucia: refund / burn rules", () => {
  it("burns only on the player's own leaving", () => {
    const burn: DepositReason[] = ["forfeit", "idle", "timeout", "userReload"];
    for (const r of DEPOSIT_REASONS) assert.equal(depositOutcome(r), burn.includes(r) ? "burn" : "refund", r);
  });

  it("refund returns everything, burn removes it (never paid to the opponent)", () => {
    const dep = newDeposit({ kind: "online", room: "AB12", bet: 1, now: T0, id: "a" });
    assert.deepEqual(settleDeposit(dep, "finish"), { id: "a", reason: "finish", refund: 10, burned: 0 });
    assert.deepEqual(settleDeposit(dep, "peerLeft"), { id: "a", reason: "peerLeft", refund: 10, burned: 0 });
    assert.deepEqual(settleDeposit(dep, "forfeit"), { id: "a", reason: "forfeit", refund: 0, burned: 10 });
  });

  it("hot-seat fold burns only the folding seat's deposit", () => {
    const dep = newDeposit({ kind: "hotseat", bet: 1, now: T0, id: "h" });
    assert.deepEqual(settleDeposit(dep, "forfeit", { burnSeat: 1 }), { id: "h", reason: "forfeit", refund: 10, burned: 10 });
    assert.deepEqual(settleDeposit(dep, "finish", { burnSeat: 1 }), { id: "h", reason: "finish", refund: 20, burned: 0 });
    assert.deepEqual(settleDeposit(dep, "userReload"), { id: "h", reason: "userReload", refund: 0, burned: 20 });
  });

  it("forfeit reasons: peer out refunds, my fold/idle/timeout burn, my failing network refunds", () => {
    assert.equal(forfeitReason({ mine: false, cause: "fold" }), "peerLeft");
    assert.equal(forfeitReason({ mine: true, cause: "fold" }), "forfeit");
    assert.equal(forfeitReason({ mine: true, cause: "idle" }), "idle");
    assert.equal(forfeitReason({ mine: true, cause: "timeout" }), "timeout");
    assert.equal(forfeitReason({ mine: true, cause: "timeout", netFault: true }), "roomFailure");
    assert.equal(forfeitReason({ mine: true, cause: "fold", netFault: true }), "forfeit");
  });
});

describe("kaucia: exactly once", () => {
  it("settles the pending deposit once; a second settle is a no-op", () => {
    const dep = newDeposit({ kind: "online", room: "AB12", bet: 1, now: T0, id: "once" });
    const first = settleOnce(dep, "finish");
    assert.equal(first.pending, null);
    assert.equal(first.settlement?.refund, 10);
    const second = settleOnce(first.pending, "forfeit");
    assert.equal(second.settlement, null);
  });

  it("an id that is not the pending one does not settle it", () => {
    const dep = newDeposit({ kind: "online", room: "AB12", bet: 1, now: T0, id: "new" });
    const res = settleOnce(dep, "forfeit", { id: "old" });
    assert.equal(res.settlement, null);
    assert.equal(res.pending, dep);
  });
});

describe("kaucia: reload on boot", () => {
  const started = { ...newDeposit({ kind: "online", room: "AB12", bet: 1, now: T0, id: "b" }), started: true };

  it("no marker -> user reload -> burn", () => {
    assert.equal(bootDepositReason(started, null, T0 + 5000), "userReload");
  });

  it("fresh app marker (version reload / crash) set after the deposit -> refund", () => {
    assert.equal(bootDepositReason(started, { at: T0 + 1000, why: "version" }, T0 + 3000), "appReload");
    assert.equal(bootDepositReason(started, { at: T0 + 1000, why: "crash" }, T0 + 3000), "appReload");
  });

  it("stale marker or a marker from before this deposit does not count", () => {
    assert.equal(bootDepositReason(started, { at: T0 + 1000, why: "version" }, T0 + 1000 + APP_RELOAD_FRESH_MS + 1), "userReload");
    assert.equal(bootDepositReason(started, { at: T0 - 1, why: "version" }, T0 + 10), "userReload");
  });

  it("lobby never started -> refund; duel finished locally -> refund", () => {
    assert.equal(bootDepositReason({ ...started, started: false }, null, T0 + 10), "notStarted");
    assert.equal(bootDepositReason({ ...started, finished: true }, null, T0 + 10), "finish");
    assert.equal(bootDepositReason(null, null, T0), null);
  });

  it("marker parsing is defensive", () => {
    assert.equal(parseMarker(null), null);
    assert.equal(parseMarker("nope"), null);
    assert.equal(parseMarker('{"at":0}'), null);
    assert.deepEqual(parseMarker('{"at":5,"why":"crash"}'), { at: 5, why: "crash" });
    assert.deepEqual(parseMarker('{"at":5}'), { at: 5, why: "version" });
  });
});

describe("kaucia: save round-trip and stats", () => {
  it("pending deposit survives sanitize; junk is dropped", () => {
    const dep = { ...newDeposit({ kind: "hotseat", bet: 1, now: T0, id: "s" }), netFault: true };
    const s = sanitizePlayerSave({ ...emptyPlayerSave(), duelDeposit: dep });
    assert.deepEqual(s.duelDeposit, dep);
    assert.equal(sanitizePlayerSave({ ...emptyPlayerSave(), duelDeposit: { id: "", kind: "online", seats: [1] } }).duelDeposit, null);
    assert.equal(sanitizeDeposit({ id: "z", kind: "online", seats: [0] }), null);
    assert.equal(sanitizeDeposit({ id: "z", kind: "alien", seats: [5] }), null);
    assert.equal(sanitizePlayerSave({ balance: 5 }).duelDeposit, null);
  });

  it("stats count paid / returned / burned amounts and reasons", () => {
    let st = emptyStats();
    st = applyStat(st, { t: "duelDeposit", phase: "paid", amount: 20 });
    st = applyStat(st, { t: "duelDeposit", phase: "returned", amount: 10, reason: "forfeit" });
    st = applyStat(st, { t: "duelDeposit", phase: "burned", amount: 10, reason: "forfeit" });
    assert.equal(st.c["duel.dep.paid"], 20);
    assert.equal(st.c["duel.dep.paid.n"], 1);
    assert.equal(st.c["duel.dep.returned"], 10);
    assert.equal(st.c["duel.dep.burned"], 10);
    assert.equal(st.c["duel.dep.why.forfeit"], 2);
  });
});

describe("aborted duel (game failure)", () => {
  it("each seat keeps its own stack, no winner", () => {
    let d = startDuel({ mode: "spins", a: "A", b: "B", bet: 1, kind: "online", you: 0, room: "AB12", need: 2 });
    d = tickDuel(d, 7);
    const ab = abortDuel(d);
    assert.equal(ab.phase, "done");
    assert.equal(ab.aborted, true);
    assert.equal(duelCreditDelta(ab, 0), d.seats[0].score);
    const out = duelOutcome(ab);
    assert.equal(out.result, "draw");
    assert.equal(out.forfeit, null);
    assert.equal(abortDuel(ab), ab);
  });
});
