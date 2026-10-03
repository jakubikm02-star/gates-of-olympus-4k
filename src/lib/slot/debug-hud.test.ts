import assert from "node:assert/strict";
import { test } from "node:test";
import { debugFromSearch, makeTapCounter, parseBrowser, summarizeFrames } from "./debug-hud.ts";

test("parseBrowser tells Samsung Internet from Chrome", () => {
  const sam =
    "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36";
  assert.deepEqual(parseBrowser(sam), { name: "Samsung Internet", version: "26.0" });
  const chrome = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
  assert.deepEqual(parseBrowser(chrome), { name: "Chrome", version: "129.0.0.0" });
  assert.equal(parseBrowser("curl/8").name, "?");
});

test("debugFromSearch", () => {
  assert.equal(debugFromSearch("?debug=1"), true);
  assert.equal(debugFromSearch("?x=2&debug=0"), false);
  assert.equal(debugFromSearch(""), null);
});

test("summarizeFrames reports Hz and slow-frame share", () => {
  const s = summarizeFrames([16.7, 50, 16.7, 50]);
  assert.ok(Math.abs(s.hz - 1000 / 33.35) < 0.01);
  assert.equal(s.maxMs, 50);
  assert.equal(s.over34, 0.5);
  assert.equal(summarizeFrames([]).hz, 0);
  assert.equal(summarizeFrames([8.33, 8.33]).hz.toFixed(0), "120");
});

test("five taps inside the window toggle, slow taps do not", () => {
  let now = 0;
  const tap = makeTapCounter(5, 3000, () => now);
  for (let i = 0; i < 4; i++) {
    assert.equal(tap(), false);
    now += 200;
  }
  assert.equal(tap(), true);
  for (let i = 0; i < 6; i++) {
    now += 1000;
    assert.equal(tap(), false);
  }
});
