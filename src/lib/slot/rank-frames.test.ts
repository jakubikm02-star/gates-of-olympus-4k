import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { BANDS, RANKS } from "./ranks.ts";
import { MACHINE_AI } from "./machine-ai-frames.ts";
import {
  frameDivisionLook,
  frameMoves,
  frameTier,
  MACHINE_AI_MOBILE_Q,
  MACHINE_AI_V,
  machineAiSrc,
  machineFrameSrc,
  machineTileSrc,
  RANK_HALO_SRC,
  rankFrameSrc,
} from "./rank-frames.ts";

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

test("every rank band has its own machine-frame corner", () => {
  const seen = new Set<string>();
  for (const b of BANDS) {
    const src = machineFrameSrc(RANKS[b.rankIndex].id, b.division);
    const text = readFileSync(file(src), "utf8");
    assert.match(text, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64"/, src);
    assert.ok(!/<script|href="http/i.test(text));
    seen.add(src);
  }
  assert.equal(seen.size, BANDS.length);
});

test("every rank band has side tiles; tiers II/I get the richer tile", () => {
  for (const b of BANDS) {
    const id = RANKS[b.rankIndex].id;
    const h = machineTileSrc(id, b.division, "h");
    const v = machineTileSrc(id, b.division, "v");
    for (const src of [h, v]) {
      const text = readFileSync(file(src), "utf8");
      assert.match(text, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 \d+ \d+"/, src);
      assert.ok(!/<script|href="http/i.test(text));
    }
    assert.equal(h.includes("-h2."), b.division === 1 || b.division === 2, h);
  }
});

test("every rank family has an AI cabinet sheet (PC + half-size phone WebP), versioned", () => {
  let total = 0;
  for (const r of RANKS) {
    const meta = MACHINE_AI[r.id];
    assert.ok(meta, r.id);
    for (const size of ["hi", "m"] as const) {
      const src = machineAiSrc(r.id, size);
      assert.match(src, new RegExp(`^/machine-ai/${r.id}${size === "m" ? "-m" : ""}\\.webp\\?v=${MACHINE_AI_V}$`));
      const buf = readFileSync(file(src));
      assert.equal(buf.subarray(0, 4).toString("latin1"), "RIFF", src);
      assert.equal(buf.subarray(8, 12).toString("latin1"), "WEBP", src);
      total += buf.length;
    }
  }
  assert.ok(total < 1.5 * 1024 * 1024, `AI cabinet assets ${total} B`);
  assert.equal(machineAiSrc("unknown"), machineAiSrc("kredit"));
  assert.equal(MACHINE_AI_MOBILE_Q, "(max-width: 820px)");
});

test("AI sheet geometry: corners hold the band plus the corner intrusion, edges leave room to tile", () => {
  for (const [id, m] of Object.entries(MACHINE_AI)) {
    const [st, sr, sb, sl] = m.slice;
    const [bt, br, bb, bl] = m.band;
    const [w, h] = m.sheet;
    assert.ok(st >= bt + m.intrusion && sb >= bb + m.intrusion, `${id} vertical slices`);
    assert.ok(sl >= bl + m.intrusion && sr >= br + m.intrusion, `${id} horizontal slices`);
    assert.ok(w - sl - sr >= 40 && h - st - sb >= 40, `${id} edge tiles`);
    assert.ok(m.gem.every((g) => g > 0 && g < 1), `${id} gem`);
  }
});

test("generated CSS carries every rank's 9-slice geometry; the window inset matches band + intrusion", () => {
  const css = readFileSync(new URL("../../machine-ai-frames.gen.css", import.meta.url), "utf8");
  for (const [id, m] of Object.entries(MACHINE_AI)) {
    const block = css.split(`[data-rank="${id}"]`)[1]?.split("}")[0] ?? "";
    assert.ok(block, id);
    assert.match(block, new RegExp(`--mai-bt: ${m.band[0]}; --mai-br: ${m.band[1]}; --mai-bb: ${m.band[2]}; --mai-bl: ${m.band[3]}; --mai-d: ${m.intrusion};`));
    assert.match(block, new RegExp(`--mai-st: ${m.slice[0]}; --mai-sr: ${m.slice[1]}; --mai-sb: ${m.slice[2]}; --mai-sl: ${m.slice[3]};`));
  }
  const hand = readFileSync(new URL("../../machine-ai-frames.css", import.meta.url), "utf8");
  assert.ok(hand.includes(`@media ${MACHINE_AI_MOBILE_Q}`), "CSS and JS pick the same sheet size");
  assert.match(hand, /prefers-reduced-motion: reduce/);
  assert.match(hand, /\.stage\.perf-lite \.mf\.is-ai > \.mai-fx/);
  assert.ok(!/@keyframes[^}]*\{[^}]*(filter|width|height|top|left|inset)\s*:/.test(hand), "keyframes animate transform / opacity only");
});

test("divisions IV…I brighten step by step; master ranks get the strongest look", () => {
  for (const r of RANKS.filter((x) => x.divisions > 1)) {
    const looks = [4, 3, 2, 1].map((d) => frameDivisionLook(r.id, d));
    for (let i = 1; i < looks.length; i++) {
      assert.ok(looks[i].sat > looks[i - 1].sat && looks[i].bri > looks[i - 1].bri, `${r.id} ${4 - i}`);
      assert.ok(looks[i].glow >= looks[i - 1].glow);
    }
    const top = looks[3];
    for (const m of ["fiveg", "nekonecno"]) {
      const ml = frameDivisionLook(m, 0);
      assert.ok(ml.sat >= top.sat && ml.bri >= top.bri && ml.glow >= top.glow, m);
    }
  }
});
