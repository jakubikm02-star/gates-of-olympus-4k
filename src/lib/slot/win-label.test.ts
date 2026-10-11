import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { TICKETS } from "./symbols.ts";
import { BOARD_KIND, boardMark, GOLD_HOW, isPoolKind, kindFromHow, PICK_HOW, pickHow, SHARE_HOW, winHow, type BoardKind } from "./win-label.ts";
import { cleanRecipe, recipeFromHow, type WinRecipe } from "./win-recipe.ts";

const ROOT = new URL("../../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, ROOT), "utf8");

/** Arguments of every `name(` call in src, split at top-level commas (strings / templates / nesting aware). */
function callArgs(src: string, name: string): string[][] {
  const out: string[][] = [];
  const re = new RegExp(`\\b${name}\\(`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    // skip the definition (`const bumpToday = useCallback((`) and dependency lists (`[bumpToday, …]`)
    let i = m.index + m[0].length;
    let depth = 0;
    let quote = "";
    let cur = "";
    const args: string[] = [];
    for (; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        cur += c;
        if (c === "\\") {
          cur += src[++i];
          continue;
        }
        if (c === quote) quote = "";
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        quote = c;
        cur += c;
        continue;
      }
      if (c === "(" || c === "{" || c === "[") depth++;
      if (c === ")" || c === "}" || c === "]") {
        if (depth === 0) break;
        depth--;
      }
      if (c === "," && depth === 0) {
        args.push(cur.trim());
        cur = "";
        continue;
      }
      cur += c;
    }
    if (cur.trim()) args.push(cur.trim());
    out.push(args);
  }
  return out;
}

const hook = read("src/hooks/use-slot-game.ts");
const calls = callArgs(hook, "bumpToday").filter((a) => a.length > 0 && !a[0].startsWith("(wager"));

/** Every label a bumpToday caller can write (the forms the grep test below allows). */
function everyLabel(): string[] {
  const out: string[] = [SHARE_HOW];
  for (const mode of Object.keys(PICK_HOW) as (keyof typeof PICK_HOW)[]) out.push(pickHow(mode, false), pickHow(mode, true));
  for (const mode of ["BASE", "ZÁSAH"] as const) {
    out.push(winHow({ mode }), winHow({ mode, pays: ["PDF 4K 5G", "hAP ac²"], pops: 3 }));
  }
  out.push(winHow({ mode: "PARKNET", spins: 17, mult: 104 }), winHow({ mode: "PARKNET", spins: 32, mult: 237, bought: true }));
  out.push(winHow({ mode: "DUEL", duel: "1200 vs 800" }));
  for (const t of Object.values(TICKETS)) out.push(`LÍSTOK ${t.name}`, winHow({ mode: "LÍSTOK", ticket: t.name }));
  return out;
}

describe("board labels: every bumpToday label has a display entry", () => {
  it("BOARD_KIND covers every kind with a label and a tooltip", () => {
    const kinds: BoardKind[] = ["base", "zasah", "fs", "buy", "duel", "ticket", "share", "kontrola", "zbox", "koleso", "unknown"];
    assert.deepEqual(Object.keys(BOARD_KIND).sort(), [...kinds].sort());
    for (const k of kinds) {
      assert.ok(BOARD_KIND[k].label.length > 0, k);
      assert.ok(BOARD_KIND[k].title.length > 0, k);
    }
  });

  it("finds all bumpToday callers in use-slot-game.ts", () => {
    // spin, 4KA TV end, KONTROLA, Ž-BOX, KOLESO, jackpot (payPoolHit), jackpot share, duel settle, duel won mid-round
    assert.ok(calls.length >= 9, `found ${calls.length}`);
  });

  it("every caller that can pay passes a label built by win-label.ts (no bare literal, no missing label)", () => {
    const allowed = [
      /^SHARE_HOW$/,
      /^pickHow\("(kontrola|zbox|koleso)", Boolean\(gold\)\)$/,
      /^winHow\(\{[\s\S]*mode: "(DUEL|PARKNET)"[\s\S]*\}\)$/,
      /^how$/, // payPoolHit(board, how, recipe): checked below
      /^countNow \? how : ""$/, // the spin: `how` is winHow({ mode: chasing ? "ZÁSAH" : "BASE", … })
    ];
    for (const args of calls) {
      if (args[1] === "0" || args[1] === undefined) continue; // stake-only
      const how = args[2];
      assert.ok(how !== undefined, `bumpToday(${args.join(", ")}) has no label: the server would keep the previous best's text`);
      assert.ok(allowed.some((re) => re.test(how)), `unexpected bumpToday label expression: ${how}`);
    }
    assert.match(hook, /winHow\(\{\s*mode: chasing \? "ZÁSAH" : "BASE",/);
    for (const args of callArgs(hook, "payPoolHit")) {
      if (args[0].startsWith("async")) continue;
      assert.match(args[1] ?? "", /^`LÍSTOK \$\{TICKETS\[tier\]\.name\}`$/, `payPoolHit label: ${args[1]}`);
    }
  });

  it("every label the game writes maps to a known kind", () => {
    for (const how of everyLabel()) {
      const k = kindFromHow(how).kind;
      assert.notEqual(k, "unknown", how);
      assert.ok(BOARD_KIND[k], how);
    }
  });

  it("pick bonuses, gold runs and the jackpot share", () => {
    assert.deepEqual(kindFromHow("KOLESO"), { kind: "koleso", gold: false });
    assert.deepEqual(kindFromHow("Ž-BOX"), { kind: "zbox", gold: false });
    assert.deepEqual(kindFromHow("KONTROLA"), { kind: "kontrola", gold: false });
    assert.deepEqual(kindFromHow(pickHow("zbox", true)), { kind: "zbox", gold: true });
    assert.equal(pickHow("koleso", true), `${GOLD_HOW} · KOLESO`);
    assert.equal(kindFromHow(SHARE_HOW).kind, "share");
    assert.equal(kindFromHow("LÍSTOK 4-FTTB").kind, "ticket");
    assert.ok(isPoolKind("share") && isPoolKind("ticket") && isPoolKind("duel") && !isPoolKind("koleso"));
  });
});

describe("board rows as stored in production (board_day, last 14 days, read 2026-10-11)", () => {
  const rec = (r: unknown) => cleanRecipe(r);
  const row = (how: string, recipe: WinRecipe | null) => boardMark(how, recipe ?? recipeFromHow(how), 0, 0).kind;
  it("maps every distinct label seen", () => {
    assert.equal(row("4KA TV · 237× · 32 točení", rec({ v: 1, mode: "buy", pays: [] })), "buy");
    assert.equal(row("4KA TV · 104× · 17 točení", rec({ v: 1, mode: "fs", pays: [] })), "fs");
    assert.equal(row("BASE · PDF 4K 5G · 1 Cluster tumble", rec({ v: 1, mode: "base", pays: [] })), "base");
    assert.equal(row("BASE · Wi-Fi router · PDF 4K 5G · 3 pop", null), "base");
    assert.equal(row("PARKNET · 72× · 22 FS", null), "fs");
    assert.equal(row("LÍSTOK podiel", null), "share");
    assert.equal(row("BASE · hAP ac² · 1 Cluster tumble", rec({ v: 1, mode: "zasah", pays: [] })), "zasah");
    assert.equal(row("Ž-BOX", null), "zbox");
    assert.equal(row("KÚPA · 5 scatter · 21 FS · 44× · SUPER MEGA", null), "buy");
    assert.equal(row("", null), "unknown");
  });
  it("new texts survive the server dropping the recipe (stake 0 / over 6200×)", () => {
    assert.equal(row(winHow({ mode: "ZÁSAH", pays: ["Krytina"] }), null), "zasah");
    assert.equal(row(winHow({ mode: "PARKNET", spins: 32, mult: 237, bought: true }), null), "buy");
    const r = recipeFromHow(winHow({ mode: "PARKNET", spins: 32, mult: 237, bought: true }));
    assert.equal(r?.mode, "buy");
    assert.equal(r?.mult, 237);
    assert.equal(r?.spins, 32);
    assert.equal(recipeFromHow("ZÁSAH · Krytina · 2 Cluster tumble")?.mode, "zasah");
  });
});

describe("boardMark extras", () => {
  it("MASÍVNA badge at 250× the stake, not for pool wins or broken stakes", () => {
    const base = cleanRecipe({ v: 1, mode: "base", pays: [] });
    assert.equal(boardMark("BASE", base, 2500, 10).massive, true);
    assert.equal(boardMark("BASE", base, 2490, 10).massive, false);
    assert.equal(boardMark("KOLESO", null, 5000, 10).massive, true);
    assert.equal(boardMark("LÍSTOK 4-FTTB", cleanRecipe({ v: 1, mode: "ticket", pays: [], ticket: "stat" }), 1e6, 1).massive, false);
    assert.equal(boardMark("BASE", base, 1e6, 1).massive, false);
  });
  it("text refines the recipe where the recipe has no mode for it", () => {
    const ticket = cleanRecipe({ v: 1, mode: "ticket", pays: [] });
    assert.equal(boardMark(SHARE_HOW, ticket).kind, "share");
    assert.equal(boardMark(pickHow("kontrola", true), null).gold, true);
  });
  it("winHow keeps the old shapes", () => {
    assert.equal(winHow({ mode: "BASE", pays: ["Krytina", "PDF 4K 5G"], pops: 1 }), "BASE · Krytina · PDF 4K 5G · 1 Cluster tumble");
    assert.equal(winHow({ mode: "PARKNET", spins: 22, mult: 72 }), "4KA TV · 72× · 22 točení");
    assert.equal(winHow({ mode: "PARKNET", spins: 22, mult: 72, bought: true }), "KÚPA · 4KA TV · 72× · 22 točení");
    assert.equal(winHow({ mode: "DUEL", duel: "5 vs 3" }), "DUEL · 5 vs 3");
    assert.ok(winHow({ mode: "LÍSTOK", ticket: "x".repeat(200) }).length <= 80);
  });
});
