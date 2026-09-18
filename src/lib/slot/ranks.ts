export const DIV_RP = 100;
export const MASTER_RP = 300;
export const PROMO_BUFFER = 40;
export const WIN_RP_CAP = 200;

const ANTE_BASE = 1.25;
const BUY_BASE = 100;
const FS_BASE = 15;
const BASE_HIT = 0.3467;

export interface RankDef {
  id: string;
  name: string;
  product: string;
  divisions: number;
  entry: number;
  color: string;
  ink: string;
}

/** Apex-style ladder named after 4ka services / products. */
export const RANKS: RankDef[] = [
  { id: "kredit", name: "KREDIT", product: "Dobitie", divisions: 4, entry: 0, color: "#8d939b", ink: "#e8eaee" },
  { id: "sloboda", name: "SLOBODA", product: "Paušál 200 / 400", divisions: 4, entry: 3, color: "#c47a3a", ink: "#ffe1c0" },
  { id: "smart", name: "SMART", product: "SMART paušál", divisions: 4, entry: 4, color: "#b7c2ce", ink: "#f4f7fb" },
  { id: "telka", name: "4KA TV", product: "Telka cez anténu", divisions: 4, entry: 5, color: "#e2b01a", ink: "#fff4c4" },
  { id: "optika", name: "OPTIKA", product: "Internet XL", divisions: 4, entry: 6, color: "#3ec6e0", ink: "#d9f7ff" },
  { id: "duo", name: "DUO", product: "Internet + TV", divisions: 4, entry: 7, color: "#6ea8ff", ink: "#e7f0ff" },
  { id: "fiveg", name: "5G NA DOMA", product: "5G na doma", divisions: 1, entry: 8, color: "#c86bff", ink: "#f6e5ff" },
  { id: "nekonecno", name: "NEKONEČNO", product: "SLOBODA NEKONEČNO", divisions: 1, entry: 10, color: "#ff3b4e", ink: "#ffe3b0" },
];

const ROMAN = ["", "I", "II", "III", "IV"] as const;

export interface Band {
  rankIndex: number;
  division: number;
  floor: number;
  size: number;
}

export const BANDS: Band[] = (() => {
  const out: Band[] = [];
  let rp = 0;
  for (let i = 0; i < RANKS.length; i++) {
    const r = RANKS[i];
    if (r.id === "nekonecno") {
      out.push({ rankIndex: i, division: 0, floor: rp, size: Number.POSITIVE_INFINITY });
      break;
    }
    if (r.divisions <= 1) {
      out.push({ rankIndex: i, division: 0, floor: rp, size: MASTER_RP });
      rp += MASTER_RP;
      continue;
    }
    for (let d = r.divisions; d >= 1; d--) {
      out.push({ rankIndex: i, division: d, floor: rp, size: DIV_RP });
      rp += DIV_RP;
    }
  }
  return out;
})();

export const NEKONECNO_FLOOR = BANDS[BANDS.length - 1]?.floor ?? 2700;

export interface Standing {
  rp: number;
  rankIndex: number;
  division: number;
  roman: string;
  name: string;
  product: string;
  id: string;
  color: string;
  ink: string;
  entry: number;
  into: number;
  need: number;
  floor: number;
  nextFloor: number | null;
}

export function standing(rp: number): Standing {
  const n = Math.max(0, Math.floor(rp));
  let band = BANDS[0];
  for (const b of BANDS) {
    if (n >= b.floor) band = b;
    else break;
  }
  const rank = RANKS[band.rankIndex];
  const into = n - band.floor;
  const need = Number.isFinite(band.size) ? band.size : 0;
  const next = BANDS[BANDS.indexOf(band) + 1];
  return {
    rp: n,
    rankIndex: band.rankIndex,
    division: band.division,
    roman: band.division ? ROMAN[band.division] : "",
    name: rank.name,
    product: rank.product,
    id: rank.id,
    color: rank.color,
    ink: rank.ink,
    entry: rank.entry,
    into,
    need,
    floor: band.floor,
    nextFloor: next ? next.floor : null,
  };
}

export function rankStart(rankIndex: number): number {
  const b = BANDS.find((x) => x.rankIndex === rankIndex);
  return b?.floor ?? 0;
}

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const WEEKLY_CATCHUP_MAX = 3;

/** Land on IV (start) of the previous named group. 4KA TV II → SMART IV. */
export function dropOneGroup(rp: number): number {
  const s = standing(rp);
  if (s.rankIndex <= 0) return 0;
  return rankStart(s.rankIndex - 1);
}

export function applyWeeklyDecay(
  rp: number,
  lastDecayAt: number,
  now = Date.now(),
): {
  rp: number;
  lastDecayAt: number;
  drops: number;
  before: Standing;
  after: Standing;
} {
  const before = standing(rp);
  if (!lastDecayAt || lastDecayAt <= 0) {
    return { rp, lastDecayAt: now, drops: 0, before, after: before };
  }
  const weeks = Math.min(WEEKLY_CATCHUP_MAX, Math.max(0, Math.floor((now - lastDecayAt) / WEEK_MS)));
  if (weeks <= 0) {
    return { rp, lastDecayAt, drops: 0, before, after: before };
  }
  let next = rp;
  let drops = 0;
  for (let i = 0; i < weeks; i++) {
    const dropped = dropOneGroup(next);
    if (dropped >= next) break;
    next = dropped;
    drops += 1;
  }
  return {
    rp: next,
    lastDecayAt: lastDecayAt + weeks * WEEK_MS,
    drops,
    before,
    after: standing(next),
  };
}

/** Win RP: log scale so 100× is ~½ division, not a full rank skip. */
export type RankBanner = "big" | "mega" | "epic" | "max" | null;
export type RankKind = "base" | "fs" | "pick";

export interface RankSpin {
  cash: number;
  bet: number;
  /** Applied can / global multiplier (1 if none). */
  mult: number;
  tumbles: number;
  /** Consecutive paying results after this one (1 = first win after a dead). */
  streak: number;
  banner: RankBanner;
  kind: RankKind;
  ante?: boolean;
  scatters?: number;
  /** FS retrigger batches (each +5 spins). */
  retriggers?: number;
  /** Safe KONTROLA tiles before ODŤAH. */
  picks?: number;
  rankId?: string;
}

export interface RankBreakdown {
  total: number;
  fromSum: number;
  fromMult: number;
  fromStreak: number;
  fromTumble: number;
  fromBanner: number;
  fromBonus: number;
  fromStake: number;
  fromBuy: number;
  fromReload: number;
}

export interface RankPerk {
  id: string;
  title: string;
  detail: string;
  pityBonus: number;
  jackTicket: number;
  streakHold: boolean;
  dripX: number;
  anteMul: number;
  fsExtra: number;
  buyOff: number;
  deadRebate: number;
  stickyOrbs: boolean;
  orbBonus: number;
}

export const RANK_PERKS: RankPerk[] = [
  {
    id: "kredit",
    title: "Štart",
    detail: "1 lístok do PARK POOL. Žiadny herný perk — šliap vyššie.",
    pityBonus: 0,
    jackTicket: 1,
    streakHold: false,
    dripX: 0,
    anteMul: ANTE_BASE,
    fsExtra: 0,
    buyOff: 0,
    deadRebate: 0,
    stickyOrbs: false,
    orbBonus: 0,
  },
  {
    id: "sloboda",
    title: "Hold série",
    detail: "Jeden mŕtvy spin sériu výhier nezhodí.",
    pityBonus: 0,
    jackTicket: 1,
    streakHold: true,
    dripX: 0,
    anteMul: ANTE_BASE,
    fsExtra: 0,
    buyOff: 0,
    deadRebate: 0,
    stickyOrbs: false,
    orbBonus: 0,
  },
  {
    id: "smart",
    title: "Ante 1.20×",
    detail: "Ante stojí 1.20× namiesto 1.25×. Držíš viac kreditu na točenie.",
    pityBonus: 0,
    jackTicket: 1,
    streakHold: true,
    dripX: 0,
    anteMul: 1.2,
    fsExtra: 0,
    buyOff: 0,
    deadRebate: 0,
    stickyOrbs: false,
    orbBonus: 0,
  },
  {
    id: "telka",
    title: "Pity +1",
    detail: "Mŕtvy spin +1 pity navyše. KONTROLA sa nabíja rýchlejšie. Ante 1.20×.",
    pityBonus: 1,
    jackTicket: 1,
    streakHold: true,
    dripX: 0,
    anteMul: 1.2,
    fsExtra: 0,
    buyOff: 0,
    deadRebate: 0,
    stickyOrbs: false,
    orbBonus: 0,
  },
  {
    id: "optika",
    title: "5 % späť",
    detail: "Mŕtvy spin vráti 5 % stávky. 2 lístky do poolu. Ante 1.20×.",
    pityBonus: 1,
    jackTicket: 2,
    streakHold: true,
    dripX: 0,
    anteMul: 1.2,
    fsExtra: 0,
    buyOff: 0,
    deadRebate: 0.05,
    stickyOrbs: false,
    orbBonus: 0,
  },
  {
    id: "duo",
    title: "+1 FS",
    detail: "Bonus má 16 voľných točení. 5 % späť, 2 lístky, postup +0.5× stávka.",
    pityBonus: 1,
    jackTicket: 2,
    streakHold: true,
    dripX: 0.5,
    anteMul: 1.2,
    fsExtra: 1,
    buyOff: 0,
    deadRebate: 0.05,
    stickyOrbs: false,
    orbBonus: 0,
  },
  {
    id: "fiveg",
    title: "Kúpa 95×",
    detail: "Buy FS za 95× a 17 točení. Pity +2, 3 lístky, 5 % späť.",
    pityBonus: 2,
    jackTicket: 3,
    streakHold: true,
    dripX: 1,
    anteMul: 1.2,
    fsExtra: 2,
    buyOff: 5,
    deadRebate: 0.05,
    stickyOrbs: false,
    orbBonus: 0,
  },
  {
    id: "nekonecno",
    title: "PREDATOR",
    detail: "Buy 90×, 18 FS, mŕtvy FS pripočíta plechovky do násobiča, 10 % späť, extra rampa, 4 lístky.",
    pityBonus: 2,
    jackTicket: 4,
    streakHold: true,
    dripX: 2,
    anteMul: 1.2,
    fsExtra: 3,
    buyOff: 10,
    deadRebate: 0.1,
    stickyOrbs: true,
    orbBonus: 1,
  },
];

export function perkOf(rankId: string | undefined): RankPerk {
  return RANK_PERKS.find((p) => p.id === rankId) ?? RANK_PERKS[0];
}

export function buyXOf(rankId?: string): number {
  return Math.max(80, BUY_BASE - perkOf(rankId).buyOff);
}

export function anteMulOf(rankId?: string): number {
  return perkOf(rankId).anteMul;
}

export function fsSpinsOf(rankId?: string): number {
  return FS_BASE + perkOf(rankId).fsExtra;
}

/** Expected dead spins if you turned over `buyX` bets in the base game. */
export function buyDeadEquiv(buyX: number): number {
  return Math.max(1, Math.round(buyX * (1 - BASE_HIT)));
}

/** Rank punishment for a buy, capped at one division so a 100× buy cannot dump 3 ranks. */
export function buyTurnoverPunish(entry: number, buyX: number): number {
  if (entry <= 0) return 0;
  return Math.min(DIV_RP, entry * buyDeadEquiv(buyX));
}

export function settleBuyRank(s: {
  returned: number;
  bet: number;
  buyX: number;
  entry: number;
  extras: Omit<RankSpin, "cash" | "bet" | "kind">;
}): { delta: number; parts: RankBreakdown } {
  const empty: RankBreakdown = {
    total: 0,
    fromSum: 0,
    fromMult: 0,
    fromStreak: 0,
    fromTumble: 0,
    fromBanner: 0,
    fromBonus: 0,
    fromStake: 0,
    fromBuy: 0,
    fromReload: 0,
  };
  const cost = s.bet * s.buyX;
  const punish = buyTurnoverPunish(s.entry, s.buyX);
  if (s.returned < cost) {
    const frac = cost > 0 ? Math.max(0, 1 - s.returned / cost) : 1;
    const delta = punish > 0 ? -Math.max(1, Math.round(punish * frac)) : 0;
    return { delta, parts: { ...empty, total: delta, fromBuy: delta } };
  }
  const parts = rpFromSpin({
    ...s.extras,
    cash: s.returned,
    bet: cost,
    kind: "fs",
  });
  return { delta: parts.total, parts };
}

export const RELOAD_GRANT = 5000;
export const RELOAD_STABILIZE = 80;
const RELOAD_RTP = 0.9769;

export function reloadPunish(opts: {
  bet: number;
  rp: number;
  streak: number;
  maxBet: number;
}): { delta: number; parts: RankBreakdown } {
  const bet = Math.max(0.01, opts.bet);
  const maxBet = Math.max(bet, opts.maxBet);
  const t = Math.min(1, Math.log2(1 + bet) / Math.log2(1 + maxBet));
  const avgCash = maxBet * (RELOAD_RTP / BASE_HIT);
  const perHit = rpFromSpin({
    cash: avgCash,
    bet: maxBet,
    mult: 1,
    tumbles: 0,
    streak: 1,
    banner: null,
    kind: "base",
  }).total;
  const maxHits = (RELOAD_GRANT / maxBet) * BASE_HIT;
  const maxFarm = maxHits * perHit;
  const minFee = 0.35 * DIV_RP;
  const maxFee = Math.ceil(maxFarm * 1.28);
  const rankW = 1 + standing(opts.rp).rankIndex * 0.12;
  const streakW = 1 + Math.min(5, Math.max(0, opts.streak - 1)) * 0.55;
  const raw = Math.round((minFee + (maxFee - minFee) * t) * rankW * streakW);
  const delta = raw > 0 ? -raw : 0;
  const empty: RankBreakdown = {
    total: delta,
    fromSum: 0,
    fromMult: 0,
    fromStreak: 0,
    fromTumble: 0,
    fromBanner: 0,
    fromBonus: 0,
    fromStake: 0,
    fromBuy: 0,
    fromReload: delta,
  };
  return { delta, parts: empty };
}

export const RANK_REWARDS = [
  { id: "sum", title: "Suma výhry", detail: "RP z reálnych eur, nie z násobku. 0.36 € ≈ 2 RP, 75 € ≈ 36 RP, 500 € ≈ 110 RP." },
  { id: "stake", title: "Výška stávky", detail: "Vyššia stávka pri výhre pridá RP, pri mŕtvom spine berie. KREDIT má mŕtvy spin 0. NEKONEČNO na 100 € ≈ −57 RP za miss." },
  { id: "mult", title: "Násobič", detail: "Energy plechovky. ×2 ≈ +4, ×10 ≈ +12, ×50 ≈ +19." },
  { id: "streak", title: "Séria výhier", detail: "2. výhra +2, 3. +5, 4. +9, 5.+ max +14. Mŕtvy spin zhodí na 0 — od SLOBODY jeden hold." },
  { id: "tumble", title: "Tumble reťaz", detail: "Dva a viac pádov v jednom spine: +2 až +8 RP." },
  { id: "banner", title: "BIG / MEGA / EPIC / MAX", detail: "Popup: +4 / +8 / +12 / +18." },
  { id: "bonus", title: "Bonusy", detail: "FS total +6, retrigger +5, KONTROLA +4 a +1 za standing, ante +1, 3+ scatter +2. Prírodzené FS idú z 1× stávky. Kúpa FS = 100 točení: výhra sa ráta voči cene kúpy, prehra berie entry ako mŕtve spiny (max 1 divízia)." },
  { id: "rank", title: "Aktívna liga", detail: "Herné perky: lacnejšie ante, pity, cashback, extra FS, zľava na buy, sticky plechovky. Liga nenásobí RP." },
  { id: "reload", title: "Bankrot", detail: "Dobitie +5000 pri prázdnom kredite berie RP. Max bet dump je drahší ako farm — 100 € ≈ −800 RP, opakované dobitie násobí trest. 80 platených spinov bez dobitia sériu nuluje." },
  { id: "week", title: "Týždenný drop", detail: "Raz za 7 dní klesáš o jednu skupinu na IV predchádzajúcej ligy. 4KA TV II → SMART IV. AFK max 3 skupiny naraz. Štít nechráni." },
] as const;

export const RANK_RULES = RANK_REWARDS.map((r) => `${r.title} — ${r.detail}`);

export function bannerFromX(x: number, hitMax = false): RankBanner {
  if (hitMax) return "max";
  if (x >= 50) return "epic";
  if (x >= 35) return "mega";
  if (x >= 20) return "big";
  return null;
}

export function rpFromDead(bet: number, entry: number): RankBreakdown {
  const empty: RankBreakdown = {
    total: 0,
    fromSum: 0,
    fromMult: 0,
    fromStreak: 0,
    fromTumble: 0,
    fromBanner: 0,
    fromBonus: 0,
    fromStake: 0,
    fromBuy: 0,
    fromReload: 0,
  };
  if (entry <= 0) return empty;
  const stake = Math.max(0, bet);
  const delta = -Math.max(1, Math.round(entry * (0.9 + 0.72 * Math.log2(1 + stake))));
  return { ...empty, total: delta, fromStake: delta };
}

export function rpFromSpin(s: RankSpin): RankBreakdown {
  const empty: RankBreakdown = {
    total: 0,
    fromSum: 0,
    fromMult: 0,
    fromStreak: 0,
    fromTumble: 0,
    fromBanner: 0,
    fromBonus: 0,
    fromStake: 0,
    fromBuy: 0,
    fromReload: 0,
  };
  if (s.cash <= 0 || s.bet <= 0) return empty;

  const cash = Math.max(0, s.cash);
  const wx = cash / s.bet;
  const fromSum = Math.round(3 * Math.pow(cash, 0.58)) + Math.round(1.6 * Math.log2(1 + wx));
  const m = Math.max(1, s.mult);
  const fromMult = m > 1 ? Math.min(12, Math.round(1 + 2.4 * Math.log2(m))) : 0;
  const k = Math.max(0, s.streak - 1);
  const fromStreak = k > 0 ? Math.min(8, Math.round(1.6 * k + 0.2 * k * k)) : 0;
  const fromTumble = s.tumbles >= 2 ? Math.min(5, s.tumbles) : 0;
  const fromBanner =
    s.banner === "max" ? 12 : s.banner === "epic" ? 8 : s.banner === "mega" ? 5 : s.banner === "big" ? 3 : 0;
  let fromBonus = 0;
  if (s.kind === "fs") fromBonus += 4;
  if (s.kind === "pick") fromBonus += 3;
  if (s.ante && s.kind === "base") fromBonus += 1;
  if ((s.scatters ?? 0) >= 3 && s.kind === "base") fromBonus += 2;
  const retriggers = s.retriggers ?? 0;
  if (retriggers > 0) fromBonus += Math.min(8, retriggers * 4);
  const picks = s.picks ?? 0;
  if (s.kind === "pick" && picks > 0) fromBonus += Math.min(5, picks);
  const fromStake = Math.round(
    Math.log2(1 + s.bet) * Math.min(2.6, 0.35 + 0.16 * Math.log2(1 + cash)),
  );
  const core = fromSum + fromMult + fromStreak + fromTumble + fromBanner + fromBonus + fromStake;

  return {
    total: Math.max(1, Math.min(WIN_RP_CAP, core)),
    fromSum,
    fromMult,
    fromStreak,
    fromTumble,
    fromBanner,
    fromBonus,
    fromStake,
    fromBuy: 0,
    fromReload: 0,
  };
}

export function rankBits(b: RankBreakdown): string[] {
  const bits: string[] = [];
  if (b.fromSum) bits.push(`suma ${b.fromSum > 0 ? "+" : ""}${b.fromSum}`);
  if (b.fromStake) bits.push(`stávka ${b.fromStake > 0 ? "+" : ""}${b.fromStake}`);
  if (b.fromMult) bits.push(`× +${b.fromMult}`);
  if (b.fromStreak) bits.push(`séria +${b.fromStreak}`);
  if (b.fromTumble) bits.push(`tumble +${b.fromTumble}`);
  if (b.fromBanner) bits.push(`banner +${b.fromBanner}`);
  if (b.fromBonus) bits.push(`bonus +${b.fromBonus}`);
  if (b.fromBuy) bits.push(`kúpa ${b.fromBuy}`);
  if (b.fromReload) bits.push(`bankrot ${b.fromReload}`);
  return bits;
}

/** @deprecated use rpFromSpin — kept for a few simple call sites. */
export function rpFromWin(win: number, bet: number, seqMult: number): number {
  return rpFromSpin({
    cash: win,
    bet,
    mult: seqMult,
    tumbles: 0,
    streak: 1,
    banner: null,
    kind: "base",
  }).total;
}

export interface RankSave {
  rp: number;
  peak: number;
  shield: boolean;
}

export type RankEvent = "up" | "down" | "shield" | "bust" | "week" | null;

export interface RankFlash {
  event: RankEvent;
  before: Standing;
  after: Standing;
  applied: number;
  parts?: RankBreakdown;
}

export function applyRankDelta(save: RankSave, delta: number): {
  save: RankSave;
  before: Standing;
  after: Standing;
  event: RankEvent;
  applied: number;
} {
  const before = standing(save.rp);
  if (delta === 0) {
    return { save, before, after: before, event: null, applied: 0 };
  }
  let nextRp = Math.max(0, save.rp + delta);
  let shield = save.shield;
  let event: RankEvent = null;
  let applied = nextRp - save.rp;

  const would = standing(nextRp);
  if (delta < 0 && would.rankIndex < before.rankIndex && shield) {
    nextRp = rankStart(before.rankIndex);
    applied = nextRp - save.rp;
    shield = false;
    event = "shield";
  } else {
    const afterTry = standing(nextRp);
    const same = afterTry.rankIndex === before.rankIndex;
    const climbedDiv =
      same && before.division > 0 && afterTry.division > 0 && afterTry.division < before.division;
    const droppedDiv =
      same && before.division > 0 && afterTry.division > 0 && afterTry.division > before.division;
    if (afterTry.rankIndex > before.rankIndex || climbedDiv) {
      event = "up";
      if (afterTry.rankIndex > before.rankIndex) {
        shield = true;
        const floor = rankStart(afterTry.rankIndex);
        if (nextRp < floor + PROMO_BUFFER) {
          nextRp = floor + PROMO_BUFFER;
          applied = nextRp - save.rp;
        }
      }
    } else if (afterTry.rankIndex < before.rankIndex || droppedDiv) {
      event = "down";
    }
  }

  const after = standing(nextRp);
  return {
    save: {
      rp: nextRp,
      peak: Math.max(save.peak, nextRp),
      shield,
    },
    before,
    after,
    event,
    applied,
  };
}
