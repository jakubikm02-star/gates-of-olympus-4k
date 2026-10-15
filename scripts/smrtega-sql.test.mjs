// SMRŤ EGA migration against an in-memory PGLite (never the production Supabase).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const sql = await readFile(new URL("../supabase/migrations/20261015_smrtega.sql", import.meta.url), "utf8");

async function fresh() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema extensions; create extension pgcrypto schema extensions;
    create schema vault; create table vault.decrypted_secrets (name text, decrypted_secret text);
    insert into vault.decrypted_secrets values ('smrtega_key', 'test-only-key');
  `);
  await db.exec(sql);
  return db;
}
const one = async (db, q, p = []) => (await db.query(q, p)).rows[0];
const j = async (db, q, p = []) => Object.values(await one(db, q, p))[0];
const hash = (s) => `encode(extensions.digest('${s}', 'sha256'), 'hex')`;

test("week start Monday 01:00 Bratislava and DST lengths", async () => {
  const db = await fresh();
  const r = await one(db, `select (ego_week_start('2026-10-15T17:06:00Z') at time zone 'UTC')::text a,
    extract(epoch from ego_week_end(ego_week_start('2026-10-21T12:00:00Z')) - ego_week_start('2026-10-21T12:00:00Z'))/3600 h1,
    extract(epoch from ego_week_end(ego_week_start('2027-03-24T12:00:00Z')) - ego_week_start('2027-03-24T12:00:00Z'))/3600 h2,
    ego_fee(50000) f1, ego_fee(3500) f2, ego_fee(500000) f3`);
  assert.match(r.a, /^2026-10-11 23:00:00/);
  assert.equal(Number(r.h1), 169);
  assert.equal(Number(r.h2), 167);
  assert.deepEqual([r.f1, r.f2, r.f3], [1250, 500, 2500]);
});

test("join, report, settle with Martin 1st, pending → delivered on code, claim, revoke", async () => {
  const db = await fresh();
  // join rules
  let r = await j(db, `select ego_join('player-low-1', 'Low', 3000, 0, 0, ${hash("x")})`);
  assert.equal(r.ok, false);
  r = await j(db, `select ego_join('martin-dev-1', 'Martin', 50000, 100, 50, ${hash("m")})`);
  assert.deepEqual(r, { ok: true, fee: 1250 });
  r = await j(db, `select ego_join('martin-dev-1', 'Martin', 50000, 100, 50, ${hash("m")})`);
  assert.equal(r.error, "joined");
  await j(db, `select ego_join('palica-dev-1', 'Palica360', 20000, 10, 5, ${hash("p")})`);
  await j(db, `select ego_join('cheat-dev-01', 'Cheat', 20000, 10, 5, ${hash("c")})`);
  await j(db, `select ego_admin_player('martin-dev-1', 'Martin', true)`);
  // reports: Martin +9000 net, Palica +3000, Cheat jumps 50k with 1 spin → hard flag
  await db.query(`select ego_report('martin-dev-1', 59000, 2000, 900)`);
  await db.query(`select ego_report('palica-dev-1', 23000, 400, 200)`);
  await db.query(`select ego_report('cheat-dev-01', 90000, 11, 6)`);
  const cur = await j(db, `select ego_current('palica-dev-1')`);
  assert.equal(cur.players, 3);
  assert.equal(cur.top[0].admin, true);
  assert.equal(cur.leader.nick, "Palica360");
  assert.equal(cur.me.score, 3000);
  const hard = await one(db, `select hard_flag from ego_entry where player_id = 'cheat-dev-01'`);
  assert.equal(hard.hard_flag, true);
  // end the week: move it into the past
  await db.exec(`
    alter table ego_entry drop constraint ego_entry_week_start_fkey;
    update ego_entry set week_start = week_start - interval '7 days';
    update ego_week set week_start = week_start - interval '7 days', week_end = week_end - interval '7 days';
    alter table ego_entry add foreign key (week_start) references ego_week (week_start);`);
  await db.query(`select ego_settle()`);
  const w = await one(db, `select status, winner_id from ego_week order by week_start limit 1`);
  assert.deepEqual(w, { status: "settled", winner_id: "palica-dev-1" });
  let prize = (await j(db, `select ego_current('palica-dev-1')`)).prize;
  assert.equal(prize.status, "pending");
  // admin pastes the key → delivered now, 28 days
  r = await j(db, `select ego_admin_code(2::smallint, 'PAIR-KEY-42')`);
  assert.deepEqual(r, { ok: true, delivered: true });
  prize = (await j(db, `select ego_current('palica-dev-1')`)).prize;
  assert.equal(prize.status, "awarded");
  const days = await one(db, `select round(extract(epoch from expires_at - delivered_at)/86400) d from ego_award`);
  assert.ok([28].includes(Number(days.d)));
  // wrong secret / other player cannot claim
  assert.equal((await j(db, `select ego_claim('palica-dev-1', 'nope')`)).error, "secret");
  assert.equal((await j(db, `select ego_claim('martin-dev-1', 'm')`)).error, "none");
  assert.equal((await j(db, `select ego_claim('palica-dev-1', 'p')`)).code, "PAIR-KEY-42");
  // admin state never returns the key
  const adm = JSON.stringify(await j(db, `select ego_admin_state()`));
  assert.ok(!adm.includes("PAIR-KEY-42"));
  // slot not empty → second key refused; removal refused while live
  assert.equal((await j(db, `select ego_admin_code(2::smallint, 'OTHER')`)).error, "slot_not_empty");
  assert.equal((await j(db, `select ego_confirm_removed(2::smallint)`)).error, "live");
  // revoke + reassign: Martin and the hard-flagged player are skipped → nobody
  const aid = (await one(db, `select id from ego_award`)).id;
  r = await j(db, `select ego_revoke(${aid}, true)`);
  assert.equal(r.ok, true);
  assert.equal(r.next, null);
  assert.equal((await j(db, `select ego_current('palica-dev-1')`)).prize.status, "revoked");
  assert.equal((await j(db, `select ego_confirm_removed(2::smallint)`)).ok, true);
  // anon cannot call admin functions
  const g = await one(db, `select has_function_privilege('anon', 'ego_admin_code(smallint,text)', 'execute') a,
    has_function_privilege('anon', 'ego_current(text)', 'execute') b,
    has_table_privilege('anon', 'ego_code', 'select') c`);
  assert.deepEqual(g, { a: false, b: true, c: false });
});

test("void week when everyone is negative; key entered ahead is kept ready", async () => {
  const db = await fresh();
  await j(db, `select ego_admin_code(1::smallint, 'AHEAD-1')`);
  await j(db, `select ego_join('a-player-01', 'A', 20000, 0, 0, ${hash("a")})`);
  await j(db, `select ego_join('b-player-01', 'B', 20000, 0, 0, ${hash("b")})`);
  await db.exec(`
    alter table ego_entry drop constraint ego_entry_week_start_fkey;
    update ego_entry set week_start = week_start - interval '7 days';
    update ego_week set week_start = week_start - interval '7 days', week_end = week_end - interval '7 days';
    alter table ego_entry add foreign key (week_start) references ego_week (week_start);`);
  await db.query(`select ego_settle()`);
  assert.equal((await one(db, `select status from ego_week order by week_start limit 1`)).status, "void");
  assert.equal((await one(db, `select status from ego_code where slot = 1`)).status, "ready");
  // settle is idempotent
  await db.query(`select ego_settle()`);
  assert.equal(Number((await one(db, `select count(*) n from ego_week`)).n), 2);
});
