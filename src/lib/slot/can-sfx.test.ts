import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CAN_DROP_WINDOW_MS,
  CAN_LAND_MS,
  CAN_STRIKE_GAP_MS,
  canDropKey,
  canLandDelay,
  canStrikeKey,
  createSfxGate,
} from "./can-sfx.ts";
import { cueKeys, cueSrc, playCanDrop, playCanLightning } from "./audio.ts";

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("can drop sound: once per landing moment", () => {
  it("2–4 cans of one drop (same key, same frame) play once", () => {
    const gate = createSfxGate(CAN_DROP_WINDOW_MS);
    const key = canDropKey(1, 0);
    const plays = [0, 0, 0, 0].filter(() => gate.take(key, 1000)).length;
    assert.equal(plays, 1);
  });

  it("the same landing moment never plays twice, even after the window", () => {
    const gate = createSfxGate(CAN_DROP_WINDOW_MS);
    assert.equal(gate.take(canDropKey(1, 0), 1000), true);
    assert.equal(gate.take(canDropKey(1, 0), 5000), false);
  });

  it("different keys inside the window are one moment (no stacking in one frame / ~150 ms)", () => {
    const gate = createSfxGate(CAN_DROP_WINDOW_MS);
    assert.equal(gate.take(canDropKey(1, 0), 1000), true);
    assert.equal(gate.take(canDropKey(1, 1), 1000 + CAN_DROP_WINDOW_MS - 1), false);
  });

  it("each cascade of a spin plays once (one play per landing moment)", () => {
    const gate = createSfxGate(CAN_DROP_WINDOW_MS);
    const t = [1000, 1900, 2800];
    const plays = t.map((now, step) => gate.take(canDropKey(7, step), now));
    assert.deepEqual(plays, [true, true, true]);
    // A repeated call for cascade 1 (e.g. land callback fired twice) stays silent.
    assert.equal(gate.take(canDropKey(7, 1), 4000), false);
  });

  it("next spin's drop plays again", () => {
    const gate = createSfxGate(CAN_DROP_WINDOW_MS);
    assert.equal(gate.take(canDropKey(1, 0), 1000), true);
    assert.equal(gate.take(canDropKey(2, 0), 3000), true);
  });

  it("is timed to the visual landing (cell-drop 280 ms), instant with reduced motion", () => {
    assert.equal(canLandDelay(false), CAN_LAND_MS);
    assert.equal(canLandDelay(true), 0);
    assert.match(src("../../styles.css"), new RegExp(`\\.cell\\.is-drop \\{\\s*animation: cell-drop ${CAN_LAND_MS}ms`));
  });

  it("gate memory is bounded and reset clears it", () => {
    const gate = createSfxGate(0, 4);
    for (let i = 0; i < 10; i++) assert.equal(gate.take(`k${i}`, i), true);
    assert.equal(gate.take("k9", 100), false);
    assert.equal(gate.take("k0", 100), true);
    gate.reset();
    assert.equal(gate.take("k9", 100), true);
  });
});

describe("can lightning sound: once per strike", () => {
  it("sequential strikes (normal 320 ms, turbo ~110 ms) each play", () => {
    for (const step of [320, 109]) {
      const gate = createSfxGate(CAN_STRIKE_GAP_MS);
      const plays = [11, 12, 13].map((uid, i) => gate.take(canStrikeKey(3, uid), 1000 + i * step));
      assert.deepEqual(plays, [true, true, true], `step ${step}`);
    }
  });

  it("strikes fired in one go (skip) are one sound", () => {
    const gate = createSfxGate(CAN_STRIKE_GAP_MS);
    const plays = [11, 12, 13, 14].map((uid, i) => gate.take(canStrikeKey(3, uid), 1000 + i * 4)).filter(Boolean);
    assert.equal(plays.length, 1);
  });

  it("the same can is never struck-sounded twice", () => {
    const gate = createSfxGate(CAN_STRIKE_GAP_MS);
    assert.equal(gate.take(canStrikeKey(3, 11), 1000), true);
    assert.equal(gate.take(canStrikeKey(3, 11), 2000), false);
  });
});

describe("audio.ts: can_lightning slot and dedupe wiring", () => {
  it("can_lightning is its own sound slot with a built-in default (not silent)", () => {
    assert.ok(cueKeys().includes("can_lightning"));
    assert.ok(cueKeys().includes("can"));
    assert.match(cueSrc("can_lightning"), /^\/sfx\/.+\.mp3/);
    assert.match("can_lightning", /^[A-Za-z0-9_-]{1,40}$/); // sfx_volume key check
  });

  it("playCanDrop / playCanLightning dedupe by key", () => {
    assert.equal(playCanDrop("test:drop:0"), true);
    assert.equal(playCanDrop("test:drop:0"), false);
    assert.equal(playCanLightning("test:strike:1"), true);
    assert.equal(playCanLightning("test:strike:1"), false);
  });
});

describe("wiring: settings slot and no double play", () => {
  it("settings list Blesk do plechovky (with its per-sound slider, generated from SOUND_CUES)", () => {
    const s = src("../../components/slot/Settings.tsx");
    assert.match(s, /\{ id: "can_lightning", name: "Blesk do plechovky", when: "[^"]+" \}/);
  });

  it("the strike plays the lightning slot, not Plechovka; the can slot plays only when a winning multiplier is counted", () => {
    const hook = src("../../hooks/use-slot-game.ts");
    const audio = src("./audio.ts");
    const at = hook.indexOf("for (const orb of orbs)");
    assert.ok(at > 0);
    const strike = hook.slice(at, hook.indexOf("setStrike(null)", at));
    assert.match(strike, /sfx\.playCanLightning\(canStrikeKey\(/);
    assert.doesNotMatch(strike, /sfx\.playMult\(\)/);
    for (const m of hook.matchAll(/zeusDrop\(board[^\n]*\n([^\n]*\n){0,4}/g)) assert.doesNotMatch(m[0], /playMult|playCanDrop/);
    assert.equal((hook.match(/playCanDrop/g) ?? []).length, 0);
    const win = hook.slice(hook.indexOf("const willThrow"), hook.indexOf("let paidX"));
    assert.match(win, /sfx\.playMult\(\)/);
    assert.doesNotMatch(audio.slice(audio.indexOf("export function playCanDrop"), audio.indexOf("export function playCanLightning")), /playMult\(/);
  });
});
