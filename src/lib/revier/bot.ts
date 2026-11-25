import { aimDj } from "./blastbeat.ts";
import { botSpend, emptyDielna, grantScrews, type Dielna } from "./dielna.ts";
import {
  armWager,
  beginSpin,
  buyEquip,
  buyFifthReel,
  buyFourthReel,
  buyHeal,
  buyKeys,
  buyOffer,
  confirmDraft,
  createRun,
  dismissBanner,
  enemyPhase,
  finishPlayer,
  fireSuper,
  holdReel,
  leaveShop,
  lockReel,
  nextOpenReel,
  playerUpkeep,
  removeSymbol,
  rerollShop,
  resolveReel,
  sealSpin,
  takeFace,
  togglePick,
} from "./engine.ts";
import { roll } from "./rng.ts";
import { EQUIP_PRICE, HEAL_PRICE, HOLD_PRICE, REEL5_PRICE, REEL_PRICE, REMOVE_PRICE, REROLL_PRICE, SUPPORT_PRICE, SYM, symDef } from "./symbols.ts";
import type { Intent, Run, SymId } from "./types.ts";

export interface BotProfile {
  id: string;
  /** How many upcoming strip symbols the bot can actually hit. */
  look: number;
  /** Chance to take the best symbol in that window. */
  focus: number;
}

/** A careful player: reads the intent and fishes a little. No timing minigame. */
export const DECENT: BotProfile = { id: "decent", look: 2, focus: 0.62 };

export interface RunSummary {
  floor: number;
  bestFloor: number;
  cleared5: boolean;
  turns: number;
  fights: number;
  kills: number;
  crits: number;
  cause: string;
  coins: number;
  hp: number;
}

const DRAFT: Partial<Record<SymId, number>> = {
  blocek: 10,
  stit: 9,
  krimp: 8,
  exekucia: 7,
  parkvolt: 6,
  boticka: 5,
  data: 5,
  konektor: 4,
  restart: 3,
  natural: 1,
  medzera: 0,
};

function incoming(intent: Intent): number {
  if (intent.kind === "shield" || intent.kind === "heal") return 0;
  if (intent.kind === "double") return intent.amount * 2;
  return intent.amount;
}

function scoreOf(sym: SymId): number {
  if (DRAFT[sym] != null) return DRAFT[sym]!;
  if (sym === "pokuta" || sym === "medzera") return -20;
  const def = symDef(sym);
  if (!def) return 0;
  return Math.round(def.dmg * 0.35 + def.shield * 0.28 + def.heal * 0.3 + def.dot * 1.2 + (def.stun ? 7 : 0) + def.coins * 2);
}

function want(run: Run, sym: SymId): number {
  const enemy = run.enemy;
  if (!enemy) return scoreOf(sym);
  const threat = incoming(enemy.intent) > run.shield + 4 || run.hp <= 42;
  const almost = enemy.hp + enemy.shield <= 40;
  switch (sym) {
    case "blocek":
      return almost ? 42 : 18;
    case "krimp":
      return almost ? 50 : 26;
    case "exekucia":
      return enemy.shield > 0 ? 40 : 22;
    case "stit":
      return threat ? 46 : 8;
    case "data":
      return threat ? 44 : 9;
    case "parkvolt":
      return run.hp < 36 ? 52 : run.hp < 72 ? 13 : 3;
    case "boticka":
      return enemy.shield > 10 ? 20 : 15;
    case "konektor":
      return run.coins < 6 ? 12 : 5;
    case "natural":
      if (run.hp <= 16) return -80;
      return run.hp > 40 ? (almost ? 36 : 14) : -40;
    case "restart":
      return 4;
    case "pokuta":
      return -40;
    default: {
      const def = symDef(sym);
      if (!def) return 0;
      if (def.self > 0 && run.hp < 36) return -28;
      let score = def.dmg * 0.45 + def.shield * 0.3 + def.heal * 0.4 + def.dot + (def.stun ? 8 : 0);
      if (def.pierce && enemy.shield > 0) score += 10;
      if (def.shield > 0 && threat) score += 12;
      if (def.dmg > 0 && almost) score += 10;
      return Math.round(score);
    }
  }
}

function chooseStop(run: Run, strip: readonly SymId[], profile: BotProfile): { run: Run; index: number } {
  const start = roll(run.rng);
  const origin = Math.floor(start.n * strip.length);
  const look = Math.max(1, Math.min(strip.length, profile.focus > 0 ? profile.look : 1));
  const window: number[] = [];
  for (let i = 0; i < look; i++) window.push((origin + i) % strip.length);
  const focused = roll(start.state);
  const tossed = roll(focused.state);
  let index = window[Math.floor(tossed.n * window.length)] ?? origin;
  if (focused.n < profile.focus) {
    let best = -Infinity;
    for (const at of window) {
      const score = want(run, strip[at] ?? "medzera");
      if (score > best) {
        best = score;
        index = at;
      }
    }
  }
  const picked = strip[index] ?? "medzera";
  const self = picked === "natural" ? 8 : 0;
  if (self > 0 && run.hp <= self + 4) {
    const safer = window.find((at) => strip[at] !== "natural");
    if (safer != null) index = safer;
  }
  return { run: { ...run, rng: tossed.state }, index };
}

function draft(run: Run): Run {
  const preferred: SymId[] = ["krimp", "blocek", "stit", "konektor", "gemr", "roof"];
  let next = run;
  for (const sym of preferred) next = togglePick(next, sym);
  return confirmDraft(next);
}

function worstIndex(run: Run): number {
  let at = -1;
  let score = Infinity;
  const counts = new Map<SymId, number>();
  for (const sym of run.deck) counts.set(sym, (counts.get(sym) ?? 0) + 1);
  run.deck.forEach((sym, i) => {
    let s = scoreOf(sym);
    if ((counts.get(sym) ?? 0) > 2 && sym !== "blocek" && sym !== "krimp") s -= 4;
    if (sym === "natural" && run.hp < 60) s -= 6;
    if (s < score) {
      score = s;
      at = i;
    }
  });
  return score <= 4 ? at : -1;
}

function shop(run: Run): Run {
  let next = run;
  for (let step = 0; step < 8; step++) {
    const stock = next.shop;
    if (!stock || next.phase !== "shop") break;
    if (next.hp <= 55 && next.hp < next.maxHp && next.coins >= HEAL_PRICE && stock.heals < 2) {
      const bought = buyHeal(next);
      if (bought !== next) {
        next = bought;
        continue;
      }
    }
    if (stock.faces.length > 0 && next.deck.length < 8) {
      let at = -1;
      let bestFace = 14;
      stock.faces.forEach((sym, i) => {
        const score = scoreOf(sym);
        if (score > bestFace) {
          bestFace = score;
          at = i;
        }
      });
      if (at >= 0) {
        next = takeFace(next, at);
        continue;
      }
    }
    if (next.reels < 4 && next.floor >= 3 && next.coins >= REEL_PRICE && next.deck.length >= 7 && next.hp >= 45) {
      const bought = buyFourthReel(next);
      if (bought !== next) {
        next = bought;
        continue;
      }
    }
    if (next.reels === 4 && next.floor >= 4 && next.coins >= REEL5_PRICE && next.hp >= 50) {
      const bought = buyFifthReel(next);
      if (bought !== next) {
        next = bought;
        continue;
      }
    }
    if (next.equip.length < 1 && next.coins >= EQUIP_PRICE + 4 && next.hp >= 48) {
      const bought = buyEquip(next, next.shield < 8 ? "stit" : "uder");
      if (bought !== next) {
        next = bought;
        continue;
      }
    }
    if (next.keys < 1 && next.coins >= SUPPORT_PRICE + 6 && next.hp >= 55) {
      const bought = buyKeys(next);
      if (bought !== next) {
        next = bought;
        continue;
      }
    }
    let best = -1;
    let bestScore = 5;
    stock.offers.forEach((offer, i) => {
      if (next.coins < offer.price || next.deck.length >= 9) return;
      const score = scoreOf(offer.sym);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0) {
      next = buyOffer(next, best);
      continue;
    }
    if (next.deck.length >= 8 && next.coins >= REMOVE_PRICE) {
      const at = worstIndex(next);
      if (at >= 0) {
        next = removeSymbol(next, at);
        continue;
      }
    }
    if (!stock.rerolled && next.coins >= REROLL_PRICE + 6 && stock.offers.every((offer) => scoreOf(offer.sym) < 6)) {
      next = rerollShop(next);
      continue;
    }
    break;
  }
  return leaveShop(next);
}

export function playRun(seed: number, profile: BotProfile = DECENT, entry = 250, perks?: Dielna["perks"]): RunSummary {
  let run = draft(createRun(seed, entry));
  if (perks && Object.keys(perks).length) run = { ...run, meta: perks };
  if (run.phase === "banner") run = dismissBanner(run);
  for (let guard = 0; guard < 420 && run.phase !== "dead"; guard++) {
    if (run.phase === "banner") {
      run = dismissBanner(run);
      continue;
    }
    if (run.phase === "shop") {
      run = shop(run);
      continue;
    }
    if (run.phase !== "fight") break;
    const upkeep = playerUpkeep(run);
    run = upkeep.run;
    if (run.phase === "dead") break;
    if (run.super >= 100 && run.enemy && run.enemy.hp > 24) {
      run = fireSuper(run);
      if (run.phase !== "fight") continue;
    }
    if (run.enemy && run.hp > 58 && run.enemy.hp + run.enemy.shield <= 36) run = armWager(run);
    if (run.enemy && run.coins >= HOLD_PRICE) {
      const threat = incoming(run.enemy.intent) > run.shield + 6;
      const holdAt = run.lastLands.findIndex((sym) => {
        const def = symDef(sym);
        return threat && def && def.shield > 0;
      });
      if (holdAt >= 0) run = holdReel(run, holdAt);
    }
    run = aimDj(run);
    const opened = beginSpin(run);
    if (!opened) break;
    run = opened.run;
    let spin = opened.spin;
    let reel = nextOpenReel(spin);
    while (reel >= 0) {
      const choice = chooseStop(run, spin.strips[reel] ?? ["blocek"], profile);
      run = choice.run;
      spin = lockReel(spin, reel, choice.index);
      reel = nextOpenReel(spin);
    }
    const sealed = sealSpin(run, spin);
    run = sealed.run;
    for (const step of sealed.plan.reels) {
      if (run.phase === "dead") break;
      run = resolveReel(run, sealed.plan, step.reel).run;
    }
    run = finishPlayer(run);
    if (run.phase === "fight") run = enemyPhase(run).run;
  }
  if (run.phase !== "dead") run = { ...run, phase: "dead", cause: run.cause || "Čas" };
  return {
    floor: run.floor,
    bestFloor: run.stats.bestFloor,
    cleared5: run.stats.bestFloor >= 6,
    turns: run.stats.turns,
    fights: run.stats.fights,
    kills: run.stats.kills,
    crits: run.stats.crits,
    cause: run.cause || "neznáme",
    coins: run.stats.coins,
    hp: run.hp,
  };
}

/** Thirty runs on one profile. Index 0, 9 and 29 are the reported mornings. */
export function playCareer(seed: number, runs = 30, profile: BotProfile = DECENT): { mornings: boolean[]; screws: number } {
  let dielna = emptyDielna();
  const mornings: boolean[] = [];
  for (let i = 0; i < runs; i++) {
    const row = playRun(seed + i * 997, profile, 250, dielna.perks);
    mornings.push(row.cleared5);
    dielna = botSpend(grantScrews(dielna, row.bestFloor, row.kills));
  }
  return { mornings, screws: dielna.screws };
}

export function bucketCause(cause: string): string {
  if (cause.startsWith("95")) return "95 natural";
  if (cause.startsWith("Pokuta")) return "Pokuta";
  if (cause.startsWith("Jed")) return "jed";
  if (cause === "Čas") return "čas";
  const name = cause.split(" ťa ")[0] ?? cause;
  return name || "neznáme";
}

export function symPrice(id: SymId): number {
  return id === "medzera" ? 0 : SYM[id].price;
}
