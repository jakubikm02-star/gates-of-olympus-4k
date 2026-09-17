export const DIV_RP = 100;
export const MASTER_RP = 300;
export const PROMO_BUFFER = 40;
export const WIN_RP_CAP = 90;

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
}

export interface RankBreakdown {
  total: number;
  fromSum: number;
  fromMult: number;
  fromStreak: number;
  fromTumble: number;
  fromBanner: number;
  fromBonus: number;
}

export const RANK_REWARDS = [
  { id: "sum", title: "Suma výhry", detail: "Log z násobku stávky. 10× ≈ 31 RP, 100× ≈ 60 RP — nie celý rank." },
  { id: "mult", title: "Násobič", detail: "Energy plechovky. ×2 ≈ +4, ×10 ≈ +12, ×50 ≈ +19." },
  { id: "streak", title: "Séria výhier", detail: "2. výhra +2, 3. +5, 4. +9, 5.+ max +14. Mŕtvy spin zhodí na 0." },
  { id: "tumble", title: "Tumble reťaz", detail: "Dva a viac pádov v jednom spine: +2 až +8 RP." },
  { id: "banner", title: "BIG / MEGA / EPIC / MAX", detail: "Popup: +4 / +8 / +12 / +18." },
  { id: "bonus", title: "Bonusy", detail: "FS total +6, retrigger +5, KONTROLA +4 a +1 za standing, ante +1, 3+ scatter +2." },
] as const;

export const RANK_RULES = RANK_REWARDS.map((r) => `${r.title} — ${r.detail}`);

export function bannerFromX(x: number, hitMax = false): RankBanner {
  if (hitMax) return "max";
  if (x >= 50) return "epic";
  if (x >= 35) return "mega";
  if (x >= 20) return "big";
  return null;
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
  };
  if (s.cash <= 0 || s.bet <= 0) return empty;

  const wx = s.cash / s.bet;
  const fromSum = Math.round(9 * Math.log2(1 + wx));
  const m = Math.max(1, s.mult);
  const fromMult = m > 1 ? Math.round(1 + 3.2 * Math.log2(m)) : 0;
  const k = Math.max(0, s.streak - 1);
  const fromStreak = k > 0 ? Math.min(14, Math.round(2 * k + 0.35 * k * k)) : 0;
  const fromTumble = s.tumbles >= 2 ? Math.min(8, s.tumbles) : 0;
  const fromBanner =
    s.banner === "max" ? 18 : s.banner === "epic" ? 12 : s.banner === "mega" ? 8 : s.banner === "big" ? 4 : 0;
  let fromBonus = 0;
  if (s.kind === "fs") fromBonus += 6;
  if (s.kind === "pick") fromBonus += 4;
  if (s.ante && s.kind === "base") fromBonus += 1;
  if ((s.scatters ?? 0) >= 3 && s.kind === "base") fromBonus += 2;
  const retriggers = s.retriggers ?? 0;
  if (retriggers > 0) fromBonus += Math.min(10, retriggers * 5);
  const picks = s.picks ?? 0;
  if (s.kind === "pick" && picks > 0) fromBonus += Math.min(6, picks);

  const raw = fromSum + fromMult + fromStreak + fromTumble + fromBanner + fromBonus;
  return {
    total: Math.max(1, Math.min(WIN_RP_CAP, raw)),
    fromSum,
    fromMult,
    fromStreak,
    fromTumble,
    fromBanner,
    fromBonus,
  };
}

export function rankBits(b: RankBreakdown): string[] {
  const bits: string[] = [];
  if (b.fromSum) bits.push(`suma +${b.fromSum}`);
  if (b.fromMult) bits.push(`× +${b.fromMult}`);
  if (b.fromStreak) bits.push(`séria +${b.fromStreak}`);
  if (b.fromTumble) bits.push(`tumble +${b.fromTumble}`);
  if (b.fromBanner) bits.push(`banner +${b.fromBanner}`);
  if (b.fromBonus) bits.push(`bonus +${b.fromBonus}`);
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

export type RankEvent = "up" | "down" | "shield" | null;

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
