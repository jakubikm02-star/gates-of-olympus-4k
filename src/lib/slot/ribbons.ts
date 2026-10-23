/**
 * Daily player ribbons (Battlefield-style titles). Cosmetic only: nothing here
 * changes a payout, a reel, or a stake. The day is Europe/Bratislava, the same
 * midnight the rest of the game uses.
 */
import { BETS } from "./symbols.ts";
import { braDay } from "./server-day.ts";

export const RIBBON_KEY = "parkizmus-ribbons-v1";
export const MAX_BET = BETS[BETS.length - 1]!;

export type RibbonTier = "bezny" | "ostre" | "tvrde" | "mrtve";
export type RibbonIcon = "skull" | "moon" | "flame" | "drop" | "wheel" | "box" | "crown" | "bolt" | "eye" | "ban" | "coins" | "ticket";

export interface RibbonDef {
  id: string;
  name: string;
  line: string;
  tier: RibbonTier;
  icon: RibbonIcon;
}

export const TIER_LABEL: Record<RibbonTier, string> = {
  bezny: "bežný",
  ostre: "ostrý",
  tvrde: "tvrdý",
  mrtve: "mŕtvy",
};

export const TIER_RANK: Record<RibbonTier, number> = {
  bezny: 0,
  ostre: 1,
  tvrde: 2,
  mrtve: 3,
};

/** Stripes are stand-ins until the ribbon art exists. One palette per tier. */
export const TIER_STRIPES: Record<RibbonTier, readonly [string, string, string]> = {
  bezny: ["#2c3a46", "#7f93a6", "#e7eef4"],
  ostre: ["#5c320f", "#e08a2a", "#ffe0b0"],
  tvrde: ["#4a1020", "#d23a4a", "#ffc2cb"],
  mrtve: ["#241b3a", "#e6c35c", "#fff6d4"],
};

export const RIBBONS: readonly RibbonDef[] = [
  { id: "po-polnoci", name: "PO POLNOCI", tier: "bezny", icon: "moon", line: "Prvý spin po polnoci. Zajtra to budeš vysvetľovať vankúšu." },
  { id: "nocny-vtak", name: "NOČNÝ VTÁK", tier: "ostre", icon: "moon", line: "Pätnásť spinov medzi polnocou a piatou. Spánok prehral." },
  { id: "mrtvy-spin", name: "MŔTVY SPIN", tier: "bezny", icon: "skull", line: "Osem prázdnych točení za sebou. Valce ťa majú v paži." },
  { id: "sucha-seria", name: "SUCHÁ SÉRIA", tier: "ostre", icon: "skull", line: "Dvadsať mŕtvych spinov. Aj sused počuje to ticho." },
  { id: "klinicka", name: "KLINICKÁ SMRŤ", tier: "tvrde", icon: "skull", line: "Štyridsaťkrát nič. Pulz nula, stávka stále žije." },
  { id: "kaskada", name: "KASKÁDA", tier: "ostre", icon: "drop", line: "Šesť pádov v jednom spine. Symboly zabudli prestať." },
  { id: "lavina", name: "LAVÍNA", tier: "tvrde", icon: "drop", line: "Desať kaskád. Telefón sa hanbí, ty nie." },
  { id: "masiv", name: "MASÍV", tier: "tvrde", icon: "coins", line: "Dvestopäťdesiatnásobok. Výplata, ktorú hneď vrátiš automatu." },
  { id: "strop", name: "STROP", tier: "mrtve", icon: "crown", line: "Narazil si do stropu výhry. Matematika povedala dosť." },
  { id: "prazdny-bonus", name: "PRÁZDNY BONUS", tier: "bezny", icon: "ban", line: "Bonus skončil na nule. Zaplatil si za ticho." },
  { id: "tri-nuly", name: "TRI NULY", tier: "tvrde", icon: "ban", line: "Tri bonusy, tri nuly. Úrad by to nazval kontrolou." },
  { id: "kupil-vzduch", name: "KÚPIL SOM VZDUCH", tier: "ostre", icon: "flame", line: "Kúpená 4KA TV vrátila menej, než stála. Klasika." },
  { id: "buy-streak", name: "BUY STREAK", tier: "ostre", icon: "flame", line: "Tri kúpy za sebou. Prirodzený scatter sa urazil." },
  { id: "zavislak", name: "ZÁVISLÁK", tier: "tvrde", icon: "flame", line: "Päť kúpených bonusov za deň. Tlačidlo KÚPIŤ má odtlačky." },
  { id: "same-mimo", name: "SAMÉ MIMO", tier: "bezny", icon: "eye", line: "Šesť okien ZÁSAHU mimo. Finančná správa sa smeje." },
  { id: "slepy-zasah", name: "SLEPÝ ZÁSAH", tier: "ostre", icon: "eye", line: "Pätnásť okien mimo. Mieril si vedľa celý deň." },
  { id: "usiel-som", name: "UŠIEL SOM", tier: "bezny", icon: "bolt", line: "ZÁSAH skončil únikom. Daň si nestihol." },
  { id: "danovy-unik", name: "DAŇOVÝ ÚNIK", tier: "ostre", icon: "bolt", line: "ÚNIK prešiel. Úrad o tom ešte nevie." },
  { id: "bankrot", name: "BANKROT", tier: "bezny", icon: "wheel", line: "KOLESO povedalo BANKROT. Tajnička ostala tajná." },
  { id: "znova-bankrot", name: "ZNOVU BANKROT", tier: "ostre", icon: "wheel", line: "Druhý bankrot na kolese. Koleso ťa má prečítaného." },
  { id: "tajnicka", name: "TAJNIČKA", tier: "ostre", icon: "wheel", line: "Rozlúskol si tajničku. Koleso tentoraz prehralo." },
  { id: "zbox-plny", name: "PLNÝ Ž-BOX", tier: "ostre", icon: "box", line: "Ž-BOX plný. Schránky dnes držali." },
  { id: "zbox-prazdny", name: "PRÁZDNY Ž-BOX", tier: "bezny", icon: "box", line: "Ž-BOX a nič v ňom. Otváral si vzduch." },
  { id: "zlaty-bonus", name: "ZLATÝ BONUS", tier: "ostre", icon: "crown", line: "Dnešné zlato naozaj niečo pridalo. SIM karta si oddýchla." },
  { id: "zlato-nula", name: "ZLATO NA NULU", tier: "bezny", icon: "crown", line: "Zlatý bonus nič nepridal. Zlato sa hanblivo vrátilo." },
  { id: "sucho", name: "SUCHO", tier: "bezny", icon: "drop", line: "SUCHO ťa zrazilo na 96 %. Parkuješ nasucho." },
  { id: "suche-pluca", name: "SUCHÉ PĽÚCA", tier: "tvrde", icon: "drop", line: "Dvadsaťkrát SUCHO za deň. Pľúca z kreditu." },
  { id: "jackpot", name: "JACKPOT", tier: "mrtve", icon: "coins", line: "Jackpot padol. Dnes sa o tebe hovorí aj bez tvojho súhlasu." },
  { id: "statny", name: "ŠTÁTNY", tier: "mrtve", icon: "crown", line: "Štátny jackpot. Najväčší hrniec v parku je tvoj." },
  { id: "versus-win", name: "VZAL SOM VERSUS", tier: "ostre", icon: "bolt", line: "VERSUS je tvoj. Súper platí pivo, aspoň v hlave." },
  { id: "versus-loss", name: "VERSUS MA ZOŽRAL", tier: "bezny", icon: "skull", line: "VERSUS si prehral. Kaucia vie, komu patrí." },
  { id: "lobby-moje", name: "LOBBY JE MOJE", tier: "tvrde", icon: "crown", line: "Tri výhry vo VERSUS za deň. Lobby má tvoj odtlačok." },
  { id: "vzdal-som", name: "VZDAL SOM TO", tier: "bezny", icon: "ban", line: "Vzdal si VERSUS. Niekedy je útek lacnejší." },
  { id: "listok-sedy", name: "LÍSTOK SEDÍ", tier: "bezny", icon: "ticket", line: "Tiket prešiel. Parkovací lístok dnes nie je pokuta." },
  { id: "pretrhnuty", name: "PRETRHNUTÝ LÍSTOK", tier: "ostre", icon: "ticket", line: "Dva tikety v koši. Podmienky boli, ty nie." },
  { id: "max-rage", name: "MAX-BET RAGE", tier: "ostre", icon: "flame", line: "Päť max stávok do prázdna za sebou. Toto je hnev, nie stratégia." },
  { id: "stavka-na-dno", name: "STÁVKA NA DNO", tier: "bezny", icon: "flame", line: "Dvanásť spinov na maximum. Dno má tvoje meno." },
  { id: "auto-maraton", name: "AUTOSPIN MARATÓN", tier: "ostre", icon: "bolt", line: "Šesťdesiat spinov na AUTO. Palec už ani netreba." },
  { id: "turbo-mozg", name: "TURBO MOZOG", tier: "bezny", icon: "bolt", line: "Osemdesiat turbo spinov. Obraz ide rýchlejšie než rozhodnutie." },
  { id: "exekucia", name: "EXEKÚCIA", tier: "tvrde", icon: "skull", line: "Kredit na nule. Exekúcia prišla osobne." },
  { id: "smrt-ega", name: "SMRŤ EGA", tier: "ostre", icon: "skull", line: "Dnes si v SMRTI EGA niečo nahlásil. Týždeň si to pamätá." },
];

const BY_ID = new Map(RIBBONS.map((r) => [r.id, r]));
const ID_RE = /^[a-z0-9-]{2,24}$/;

export function ribbonById(id: string | null | undefined): RibbonDef | null {
  if (!id) return null;
  return BY_ID.get(id) ?? null;
}

export function isRibbonId(id: string): boolean {
  return ID_RE.test(id) && BY_ID.has(id);
}

export interface RibbonEarn {
  id: string;
  at: number;
}

export interface RibbonCounters {
  deadRun: number;
  night: number;
  maxBet: number;
  rageRun: number;
  auto: number;
  turbo: number;
  emptyFs: number;
  buyAir: number;
  buyRun: number;
  buys: number;
  miss: number;
  bankrot: number;
  sucho: number;
  duelWin: number;
  ticketFail: number;
}

export interface RibbonLog {
  v: 1;
  day: string;
  at: number;
  earned: RibbonEarn[];
  c: RibbonCounters;
}

export type RibbonEvent =
  | {
      t: "spin";
      free: boolean;
      buy: boolean;
      cost: number;
      bet: number;
      cash0: number;
      x: number;
      tumbles: number;
      hitMax: boolean;
      turbo: boolean;
      auto: boolean;
    }
  | { t: "fsStart"; bought: boolean }
  | { t: "fsEnd"; resumed?: boolean; empty?: boolean; total: number; trigger: number; bought: boolean; buyCost: number }
  | { t: "chaseWindow"; result: "hit" | "fs" | "miss" }
  | { t: "chaseEnd"; outcome: string }
  | { t: "koleso"; bankrot: number; solved: boolean }
  | { t: "zbox"; full: boolean; found: number }
  | { t: "jackpot"; tier: string }
  | { t: "duel"; result: "win" | "loss" | "draw"; forfeit: "me" | "peer" | null }
  | { t: "job"; phase: "take" | "ok" | "fail" }
  | { t: "rank"; src?: string }
  | { t: "bust" }
  | { t: "gold"; paid: boolean }
  | { t: "ego" };

const COUNTER_KEYS: readonly (keyof RibbonCounters)[] = [
  "deadRun",
  "night",
  "maxBet",
  "rageRun",
  "auto",
  "turbo",
  "emptyFs",
  "buyAir",
  "buyRun",
  "buys",
  "miss",
  "bankrot",
  "sucho",
  "duelWin",
  "ticketFail",
];

export function emptyCounters(): RibbonCounters {
  return {
    deadRun: 0,
    night: 0,
    maxBet: 0,
    rageRun: 0,
    auto: 0,
    turbo: 0,
    emptyFs: 0,
    buyAir: 0,
    buyRun: 0,
    buys: 0,
    miss: 0,
    bankrot: 0,
    sucho: 0,
    duelWin: 0,
    ticketFail: 0,
  };
}

export function emptyRibbonLog(day = "", at = 0): RibbonLog {
  return { v: 1, day, at, earned: [], c: emptyCounters() };
}

let hourFmt: Intl.DateTimeFormat | null = null;

/** Hour 0–23 in Europe/Bratislava. */
export function braHour(ms: number): number {
  hourFmt ??= new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Bratislava", hour: "2-digit", hourCycle: "h23" });
  const raw = hourFmt.formatToParts(new Date(ms)).find((p) => p.type === "hour")?.value ?? "0";
  const h = Number.parseInt(raw, 10);
  return Number.isFinite(h) ? h % 24 : 0;
}

function finite(n: unknown, lo = 0, hi = 1_000_000): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

/** Drop junk. Missing or unreadable → null so an old save is left alone. */
export function sanitizeRibbonLog(raw: unknown): RibbonLog | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const day = typeof o.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.day) ? o.day : "";
  if (!day) return null;
  const c = emptyCounters();
  const src = o.c && typeof o.c === "object" && !Array.isArray(o.c) ? (o.c as Record<string, unknown>) : {};
  for (const k of COUNTER_KEYS) c[k] = finite(src[k]);
  const earned: RibbonEarn[] = [];
  if (Array.isArray(o.earned)) {
    for (const item of o.earned) {
      if (!item || typeof item !== "object") continue;
      const id = (item as { id?: unknown }).id;
      const at = (item as { at?: unknown }).at;
      if (typeof id !== "string" || !isRibbonId(id)) continue;
      if (earned.some((e) => e.id === id)) continue;
      if (earned.length >= RIBBONS.length) break;
      earned.push({ id, at: finite(at, 0, 10_000_000_000_000) });
    }
  }
  return { v: 1, day, at: finite(o.at, 0, 10_000_000_000_000), earned, c };
}

function paidSpin(ev: Extract<RibbonEvent, { t: "spin" }>): boolean {
  return !ev.free && !ev.buy && ev.cost > 0;
}

/**
 * Fold one real play event into today's log. A new Bratislava day wipes the
 * counters and the titles; the same title cannot be earned twice that day.
 * Returns the same log reference when nothing moved.
 */
export function noteRibbon(log: RibbonLog, ev: RibbonEvent, now: number): { log: RibbonLog; fresh: string[] } {
  const day = braDay(now);
  const base = log.day === day ? log : emptyRibbonLog(day, now);
  const c: RibbonCounters = { ...base.c };
  const earned = base.earned.slice();
  const have = new Set(earned.map((e) => e.id));
  const fresh: string[] = [];
  const grant = (id: string, ok = true) => {
    if (!ok || have.has(id) || !isRibbonId(id)) return;
    have.add(id);
    earned.push({ id, at: now });
    fresh.push(id);
  };

  switch (ev.t) {
    case "spin": {
      const paid = paidSpin(ev);
      const dead = paid && ev.cash0 <= 0;
      const max = paid && ev.bet >= MAX_BET;
      if (dead) c.deadRun += 1;
      else if (paid && ev.cash0 > 0) c.deadRun = 0;
      if (max && dead) c.rageRun += 1;
      else if (paid) c.rageRun = 0;
      if (max) c.maxBet += 1;
      if (paid && ev.auto) c.auto += 1;
      if (paid && ev.turbo) c.turbo += 1;
      if (paid && braHour(now) < 5) c.night += 1;
      grant("mrtvy-spin", c.deadRun >= 8);
      grant("sucha-seria", c.deadRun >= 20);
      grant("klinicka", c.deadRun >= 40);
      grant("kaskada", ev.tumbles >= 6);
      grant("lavina", ev.tumbles >= 10);
      grant("masiv", ev.x >= 250);
      grant("strop", ev.hitMax);
      grant("po-polnoci", c.night >= 1);
      grant("nocny-vtak", c.night >= 15);
      grant("max-rage", c.rageRun >= 5);
      grant("stavka-na-dno", c.maxBet >= 12);
      grant("auto-maraton", c.auto >= 60);
      grant("turbo-mozg", c.turbo >= 80);
      break;
    }
    case "fsStart": {
      if (ev.bought) {
        c.buyRun += 1;
        c.buys += 1;
      } else {
        c.buyRun = 0;
      }
      grant("buy-streak", c.buyRun >= 3);
      grant("zavislak", c.buys >= 5);
      break;
    }
    case "fsEnd": {
      if (ev.resumed) break;
      const empty = Boolean(ev.empty) || ev.total <= 0;
      if (empty) c.emptyFs += 1;
      const air = ev.bought && ev.buyCost > 0 && ev.total + ev.trigger < ev.buyCost;
      if (air) c.buyAir += 1;
      grant("prazdny-bonus", empty);
      grant("tri-nuly", c.emptyFs >= 3);
      grant("kupil-vzduch", air);
      break;
    }
    case "chaseWindow": {
      if (ev.result === "miss") c.miss += 1;
      grant("same-mimo", c.miss >= 6);
      grant("slepy-zasah", c.miss >= 15);
      break;
    }
    case "chaseEnd": {
      grant("usiel-som", ev.outcome === "escape");
      grant("danovy-unik", ev.outcome === "unik");
      break;
    }
    case "koleso": {
      if (ev.bankrot > 0) c.bankrot += ev.bankrot;
      grant("bankrot", c.bankrot >= 1);
      grant("znova-bankrot", c.bankrot >= 2);
      grant("tajnicka", ev.solved);
      break;
    }
    case "zbox": {
      grant("zbox-plny", ev.full);
      grant("zbox-prazdny", ev.found <= 0);
      break;
    }
    case "jackpot": {
      grant("jackpot");
      grant("statny", ev.tier === "stat");
      break;
    }
    case "duel": {
      if (ev.result === "win") c.duelWin += 1;
      grant("versus-win", ev.result === "win");
      grant("versus-loss", ev.result === "loss");
      grant("lobby-moje", c.duelWin >= 3);
      grant("vzdal-som", ev.forfeit === "me");
      break;
    }
    case "job": {
      if (ev.phase === "fail") c.ticketFail += 1;
      grant("listok-sedy", ev.phase === "ok");
      grant("pretrhnuty", c.ticketFail >= 2);
      break;
    }
    case "rank": {
      if (ev.src === "sucho") c.sucho += 1;
      grant("sucho", c.sucho >= 1);
      grant("suche-pluca", c.sucho >= 20);
      break;
    }
    case "bust":
      grant("exekucia");
      break;
    case "gold":
      grant(ev.paid ? "zlaty-bonus" : "zlato-nula");
      break;
    case "ego":
      grant("smrt-ega");
      break;
    default:
      break;
  }

  if (!fresh.length && base.day === day && sameCounters(base.c, c)) return { log, fresh };
  return { log: { v: 1, day, at: now, earned, c }, fresh };
}

function sameCounters(a: RibbonCounters, b: RibbonCounters): boolean {
  return COUNTER_KEYS.every((k) => a[k] === b[k]);
}

export function latestRibbon(log: RibbonLog): RibbonEarn | null {
  return log.earned.length ? log.earned[log.earned.length - 1]! : null;
}

/** Map a stat event the game already records. Unknown events are ignored. */
export function ribbonFromStat(ev: { t: string } & Record<string, unknown>): RibbonEvent | null {
  const num = (k: string) => (typeof ev[k] === "number" && Number.isFinite(ev[k] as number) ? (ev[k] as number) : 0);
  const flag = (k: string) => ev[k] === true;
  switch (ev.t) {
    case "spin":
      return {
        t: "spin",
        free: flag("free"),
        buy: flag("buy"),
        cost: num("cost"),
        bet: num("bet"),
        cash0: num("cash0"),
        x: num("x"),
        tumbles: num("tumbles"),
        hitMax: flag("hitMax"),
        turbo: flag("turbo"),
        auto: flag("auto"),
      };
    case "fsStart":
      return { t: "fsStart", bought: flag("bought") };
    case "fsEnd":
      return {
        t: "fsEnd",
        resumed: flag("resumed"),
        empty: flag("empty"),
        total: num("total"),
        trigger: num("trigger"),
        bought: flag("bought"),
        buyCost: num("buyCost"),
      };
    case "chaseWindow":
      return ev.result === "hit" || ev.result === "fs" || ev.result === "miss" ? { t: "chaseWindow", result: ev.result } : null;
    case "chaseEnd":
      return typeof ev.outcome === "string" ? { t: "chaseEnd", outcome: ev.outcome } : null;
    case "koleso":
      return { t: "koleso", bankrot: num("bankrot"), solved: flag("solved") };
    case "zbox":
      return { t: "zbox", full: flag("full"), found: num("found") };
    case "jackpot":
      return typeof ev.tier === "string" ? { t: "jackpot", tier: ev.tier } : null;
    case "duel":
      return ev.result === "win" || ev.result === "loss" || ev.result === "draw"
        ? { t: "duel", result: ev.result, forfeit: ev.forfeit === "me" || ev.forfeit === "peer" ? ev.forfeit : null }
        : null;
    case "job":
      return ev.phase === "take" || ev.phase === "ok" || ev.phase === "fail" ? { t: "job", phase: ev.phase } : null;
    case "rank":
      return { t: "rank", src: typeof ev.src === "string" ? ev.src : undefined };
    case "bust":
      return { t: "bust" };
    default:
      return null;
  }
}
