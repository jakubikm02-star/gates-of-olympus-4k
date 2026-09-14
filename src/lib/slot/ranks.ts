export const DIV_RP = 100;
export const MASTER_RP = 300;

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
  { id: "sloboda", name: "SLOBODA", product: "Paušál 200 / 400", divisions: 4, entry: 8, color: "#c47a3a", ink: "#ffe1c0" },
  { id: "smart", name: "SMART", product: "SMART paušál", divisions: 4, entry: 12, color: "#b7c2ce", ink: "#f4f7fb" },
  { id: "telka", name: "4KA TV", product: "Telka cez anténu", divisions: 4, entry: 16, color: "#e2b01a", ink: "#fff4c4" },
  { id: "optika", name: "OPTIKA", product: "Internet XL", divisions: 4, entry: 22, color: "#3ec6e0", ink: "#d9f7ff" },
  { id: "duo", name: "DUO", product: "Internet + TV", divisions: 4, entry: 28, color: "#6ea8ff", ink: "#e7f0ff" },
  { id: "fiveg", name: "5G NA DOMA", product: "5G na doma", divisions: 1, entry: 36, color: "#c86bff", ink: "#f6e5ff" },
  { id: "nekonecno", name: "NEKONEČNO", product: "SLOBODA NEKONEČNO", divisions: 1, entry: 48, color: "#ff3b4e", ink: "#ffe3b0" },
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

/** Win RP from multiplier value + win amount (in bet multiples). */
export function rpFromWin(win: number, bet: number, seqMult: number): number {
  if (win <= 0 || bet <= 0) return 0;
  const wx = win / bet;
  const fromSum = wx * 2.6;
  const fromMult = Math.max(1, seqMult) * 4;
  return Math.max(1, Math.round(Math.min(380, fromSum + fromMult)));
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
      if (afterTry.rankIndex > before.rankIndex) shield = true;
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
