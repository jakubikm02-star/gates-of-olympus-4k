import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { claimChallenges, challengesOn, emptyChallenges } from "./challenges.ts";
import { buyPerk, emptyDielna, grantScrews, respec, screwsFor } from "./dielna.ts";
import { freshDj, focusClone, scriptDj, twistLands } from "./blastbeat.ts";
import { postMortem } from "./review.ts";
import { DECENT, playRun } from "./bot.ts";
import { spawnFoe } from "./enemies.ts";
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
    for (const sym of ["blocek", "stit", "konektor", "gemr", "gemb", "roof"] as const) seeded = togglePick(seeded, sym);
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

describe("DJ Blastbeat", () => {
  it("a mark mutes the window only after the cymbal is armed", () => {
    const quiet = freshDj();
    quiet.clones.push({ hp: 26, maxHp: 26, mark: 1, armed: false, black: false });
    assert.equal(twistLands(["blocek", "krimp", "stit"], quiet).lands[1], "krimp");
    const armed = freshDj();
    armed.clones.push({ hp: 26, maxHp: 26, mark: 1, armed: true, black: false });
    const hit = twistLands(["blocek", "krimp", "stit"], armed);
    assert.equal(hit.lands[1], "medzera");
    assert.equal(hit.dj.clones[0]?.mark, null);
  });

  it("the fan slides one symbol sideways and then is spent", () => {
    const dj = freshDj();
    dj.fan = { reel: 0, dir: 1 };
    const moved = twistLands(["krimp", "blocek", "stit"], dj);
    assert.deepEqual(moved.lands, ["blocek", "krimp", "stit"]);
    assert.equal(moved.dj.fan, null);
  });

  it("floor 4 is the DJ, and a chosen clone takes the hit", () => {
    const born = spawnFoe("boss", 4, 0, 4);
    assert.equal(born.enemy.id, "blastbeat");
    assert.equal(born.enemy.windows, 4);
    const scripted = scriptDj(born.enemy, [], 3, 9);
    assert.ok((scripted.enemy.dj?.clones.length ?? 0) >= 1);
    let run = face(createRun(4), { name: "DJ Blastbeat", hp: 620, id: "blastbeat" });
    run = { ...run, enemy: { ...scripted.enemy, hp: 620, maxHp: 620 } };
    run = focusClone(run, 0);
    const before = run.enemy?.dj?.clones[0]?.hp ?? 0;
    const played = resolveLands(run, ["blocek", "stit", "stit"]);
    assert.ok((played.run.enemy?.dj?.clones[0]?.hp ?? before) < before);
    assert.equal(played.run.enemy?.hp, 620);
  });

  it("Syntík buffs the neighbouring PARKVOLT symbol", () => {
    const plain = resolveLands(face(createRun(2), { name: "cieľ", hp: 400 }), ["krimp", "blocek", "stit"]);
    const buffed = resolveLands(face(createRun(2), { name: "cieľ", hp: 400 }), ["syntik", "krimp", "stit"]);
    assert.ok(buffed.run.stats.dealt > plain.run.stats.dealt);
  });

  it("a stun drops the tempo", () => {
    const born = spawnFoe("boss", 4, 0, 6);
    const enemy = { ...born.enemy, stunned: true, lands: ["cymbal" as const], dj: { ...born.enemy.dj!, bpm: 120 } };
    const run = { ...face(createRun(6), { name: "DJ", hp: 80 }), enemy };
    const phased = enemyPhase(run);
    assert.equal(phased.run.enemy?.dj?.bpm, 84);
    assert.equal(phased.beats.some((beat) => beat.text === "Omámený"), true);
  });
});

describe("Dielňa", () => {
  it("pays screws from the floor and the fights, and caps a move", () => {
    assert.equal(screwsFor(1, 0), 3);
    assert.equal(screwsFor(4, 5), 17);
    let shop = grantScrews(emptyDielna(), 4, 8);
    assert.equal(shop.screws, 20);
    shop = buyPerk(shop, "krimp", "dmg");
    assert.equal(shop.perks.krimp?.dmg, 1);
    assert.equal(shop.screws, 8);
    const moved = respec({ ...shop, screws: 8 }, "krimp", "blocek", "dmg");
    assert.equal(moved.perks.krimp?.dmg, 0);
    assert.equal(moved.perks.blocek?.dmg, 1);
    assert.equal(moved.screws, 2);
  });

  it("a new run keeps three reels and drops the run-only levels", () => {
    let run = createRun(3, 250);
    for (const sym of ["blocek", "stit", "konektor", "gemr", "gemb", "roof"] as const) run = togglePick(run, sym);
    run = confirmDraft({ ...run, reels: 5, levels: { blocek: 3 }, pro: ["blocek"] });
    assert.equal(run.reels, 3);
    assert.equal(run.levels.blocek, undefined);
    assert.deepEqual(run.pro, []);
    assert.equal(run.deck.length, 6);
  });

  it("the death card quotes the run and the same day always deals the same challenges", () => {
    let run = face(createRun(1), { name: "Pokuta", hp: 10 });
    run = { ...run, hp: 0, phase: "dead", cause: "Pokuta ťa dorazila", stats: { ...run.stats, bestFloor: 2, kills: 1 }, trace: { ...run.trace, chemBad: 4, chemGood: 1, callHits: 0, callMiss: 3 } };
    const card = postMortem(run);
    assert.match(card.cause, /Pokuta/);
    assert.equal(card.screws, screwsFor(2, 1));
    assert.ok(card.gaps.length >= 1);
    const a = challengesOn("2026-11-25").map((row) => row.id);
    const b = challengesOn("2026-11-25").map((row) => row.id);
    assert.deepEqual(a, b);
    assert.equal(a.length, 3);
    const ready = {
      ...run,
      stats: { ...run.stats, bestFloor: 5, kills: 8, crits: 3 },
      trace: { ...run.trace, chemRow: 3, bosses: 1, allIns: 0 },
    };
    const claim = claimChallenges(emptyChallenges("2026-11-25"), ready, "2026-11-25");
    assert.ok(claim.gained >= 6);
    assert.equal(claimChallenges(claim.state, { ...run, stats: { ...run.stats, bestFloor: 3 } }, "2026-11-25").gained, 0);
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
