import { test } from "node:test";
import assert from "node:assert/strict";
import { CUE_WAIT_MS, canEventCue, cueRoute, type CueState } from "./cue-ready.ts";

const base: CueState = { decoded: false, remote: false, stored: false, failed: false, waitedMs: 0 };

test("every can drop is the Rampa slot, the activation throw stays Hrom", () => {
  assert.equal(canEventCue("land"), "zap");
  assert.equal(canEventCue("tumble"), "zap");
  assert.equal(canEventCue("activate"), "thunder");
});

test("a can-drop sequence sounds Rampa on every drop (land + each tumble drop)", () => {
  const events = ["land", "activate", "tumble", "tumble", "land"] as const;
  const zaps = events.filter((e) => canEventCue(e) === "zap").length;
  assert.equal(zaps, 4);
});

test("decoded buffer plays at once, whatever else is known", () => {
  assert.equal(cueRoute({ ...base, decoded: true }), "buffer");
  assert.equal(cueRoute({ ...base, decoded: true, remote: true, stored: true, failed: true, waitedMs: 9999 }), "buffer");
});

test("upload here but still decoding: wait, then <audio> element once late", () => {
  assert.equal(cueRoute({ ...base, stored: true, waitedMs: 0 }), "wait");
  assert.equal(cueRoute({ ...base, stored: true, waitedMs: CUE_WAIT_MS - 1 }), "wait");
  assert.equal(cueRoute({ ...base, stored: true, waitedMs: CUE_WAIT_MS }), "element");
});

test("upload Web Audio cannot decode goes to the element at once (no pointless wait)", () => {
  assert.equal(cueRoute({ ...base, stored: true, failed: true }), "element");
});

test("upload listed but bytes not here: wait, never past the limit, then fallback", () => {
  assert.equal(cueRoute({ ...base, remote: true, waitedMs: 10 }), "wait");
  assert.equal(cueRoute({ ...base, remote: true, waitedMs: CUE_WAIT_MS }), "fallback");
  assert.equal(cueRoute({ ...base, remote: true, waitedMs: Number.POSITIVE_INFINITY }), "fallback");
});

test("no upload and no buffer: fallback right away", () => {
  assert.equal(cueRoute(base), "fallback");
});

test("custom wait limit is honoured", () => {
  assert.equal(cueRoute({ ...base, stored: true, waitedMs: 120, maxWaitMs: 100 }), "element");
  assert.equal(cueRoute({ ...base, remote: true, waitedMs: 50, maxWaitMs: 100 }), "wait");
});

test("built-in file still loading: wait up to the limit, then fallback", () => {
  assert.equal(cueRoute({ ...base, loading: true, waitedMs: 0 }), "wait");
  assert.equal(cueRoute({ ...base, loading: true, waitedMs: CUE_WAIT_MS }), "fallback");
});
