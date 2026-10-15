// Upload script + migration. Fetch is injected. The production project is never requested.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PROD_HOST, SFX_OBJECT_CACHE, assertUploadEnv, decodeBytea, sfxObjectPath, uploadSfxCues } from "./sfx-storage.mjs";

const FAKE = "https://sfx-test.example";
const ROLE = "test-role-not-a-real-key";

test("object names match the client (key/md5.ext)", () => {
  const hash = "0123456789abcdef0123456789abcdef";
  assert.equal(sfxObjectPath("zbox_scan2", "0123456789ABCDEF0123456789ABCDEF", "audio/mpeg"), `zbox_scan2/${hash}.mp3`);
  assert.equal(sfxObjectPath("bed", "524c7627642c2d8c122bf0dd7b2bdd21", "audio/flac"), "bed/524c7627642c2d8c122bf0dd7b2bdd21.flac");
  assert.equal(sfxObjectPath("koleso_vo_tax", hash, "audio/ogg; codecs=opus"), `koleso_vo_tax/${hash}.ogg`);
  assert.equal(SFX_OBJECT_CACHE, "public, max-age=31536000, immutable");
});

test("hex and base64 bytea decode to the same bytes", () => {
  const buf = Buffer.from("ID3-hello-sfx!!");
  assert.deepEqual(decodeBytea("\\x" + buf.toString("hex")), buf);
  assert.deepEqual(decodeBytea(buf.toString("base64")), buf);
  assert.equal(decodeBytea(null).length, 0);
});

test("missing env never calls fetch", async () => {
  let n = 0;
  const fetchImpl = () => {
    n += 1;
    return Promise.reject(new Error("called"));
  };
  await assert.rejects(() => uploadSfxCues({ env: {}, fetchImpl }), /SUPABASE_SERVICE_ROLE_KEY/);
  await assert.rejects(
    () => uploadSfxCues({ env: { SUPABASE_URL: FAKE, SUPABASE_SERVICE_ROLE_KEY: ROLE }, fetchImpl }),
    /SFX_UPLOAD_CONFIRM/,
  );
  assert.throws(() => assertUploadEnv({ SUPABASE_URL: "not a url", SUPABASE_SERVICE_ROLE_KEY: ROLE, SFX_UPLOAD_CONFIRM: "yes" }), /not a URL/);
  assert.equal(n, 0);
});

test("production host is refused unless the CLI opts in, and fetch is not called", async () => {
  let n = 0;
  await assert.rejects(
    () =>
      uploadSfxCues({
        env: { SUPABASE_URL: `https://${PROD_HOST}`, SUPABASE_SERVICE_ROLE_KEY: ROLE, SFX_UPLOAD_CONFIRM: "yes" },
        fetchImpl: () => {
          n += 1;
          return Promise.reject(new Error("called"));
        },
      }),
    /Refusing/,
  );
  assert.equal(n, 0);
  assert.match(PROD_HOST, /xgpnmxkquxzbhgktjipa/);
});

test("uploads one cue to the fake host, sets immutable cache, patches path", async () => {
  const bytes = Buffer.from("ID3-fake-mp3-bytes-for-a-custom-upload");
  const hash = createHash("md5").update(bytes).digest("hex");
  const path = sfxObjectPath("zHit", hash, "audio/mpeg");
  const seen = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    assert.equal(u.includes(PROD_HOST), false, u);
    seen.push({ u, method: init.method || "GET" });
    if (u.includes("select=key,mime")) return Response.json([{ key: "zHit", mime: "audio/mpeg", md5: hash, path: null }]);
    if (u.includes("select=bytes")) return Response.json([{ mime: "audio/mpeg", md5: hash, path: null, bytes: "\\x" + bytes.toString("hex") }]);
    if ((init.method || "GET") === "HEAD") return new Response(null, { status: 404 });
    if (u.includes("/storage/v1/object/sfx/") && init.method === "POST") {
      assert.equal(init.headers["cache-control"], SFX_OBJECT_CACHE);
      assert.equal(init.headers["x-upsert"], "true");
      assert.equal(init.headers.authorization, `Bearer ${ROLE}`);
      assert.deepEqual(Buffer.from(init.body), bytes);
      assert.match(u, new RegExp(`/zHit/${hash}\\.mp3$`));
      return new Response("{}", { status: 200 });
    }
    if (init.method === "PATCH") {
      assert.deepEqual(JSON.parse(init.body), { path });
      return new Response(null, { status: 204 });
    }
    return new Response("unexpected " + u, { status: 500 });
  };
  const summary = await uploadSfxCues({
    env: { SUPABASE_URL: FAKE, SUPABASE_SERVICE_ROLE_KEY: ROLE, SFX_UPLOAD_CONFIRM: "yes" },
    fetchImpl,
  });
  assert.deepEqual(summary, { uploaded: 1, skipped: 0, patched: 1, empty: 0 });
  assert.equal(seen.some((s) => s.u.includes(PROD_HOST)), false);
});

test("an object already at key/md5.ext is not uploaded again", async () => {
  const bytes = Buffer.from("ID3-fake-mp3-bytes-for-a-custom-upload");
  const hash = createHash("md5").update(bytes).digest("hex");
  const path = sfxObjectPath("bed", hash, "audio/flac");
  let posts = 0;
  const fetchImpl = async (url, init = {}) => {
    assert.equal(String(url).includes(PROD_HOST), false);
    if (String(url).includes("select=key,mime")) return Response.json([{ key: "bed", mime: "audio/flac", md5: hash, path }]);
    if (String(url).includes("select=bytes")) return Response.json([{ bytes: bytes.toString("base64"), mime: "audio/flac", md5: hash, path }]);
    if ((init.method || "GET") === "HEAD") return new Response(null, { status: 200 });
    if (init.method === "POST") posts += 1;
    return new Response("no", { status: 500 });
  };
  const summary = await uploadSfxCues({
    env: { SUPABASE_URL: FAKE, SUPABASE_SERVICE_ROLE_KEY: ROLE, SFX_UPLOAD_CONFIRM: "yes" },
    fetchImpl,
  });
  assert.equal(summary.skipped, 1);
  assert.equal(summary.uploaded, 0);
  assert.equal(posts, 0);
});

test("empty bytes are skipped", async () => {
  const fetchImpl = async (url, init = {}) => {
    assert.equal(String(url).includes(PROD_HOST), false);
    if (String(url).includes("select=key,mime")) return Response.json([{ key: "zap", mime: "audio/mpeg", md5: null, path: null }]);
    if (String(url).includes("select=bytes")) return Response.json([{ bytes: "\\x", mime: "audio/mpeg", path: null }]);
    if ((init.method || "GET") === "HEAD" || init.method === "POST" || init.method === "PATCH") {
      throw new Error("should not touch storage for an empty cue");
    }
    return new Response("no", { status: 500 });
  };
  const summary = await uploadSfxCues({
    env: { SUPABASE_URL: FAKE, SUPABASE_SERVICE_ROLE_KEY: ROLE, SFX_UPLOAD_CONFIRM: "yes" },
    fetchImpl,
  });
  assert.equal(summary.empty, 1);
  assert.equal(summary.uploaded, 0);
});

test("the CLI does not upload on import", async () => {
  let n = 0;
  const orig = globalThis.fetch;
  globalThis.fetch = () => {
    n += 1;
    return Promise.reject(new Error("network"));
  };
  try {
    await import("./upload-sfx-storage.mjs");
  } finally {
    globalThis.fetch = orig;
  }
  assert.equal(n, 0);
});

const sql = await readFile(new URL("../supabase/migrations/20261015_sfx_storage.sql", import.meta.url), "utf8");

test("migration SQL adds the bucket, a read policy and path, and does not drop bytes", () => {
  assert.match(sql, /insert into storage\.buckets/i);
  assert.match(sql, /'sfx', 'sfx', true/);
  assert.match(sql, /sfx_public_read/);
  assert.match(sql, /for select/i);
  assert.match(sql, /to anon, authenticated/i);
  assert.match(sql, /add column if not exists path text/);
  assert.match(sql, /sfx_keys2/);
  assert.match(sql, /c\.path/);
  assert.doesNotMatch(sql, /drop column/i);
  assert.doesNotMatch(sql, /drop table/i);
  assert.doesNotMatch(sql, /for insert/i);
  assert.doesNotMatch(sql, /for update/i);
  assert.doesNotMatch(sql, /for delete/i);
  assert.doesNotMatch(sql, /xgpnmxkquxzbhgktjipa/);
  assert.doesNotMatch(sql, /service_role/);
});

test("migration applies twice on a stub and still serves bytes plus path", async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema storage;
    create table storage.buckets (
      id text primary key,
      name text not null,
      public boolean default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects (
      id bigint generated always as identity primary key,
      bucket_id text,
      name text
    );
    create table public.sfx_cue (
      key text primary key,
      mime text,
      bytes bytea not null
    );
  `);
  await db.exec(sql);
  await db.exec(sql);
  const bucket = (await db.query("select public, file_size_limit from storage.buckets where id = 'sfx'")).rows[0];
  assert.equal(bucket.public, true);
  assert.equal(Number(bucket.file_size_limit), 52428800);
  await db.query("insert into public.sfx_cue (key, mime, bytes) values ('zap', 'audio/mpeg', '\\x4944332d6869')");
  const listed = (await db.query("select key, v, len, path from public.sfx_keys2()")).rows[0];
  assert.equal(listed.key, "zap");
  assert.equal(listed.path, null);
  assert.match(listed.v, /^[a-f0-9]{32}$/);
  assert.equal(Number(listed.len), 6);
  await db.query("update public.sfx_cue set path = 'zap/' || md5 || '.mp3' where key = 'zap'");
  const again = (await db.query("select path from public.sfx_keys2()")).rows[0];
  assert.match(again.path, /^zap\/[a-f0-9]{32}\.mp3$/);
  const still = (await db.query("select octet_length(bytes)::int n from public.sfx_cue")).rows[0];
  assert.equal(still.n, 6);
});
