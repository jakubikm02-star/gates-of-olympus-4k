import { advanceIntent, capEnemyShield, openReel, spawnFoe } from "./enemies.ts";
import { pick, roll, shuffle } from "./rng.ts";
import {
  DOT_CAP,
  ENERGY_AT,
  ENERGY_BONUS,
  HEAL_GAIN,
  HEAL_PRICE,
  HEAL_STOCK,
  MIN_DECK,
  CORE_SYMS,
  PLAY_SYMS,
  POISON_CAP,
  REEL_PRICE,
  REMOVE_PRICE,
  REROLL_PRICE,
  SHIELD_CAP,
  START_HP,
  START_REELS,
  STRIP,
  SYM,
  critMul,
  symDef,
} from "./symbols.ts";
import type { Beat, Enemy, Fx, LiveSpin, Plan, PlanReel, Run, Shop, SymId } from "./types.ts";

function freshStats() {
  return { turns: 0, fights: 0, kills: 0, crits: 0, dealt: 0, taken: 0, coins: 0, bestFloor: 1 };
}

export function createRun(seed: number, entry = 0): Run {
  let rng = (seed >>> 0) || 1;
  const draft = dealDraft(rng);
  rng = draft.state;
  return {
    rng,
    floor: 1,
    mobsLeft: mobsOn(1),
    bossPending: true,
    ranna: 0,
    phase: "draft",
    hp: START_HP,
    maxHp: START_HP,
    shield: 0,
    coins: 0,
    energy: 0,
    reels: START_REELS,
    deck: [],
    poison: null,
    blankReels: 0,
    fightTurns: 0,
    enemy: null,
    shop: null,
    draft: draft.items,
    picks: [],
    stats: freshStats(),
    cause: "",
    entry,
    growth: {},
  };
}

export function mobsOn(floor: number): number {
  if (floor >= 6) return 0;
  return floor <= 2 ? 2 : 3;
}

function dealDraft(state: number): { state: number; items: SymId[] } {
  const rest = CORE_SYMS.filter((id) => id !== "blocek" && id !== "stit");
  const shuffled = shuffle(state, rest);
  const items = shuffle(shuffled.state, ["blocek", "stit", ...shuffled.items.slice(0, 4)] as SymId[]);
  return items;
}

export function togglePick(run: Run, sym: SymId): Run {
  if (run.phase !== "draft") return run;
  if (!run.draft.includes(sym)) return run;
  if (run.picks.includes(sym)) return { ...run, picks: run.picks.filter((id) => id !== sym) };
  if (run.picks.length >= 3) return run;
  return { ...run, picks: [...run.picks, sym] };
}

export function confirmDraft(run: Run): Run {
  if (run.phase !== "draft" || run.picks.length !== 3) return run;
  if (run.picks.some((id) => !run.draft.includes(id))) return run;
  return {
    ...run,
    phase: "banner",
    deck: run.picks.slice(),
    stats: { ...run.stats, bestFloor: 1 },
  };
}

export function dismissBanner(run: Run): Run {
  if (run.phase !== "banner") return run;
  if (run.floor >= 6) return spawn(run, "elite");
  if (run.mobsLeft > 0) return spawn(run, "mob");
  if (run.bossPending) return spawn(run, "boss");
  return spawn(run, "elite");
}

function spawn(run: Run, kind: "mob" | "boss" | "elite"): Run {
  const born = spawnFoe(kind, run.floor, kind === "elite" ? run.ranna + 1 : run.ranna, run.rng);
  return {
    ...run,
    rng: born.rng,
    phase: "fight",
    mobsLeft: kind === "mob" ? Math.max(0, run.mobsLeft - 1) : run.mobsLeft,
    bossPending: kind === "boss" ? false : run.bossPending,
    ranna: kind === "elite" ? run.ranna + 1 : run.ranna,
    enemy: born.enemy,
    fightTurns: 0,
    blankReels: 0,
    energy: 0,
    stats: {
      ...run.stats,
      fights: run.stats.fights + 1,
      bestFloor: Math.max(run.stats.bestFloor, run.floor),
    },
  };
}

function drawSym(state: number, deck: readonly SymId[]): { state: number; sym: SymId } {
  const bag = deck.length ? deck : (["blocek"] as SymId[]);
  const r = pick(state, bag);
  return { state: r.state, sym: r.item };
}

function makeStrip(state: number, deck: readonly SymId[]): { state: number; strip: SymId[] } {
  const strip: SymId[] = [];
  let s = state;
  const bag = deck.length ? deck : (["blocek"] as SymId[]);
  while (strip.length < STRIP) {
    const shuffled = shuffle(s, bag);
    s = shuffled.state;
    for (const sym of shuffled.items) {
      strip.push(sym);
      if (strip.length >= STRIP) break;
    }
  }
  return { state: s, strip };
}

export function beginSpin(run: Run): { run: Run; spin: LiveSpin } | null {
  if (run.phase !== "fight" || !run.enemy || run.hp <= 0) return null;
  const n = run.reels;
  const blanks = Math.max(0, Math.min(n - 1, run.blankReels));
  const strips: SymId[][] = [];
  const index: (number | null)[] = [];
  const blankFlags: boolean[] = [];
  let rng = run.rng;
  for (let i = 0; i < n; i++) {
    const blank = i >= n - blanks;
    blankFlags.push(blank);
    if (blank) {
      strips.push(["medzera"]);
      index.push(0);
    } else {
      const made = makeStrip(rng, run.deck);
      rng = made.state;
      strips.push(made.strip);
      index.push(null);
    }
  }
  return {
    run: { ...run, rng, blankReels: 0, fightTurns: run.fightTurns + 1, stats: { ...run.stats, turns: run.stats.turns + 1 } },
    spin: { strips, index, blanks: blankFlags },
  };
}

export function lockReel(spin: LiveSpin, reel: number, at: number): LiveSpin {
  if (reel < 0 || reel >= spin.strips.length) return spin;
  if (spin.index[reel] != null) return spin;
  const strip = spin.strips[reel]!;
  const index = strip.length ? ((Math.floor(at) % strip.length) + strip.length) % strip.length : 0;
  const next = spin.index.slice();
  next[reel] = index;
  return { ...spin, index: next };
}

export function nextOpenReel(spin: LiveSpin): number {
  return spin.index.findIndex((n) => n == null);
}

export function spinReady(spin: LiveSpin): boolean {
  return spin.index.every((n) => n != null);
}

function landed(spin: LiveSpin): SymId[] {
  return spin.strips.map((strip, i) => strip[spin.index[i] ?? 0] ?? "medzera");
}

export function sealSpin(run: Run, spin: LiveSpin): { run: Run; plan: Plan } {
  let rng = run.rng;
  let lands = landed(spin);
  const rerolls: Plan["rerolls"] = [];
  for (let i = 0; i < lands.length; i++) {
    if (lands[i] !== "restart") continue;
    const a = drawSym(rng, run.deck);
    rng = a.state;
    rerolls.push({ reel: i, from: "restart", to: a.sym });
    lands[i] = a.sym;
    if (lands[i] === "restart") {
      const b = drawSym(rng, run.deck);
      rng = b.state;
      const to = b.sym === "restart" ? "medzera" : b.sym;
      rerolls.push({ reel: i, from: "restart", to });
      lands[i] = to;
    }
  }
  const counts = new Map<SymId, number>();
  for (const sym of lands) {
    if (sym === "medzera" || sym === "restart") continue;
    counts.set(sym, (counts.get(sym) ?? 0) + 1);
  }
  let critSym: SymId | null = null;
  let best = 1;
  let wilds = 0;
  for (const [sym, n] of counts) {
    if (symDef(sym)?.hook === "wild") {
      wilds += n;
      continue;
    }
    if (n > best) {
      best = n;
      critSym = sym;
    }
  }
  if (critSym && wilds) best += wilds;
  if (!critSym && wilds >= 3) {
    critSym = "tv";
    best = wilds;
  }
  if (best < 3) critSym = null;
  let mul = critSym ? critMul(best) : 1;
  if (lands.includes("crown")) mul = Math.max(2, mul);
  const reels: PlanReel[] = lands.map((sym, reel) => ({
    reel,
    sym,
    crit: sym === "crown" || Boolean(critSym && (sym === critSym || symDef(sym)?.hook === "wild")),
  }));
  return { run: { ...run, rng }, plan: { lands, rerolls, critSym, critMul: mul, reels } };
}

function hurtEnemy(enemy: Enemy, amount: number, pierce: boolean): { enemy: Enemy; dealt: number; blocked: number } {
  const dmg = Math.max(0, Math.round(amount));
  if (dmg <= 0) return { enemy, dealt: 0, blocked: 0 };
  if (pierce) {
    return { enemy: { ...enemy, hp: enemy.hp - dmg }, dealt: dmg, blocked: 0 };
  }
  const blocked = Math.min(enemy.shield, dmg);
  return {
    enemy: { ...enemy, shield: enemy.shield - blocked, hp: enemy.hp - (dmg - blocked) },
    dealt: dmg,
    blocked,
  };
}

function gainShield(run: Run, amount: number): { run: Run; gained: number } {
  const room = Math.max(0, SHIELD_CAP - run.shield);
  const gained = Math.max(0, Math.min(room, Math.round(amount)));
  return { run: { ...run, shield: run.shield + gained }, gained };
}

function gainHp(run: Run, amount: number): { run: Run; gained: number } {
  const room = Math.max(0, run.maxHp - run.hp);
  const gained = Math.max(0, Math.min(room, Math.round(amount)));
  return { run: { ...run, hp: run.hp + gained }, gained };
}

function die(run: Run, cause: string): Run {
  return { ...run, hp: Math.min(0, run.hp), phase: "dead", cause, enemy: run.enemy ? { ...run.enemy, hp: Math.max(0, run.enemy.hp) } : null };
}

export function resolveReel(run: Run, plan: Plan, reel: number): { run: Run; fx: Fx[] } {
  const step = plan.reels[reel];
  if (!step || run.phase !== "fight" || !run.enemy || run.hp <= 0) return { run, fx: [] };
  const sym = step.sym;
  const def = symDef(sym);
  const fx: Fx[] = [];
  if (!def || sym === "medzera") {
    fx.push({ t: "blank" });
    return { run, fx };
  }
  const cm = step.crit ? plan.critMul : 1;
  let enemy = run.enemy;
  let next: Run = run;
  let dealt = 0;

  const strike = (raw: number, pierce: boolean, bonus: number) => {
    const amount = Math.max(0, Math.round(raw));
    const hit = hurtEnemy(enemy, amount, pierce);
    enemy = hit.enemy;
    dealt += hit.dealt;
    fx.push({ t: "hit", amount: hit.dealt, crit: step.crit, pierce, blocked: hit.blocked, bonus });
  };

  let raw = def.dmg;
  if (def.hook === "left") raw = step.reel === 0 ? def.dmg + 10 : def.dmg;
  if (def.hook === "right") raw = step.reel === plan.lands.length - 1 ? def.dmg * 2 : def.dmg;
  if (def.hook === "chain") {
    const mates = plan.lands.filter((id) => id === sym).length;
    raw = mates >= 2 ? Math.max(def.dmg, 16) : def.dmg;
  }
  if (def.hook === "copy" && step.reel > 0) {
    const left = symDef(plan.lands[step.reel - 1] ?? "medzera");
    raw = left && left.dmg > 0 ? left.dmg : def.dmg;
  }
  if (def.hook === "grow") {
    const seen = next.growth[sym] ?? 0;
    raw = def.dmg + seen * 3;
    next = { ...next, growth: { ...next.growth, [sym]: seen + 1 } };
  }
  if (def.hook === "burst") {
    const at = next.deck.indexOf(sym);
    if (at >= 0 && next.deck.length > 3) {
      const deck = next.deck.slice();
      deck.splice(at, 1);
      next = { ...next, deck };
    }
  }
  if (raw > 0) {
    let bonus = 0;
    let energy = next.energy;
    energy += 1;
    if (energy >= ENERGY_AT) {
      bonus = ENERGY_BONUS;
      energy = 0;
    }
    next = { ...next, energy };
    strike(raw * cm + bonus, def.pierce, bonus);
  }
  if (def.hook === "double" && step.reel > 0) {
    const left = symDef(plan.lands[step.reel - 1] ?? "medzera");
    if (left && left.dmg > 0) strike(Math.round(left.dmg * cm), left.pierce, 0);
  }

  if (def.dot > 0) {
    const tick = Math.max(1, Math.round(def.dot * cm));
    const prev = enemy.dot;
    const dmg = Math.min(DOT_CAP, (prev?.dmg ?? 0) + tick);
    enemy = { ...enemy, dot: { dmg, left: Math.max(prev?.left ?? 0, def.dotTurns) } };
    fx.push({ t: "dot", amount: tick, turns: def.dotTurns, immediate: 0, crit: step.crit });
  }

  if (def.shield > 0) {
    const gained = gainShield(next, def.shield * cm);
    next = gained.run;
    fx.push({ t: "shield", amount: gained.gained, crit: step.crit });
  }
  if (def.heal > 0) {
    const gained = gainHp(next, def.heal * cm);
    next = gained.run;
    fx.push({ t: "heal", amount: gained.gained, crit: step.crit });
  }
  if (def.coins > 0) {
    const amount = Math.max(0, Math.round(def.coins * cm));
    next = {
      ...next,
      coins: next.coins + amount,
      stats: { ...next.stats, coins: next.stats.coins + amount },
    };
    fx.push({ t: "coin", amount, crit: step.crit });
  }
  if (def.stun) {
    let slap = 0;
    if (enemy.stunned) {
      const hit = hurtEnemy(enemy, Math.round(8 * cm), false);
      enemy = hit.enemy;
      dealt += hit.dealt;
      slap = hit.dealt;
    } else {
      enemy = { ...enemy, stunned: true };
    }
    if (step.crit) {
      const hit = hurtEnemy(enemy, Math.round(10 * (plan.critMul > 2 ? 2 : 1)), false);
      enemy = hit.enemy;
      dealt += hit.dealt;
      slap += hit.dealt;
    }
    fx.push({ t: "stun", crit: step.crit, slap });
  }
  if (def.self > 0) {
    const amount = def.self;
    next = { ...next, hp: next.hp - amount, stats: { ...next.stats, taken: next.stats.taken + amount } };
    fx.push({ t: "self", amount });
    if (next.hp <= 0) next = die(next, "95 natural — vlastná dávka");
  }

  if (dealt > 0) next = { ...next, stats: { ...next.stats, dealt: next.stats.dealt + dealt } };
  const firstCrit = plan.reels.findIndex((row) => row.crit);
  if (step.crit && step.reel === firstCrit) {
    next = { ...next, stats: { ...next.stats, crits: next.stats.crits + 1 } };
  }
  next = { ...next, enemy: enemy.hp < 0 ? { ...enemy, hp: enemy.hp } : enemy };
  return { run: next, fx };
}

/** Apply a full landed row. Used by tests and the sim. */
export function resolveLands(run: Run, lands: SymId[]): { run: Run; plan: Plan; fx: Fx[][] } {
  const spin: LiveSpin = {
    strips: lands.map((sym) => [sym]),
    index: lands.map(() => 0),
    blanks: lands.map((sym) => sym === "medzera"),
  };
  const sealed = sealSpin(run, spin);
  const fx: Fx[][] = [];
  let cur = sealed.run;
  for (let i = 0; i < lands.length; i++) {
    if (cur.phase === "dead") {
      fx.push([]);
      continue;
    }
    const step = resolveReel(cur, sealed.plan, i);
    cur = step.run;
    fx.push(step.fx);
  }
  return { run: cur, plan: sealed.plan, fx };
}

export function finishPlayer(run: Run): Run {
  if (run.phase !== "fight" || !run.enemy) return run;
  if (run.hp <= 0) return die(run, run.cause || "Koniec smeny");
  if (run.enemy.hp <= 0) return onKill(run);
  return run;
}

function purse(run: Run, enemy: Enemy): number {
  if (enemy.elite || run.floor >= 6) return 7 + Math.min(10, Math.floor(Math.max(0, run.ranna - 1) / 2));
  if (enemy.boss) return 8 + run.floor * 2;
  return 3 + run.floor;
}

function onKill(run: Run): Run {
  const enemy = run.enemy;
  if (!enemy) return run;
  const gain = purse(run, enemy);
  const clearedBoss = enemy.boss;
  let next: Run = {
    ...run,
    enemy: { ...enemy, hp: 0 },
    coins: run.coins + gain,
    stats: { ...run.stats, kills: run.stats.kills + 1, coins: run.stats.coins + gain },
    poison: run.poison,
  };
  if (clearedBoss && run.floor >= 5) {
    next = { ...next, stats: { ...next.stats, bestFloor: Math.max(next.stats.bestFloor, 5) } };
  }
  return openShop(next);
}

function weightedSym(state: number, deck: readonly SymId[]): { state: number; sym: SymId } {
  const bag: SymId[] = [];
  for (const id of PLAY_SYMS) {
    const have = deck.filter((s) => s === id).length;
    const w = Math.max(1, SYM[id].weight - have * 2);
    for (let i = 0; i < w; i++) bag.push(id);
  }
  const got = pick(state, bag);
  return { state: got.state, sym: got.item };
}

function rollShop(run: Run): { run: Run; shop: Shop } {
  const offers: Shop["offers"] = [];
  let rng = run.rng;
  const used = new Set<SymId>();
  while (offers.length < 3) {
    const drawn = weightedSym(rng, run.deck);
    rng = drawn.state;
    if (used.has(drawn.sym) && used.size < PLAY_SYMS.length) continue;
    used.add(drawn.sym);
    const priced = symDef(drawn.sym);
    if (!priced) continue;
    offers.push({ sym: drawn.sym, price: priced.price });
  }
  return { run: { ...run, rng }, shop: { offers, heals: 0, rerolled: false } };
}

function openShop(run: Run): Run {
  const rolled = rollShop({ ...run, phase: "shop", enemy: null });
  return { ...rolled.run, phase: "shop", shop: rolled.shop, enemy: null };
}

export function buyOffer(run: Run, index: number): Run {
  const shop = run.shop;
  if (run.phase !== "shop" || !shop) return run;
  const offer = shop.offers[index];
  if (!offer || run.coins < offer.price) return run;
  const offers = shop.offers.slice();
  offers.splice(index, 1);
  return {
    ...run,
    coins: run.coins - offer.price,
    deck: [...run.deck, offer.sym],
    shop: { ...shop, offers },
  };
}

export function buyHeal(run: Run): Run {
  const shop = run.shop;
  if (run.phase !== "shop" || !shop) return run;
  if (shop.heals >= HEAL_STOCK || run.coins < HEAL_PRICE || run.hp >= run.maxHp) return run;
  const gained = gainHp(run, HEAL_GAIN);
  return { ...gained.run, coins: run.coins - HEAL_PRICE, shop: { ...shop, heals: shop.heals + 1 } };
}

export function rerollShop(run: Run): Run {
  if (run.phase !== "shop" || !run.shop || run.coins < REROLL_PRICE) return run;
  const paid = { ...run, coins: run.coins - REROLL_PRICE };
  const rolled = rollShop(paid);
  return { ...rolled.run, shop: { ...rolled.shop, heals: run.shop.heals, rerolled: true } };
}

export function removeSymbol(run: Run, index: number): Run {
  if (run.phase !== "shop" || !run.shop) return run;
  if (run.deck.length <= MIN_DECK || run.coins < REMOVE_PRICE) return run;
  if (index < 0 || index >= run.deck.length) return run;
  const deck = run.deck.slice();
  deck.splice(index, 1);
  return { ...run, coins: run.coins - REMOVE_PRICE, deck };
}

export function buyFourthReel(run: Run): Run {
  if (run.phase !== "shop" || run.reels >= 4 || run.floor < 3 || run.coins < REEL_PRICE) return run;
  return { ...run, coins: run.coins - REEL_PRICE, reels: 4 };
}

export function leaveShop(run: Run): Run {
  if (run.phase !== "shop") return run;
  const bare = { ...run, shop: null };
  if (run.floor >= 6) return spawn(bare, "elite");
  if (run.mobsLeft > 0) return spawn(bare, "mob");
  if (run.bossPending) return spawn(bare, "boss");
  const nextFloor = run.floor + 1;
  if (nextFloor > 5) {
    return {
      ...bare,
      floor: 6,
      phase: "banner",
      mobsLeft: 0,
      bossPending: false,
      ranna: 0,
      stats: { ...bare.stats, bestFloor: Math.max(bare.stats.bestFloor, 6) },
    };
  }
  return {
    ...bare,
    floor: nextFloor,
    phase: "banner",
    mobsLeft: mobsOn(nextFloor),
    bossPending: true,
    stats: { ...bare.stats, bestFloor: Math.max(bare.stats.bestFloor, nextFloor) },
  };
}

/** Poison on the player, before the reels. */
export function playerUpkeep(run: Run): { run: Run; beat: Beat | null } {
  if (run.phase !== "fight" || !run.poison || run.poison.left <= 0) return { run, beat: null };
  const amount = run.poison.dmg;
  const left = run.poison.left - 1;
  let next: Run = {
    ...run,
    hp: run.hp - amount,
    poison: left > 0 ? { dmg: run.poison.dmg, left } : null,
    stats: { ...run.stats, taken: run.stats.taken + amount },
  };
  const beat: Beat = { t: "poison", amount, blocked: 0, text: `Jed ${amount}` };
  if (next.hp <= 0) next = die(next, "Jed ťa dorazil");
  return { run: next, beat };
}

function hurtPlayer(run: Run, amount: number, pierce: boolean): { run: Run; lost: number; blocked: number } {
  let dmg = Math.max(0, Math.round(amount));
  let blocked = 0;
  if (!pierce) {
    blocked = Math.min(run.shield, dmg);
    dmg -= blocked;
  }
  const next: Run = {
    ...run,
    shield: run.shield - blocked,
    hp: run.hp - dmg,
    stats: { ...run.stats, taken: run.stats.taken + dmg },
  };
  return { run: next, lost: dmg, blocked };
}

function rageMul(turns: number): number {
  if (turns >= 36) return 3;
  if (turns >= 24) return 2;
  return 1;
}

export function enemyPhase(run: Run): { run: Run; beats: Beat[] } {
  if (run.phase !== "fight" || !run.enemy || run.hp <= 0) return { run, beats: [] };
  const beats: Beat[] = [];
  let enemy = run.enemy;
  let next = run;
  if (enemy.dot && enemy.dot.left > 0) {
    const amount = enemy.dot.dmg;
    const left = enemy.dot.left - 1;
    enemy = { ...enemy, hp: enemy.hp - amount, dot: left > 0 ? { dmg: enemy.dot.dmg, left } : null };
    next = { ...next, enemy, stats: { ...next.stats, dealt: next.stats.dealt + amount } };
    beats.push({ t: "dot", amount, blocked: 0, text: `Jed ${amount}` });
    if (enemy.hp <= 0) return { run: onKill(next), beats };
  }
  if (enemy.stunned) {
    enemy = advanceIntent({ ...enemy, stunned: false });
    beats.push({ t: "whiff", amount: 0, blocked: 0, text: "Omámený" });
    return { run: { ...next, enemy }, beats };
  }
  const intent = enemy.intent;
  const mul = rageMul(next.fightTurns);
  const amount = Math.max(1, Math.round(intent.amount * mul));
  const applyHit = (dmg: number, pierce: boolean) => {
    const hit = hurtPlayer(next, dmg, pierce);
    next = hit.run;
    const blockedAll = hit.lost <= 0 && hit.blocked > 0;
    beats.push({
      t: blockedAll ? "block" : "hit",
      amount: hit.lost,
      blocked: hit.blocked,
      text: blockedAll ? `Štít udržal ${hit.blocked}` : `Zásah ${hit.lost}`,
    });
  };
  if (intent.kind === "hit" || intent.kind === "heavy") applyHit(amount, false);
  else if (intent.kind === "pierce") applyHit(amount, true);
  else if (intent.kind === "double") {
    applyHit(amount, false);
    if (next.hp > 0) applyHit(amount, false);
  } else if (intent.kind === "shield") {
    const gained = capEnemyShield(enemy.shield + amount) - enemy.shield;
    enemy = { ...enemy, shield: enemy.shield + gained };
    beats.push({ t: "heal", amount: gained, blocked: 0, text: `Štít +${gained}` });
  } else if (intent.kind === "heal") {
    const room = Math.max(0, enemy.maxHp - enemy.hp);
    const gained = Math.min(room, amount);
    enemy = { ...enemy, hp: enemy.hp + gained };
    beats.push({ t: "heal", amount: gained, blocked: 0, text: `Liečenie ${gained}` });
  } else if (intent.kind === "poison") {
    applyHit(Math.max(1, Math.round(amount * 0.6)), false);
    if (next.hp > 0) {
      const prev = next.poison;
      const dmg = Math.min(POISON_CAP, (prev?.dmg ?? 0) + amount);
      next = { ...next, poison: { dmg, left: Math.max(prev?.left ?? 0, intent.turns ?? 3) } };
      beats.push({ t: "poison", amount, blocked: 0, text: `Jed ${amount}` });
    }
  } else if (intent.kind === "steal") {
    const coins = Math.min(next.coins, intent.turns ?? 2);
    next = { ...next, coins: next.coins - coins };
    beats.push({ t: "steal", amount: coins, blocked: 0, text: coins > 0 ? `Krádež ${coins}` : "Nemáš čo ukradnúť" });
    applyHit(amount, false);
  } else if (intent.kind === "stun") {
    applyHit(amount, false);
    if (next.hp > 0) {
      next = { ...next, blankReels: Math.max(next.blankReels, 1) };
      beats.push({ t: "stun", amount: 0, blocked: 0, text: "Pečiatka — valec zamrzne" });
    }
  }
  if (next.hp <= 0) {
    next = die({ ...next, enemy }, `${enemy.name} ťa dorazil`);
    return { run: next, beats };
  }
  enemy = advanceIntent(enemy);
  const rolled = openReel(enemy, next.rng);
  return { run: { ...next, rng: rolled.rng, enemy: rolled.enemy }, beats };
}

/** Replace the living enemy. Tests pin a fixture without rolling the floor table. */
export function face(
  run: Run,
  foe: Pick<Enemy, "name" | "hp"> & Partial<Pick<Enemy, "shield" | "intent" | "id" | "art">>,
): Run {
  const intent = foe.intent ?? { kind: "hit" as const, amount: 10, label: "Úder 10" };
  const enemy: Enemy = {
    id: foe.id ?? "fixture",
    name: foe.name,
    art: foe.art ?? "",
    taunt: "",
    boss: false,
    elite: false,
    hp: foe.hp,
    maxHp: foe.hp,
    shield: foe.shield ?? 0,
    dot: null,
    stunned: false,
    pattern: [intent, intent],
    pi: 0,
    intent,
    reel: "blocek",
    kit: [],
    roll: 0,
  };
  return { ...run, phase: "fight", enemy, fightTurns: 1 };
}

export function resign(run: Run): Run {
  if (run.phase === "dead") return run;
  return { ...run, phase: "dead", cause: "Vzdal si to pred koncom" };
}

export function clearedFifth(run: Run): boolean {
  return run.floor >= 6 || (run.floor === 5 && run.phase !== "dead" && !run.bossPending && run.mobsLeft === 0 && run.phase !== "fight");
}
