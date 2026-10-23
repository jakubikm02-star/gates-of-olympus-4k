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
  { id: "po-polnoci", name: "POLNOČNÁ OMŠA", tier: "bezny", icon: "moon", line: "Prvý spin po polnoci. Normálni ľudia už spia, ty sa ešte modlíš k automatu." },
  { id: "nocny-vtak", name: "NOČNÁ SMENA ZADARMO", tier: "ostre", icon: "moon", line: "Pätnásť spinov medzi 0:00 a 5:00. Šéf by ti za to dal nočný príplatok, automat ti ho ešte zoberie." },
  { id: "mrtvy-spin", name: "NULA CELÝCH NULA", tier: "bezny", icon: "skull", line: "Osem prázdnych spinov za sebou. Nula celých, nula celých, nula, nula – a to si ešte ani nefúkal." },
  { id: "sucha-seria", name: "DVADSAŤKRÁT NA HOVNO", tier: "ostre", icon: "skull", line: "Dvadsať prázdnych spinov za sebou. Aj horoskop v bulvári má lepšiu úspešnosť." },
  { id: "klinicka", name: "OTRAS MOZGU MÁ", tier: "tvrde", icon: "skull", line: "Štyridsať prázdnych spinov za sebou. Nič ti nie je, len otras mozgu máš a peňaženku na JIS-ke." },
  { id: "kaskada", name: "PADÁ TO AKO HRUŠKY", tier: "ostre", icon: "drop", line: "Šesť pádov symbolov v jednom spine. Ako babka z rebríka, len toto aspoň niečo vyplatilo." },
  { id: "lavina", name: "VODOPÁD SRAČIEK", tier: "tvrde", icon: "drop", line: "Desať kaskád v jednom spine. Tečie to ako stúpačka v paneláku – a nikto nevie, kde sa to zastaví." },
  { id: "masiv", name: "TU MÁŠ BANÁN", tier: "tvrde", icon: "coins", line: "Výhra 250× stávky. Tu máš banán a šicko v porádku – zajtra to aj tak vrátiš automatu." },
  { id: "strop", name: "VYŠŠIE NEJEBNEŠ", tier: "mrtve", icon: "crown", line: "Trafil si strop výhry. Viac ti nedajú, ani keby si im podpísal dušu aj byt po babke." },
  { id: "prazdny-bonus", name: "BONUS NA PIČU", tier: "bezny", icon: "ban", line: "Bonus skončil na nule. Čakal si ho ako Mikuláša a v čižme si našiel uhlie aj s faktúrou." },
  { id: "tri-nuly", name: "HETRIK DO VLASTNEJ", tier: "tvrde", icon: "ban", line: "Tri bonusy, tri nuly. Hetrik ako na majstrovstvách, akurát všetky góly do vlastnej bránky." },
  { id: "kupil-vzduch", name: "PAUŠÁL BEZ SIGNÁLU", tier: "ostre", icon: "flame", line: "Kúpená 4KA TV vrátila menej, ako stála. Ako paušál: platíš celý mesiac a signál máš na chuja." },
  { id: "buy-streak", name: "NEDAJ SA OJEBAŤ", tier: "ostre", icon: "flame", line: "Tri kúpené bonusy za sebou. Raz je náhoda, dvakrát zvyk, trikrát už máš pri automate vlastnú stoličku." },
  { id: "zavislak", name: "ČIERNY PIATOK DENNE", tier: "tvrde", icon: "flame", line: "Päť kúpených bonusov za deň. Lidl má akcie raz do týždňa, ty denne – len zľavu má vždy automat." },
  { id: "same-mimo", name: "MAL ŠI BRANIC", tier: "bezny", icon: "eye", line: "Zmeškal si šesť okien ZÁSAHU. Mal ši branic – Finančná správa ti máva do kamery." },
  { id: "slepy-zasah", name: "REFLEXY Z BOROVIČKY", tier: "ostre", icon: "eye", line: "Pätnásť zmeškaných okien ZÁSAHU. Reakčný čas ako po tretej borovičke na svadbe u strýka." },
  { id: "usiel-som", name: "PREČ AKO KAMOŠ Z RUNDY", tier: "bezny", icon: "bolt", line: "ZÁSAH skončil únikom. Zmizol si rýchlejšie ako kamoš v krčme, keď príde rad na jeho rundu." },
  { id: "danovy-unik", name: "CHOĎTE DOMOV", tier: "ostre", icon: "bolt", line: "Prešiel si ÚNIKOM. Finančná správa stojí s papiermi a ty im len zakývaš: choďte domov." },
  { id: "bankrot", name: "KOLESO ŤA VYDRBALO", tier: "bezny", icon: "wheel", line: "KOLESO hodilo bankrot. Točilo sa krásne ako kolotoč na hodoch a skončil si ako po ňom – na zemi." },
  { id: "znova-bankrot", name: "JEZUS, DO PIČI", tier: "ostre", icon: "wheel", line: "Druhý bankrot na KOLESE. Prvý bol náhoda, druhý je už charakter." },
  { id: "tajnicka", name: "MOZOG Z TRAFIKY", tier: "ostre", icon: "wheel", line: "Vylúštil si tajničku KOLESA. Celý život nič a zrazu génius – v automatoch o tretej ráno." },
  { id: "zbox-plny", name: "Ž-BOX PLNÝ AKO ŽUMPA", tier: "ostre", icon: "box", line: "Ž-BOX je plný. Prvý balík v tvojom živote, čo prišiel načas, a hneď s výhrou." },
  { id: "zbox-prazdny", name: "DORUČENÉ: HOVNO", tier: "bezny", icon: "box", line: "Ž-BOX je prázdny. Kuriér napísal „doručené“ a ty si otvoril dvierka do prázdnej riti." },
  { id: "zlaty-bonus", name: "ZLATO Z PLOMBY", tier: "ostre", icon: "crown", line: "Zlatý bonus niečo vyplatil. Prvé zlato v rodine od čias, čo dedo predal zubné plomby." },
  { id: "zlato-nula", name: "ZLATÉ LEN NA OBALE", tier: "bezny", icon: "crown", line: "Zlatý bonus nepridal nič. Ako bonboniéra od tety: zlatá krabica, vnútri biely povlak z roku 2019." },
  { id: "sucho", name: "PODMIERKA 96 %", tier: "bezny", icon: "drop", line: "SUCHO ťa stiahlo na 96 %. Ako pivo v krčme: podmierka nie je chyba, ale tradícia." },
  { id: "suche-pluca", name: "SAHARA V PANELÁKU", tier: "tvrde", icon: "drop", line: "Dvadsať SÚCH za jeden deň. Suchšie bolo už len tvoje rande z Tinderu a radiátor v októbri." },
  { id: "jackpot", name: "HOP, HOP, HOP!", tier: "mrtve", icon: "coins", line: "Trafil si jackpot. Kto neskáče, nie je Slovák – skáče aj sused, lebo počul, že požičiavaš." },
  { id: "statny", name: "FINANČNÁ UŽ VOLÁ", tier: "mrtve", icon: "crown", line: "Trafil si štátny jackpot. Finančná správa ti gratuluje skôr ako mama a chce z toho viac než ona." },
  { id: "versus-win", name: "SÚPER IDE DOMOV PEŠO", tier: "ostre", icon: "bolt", line: "Vyhral si VERSUS. Súper ide domov pešo, lebo na lístok do MHD mu už nezostalo." },
  { id: "versus-loss", name: "ROZOBRATÝ NA ŠROT", tier: "bezny", icon: "skull", line: "Prehral si VERSUS. Rozobral ťa ako starú stodvadsiatku a ešte si nechal zaplatiť za odvoz." },
  { id: "lobby-moje", name: "KRÁĽ OKRESU", tier: "tvrde", icon: "crown", line: "Tri výhry vo VERSUS za deň. Kráľ okresu – v krčme ti už naleje aj krčmárka, čo ťa nenávidí." },
  { id: "vzdal-som", name: "BIELA VLAJKA Z GATÍ", tier: "bezny", icon: "ban", line: "Vzdal si VERSUS. Vyvesil si bielu vlajku – škoda, že to boli gate a biele už dávno neboli." },
  { id: "listok-sedy", name: "LÍSTOK SEDEL, KOKSO", tier: "bezny", icon: "ticket", line: "Lístok prešiel. Prvýkrát v živote ti niečo vyšlo podľa plánu, a ani to nebol tvoj plán." },
  { id: "pretrhnuty", name: "VSADIL SI NA SLOVENSKO", tier: "ostre", icon: "ticket", line: "Dva lístky nevyšli. Ako tipovať, že náš hokej postúpi zo skupiny: srdce áno, peňaženka nie." },
  { id: "max-rage", name: "MAX DO PRÁZDNEJ RITI", tier: "ostre", icon: "flame", line: "Päť max stávok za sebou do ničoho. All-in ako na dedinskej zábave: ráno nič, len bolí hlava." },
  { id: "stavka-na-dno", name: "ROBIŤ VIEM, VYPIŤ VIEM", tier: "bezny", icon: "flame", line: "Dvanásť spinov na max stávku. Robiť vieš, vypiť vieš, zajesť vieš – len prestať nevieš." },
  { id: "auto-maraton", name: "PALEC NA DÔCHODKU", tier: "ostre", icon: "bolt", line: "Šesťdesiat autospinov. Automat hrá za teba – konečne niečo, čo robíš a nedoserieš to." },
  { id: "turbo-mozg", name: "PREDČASNÝ VÝSTREL", tier: "bezny", icon: "bolt", line: "Osemdesiat turbo spinov. Rýchlo, často a bez rozkoše – presne ako tvoj sexuálny život podľa ex." },
  { id: "exekucia", name: "EXEKÚTOR UŽ PARKUJE", tier: "tvrde", icon: "skull", line: "Kredit na nule. Exekútor už parkuje pred domom a ako jediný v meste má zaplatený PAAS." },
  { id: "smrt-ega", name: "PRÁSKAČ Z PRÍZEMIA", tier: "ostre", icon: "skull", line: "Nahlásil si niečo v SMRTI EGA. Babka z prízemia je hrdá – konečne má nástupcu na udávanie." },
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
