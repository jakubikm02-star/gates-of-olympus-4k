import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DECENT, playRun } from "./bot.ts";
import {
  beginSpin,
  buyFourthReel,
  buyHeal,
  confirmDraft,
  createRun,
  dismissBanner,
  enemyPhase,
  face,
  finishPlayer,
  lockReel,
  removeSymbol,
  rerollShop,
  resolveLands,
  togglePick,
} from "./engine.ts";
import { entryBlock, entryPrice, sanitizeNocna } from "./entry.ts";
import { HEAL_GAIN, HEAL_PRICE, REMOVE_PRICE, REROLL_PRICE, REEL_PRICE } from "./symbols.ts";
import { sanitizePlayerSave } from "../slot/player-save.ts";

describe("Nočná smena entry", () => {
  it("charges 1 % of classic credit, clamped to 250–50 000", () => {
    assert.equal(entryPrice(0), 250);
    assert.equal(entryPrice(100), 250);
    assert.equal(entryPrice(25_000), 250);
    assert.equal(entryPrice(25_049), 250);
    assert.equal(entryPrice(80_000), 800);
    assert.equal(entryPrice(9_000_000), 50_000);
    assert.equal(entryBlock(249), "MÁLO KREDITU");
    assert.equal(entryBlock(250), null);
    assert.equal(entryBlock(80_000), null);
  });
});

describe("Nočná smena save", () => {
  it("keeps an old automat save and clamps the night-shift record", () => {
    const old = sanitizePlayerSave({ balance: 42, betIndex: 3, updatedAt: 10, playerId: "abcdefghij" });
    assert.equal(old.balance, 42);
    assert.equal(old.nocna, null);
    const kept = sanitizePlayerSave({
      balance: 80,
      nocna: { runs: 4, bestFloor: 3, bestKills: 9 },
    });
    assert.equal(kept.balance, 80);
    assert.deepEqual(kept.nocna, { runs: 4, bestFloor: 3, bestKills: 9 });
    assert.equal(sanitizeNocna({ runs: -2, bestFloor: 400, bestKills: "x" })?.bestFloor, 99);
    assert.equal(sanitizePlayerSave({ nocna: { runs: 0, bestFloor: 0, bestKills: 0 } }).nocna, null);
  });
});

describe("Nočná smena combat", () => {
  function armed() {
    let run = createRun(7, 250);
    for (const sym of ["blocek", "stit", "krimp"] as const) run = togglePick(run, sym);
    run = confirmDraft(run);
    return dismissBanner(run);
  }

  it("three Bločeks are a critical for 90, plus the výboj on the third", () => {
    let run = face(armed(), { name: "Vrece", hp: 400, shield: 0 });
    const played = resolveLands(run, ["blocek", "blocek", "blocek"]);
    run = played.run;
    assert.equal(played.plan.critSym, "blocek");
    assert.equal(played.plan.critMul, 2);
    const hits = played.fx.flat().filter((fx) => fx.t === "hit");
    assert.equal(hits.length, 3);
    const base = hits.reduce((sum, fx) => (fx.t === "hit" ? sum + fx.amount - fx.bonus : sum), 0);
    const bonus = hits.reduce((sum, fx) => (fx.t === "hit" ? sum + fx.bonus : sum), 0);
    assert.equal(base, 90);
    assert.equal(bonus, 8);
    assert.equal(run.enemy?.hp, 400 - 98);
    assert.equal(run.stats.crits, 1);
    assert.equal(run.energy, 0);
  });

  it("shield breaks before hit points and a pierce ignores it", () => {
    let run = face(armed(), { name: "Inkasák", hp: 80, shield: 0, intent: { kind: "hit", amount: 30, label: "Úder 30" } });
    run = { ...run, shield: 20, hp: 100 };
    const hit = enemyPhase(run);
    assert.equal(hit.beats[0]?.t, "hit");
    assert.equal(hit.beats[0]?.blocked, 20);
    assert.equal(hit.run.hp, 90);
    assert.equal(hit.run.shield, 0);

    let wall = face(armed(), { name: "Múr", hp: 100, shield: 40 });
    const cut = resolveLands(wall, ["exekucia", "medzera", "medzera"]);
    wall = cut.run;
    assert.equal(wall.enemy?.hp, 78);
    assert.equal(wall.enemy?.shield, 40);
  });

  it("95 natural always takes 8 HP from you", () => {
    const run = face(armed(), { name: "Vrece", hp: 200 });
    const played = resolveLands({ ...run, hp: 40 }, ["natural", "medzera", "medzera"]);
    const self = played.fx.flat().find((fx) => fx.t === "self");
    assert.equal(self && self.t === "self" ? self.amount : 0, 8);
    assert.equal(played.run.hp, 32);
  });

  it("DATA 0 kB skips the telegraphed hit", () => {
    let run = face(armed(), { name: "Neplatič", hp: 200, intent: { kind: "heavy", amount: 40, label: "Ťažký úder 40" } });
    run = { ...run, hp: 100, shield: 0 };
    const spun = resolveLands(run, ["data", "medzera", "medzera"]);
    assert.equal(spun.run.enemy?.stunned, true);
    const turn = enemyPhase(spun.run);
    assert.equal(turn.beats.some((b) => b.t === "whiff"), true);
    assert.equal(turn.run.hp, 100);
  });

  it("a kill opens the shop and the prices stay small", () => {
    let run = face(armed(), { name: "Neplatič", hp: 30 });
    run = finishPlayer(resolveLands(run, ["blocek", "blocek", "blocek"]).run);
    assert.equal(run.phase, "shop");
    assert.ok(run.coins >= 4 && run.coins <= 12);
    assert.equal(run.shop?.offers.length, 3);
    const broke = buyHeal({ ...run, coins: 4, hp: 40 });
    assert.equal(broke.hp, 40);
    const healed = buyHeal({ ...run, coins: HEAL_PRICE, hp: 40 });
    assert.equal(healed.hp, 40 + HEAL_GAIN);
    assert.equal(healed.coins, run.coins < HEAL_PRICE ? healed.coins : run.coins);
    const rerolled = rerollShop({ ...run, coins: REROLL_PRICE });
    assert.equal(rerolled.coins, 0);
    assert.equal(rerolled.shop?.offers.length, 3);
    const thin = removeSymbol({ ...run, coins: REMOVE_PRICE, deck: ["blocek", "stit", "krimp"] }, 2);
    assert.equal(thin.deck.length, 3);
    const cut = removeSymbol({ ...run, coins: REMOVE_PRICE, deck: ["blocek", "stit", "krimp", "natural"] }, 3);
    assert.deepEqual(cut.deck, ["blocek", "stit", "krimp"]);
    assert.equal(cut.coins, 0);
    assert.equal(buyFourthReel({ ...run, floor: 2, coins: REEL_PRICE }).reels, 3);
    assert.equal(buyFourthReel({ ...run, floor: 3, coins: REEL_PRICE }).reels, 4);
  });

  it("the enemy spins the same shared symbols the shop sells", () => {
    let seeded = createRun(11, 250);
    for (const sym of seeded.draft.slice(0, 3)) seeded = togglePick(seeded, sym);
    const real = dismissBanner(confirmDraft(seeded));
    const enemy = real.enemy;
    assert.ok(enemy);
    assert.equal(enemy!.lands.length, enemy!.boss ? 4 : 3);
    assert.ok(enemy!.deck.length >= 8);
    for (const sym of enemy!.lands) assert.ok(enemy!.deck.includes(sym));
    assert.ok(enemy!.intent.amount > 0);
  });

  it("the same seed stops on the same symbols", () => {
    const run = face(armed(), { name: "Neplatič", hp: 140 });
    const a = beginSpin(run);
    const b = beginSpin(run);
    assert.ok(a && b);
    assert.deepEqual(a!.spin.strips, b!.spin.strips);
    const locked = lockReel(a!.spin, 0, 3);
    assert.equal(locked.index[0], 3);
    assert.equal(lockReel(locked, 0, 1).index[0], 3);
  });
});

describe("Nočná smena curve", () => {
  it("a decent player usually sees floor 2 or 3 and rarely finishes floor 5", () => {
    const n = 80;
    let reached2 = 0;
    let reached4 = 0;
    let cleared = 0;
    let died1 = 0;
    let turns = 0;
    let fights = 0;
    for (let i = 0; i < n; i++) {
      const row = playRun(20261122 + i * 997, DECENT);
      if (row.bestFloor >= 2) reached2 += 1;
      if (row.bestFloor >= 4) reached4 += 1;
      if (row.bestFloor <= 1) died1 += 1;
      if (row.cleared5) cleared += 1;
      turns += row.turns;
      fights += row.fights;
    }
    const avg = turns / Math.max(1, fights);
    assert.ok(reached2 / n >= 0.55, `floor 2+ ${(reached2 / n).toFixed(2)}`);
    assert.ok(reached4 / n <= 0.55, `floor 4+ ${(reached4 / n).toFixed(2)}`);
    assert.ok(cleared / n <= 0.12, `cleared F5 ${(cleared / n).toFixed(2)}`);
    assert.ok(died1 / n <= 0.4, `died on F1 ${(died1 / n).toFixed(2)}`);
    assert.ok(avg >= 3 && avg <= 14, `turns/fight ${avg.toFixed(2)}`);
  });
});
