/**
 * Ribbony gallery: lifetime counts folded from the daily logs, and the silhouette state of
 * ribbons never earned. Supabase is stubbed: nothing here may reach production
 * (xgpnmxkquxzbhgktjipa); the tally is local and must not touch the network at all.
 */
import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";

let netCalls = 0;
const mem = new Map<string, string>();

before(() => {
  globalThis.fetch = (async (input: unknown) => {
    netCalls += 1;
    throw new Error(`network blocked in ribbon-tally test: ${String(input)}`);
  }) as typeof fetch;
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
  };
});

const T = await import("./ribbon-tally.ts");
const { RIBBONS, emptyRibbonLog } = await import("./ribbons.ts");

function dayLog(day: string, earned: [string, number][]) {
  const log = emptyRibbonLog(day, earned.at(-1)?.[1] ?? 0);
  return { ...log, earned: earned.map(([id, at]) => ({ id, at })) };
}

describe("ribbon tally aggregation", () => {
  beforeEach(() => {
    mem.clear();
    T.resetTally({});
  });

  it("counts one per day and never double counts a replayed log", () => {
    const d1 = dayLog("2026-10-26", [
      ["mrtvy-spin", 1000],
      ["kaskada", 2000],
    ]);
    const d2 = dayLog("2026-10-27", [["mrtvy-spin", 90_000_000]]);
    let t = T.foldRibbonLog({}, d1);
    t = T.foldRibbonLog(t, d1);
    t = T.foldRibbonLog(t, d2);
    t = T.foldRibbonLog(t, d2);
    assert.deepEqual(t["mrtvy-spin"], { n: 2, last: 90_000_000 });
    assert.deepEqual(t["kaskada"], { n: 1, last: 2000 });
    assert.equal(T.earnedKinds(t), 2);
    // unchanged input keeps identity (no re-render, no write)
    assert.equal(T.foldRibbonLog(t, d2), t);
  });

  it("ignores unknown ids and garbage in storage", () => {
    const t = T.foldRibbonLog({}, dayLog("2026-10-27", [["nie-je-ribbon", 5]]));
    assert.deepEqual(t, {});
    const s = T.sanitizeTally({ jackpot: { n: 3, last: 7 }, bogus: { n: 9 }, kaskada: { n: -2 }, masiv: "x" });
    assert.deepEqual(s, { jackpot: { n: 3, last: 7 } });
  });

  it("store persists the tally and notifies subscribers", () => {
    let pings = 0;
    const off = T.subscribeTally(() => pings++);
    T.syncTally(dayLog("2026-10-28", [["jackpot", 123]]));
    T.syncTally(dayLog("2026-10-28", [["jackpot", 123]]));
    off();
    assert.equal(pings, 1);
    assert.deepEqual(JSON.parse(mem.get(T.TALLY_KEY)!), { jackpot: { n: 1, last: 123 } });
    assert.equal(T.tallySnapshot().jackpot?.n, 1);
  });
});

describe("gallery tiles and silhouettes", () => {
  it("lists all ribbons; unearned ones are locked with no count", () => {
    const tiles = T.galleryTiles({ masiv: { n: 4, last: 50 } });
    assert.equal(tiles.length, RIBBONS.length);
    assert.equal(tiles.length, 41);
    const masiv = tiles.find((t) => t.def.id === "masiv")!;
    assert.deepEqual([masiv.earned, masiv.n, masiv.last], [true, 4, 50]);
    const locked = tiles.filter((t) => !t.earned);
    assert.equal(locked.length, 40);
    for (const t of locked) assert.deepEqual([t.n, t.last], [0, 0]);
  });

  it("opening a ribbon from anywhere lands on its detail; bad ids land on the grid", () => {
    T.openRibbonGallery("strop");
    assert.deepEqual(T.gallerySnapshot(), { open: true, id: "strop" });
    T.showRibbonGrid();
    assert.deepEqual(T.gallerySnapshot(), { open: true, id: "" });
    T.openRibbonGallery("<script>");
    assert.deepEqual(T.gallerySnapshot(), { open: true, id: "" });
    T.closeRibbonGallery();
    assert.equal(T.gallerySnapshot().open, false);
  });

  it("locked badge CSS turns the art into a black silhouette", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(new URL("../../components/slot/ribbons.css", import.meta.url), "utf8");
    const rule = /\.rib\.is-locked img,\s*\.rib\.is-locked svg\s*\{([^}]*)\}/.exec(css);
    assert.ok(rule, "locked rule exists");
    assert.match(rule[1]!, /filter:\s*brightness\(0\)/);
    const gallery = readFileSync(new URL("../../components/slot/RibbonGallery.tsx", import.meta.url), "utf8");
    assert.match(gallery, /t\.earned \? t\.def\.name : "\?\?\?"/);
    assert.match(gallery, /locked=\{!t\.earned\}/);
  });

  it("never touched the network", () => {
    assert.equal(netCalls, 0);
  });
});
