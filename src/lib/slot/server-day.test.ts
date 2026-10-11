import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { braDay, braMidnightAfter, braOffsetMs, clockReply, msToReset, resetCountdown, serverDay, serverNow, setServerOffset, syncServerClock } from "./server-day.ts";

const H = 3600 * 1000;

describe("server day (Europe/Bratislava)", () => {
  it("day string follows Bratislava, not UTC", () => {
    assert.equal(braDay(Date.parse("2026-10-10T21:59:59Z")), "2026-10-10");
    assert.equal(braDay(Date.parse("2026-10-10T22:00:00Z")), "2026-10-11");
    assert.equal(braDay(Date.parse("2026-01-15T22:59:59Z")), "2026-01-15");
    assert.equal(braDay(Date.parse("2026-01-15T23:00:00Z")), "2026-01-16");
  });
  it("offset +1 h winter, +2 h summer", () => {
    assert.equal(braOffsetMs(Date.parse("2026-01-15T12:00:00Z")), 1 * H);
    assert.equal(braOffsetMs(Date.parse("2026-07-15T12:00:00Z")), 2 * H);
  });
  it("next reset is local midnight, also across both DST switches (23 h and 25 h days)", () => {
    // spring: Sun 29 Mar 2026, 02:00 CET → 03:00 CEST
    const m28 = Date.parse("2026-03-28T23:00:00Z"); // 29 Mar 00:00 CET
    assert.equal(braMidnightAfter(m28 - 1), m28);
    assert.equal(braMidnightAfter(m28), Date.parse("2026-03-29T22:00:00Z"));
    assert.equal(braMidnightAfter(m28) - m28, 23 * H);
    // autumn: Sun 25 Oct 2026, 03:00 CEST → 02:00 CET
    const o25 = Date.parse("2026-10-24T22:00:00Z");
    assert.equal(braMidnightAfter(o25), Date.parse("2026-10-25T23:00:00Z"));
    assert.equal(braMidnightAfter(o25) - o25, 25 * H);
    assert.equal(braDay(braMidnightAfter(o25)), "2026-10-26");
    // ordinary day, month and year ends
    assert.equal(braMidnightAfter(Date.parse("2026-12-31T12:00:00Z")), Date.parse("2026-12-31T23:00:00Z"));
    assert.equal(braDay(Date.parse("2026-12-31T23:00:00Z")), "2027-01-01");
  });
  it("every reset over two years lands on 00:00 local and changes the day", () => {
    let t = Date.parse("2026-01-01T12:00:00Z");
    for (let i = 0; i < 730; i++) {
      const n = braMidnightAfter(t);
      assert.ok(n > t);
      assert.notEqual(braDay(n - 1), braDay(n));
      assert.equal((n + braOffsetMs(n)) % (24 * H), 0, "local 00:00:00");
      t = n + 3 * H;
    }
  });
  it("countdown format and msToReset", () => {
    assert.equal(resetCountdown(0), "0:00:00");
    assert.equal(resetCountdown(13 * H + 5 * 60000 + 9000), "13:05:09");
    const t = Date.parse("2026-10-11T09:30:00Z"); // 11:30 CEST
    assert.equal(msToReset(t), 12.5 * H);
  });
  it("clock reply carries day and next reset", () => {
    const now = Date.parse("2026-10-11T09:30:00Z");
    const r = clockReply(now);
    assert.deepEqual(r, { now, day: "2026-10-11", next: Date.parse("2026-10-11T22:00:00Z"), tz: "Europe/Bratislava" });
  });
  it("sync learns the server offset (phone clock moved does not move the day)", async () => {
    setServerOffset(0, false);
    const fake = async () => new Response(JSON.stringify({ now: Date.now() + 26 * H }), { status: 200 });
    assert.equal(await syncServerClock(fake, 0), true);
    assert.ok(Math.abs(serverNow() - Date.now() - 26 * H) < 2000);
    assert.equal(serverDay(), braDay(Date.now() + 26 * H));
    setServerOffset(0, false);
    assert.equal(await syncServerClock(async () => new Response("nope", { status: 500 }), 0), false);
    assert.equal(await syncServerClock(async () => { throw new Error("offline"); }, 0), false);
    assert.ok(Math.abs(serverNow() - Date.now()) < 50);
  });
});
