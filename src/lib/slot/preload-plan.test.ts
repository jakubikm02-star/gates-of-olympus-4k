import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FONT_FACES,
  SLOW_HINT,
  SLOW_HINT_MS,
  failMessage,
  formatMB,
  imageTimeout,
  pathOf,
  progressOf,
  publicImages,
  rankArt,
  retryDelay,
  showSlowHint,
  type ItemState,
  type PreloadItem,
} from "./preload-plan.ts";
import { b64Size, cueCacheUrl, cueVersion, isFresh, parseCueRows, UNVERSIONED_TTL_MS } from "./sfx-cache.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(n) && !/\.test\.ts$/.test(n)) out.push(p);
  }
  return out;
}

describe("preload list covers every public image the game references", () => {
  const list = new Set(publicImages());
  const paths = new Set([...list].map(pathOf));

  it("every literal /dir/file reference in src/ (components, CSS, libs) is preloaded with the same URL", () => {
    const re = /["'(]\/(symbols|art|koleso|zbox|fx|machine-ai|machine|ranks|frames|massive)\/[^"')\s]+\.(png|webp|jpg|svg)(\?[^"')\s]*)?/g;
    const missing: string[] = [];
    for (const f of walk(join(root, "src"))) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(re)) {
        const url = m[0].slice(1);
        if (!list.has(url)) missing.push(`${url} (${f.slice(root.length + 1)})`);
      }
    }
    assert.deepEqual(missing, []);
  });

  it("every listed file exists in public/", () => {
    const gone = [...paths].filter((p) => !existsSync(join(root, "public", p)));
    assert.deepEqual(gone, []);
  });

  it("covers all 4 can tiers, every rank badge / cabinet of every family and both AI sheet sizes", () => {
    for (const t of [1, 2, 3, 4]) assert.ok(paths.has(`/symbols/can-t${t}.webp`));
    const ranks = rankArt();
    assert.ok(ranks.some((u) => u.startsWith("/ranks/kredit-iv.svg")));
    assert.ok(ranks.some((u) => u.startsWith("/ranks/nekonecno.svg")));
    assert.ok(ranks.some((u) => u.startsWith("/machine/optika-v2.svg")));
    assert.ok(ranks.some((u) => u.startsWith("/machine-ai/duo-m.webp")));
    assert.ok(ranks.some((u) => u.startsWith("/machine-ai/fiveg.webp")));
  });

  it("bonus art: KOLESO, Ž-BOX, ZÁSAH smog, 4KA TV fog, KONTROLA map are in", () => {
    for (const p of ["/koleso/disc.webp", "/zbox/print-w.webp", "/fx/smog-red2.webp", "/fx/beam-blue.webp", "/fx/fog-rainbow.webp", "/art/city-map.jpg"]) {
      assert.ok(paths.has(p), p);
    }
  });

  it("bundled src/assets art (KOLESO host poses, VERSUS cards) is preloaded by glob", () => {
    const pre = read("src/lib/slot/preloader.ts");
    assert.match(pre, /import\.meta\.glob\("\/src\/assets\/\*\*\/\*\.\{webp,png,jpg,jpeg,svg\}"/);
    const bundled = [...readdirSync(join(root, "src/assets/koleso")), ...readdirSync(join(root, "src/assets/versus"))];
    assert.ok(bundled.length >= 13);
  });

  it("no component loads art lazily outside the list (new Image only in preloader / predecode / known users)", () => {
    const users = walk(join(root, "src")).filter((f) => /new Image\(\)/.test(readFileSync(f, "utf8"))).map((f) => f.slice(root.length + 1));
    assert.deepEqual(users.sort(), [
      "src/components/slot/BedVisualizer.tsx",
      "src/components/slot/MachineFrame.tsx",
      "src/components/slot/PoliceSmog.tsx",
      "src/lib/slot/predecode.ts",
      "src/lib/slot/preloader.ts",
    ]);
    // BedVisualizer / MachineFrame / PoliceSmog read art that is in the list (fog sheet, AI cabinet sheets, ZÁSAH smog + beams).
    assert.ok(paths.has("/fx/fog-rainbow.webp"));
  });

  it("fonts: every family of the CSS @import, Slovak glyphs", () => {
    const css = read("src/styles.css");
    for (const fam of ["IBM+Plex+Mono", "Oswald", "Outfit"]) assert.ok(css.includes(fam));
    for (const fam of ["IBM Plex Mono", "Oswald", "Outfit"]) assert.ok(FONT_FACES.some((f) => f.includes(fam)), fam);
  });
});

const item = (id: string, bytes: number, critical = true): PreloadItem => ({ id, kind: "image", bytes, critical });

describe("progress", () => {
  it("is byte-weighted and never shows 100 % before everything settled", () => {
    const items = [item("a", 1000_000), item("b", 9000_000)];
    const st = new Map<string, ItemState>([
      ["a", { status: "ok", loaded: 0, attempts: 1 }],
      ["b", { status: "load", loaded: 4500_000, attempts: 1 }],
    ]);
    const p = progressOf(items, st);
    assert.equal(p.pct, 55);
    assert.equal(p.done, 1);
    assert.equal(p.settled, false);
    st.set("b", { status: "load", loaded: 9000_000, attempts: 1 });
    assert.ok(progressOf(items, st).pct <= 99);
    st.set("b", { status: "ok", loaded: 0, attempts: 1 });
    assert.equal(progressOf(items, st).pct, 100);
  });

  it("a failed critical item blocks; a failed optional one counts as handled", () => {
    const items = [item("img", 5000), item("cue", 5000, false)];
    const st = new Map<string, ItemState>([
      ["img", { status: "fail", loaded: 0, attempts: 4 }],
      ["cue", { status: "fail", loaded: 0, attempts: 4 }],
    ]);
    const p = progressOf(items, st);
    assert.deepEqual(p.blocking, ["img"]);
    assert.deepEqual(p.failed, ["img", "cue"]);
    assert.ok(p.pct < 100);
    st.set("img", { status: "ok", loaded: 0, attempts: 5 });
    assert.equal(progressOf(items, st).pct, 100);
  });

  it("unknown sizes still weigh something", () => {
    const p = progressOf([item("x", 0)], new Map([["x", { status: "ok", loaded: 0, attempts: 1 } as ItemState]]));
    assert.ok(p.totalBytes > 0);
  });
});

describe("slow hint, retry and messages", () => {
  it("hint appears after 5 s while loading, never once ready", () => {
    assert.equal(SLOW_HINT, "Načítanie závisí od rýchlosti internetu");
    assert.equal(showSlowHint(SLOW_HINT_MS - 1, false), false);
    assert.equal(showSlowHint(SLOW_HINT_MS, false), true);
    assert.equal(showSlowHint(60_000, true), false);
  });

  it("three automatic retries with growing pauses, then give up", () => {
    assert.equal(retryDelay(0), null);
    assert.ok(retryDelay(1)! < retryDelay(2)! && retryDelay(2)! < retryDelay(3)!);
    assert.equal(retryDelay(4), null);
  });

  it("image timeout grows with the file (slow links finish)", () => {
    assert.ok(imageTimeout(725_200) > imageTimeout(10_000));
    assert.ok(imageTimeout(725_200) >= 45_000 + 180_000);
  });

  it("Slovak plurals and MB with a comma", () => {
    assert.match(failMessage(1), /1 súbor hry/);
    assert.match(failMessage(3), /3 súbory/);
    assert.match(failMessage(7), /7 súborov/);
    assert.equal(formatMB(1.5 * 1024 * 1024), "1,5 MB");
    assert.equal(formatMB(48 * 1024 * 1024), "48 MB");
  });
});

describe("sfx cache (uploads kept on the device)", () => {
  it("versioned by md5 from sfx_keys2, else by mime with a TTL", () => {
    assert.deepEqual(cueVersion({ key: "bed", mime: "audio/flac", v: "524C7627642C2D8C122BF0DD7B2BDD21" }), {
      ver: "524c7627642c2d8c122bf0dd7b2bdd21",
      versioned: true,
    });
    assert.deepEqual(cueVersion({ key: "bed", mime: "audio/flac" }), { ver: "m-audio-flac", versioned: false });
    const now = 1_800_000_000_000;
    assert.equal(isFresh(now - 1000, now, false), true);
    assert.equal(isFresh(now - UNVERSIONED_TTL_MS - 1, now, false), false);
    assert.equal(isFresh(0, now, true), true);
  });

  it("cache key is a same-origin URL per slot and version", () => {
    assert.equal(cueCacheUrl("https://parkizmus.vercel.app", "zbox_scan", "abc"), "https://parkizmus.vercel.app/__sfx-cache/zbox_scan?v=abc");
  });

  it("parses sfx_keys and sfx_keys2 rows, drops unknown slots", () => {
    const rows = parseCueRows(
      [{ key: "bed", mime: "audio/flac", v: "aa11bb22cc33dd44", len: 19132503 }, { key: "nope", mime: "x" }, { key: "zap", mime: "audio/mpeg" }, null],
      (k) => k !== "nope",
    );
    assert.deepEqual(rows, [
      { key: "bed", mime: "audio/flac", v: "aa11bb22cc33dd44", len: 19132503 },
      { key: "zap", mime: "audio/mpeg" },
    ]);
  });

  it("base64 size estimate matches what sfx_audio sends (Postgres wraps at 76 chars)", () => {
    // bed: 19 132 503 raw bytes → 25 510 004 base64 chars + 335 657 line breaks (+2 quotes)
    const n = b64Size(19_132_503);
    assert.ok(Math.abs(n - (25_510_004 + 335_657 + 2)) < 4);
  });
});

describe("audio wiring: no Supabase download at import, shipped uploads play from the static file", () => {
  const audio = read("src/lib/slot/audio.ts");
  it("does not hydrate uploads at module load any more", () => {
    assert.doesNotMatch(audio, /if \(typeof window !== "undefined"\) void hydrateCustoms\(\);/);
  });
  it("prefers sfx_keys2 with a fallback to sfx_keys", () => {
    assert.match(audio, /sfxRpc\("sfx_keys2"/);
    assert.match(audio, /sfxRpc\("sfx_keys"/);
  });
  it("music beds are kept as blob URLs, not decoded to PCM", () => {
    assert.match(audio, /localUrl\[key\] = URL\.createObjectURL/);
  });
  it("vercel.json: immutable for ?v= assets, a day + stale-while-revalidate for the rest", () => {
    const v = JSON.parse(read("vercel.json")) as { headers: { source: string; has?: unknown[]; missing?: unknown[]; headers: { value: string }[] }[] };
    const art = v.headers.filter((h) => h.source.includes("symbols|art|koleso"));
    assert.equal(art.length, 2);
    assert.ok(art.some((h) => h.has && /immutable/.test(h.headers[0].value)));
    assert.ok(art.some((h) => h.missing && /max-age=86400/.test(h.headers[0].value)));
  });
});
