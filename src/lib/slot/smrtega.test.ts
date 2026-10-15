import { test } from "node:test";
import assert from "node:assert/strict";
import { egoAdminVisible, egoAttention, egoBanner, egoDeltaTone, egoExpires, egoFee, egoLiveBoard, egoLiveScore, egoMissing, egoScore, egoSnapshot, egoStripLine, egoWeekEnd, egoWeekStart, egoWinner, EGO_REPORT_EVERY, type EgoState } from "./smrtega.ts";
import { egoClaim, egoCurrent, egoJoin, parseEgoState, setEgoFetcher } from "./smrtega-api.ts";
import { handleEgoAdmin, type EgoAdminDeps } from "./smrtega-admin.server.ts";

test("fee: 2.5 % rounded to 50, clamped 500..2500", () => {
  assert.equal(egoFee(50_000), 1250);
  assert.equal(egoFee(3_500), 500);
  assert.equal(egoFee(46_000), 1150);
  assert.equal(egoFee(500_000), 2500);
  assert.equal(egoFee(0), 500);
});

test("join needs NEKONEČNO and RP − fee ≥ 2700", () => {
  assert.equal(egoMissing(2_000), 700);
  assert.equal(egoMissing(3_000), 200);
  assert.equal(egoMissing(3_200), 0);
  assert.equal(egoMissing(60_000), 0);
});

test("score is net RP since join (fee included, losses count)", () => {
  assert.equal(egoScore(50_000 - 1250 + 8420, 50_000), 7170);
  assert.equal(egoScore(40_000, 50_000), -10_000);
});

const iso = (ms: number) => new Date(ms).toISOString();

test("window: Monday 01:00 Bratislava, DST-safe", () => {
  // Thu 15. 10. 2026 19:06 CEST → week from Mon 12. 10. 01:00 CEST (= 11. 10. 23:00Z)
  const now = Date.parse("2026-10-15T17:06:00Z");
  assert.equal(iso(egoWeekStart(now)), "2026-10-11T23:00:00.000Z");
  assert.equal(iso(egoWeekEnd(now)), "2026-10-18T23:00:00.000Z");
  // Mon 00:30 local still belongs to the previous week
  assert.equal(iso(egoWeekStart(Date.parse("2026-10-18T22:30:00Z"))), "2026-10-11T23:00:00.000Z");
  assert.equal(iso(egoWeekStart(Date.parse("2026-10-18T23:00:00Z"))), "2026-10-18T23:00:00.000Z");
  // 19. 10. → 26. 10. 2026 has 169 h (clocks back 25. 10.)
  const s = egoWeekStart(Date.parse("2026-10-21T12:00:00Z"));
  assert.equal((egoWeekEnd(s) - s) / 3_600_000, 169);
  assert.equal(iso(egoWeekEnd(s)), "2026-10-26T00:00:00.000Z");
  // 22. 3. → 29. 3. 2027 has 167 h
  const s2 = egoWeekStart(Date.parse("2027-03-24T12:00:00Z"));
  assert.equal((egoWeekEnd(s2) - s2) / 3_600_000, 167);
});

test("28 days on local wall clock", () => {
  const d = Date.parse("2026-10-19T07:30:00Z"); // Mon 09:30 CEST
  assert.equal(iso(egoExpires(d)), "2026-11-16T08:30:00.000Z"); // Mon 09:30 CET
});

test("winner: Martin 1st → runner-up wins; hard flag skipped; soft flag still wins", () => {
  const e = [
    { id: "martin", score: 9000, reachedAt: 1, fee: 1250, admin: true },
    { id: "cheat", score: 8000, reachedAt: 1, fee: 500, hard: true },
    { id: "palica", score: 5000, reachedAt: 5, fee: 500 },
    { id: "samo", score: 5000, reachedAt: 3, fee: 500 },
  ];
  assert.equal(egoWinner(e)?.id, "samo"); // tie → earlier reached
  assert.equal(egoWinner(e, new Set(["samo"]))?.id, "palica");
  assert.equal(egoWinner([{ id: "x", score: -1, reachedAt: 0, fee: 500 }, { id: "y", score: -5, reachedAt: 0, fee: 500 }]), null);
  assert.equal(egoWinner([{ id: "solo", score: 400, reachedAt: 0, fee: 500 }]), null);
  assert.equal(egoWinner([{ id: "solo", score: 600, reachedAt: 0, fee: 500 }])?.id, "solo");
});

const st = (o: Partial<EgoState>): EgoState => ({
  weekStart: 0, weekEnd: 2 * 86_400_000 + 5 * 3_600_000, now: 0, players: 2, top: [], me: null, leader: null, prize: null, lastWinner: null, ...o,
});

test("score tone and admin link stay client-side", () => {
  assert.equal(egoDeltaTone(12), "up");
  assert.equal(egoDeltaTone(-1), "down");
  assert.equal(egoDeltaTone(0), "flat");
  assert.equal(egoAdminVisible(false, "", false), false);
  assert.equal(egoAdminVisible(false, "   ", false), false);
  assert.equal(egoAdminVisible(true, null, false), true);
  assert.equal(egoAdminVisible(false, "tok", false), true);
  assert.equal(egoAdminVisible(false, null, true), true);
});

test("live score moves with RP since the last report and re-sorts the visible board", () => {
  assert.equal(EGO_REPORT_EVERY, 5);
  assert.equal(egoLiveScore(500, 10_050, 10_000), 550);
  assert.equal(egoLiveScore(500, 9_900, 10_000), 400);
  assert.equal(egoLiveScore(-500, 9_500, null), -500);
  const top = [
    { nick: "A", score: 100, admin: false },
    { nick: "Ja", score: 50, admin: false },
    { nick: "B", score: 40, admin: false },
  ];
  const me = { score: 50, place: 2, admin: false };
  const up = egoLiveBoard(top, me, 90, "Ja");
  assert.equal(up.place, 2);
  assert.deepEqual(up.top.map((t) => [t.nick, t.score, Boolean(t.mine)]), [
    ["A", 100, false],
    ["Ja", 90, true],
    ["B", 40, false],
  ]);
  const lead = egoLiveBoard(top, me, 110, "Ja");
  assert.equal(lead.place, 1);
  assert.equal(lead.top[0]?.nick, "Ja");
  const tied = egoLiveBoard(top, me, 100, "Ja");
  assert.equal(tied.place, 2);
  assert.equal(tied.top[0]?.nick, "A");
  const crowd = Array.from({ length: 10 }, (_, i) => ({ nick: `P${i}`, score: 200 - i, admin: false }));
  const still = egoLiveBoard(crowd, { score: 50, place: 15, admin: false }, 60, "Ja");
  assert.equal(still.place, 15);
  assert.equal(still.top.some((t) => t.mine), false);
  const climb = egoLiveBoard(crowd, { score: 50, place: 15, admin: false }, 196, "Ja");
  assert.equal(climb.place, 6);
  assert.equal(climb.top.filter((t) => t.mine).length, 1);
  assert.equal(climb.top.length, 10);
});

test("trophy badge: not entered, place change, prize — not a score tick", () => {
  const open = st({ weekStart: 0, weekEnd: 100, me: null });
  const joined = st({
    weekStart: 0,
    weekEnd: 100,
    me: { joined: true, score: 100, place: 2, fee: 500, admin: false },
  });
  assert.equal(egoAttention(null, 50_000, 0, null), false);
  assert.equal(egoAttention(open, 50_000, 10, null), true);
  assert.equal(egoAttention(open, 2_000, 10, null), false);
  const seenOpen = egoSnapshot(open);
  assert.equal(egoAttention(open, 50_000, 10, seenOpen), true);
  assert.equal(egoAttention(joined, 50_000, 10, null), true);
  assert.equal(egoAttention(joined, 50_000, 10, egoSnapshot(joined)), false);
  const moved = st({
    weekStart: 0,
    weekEnd: 100,
    me: { joined: true, score: 9_000, place: 1, fee: 500, admin: false },
  });
  assert.equal(egoAttention(moved, 50_000, 10, egoSnapshot(joined)), true);
  const richer = st({
    weekStart: 0,
    weekEnd: 100,
    me: { joined: true, score: 9_000, place: 2, fee: 500, admin: false },
  });
  assert.equal(egoAttention(richer, 50_000, 10, egoSnapshot(joined)), false);
  assert.equal(egoAttention(st({ weekStart: 0, weekEnd: 100, me: null }), 50_000, 100, null), false);
  const prize = st({ prize: { status: "pending", deliveredAt: null, expiresAt: null }, me: { joined: true, score: 1, place: 1, fee: 500, admin: false } });
  assert.equal(egoAttention(prize, 100, 10, egoSnapshot(joined)), true);
  assert.equal(egoAttention(prize, 100, 10, egoSnapshot(prize)), false);
  const awarded = st({ prize: { status: "awarded", deliveredAt: 1, expiresAt: 50 }, me: prize.me });
  assert.equal(egoAttention(awarded, 100, 10, egoSnapshot(prize)), true);
  assert.equal(egoAttention(awarded, 100, 50, egoSnapshot(prize)), false);
});

test("banner texts", () => {
  assert.match(egoBanner(st({}), 50_000, 0), /vstupné 1250 RP · končí o 2 d 05 h/);
  assert.match(egoBanner(null, 2_060, 0), /od NEKONEČNA · chýba ti 640 RP/);
  assert.match(egoBanner(st({ me: { joined: true, score: 8420, place: 2, fee: 1250, admin: false }, leader: { nick: "Palica360", score: 11060 } }), 0, 0), /si 2\. · \+8\u00a0420 RP · líder Palica360 \+11\u00a0060/);
  assert.match(
    egoBanner(st({ me: { joined: true, score: 9000, place: 1, fee: 1250, admin: true }, top: [{ nick: "Martin", score: 9000, admin: true }, { nick: "Palica360", score: 100, admin: false }] }), 0, 0),
    /si 1\. \(bez nároku\) · cenu má zatiaľ Palica360/,
  );
  assert.equal(egoBanner(st({ prize: { status: "pending", deliveredAt: null, expiresAt: null } }), 0, 0), "vyhral si · kód sa pripravuje");
});

test("strip line is one sequence, title once", () => {
  const line = egoStripLine(
    st({ players: 517, me: { joined: true, score: 10, place: 1, fee: 500, admin: false } }),
    0,
    0,
  );
  assert.equal(line, "517 · končí o 2 d 05 h · SMRŤ EGA · si 1. · +10 RP");
  assert.equal(line.split("SMRŤ EGA").length - 1, 1);
  assert.equal(egoStripLine(null, 0, 0), "SMRŤ EGA · od NEKONEČNA · chýba ti 2\u00a0700 RP");
});

test("api goes through injected fetcher only (mock, no production)", async () => {
  const calls: string[] = [];
  setEgoFetcher(async (url, init) => {
    calls.push(`${url.split("/rpc/")[1]} ${String(init?.body)}`);
    const name = url.split("/rpc/")[1];
    const body = name === "ego_current"
      ? { week_start: "2026-10-11T23:00:00Z", week_end: "2026-10-18T23:00:00Z", now: "2026-10-15T17:00:00Z", players: 1, top: [{ nick: "A", score: "5" }], me: null, prize: { status: "awarded", expires_at: "2026-11-16T08:30:00Z" } }
      : name === "ego_join" ? { ok: true, fee: 1250 } : { code: "ABCD1234", expires_at: "2026-11-16T08:30:00Z" };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
  const s = await egoCurrent("device-123456");
  assert.equal(s.weekEnd, Date.parse("2026-10-18T23:00:00Z"));
  assert.equal(s.top[0].score, 5);
  assert.equal(s.prize?.status, "awarded");
  assert.deepEqual(await egoJoin("device-123456", "Nick", { rp: 50_000, spins: 10, wagered: 5 }, "a".repeat(64)), { ok: true, fee: 1250, error: undefined });
  assert.equal((await egoClaim("device-123456", "s")).code, "ABCD1234");
  assert.equal(calls.length, 3);
  assert.equal(parseEgoState(null).prize, null);
});

const deps = (over: Partial<EgoAdminDeps> = {}): EgoAdminDeps & { seen: string[] } => {
  const seen: string[] = [];
  return {
    seen,
    identify: async () => ({ sub: "1", email: "martin@example.sk", name: "M", teamId: null }),
    admins: () => ["martin@example.sk"],
    serviceKey: () => "service-key",
    adminToken: () => undefined,
    supaUrl: () => "https://mock.invalid",
    fetcher: async (url, init) => {
      seen.push(`${url} ${String(init?.body)}`);
      return Response.json({ ok: true });
    },
    ...over,
  };
};

test("admin endpoint: only ADMIN_EMAILS or token, write-only code", async () => {
  const d = deps();
  const r = await handleEgoAdmin(new Request("http://x/api/smrtega-admin", { method: "POST", body: JSON.stringify({ action: "code", slot: 2, code: " K3Y-9 " }) }), d);
  assert.equal(r.status, 200);
  assert.match(d.seen[0], /ego_admin_code \{"p_slot":2,"p_code":"K3Y-9"\}/);
  const no = await handleEgoAdmin(new Request("http://x/api/smrtega-admin"), deps({ identify: async () => ({ sub: "2", email: "x@y.sk", name: null, teamId: null }) }));
  assert.equal(no.status, 403);
  const tok = "t".repeat(32);
  const ok = deps({ identify: async () => null, adminToken: () => tok });
  const r2 = await handleEgoAdmin(new Request("http://x/api/smrtega-admin", { headers: { "x-ego-admin-token": tok } }), ok);
  assert.equal(r2.status, 200);
  assert.match(ok.seen[0], /ego_admin_state/);
  const bad = await handleEgoAdmin(new Request("http://x/api/smrtega-admin", { method: "POST", body: JSON.stringify({ action: "code", slot: 5, code: "abcd" }) }), deps());
  assert.equal(bad.status, 400);
});
