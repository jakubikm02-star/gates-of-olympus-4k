/**
 * Uploaded sounds vs the files shipped in public/sfx/pack/ (Supabase stubbed: fetch, localStorage, Cache Storage).
 *
 * Regression: since the static-pack change an upload byte-identical to the shipped file goes to `shippedSame`, never
 * to `custom`, but every "own sound, else synth" branch (playOwn / ownCue) still asked `custom.has`. Result on
 * production: the Ž-BOX scans 1–4 and beep, the ZÁSAH one-shots and MASÍVNA played synth beeps / fallbacks although
 * Martin's recordings were loaded. A listing without md5 also assumed every /sfx/pack/ slot was unchanged and hid
 * re-uploads.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it, beforeEach } from "node:test";
import { publicAssets } from "../../../scripts/park-assets-plugin.mjs";

const ROOT = new URL("../../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, ROOT), "utf8");
const assets = publicAssets(new URL(".", ROOT).pathname);

/** sfx_cue in production (SELECT key, md5, octet_length(bytes) — 2026-10-11 16:5x CEST). */
const PROD: [string, string, number][] = [
  ["zbox_scan4", "874415141db4f51b7ceb44bb4339d921", 158445],
  ["zbox_scan3", "66e5e3945ce66dfe0538e517eee0b9c4", 15405],
  ["zbox_scan2", "e1f8a0bb8e835ddba1be56f802cd7b10", 15405],
  ["zbox_scan", "f7489bb46f1ed5958d0bc6fce3f0e65b", 19245],
  ["zTax", "0d402411f4f5a63d660bbf1bf57aeb00", 89905],
  ["zbox_full", "4cb39ba2d868d23cc0894f1daf4355bb", 233325],
  ["zbox_open", "5a1bf0b68fe1b3ec75b185b709b446af", 37485],
  ["zbox_beep", "460024f6a139552fd2ef62730f0b81a5", 73965],
  ["bed", "524c7627642c2d8c122bf0dd7b2bdd21", 19132503],
  ["massive", "e98a590234c4cc6367e00708bf909c84", 2698321],
  ["zStart", "50ae3b822a45adde23b8ef790162753c", 48527],
  ["zHit", "80ef844f0759db2319a9f0874df3da24", 150862],
  ["ticketOk", "4cb39ba2d868d23cc0894f1daf4355bb", 233325],
];

type Rpc = (name: string, body: Record<string, unknown>) => Response;
let rpc: Rpc;
const calls: string[] = [];
const store = new Map<string, Response>();

function stubGlobals(): void {
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
    const name = String(url).split("/rpc/")[1] ?? String(url);
    calls.push(name);
    return rpc(name, init?.body ? JSON.parse(String(init.body)) : {});
  };
}

const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
const keys2 = (rows: [string, string, number][]) => rows.map(([key, v, len]) => ({ key, mime: "audio/mpeg", v, len }));
const B64 = Buffer.from("ID3-fake-mp3-bytes-for-a-custom-upload").toString("base64");

let n = 0;
/** A fresh audio.ts (module state: listing, sets) per test. */
async function freshAudio() {
  n += 1;
  const mod = await import(`./audio.ts?case=${n}`);
  mod.setShippedSfx(assets.md5, assets.sizes);
  return mod as typeof import("./audio.ts");
}

beforeEach(() => {
  calls.length = 0;
  stubGlobals();
});

describe("uploads vs shipped pack files", () => {
  it("production listing: every upload equals its shipped file, so none is downloaded and all count as recordings", async () => {
    rpc = (name) => (name === "sfx_keys2" ? json(keys2(PROD)) : json("", 500));
    const a = await freshAudio();
    const rows = await a.listCues();
    assert.equal(rows?.length, PROD.length);
    assert.deepEqual(a.remotePlan(), [], "nothing to download");
    for (const [key] of PROD) {
      assert.ok(a.isCustomCue(key), `${key} shown as uploaded`);
      assert.ok(a.isRecordedCue(key), `${key} plays as a recording, not synth`);
    }
    // ...and the shipped files of those slots are preloaded before HRAŤ.
    const plan = new Set(a.builtinPlan().map((b) => b.key));
    for (const k of ["zbox_scan", "zbox_scan2", "zbox_scan3", "zbox_scan4", "zbox_beep", "zStart", "massive"]) assert.ok(plan.has(k), k);
    assert.ok(!calls.includes("sfx_audio"));
  });

  it("a different upload on a pack slot overrides the shipped file, is downloaded once and then read by md5 from Cache Storage", async () => {
    const changed: [string, string, number][] = [["zbox_scan2", "0123456789abcdef0123456789abcdef", 999]];
    rpc = (name, body) => (name === "sfx_keys2" ? json(keys2(changed)) : name === "sfx_audio" && body.p_key === "zbox_scan2" ? json(B64) : json(null, 404));
    let a = await freshAudio();
    await a.listCues();
    assert.deepEqual(a.remotePlan().map((r) => r.key), ["zbox_scan2"]);
    assert.ok(!a.builtinPlan().some((b) => b.key === "zbox_scan2"), "the shipped zbox_scan2.mp3 is not used");
    await a.pullCue(a.remotePlan()[0]);
    assert.equal(a.sfxNet.downloaded, 1);
    assert.ok(a.isCustomCue("zbox_scan2") && a.isRecordedCue("zbox_scan2"));
    // next visit: same md5 → Cache Storage, no download
    calls.length = 0;
    a = await freshAudio();
    await a.listCues();
    await a.pullCue(a.remotePlan()[0]);
    assert.equal(a.sfxNet.cacheHits, 1);
    assert.ok(!calls.includes("sfx_audio"));
    // re-upload (new md5) → downloaded again
    changed[0][1] = "fedcba9876543210fedcba9876543210";
    a = await freshAudio();
    await a.listCues();
    await a.pullCue(a.remotePlan()[0]);
    assert.equal(a.sfxNet.downloaded, 1);
  });

  it("listing without md5 (old sfx_keys): uploads win over pack files instead of being assumed identical", async () => {
    rpc = (name) => (name === "sfx_keys2" ? json({ code: "PGRST202" }, 404) : name === "sfx_keys" ? json([{ key: "zbox_scan", mime: "audio/mpeg" }]) : json(B64));
    const a = await freshAudio();
    await a.listCues();
    assert.deepEqual(a.remotePlan().map((r) => r.key), ["zbox_scan"]);
  });

  it("sfx_keys2 failing with a 5xx falls back to sfx_keys for this visit instead of dropping every upload", async () => {
    rpc = (name) => (name === "sfx_keys2" ? json({ message: "boom" }, 503) : name === "sfx_keys" ? json([{ key: "zHit", mime: "audio/mpeg" }]) : json(B64));
    const a = await freshAudio();
    const rows = await a.listCues();
    assert.deepEqual(rows?.map((r) => r.key), ["zHit"]);
    assert.ok(calls.includes("sfx_keys"));
  });

  it("Supabase unreachable: pack slots still play the shipped recordings (not synth)", async () => {
    rpc = () => {
      throw new TypeError("offline");
    };
    const a = await freshAudio();
    assert.equal(await a.listCues(), null);
    for (const k of ["zbox_scan", "zbox_scan4", "zbox_beep", "zStart", "massive"]) assert.ok(a.isRecordedCue(k), k);
    assert.ok(!a.isRecordedCue("zbox_miss"), "empty slot without upload stays synth");
  });

  it("every built-in sfx md5 matches production's upload of that slot (so shipped == custom right now)", () => {
    for (const [key, md5] of PROD) {
      if (key === "bed" || key === "ticketOk") continue; // bed recompressed (alias), ticketOk default is pack/ticketOk
      const path = `/sfx/pack/${key}.${key === "massive" ? "flac" : "mp3"}`;
      assert.equal(assets.md5[path], md5, path);
    }
  });
});

describe("audio.ts: own-sound branches ask isRecordedCue, not custom.has", () => {
  const src = read("src/lib/slot/audio.ts");
  it("ownCue / playOwn", () => {
    assert.match(src, /function ownCue\(key: string\): boolean \{\s*return isRecordedCue\(key\) && Boolean\(bufs\[key\]\);/);
  });
  it("no `!custom.has(\"…\")` layering left on a fixed slot", () => {
    assert.doesNotMatch(src, /!custom\.has\("[a-zA-Z0-9_]+"\)/);
  });
});
