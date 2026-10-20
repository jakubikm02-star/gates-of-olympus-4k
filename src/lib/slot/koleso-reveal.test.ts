/**
 * Tajnička reveal. Pure puzzle data — no network.
 * Supabase (including production project xgpnmxkquxzbhgktjipa) is stubbed and must never be called.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CHANGELOG } from "./changelog.ts";
import {
  KOLESO_PHRASES,
  kolesoBase,
  kolesoGrid,
  kolesoLetterTiles,
  kolesoOfferable,
  kolesoRevealAll,
  kolesoRevealIds,
} from "./koleso.ts";

const PROD_HOST = "xgpnmxkquxzbhgktjipa";

beforeAll(() => {
  vi.stubGlobal("fetch", (input: unknown) => {
    const url = String(input);
    if (url.includes(PROD_HOST) || url.includes("supabase")) {
      throw new Error(`refusing Supabase call in the tajnička test: ${url}`);
    }
    throw new Error(`unexpected fetch in the tajnička test: ${url}`);
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const DIACRITICS: readonly [string, string][] = [
  ["á", "a"],
  ["ä", "a"],
  ["č", "c"],
  ["ď", "d"],
  ["é", "e"],
  ["í", "i"],
  ["ĺ", "l"],
  ["ľ", "l"],
  ["ň", "n"],
  ["ó", "o"],
  ["ô", "o"],
  ["ŕ", "r"],
  ["š", "s"],
  ["ť", "t"],
  ["ú", "u"],
  ["ý", "y"],
  ["ž", "z"],
];

function basesIn(text: string): string[] {
  const out: string[] = [];
  for (const ch of text.normalize("NFC")) {
    const b = kolesoBase(ch);
    if (b) out.push(b);
  }
  return out;
}

describe("KOLESO tajnička reveal", () => {
  it("folds Slovak diacritics, including NFD, and keeps CH as two offerable letters", () => {
    const offer = new Set(kolesoOfferable());
    for (const [ch, base] of DIACRITICS) {
      expect(offer.has(base), base).toBe(true);
      expect(kolesoBase(ch)).toBe(base);
      expect(kolesoBase(ch.toUpperCase())).toBe(base);
      expect(kolesoBase(ch.normalize("NFD"))).toBe(base);
      expect(kolesoBase(ch.normalize("NFD").toLocaleUpperCase("sk"))).toBe(base);
    }
    expect(kolesoBase("c")).toBe("c");
    expect(kolesoBase("h")).toBe("h");
    expect(kolesoBase("ch")).toBeNull();
    expect(kolesoBase(",")).toBeNull();
    expect(kolesoBase("-")).toBeNull();
    expect(kolesoBase(":")).toBeNull();
    expect(kolesoBase("7")).toBeNull();
    expect(kolesoBase(" ")).toBeNull();
  });

  it("every puzzle letter is offerable, and the full reveal opens every tile", () => {
    expect(KOLESO_PHRASES.length).toBeGreaterThan(0);
    const offer = new Set(kolesoOfferable());
    for (const phrase of KOLESO_PHRASES) {
      expect(phrase.text.normalize("NFC"), phrase.text).toBe(phrase.text);
      const tiles = kolesoLetterTiles(phrase.text);
      expect(tiles.length, phrase.text).toBeGreaterThan(0);
      expect(
        tiles.map((t) => t.base),
        phrase.text,
      ).toEqual(basesIn(phrase.text));
      expect(
        tiles.map((t) => t.id),
        phrase.text,
      ).toEqual(tiles.map((_, i) => i));

      const opened = new Set<number>();
      for (const letter of offer) {
        for (const id of kolesoRevealIds(phrase.text, letter)) opened.add(id);
      }
      expect(
        [...opened].sort((a, b) => a - b),
        phrase.text,
      ).toEqual(tiles.map((t) => t.id));

      const all = kolesoRevealAll(phrase.text);
      expect(all, phrase.text).toEqual(tiles.map((t) => t.id));
      expect(new Set(all).size, phrase.text).toBe(tiles.length);

      for (const tile of tiles) {
        expect(offer.has(tile.base), `${phrase.text} ${tile.ch}`).toBe(true);
        expect(kolesoRevealIds(phrase.text, tile.base), tile.ch).toContain(tile.id);
        expect(kolesoRevealIds(phrase.text, tile.ch), tile.ch).toContain(tile.id);
        expect(kolesoRevealIds(phrase.text, tile.ch.normalize("NFD")), tile.ch).toContain(tile.id);
      }

      const nfd = phrase.text.normalize("NFD");
      expect(
        kolesoLetterTiles(nfd).map((t) => t.base),
        phrase.text,
      ).toEqual(tiles.map((t) => t.base));
      expect(kolesoRevealAll(nfd), phrase.text).toEqual(kolesoLetterTiles(nfd).map((t) => t.id));

      for (const row of kolesoGrid(phrase.text)) {
        for (const cell of row) {
          if (!cell.ch || cell.base) continue;
          expect(cell.id, `${phrase.text} [${cell.ch}]`).toBe(-1);
          expect(all, cell.ch).not.toContain(cell.id);
          expect(kolesoBase(cell.ch), cell.ch).toBeNull();
        }
      }
    }
  });

  it("a comma, a digit or a hyphen does not hide the letters after it", () => {
    const text = "Meškajúca MHD v -15 stupňoch.";
    const tiles = kolesoLetterTiles(text);
    const tail = tiles.slice(-8);
    expect(tail.map((t) => t.ch).join("")).toBe("STUPŇOCH");
    expect(tail.map((t) => t.base)).toEqual(["s", "t", "u", "p", "n", "o", "c", "h"]);
    const all = kolesoRevealAll(text);
    for (const tile of tail) expect(all).toContain(tile.id);
    expect(kolesoRevealIds(text, "o")).toEqual(
      tiles.filter((t) => t.base === "o").map((t) => t.id),
    );
    const marks = kolesoGrid(text)
      .flat()
      .filter((c) => c.ch === "-" || c.ch === "1" || c.ch === "5");
    expect(marks.map((c) => c.ch)).toEqual(["-", "1", "5"]);
    expect(marks.every((c) => c.base === null && c.id === -1)).toBe(true);

    const comma = "Výplata, čo zmizla do víkendu.";
    const commaTiles = kolesoLetterTiles(comma);
    expect(commaTiles.at(-1)?.ch).toBe("U");
    expect(kolesoRevealAll(comma)).toContain(commaTiles.at(-1)!.id);
    const commaCell = kolesoGrid(comma)
      .flat()
      .find((c) => c.ch === ",");
    expect(commaCell).toMatchObject({ id: -1, base: null });
  });

  it("the bonus board uses the shared reveal, and Zmeny mentions the fix", () => {
    const ui = readFileSync(
      new URL("../../components/slot/KolesoBonus.tsx", import.meta.url),
      "utf8",
    );
    expect(ui).toContain("kolesoRevealIds");
    expect(ui).toContain("kolesoRevealAll");
    expect(ui).toContain("kolesoGrid");
    expect(ui).not.toMatch(/tiles\.map\(\(_, i\) => i\)/);
    const note = CHANGELOG.find((n) => n.day === "2026-10-20");
    expect(note?.text).toBe(
      "KOLESO: tajnička už vždy odkryje všetky písmená a na konci kola ukáže celé riešenie.",
    );
  });
});
