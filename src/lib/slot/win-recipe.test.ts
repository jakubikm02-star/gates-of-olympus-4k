import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cascadeWord, cleanRecipe, emptyTally, MAX_TUMBLES, mergeTally, notePays, recipeFromHow, recipeSentence, recipeTumbles, topCans, topPays } from "./win-recipe.ts";

describe("cleanRecipe", () => {
  it("keeps a well-formed base recipe", () => {
    const r = cleanRecipe({ v: 1, mode: "base", pays: [{ id: "pdf", n: 12 }], cans: [15, 5], mult: 20, tumbles: 3 });
    assert.deepEqual(r, { v: 1, mode: "base", pays: [{ id: "pdf", n: 12 }], cans: [15, 5], mult: 20, tumbles: 3 });
  });
  it("drops unknown symbols, impossible counts, non-pool cans and extra keys", () => {
    const r = cleanRecipe({
      v: 1,
      mode: "fs",
      pays: [{ id: "crown", n: 12 }, { id: "pdf", n: 7 }, { id: "meter", n: 99 }, { id: "roof", n: 9 }],
      cans: [7, 500, 1000, "50"],
      evil: "<script>",
    });
    assert.deepEqual(r, { v: 1, mode: "fs", pays: [{ id: "roof", n: 9 }], cans: [500] });
  });
  it("rejects wrong version, mode or shape", () => {
    assert.equal(cleanRecipe(null), null);
    assert.equal(cleanRecipe([]), null);
    assert.equal(cleanRecipe({ v: 2, mode: "base" }), null);
    assert.equal(cleanRecipe({ v: 1, mode: "jackpot" }), null);
  });
  it("caps lists", () => {
    const r = cleanRecipe({ v: 1, mode: "fs", pays: [], cans: [2, 3, 4, 5, 6, 8, 10, 12] });
    assert.equal(r?.cans?.length, 6);
  });
});

describe("tally", () => {
  it("ranks pays by contribution and merges free spins", () => {
    const fs = emptyTally();
    fs.scatters = 5;
    const a = emptyTally();
    notePays(a, [
      { payId: "rj45", count: 9, payX: 0.2 },
      { payId: "pdf", count: 8, payX: 7.9 },
      { payId: "scatter", count: 4, payX: 3 },
    ]);
    a.cans = [10, 2];
    a.scatters = 3;
    const b = emptyTally();
    notePays(b, [{ payId: "pdf", count: 11, payX: 19.75 }]);
    b.cans = [50];
    mergeTally(fs, a);
    mergeTally(fs, b);
    assert.deepEqual(topPays(fs), [
      { id: "pdf", n: 11 },
      { id: "rj45", n: 9 },
    ]);
    assert.deepEqual(topCans(fs.cans), [50, 10, 2]);
    assert.equal(fs.scatters, 5, "feature keeps the trigger scatter count");
  });
});

describe("recipeFromHow (legacy text)", () => {
  it("reads free spins", () => {
    assert.deepEqual(recipeFromHow("PARKNET · 42× · 22 FS"), { v: 1, mode: "fs", pays: [], mult: 42, spins: 22, legacy: true });
  });
  it("reads base symbols and cascades", () => {
    assert.deepEqual(recipeFromHow("BASE · Krytina · PDF 4K 5G · 1 pop"), {
      v: 1,
      mode: "base",
      pays: [
        { id: "roof", n: 8 },
        { id: "pdf", n: 8 },
      ],
      tumbles: 1,
      legacy: true,
    });
  });
  it("reads the old buy line", () => {
    const r = recipeFromHow("KÚPA · 5 scatter · 21 FS · 44× · SUPER MEGA");
    assert.equal(r?.mode, "buy");
    assert.equal(r?.scatters, 5);
    assert.equal(r?.spins, 21);
    assert.equal(r?.mult, 44);
  });
  it("reads tickets and duels; unknown text stays null", () => {
    assert.equal(recipeFromHow("LÍSTOK 3-FTTB")?.ticket, "kraj");
    assert.deepEqual(recipeFromHow("DUEL · 120 vs 80")?.vs, [120, 80]);
    assert.equal(recipeFromHow(""), null);
    assert.equal(recipeFromHow("niečo iné"), null);
  });
});

describe("recipeSentence", () => {
  it("reads like Slovak", () => {
    const s = recipeSentence(
      { v: 1, mode: "fs", pays: [{ id: "pdf", n: 12 }], scatters: 4, spins: 20, extra: 5, cans: [100], mult: 64 },
      (id) => (id === "pdf" ? "PDF 4K 5G" : id),
    );
    assert.equal(s, "4KA TV, 4× 4ka TV, 20 točení 4KA TV (+5 navyše), 12× PDF 4K 5G, plechovky 100×, celkový násobič 64×.");
    assert.equal(recipeSentence(null, String), "Spôsob výhry nie je zaznamenaný.");
  });
});

describe("FS tumbles", () => {
  it("sums cascades over free spins only (trigger spin reset) and clamps to the server range", () => {
    const fs = emptyTally();
    mergeTally(fs, { ...emptyTally(), tumbles: 4 }); // trigger spin
    fs.tumbles = 0; // as in use-slot-game: only the free spins count
    for (const n of [2, 0, 3, 1]) mergeTally(fs, { ...emptyTally(), tumbles: n });
    assert.equal(recipeTumbles(fs.tumbles), 6);
    assert.equal(recipeTumbles(0), undefined);
    assert.equal(recipeTumbles(140), MAX_TUMBLES);
    // the clamped value survives the client cleaner (server board_recipe_clean uses the same 1..99)
    assert.equal(cleanRecipe({ v: 1, mode: "fs", pays: [], tumbles: recipeTumbles(140) })?.tumbles, 99);
    assert.equal(cleanRecipe({ v: 1, mode: "fs", pays: [], tumbles: 140 })?.tumbles, undefined);
  });

  it("uses Slovak count words", () => {
    assert.deepEqual([1, 2, 4, 5, 12, 99].map(cascadeWord), ["kaskáda", "kaskády", "kaskády", "kaskád", "kaskád", "kaskád"]);
  });
});
