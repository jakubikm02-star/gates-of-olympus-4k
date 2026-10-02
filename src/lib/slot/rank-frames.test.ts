import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { BANDS, RANKS } from "./ranks.ts";
import { frameMoves, frameTier, RANK_HALO_SRC, rankFrameSrc } from "./rank-frames.ts";

const file = (src: string) => new URL(`../../../public${src.split("?")[0]}`, import.meta.url);

test("every rank band has its own frame asset on disk", () => {
  const seen = new Set<string>();
  for (const b of BANDS) {
    const r = RANKS[b.rankIndex];
    const src = rankFrameSrc(r.id, b.division);
    assert.ok(existsSync(file(src)), `${r.id} ${b.division} → ${src}`);
    seen.add(src);
  }
  assert.equal(seen.size, BANDS.length, "tiers inside a family must not share one frame");
  assert.ok(existsSync(file(RANK_HALO_SRC)));
});

test("frames are valid standalone SVG with a square 64 viewBox", () => {
  for (const b of BANDS) {
    const text = readFileSync(file(rankFrameSrc(RANKS[b.rankIndex].id, b.division)), "utf8");
    assert.match(text, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64"/);
    assert.ok(!/<script|href="http/i.test(text));
  }
});

test("motion starts at DUO and grows to NEKONEČNO", () => {
  const order = RANKS.map((r) => frameTier(r.id));
  assert.deepEqual(order, ["base", "base", "base", "rich", "rich", "lux", "elite", "apex"]);
  assert.deepEqual(
    RANKS.map((r) => frameMoves(r.id)),
    [false, false, false, false, false, true, true, true],
  );
  assert.equal(rankFrameSrc("unknown", 2), rankFrameSrc("kredit", 2));
});
