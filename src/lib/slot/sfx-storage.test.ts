/**
 * Storage URLs for uploaded cues. fetch is replaced; nothing here contacts Supabase.
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { parseCueRows } from "./sfx-cache.ts";
import { SFX_OBJECT_CACHE, sfxObjectPath, sfxPublicUrl, storagePathForRow } from "./sfx-storage.ts";

const HASH = "0123456789abcdef0123456789abcdef";
const PATH = `zbox_scan2/${HASH}.mp3`;
const MP3 = Buffer.from("ID3-fake-mp3-bytes-for-a-custom-upload");

type Hit = { url: string; method: string };
const hits: Hit[] = [];
const store = new Map<string, Response>();

function stub(handler: (hit: Hit) => Response): void {
  const g = globalThis as Record<string, unknown>;
  const ls = new Map<string, string>();
  g.localStorage = {
    getItem: (k: string) => ls.get(k) ?? null,
    setItem: (k: string, v: string) => void ls.set(k, String(v)),
    removeItem: (k: string) => void ls.delete(k),
  };
  g.caches = {
    open: async () => ({
      match: async (url: string) => store.get(url)?.clone(),
      put: async (url: string, res: Response) => void store.set(url, res),
      delete: async (url: string) => store.delete(url),
      keys: async () => [...store.keys()].map((url) => ({ url })),
    }),
  };
  g.fetch = async (url: string, init?: RequestInit) => {
    const hit = { url: String(url), method: init?.method || "GET" };
    hits.push(hit);
    return handler(hit);
  };
}

const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });

let n = 0;
async function freshAudio() {
  n += 1;
  return (await import(`./audio.ts?sfxcdn=${n}`)) as typeof import("./audio.ts");
}

beforeEach(() => {
  hits.length = 0;
  store.clear();
});

describe("versioned storage names", () => {
  it("puts the md5 in the filename", () => {
    const path = sfxObjectPath("zbox_scan2", "0123456789ABCDEF0123456789ABCDEF", "audio/mpeg");
    assert.equal(path, PATH);
    assert.equal(sfxObjectPath("bed", "524c7627642c2d8c122bf0dd7b2bdd21", "audio/flac"), "bed/524c7627642c2d8c122bf0dd7b2bdd21.flac");
    assert.equal(sfxObjectPath("koleso_vo_tax", HASH, "audio/ogg; codecs=opus"), `koleso_vo_tax/${HASH}.ogg`);
    assert.match(SFX_OBJECT_CACHE, /immutable/);
    assert.match(SFX_OBJECT_CACHE, /max-age=31536000/);
  });

  it("public URL is the bucket CDN, with no apikey and no query", () => {
    const url = sfxPublicUrl("https://sfx-test.example/", "bed/524c7627642c2d8c122bf0dd7b2bdd21.flac");
    assert.equal(url, "https://sfx-test.example/storage/v1/object/public/sfx/bed/524c7627642c2d8c122bf0dd7b2bdd21.flac");
    assert.equal(url.includes("?"), false);
    assert.equal(url.includes("apikey"), false);
  });

  it("rejects a path that is not the versioned object, including a stale hash", () => {
    assert.equal(storagePathForRow({ path: "../secret.mp3" }), null);
    assert.equal(storagePathForRow({ path: "https://evil.test/a.mp3" }), null);
    assert.equal(storagePathForRow({ path: "/sfx/bed.mp3" }), null);
    assert.equal(storagePathForRow({ path: "bed/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.flac", v: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }), null);
    assert.equal(
      storagePathForRow({ path: "bed/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.flac", v: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }),
      "bed/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.flac",
    );
  });
});

describe("listing keeps only a safe path", () => {
  it("drops a hostile path and a path whose hash is not v", () => {
    const rows = parseCueRows(
      [
        { key: "zap", mime: "audio/mpeg", v: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", len: 12, path: "zap/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.mp3" },
        { key: "bed", mime: "audio/flac", v: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", len: 20, path: "https://evil.test/x.flac" },
        { key: "zHit", mime: "audio/mpeg", v: HASH, len: 30, path: "zHit/ffffffffffffffffffffffffffffffff.mp3" },
      ],
      () => true,
    );
    assert.equal(rows[0].path, "zap/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.mp3");
    assert.equal(rows[1].path, undefined);
    assert.equal(rows[2].path, undefined);
  });
});

describe("pullCue prefers storage and falls back to sfx_audio", () => {
  const row = { key: "zbox_scan2", mime: "audio/mpeg", v: HASH, len: MP3.length, path: PATH };

  it("GETs the public object, skips sfx_audio, then reads the device cache", async () => {
    stub((hit) => {
      if (hit.url.endsWith("/rpc/sfx_keys2")) return json([row]);
      if (hit.url.includes("/storage/v1/object/public/sfx/")) return new Response(MP3, { status: 200, headers: { "content-type": "audio/mpeg", "cache-control": SFX_OBJECT_CACHE } });
      return new Response("unexpected", { status: 500 });
    });
    let a = await freshAudio();
    await a.listCues();
    assert.equal(a.remotePlan()[0]?.path, PATH);
    assert.equal(a.cueBytesHint(a.remotePlan()[0]), MP3.length);
    await a.pullCue(a.remotePlan()[0]);
    assert.equal(a.sfxNet.downloaded, 1);
    assert.ok(hits.some((h) => h.url.includes(`/storage/v1/object/public/sfx/${PATH}`) && h.method === "GET"));
    assert.ok(!hits.some((h) => h.url.includes("sfx_audio")));
    assert.ok(a.isCustomCue("zbox_scan2"));

    hits.length = 0;
    a = await freshAudio();
    await a.listCues();
    await a.pullCue(a.remotePlan()[0]);
    assert.equal(a.sfxNet.cacheHits, 1);
    assert.ok(!hits.some((h) => h.url.includes("/storage/") || h.url.includes("sfx_audio")));
  });

  it("a missing object falls back to sfx_audio", async () => {
    stub((hit) => {
      if (hit.url.endsWith("/rpc/sfx_keys2")) return json([row]);
      if (hit.url.includes("/storage/")) return new Response("", { status: 404 });
      if (hit.url.includes("sfx_audio")) return json(MP3.toString("base64"));
      return new Response("unexpected", { status: 500 });
    });
    const a = await freshAudio();
    await a.listCues();
    await a.pullCue(a.remotePlan()[0]);
    assert.equal(a.sfxNet.downloaded, 1);
    assert.ok(hits.some((h) => h.url.includes("sfx_audio")));
    assert.ok(a.isRecordedCue("zbox_scan2"));
  });

  it("a path whose hash is not the listing md5 is ignored", async () => {
    stub((hit) => {
      if (hit.url.endsWith("/rpc/sfx_keys2")) return json([{ ...row, path: "zbox_scan2/ffffffffffffffffffffffffffffffff.mp3" }]);
      if (hit.url.includes("sfx_audio")) return json(MP3.toString("base64"));
      return new Response("unexpected", { status: 500 });
    });
    const a = await freshAudio();
    await a.listCues();
    assert.equal(a.remotePlan()[0]?.path, undefined);
    assert.ok(a.cueBytesHint(a.remotePlan()[0]) > MP3.length);
    await a.pullCue(a.remotePlan()[0]);
    assert.ok(!hits.some((h) => h.url.includes("/storage/")));
    assert.ok(hits.some((h) => h.url.includes("sfx_audio")));
  });

  it("no path at all still uses sfx_audio only", async () => {
    stub((hit) => {
      if (hit.url.endsWith("/rpc/sfx_keys2")) return json([{ key: "zbox_scan2", mime: "audio/mpeg", v: HASH, len: MP3.length }]);
      if (hit.url.includes("sfx_audio")) return json(MP3.toString("base64"));
      return new Response("unexpected", { status: 500 });
    });
    const a = await freshAudio();
    await a.listCues();
    await a.pullCue(a.remotePlan()[0]);
    assert.ok(!hits.some((h) => h.url.includes("/storage/")));
    assert.equal(hits.filter((h) => h.url.includes("sfx_audio")).length, 1);
  });
});
