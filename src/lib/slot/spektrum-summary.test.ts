/**
 * "Dnes v automate" popover text: built from the real Spektrum HUD state, short, nothing invented.
 * No network: Supabase (xgpnmxkquxzbhgktjipa) is stubbed and must never be reached.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";
import { spectrumHud, emptySpectrum } from "./spectrum.ts";
import { COLOR_SHORT, spektrumSummary, spinsSk } from "./spektrum-summary.ts";

before(() => {
  globalThis.fetch = (async (input: unknown) => {
    throw new Error(`network blocked in spektrum-summary test: ${String(input)}`);
  }) as typeof fetch;
});

function hud(over: Partial<ReturnType<typeof emptySpectrum>> = {}) {
  return spectrumHud({ ...emptySpectrum(), mood: 5, support: 6, opponent: 0, ...over }, true);
}

describe("Dnes v automate", () => {
  it("one line per day colour with its remaining lamp spins from state", () => {
    const s = spektrumSummary(hud({ lit: [9, 0, 0, 0, 0, 4, 0] }));
    const [a, b, c] = s.lines;
    assert.equal(a!.lead, "SOLIDARITA");
    assert.match(a!.text, /padá najčastejšie/);
    assert.match(a!.text, /Svieti ešte 4 spiny\./);
    assert.equal(b!.lead, "VERNOSŤ");
    assert.match(b!.text, /Teraz nesvieti\./);
    assert.equal(c!.lead, "REKLAMÁCIA");
    assert.match(c!.text, /Svieti ešte 9 spinov\./);
  });

  it("weather always, 1-FTTB and parked credits only when they exist", () => {
    const plain = spektrumSummary(hud());
    assert.deepEqual(plain.lines.map((l) => l.key), ["c5", "c6", "c0", "w"]);
    const busy = spektrumSummary(hud({ fttb: 6, pending: 12.5, weather: 2 }));
    assert.deepEqual(busy.lines.map((l) => l.key), ["c5", "c6", "c0", "w", "f", "p"]);
    assert.match(busy.lines[4]!.text, /ešte 6 spinov/);
    assert.match(busy.lines[3]!.lead, /Búrka/);
  });

  it("stays short: one sentence-ish per line", () => {
    const s = spektrumSummary(hud({ fttb: 1, pending: 3, lit: [12, 12, 12, 12, 12, 12, 12] }));
    for (const l of s.lines) assert.ok(`${l.lead} ${l.text}`.length <= 110, l.text);
    assert.ok(s.foot.length <= 110);
  });

  it("Slovak spin plurals", () => {
    assert.deepEqual([1, 2, 4, 5, 12].map(spinsSk), ["1 spin", "2 spiny", "4 spiny", "5 spinov", "12 spinov"]);
  });

  it("carton labels are short and never ellipsised", () => {
    for (const v of Object.values(COLOR_SHORT)) assert.ok(v.length <= 7 && !v.includes("…"), v);
    const css = readFileSync(new URL("../../components/slot/spektrum-carton.css", import.meta.url), "utf8");
    assert.doesNotMatch(css, /text-overflow:\s*ellipsis/);
    // The carton is absolute in .head-rank: no layout space, the reels keep their size.
    assert.match(css, /\.spk-wrap\s*\{[^}]*position:\s*absolute/);
    const pop = /\.spk-pop\s*\{([^}]*)\}/.exec(css)![1]!;
    assert.match(pop, /position:\s*fixed/);
    assert.ok(Number(/z-index:\s*(\d+)/.exec(pop)![1]) < 500, "below the ribbon toast");
  });
});
