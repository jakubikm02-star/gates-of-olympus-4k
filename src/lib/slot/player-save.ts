import { BETS, START_BALANCE, type PayId } from "./symbols";
import type { PityMap } from "./pick-bonus";
import type { TierId } from "./jackpot";
import { type JobCard, type JobFloor } from "./spend";

export const SAVE_KEY = "parkizmus-v1";
const LEGACY_KEYS = ["olympus4k-v1"];

export interface PlayerSave {
  balance: number;
  betIndex: number;
  muted: boolean;
  turbo: boolean;
  quick: boolean;
  ante: boolean;
  autoHalt: boolean;
  bestWin: number;
  pityByBet: PityMap;
  rp: number;
  rankPeak: number;
  rankShield: boolean;
  winStreak: number;
  poolLocal: number;
  reloadStreak: number;
  spinsSinceReload: number;
  lastDecayAt: number;
  updatedAt: number;
  inFs: boolean;
  fsLeft: number;
  fsTotal: number;
  fsCash: number;
  fsPlayed: number;
  fsExtra: number;
  fsPeak: number;
  fsBought: boolean;
  fsTriggerCash: number;
  globalMult: number;
  playerId: string;
  job: JobCard | null;
  pendingLiveTicket: TierId | null;
  dailyDay: string;
  dailyCards: JobCard[];
  dailyMarks: ("ok" | "fail" | null)[];
  deskDay: string;
  deskWagered: number;
  deskPaid: number;
  deskBest: number;
  deskTicketWon: number;
  deskTicketLost: number;
}

export function emptyPlayerSave(): PlayerSave {
  return {
    balance: START_BALANCE,
    betIndex: 4,
    muted: false,
    turbo: false,
    quick: false,
    ante: false,
    autoHalt: true,
    bestWin: 0,
    pityByBet: {},
    rp: 0,
    rankPeak: 0,
    rankShield: false,
    winStreak: 0,
    poolLocal: 500,
    reloadStreak: 0,
    spinsSinceReload: 0,
    lastDecayAt: 0,
    updatedAt: 0,
    inFs: false,
    fsLeft: 0,
    fsTotal: 0,
    fsCash: 0,
    fsPlayed: 0,
    fsExtra: 0,
    fsPeak: 0,
    fsBought: false,
    fsTriggerCash: 0,
    globalMult: 0,
    playerId: "",
    job: null,
    pendingLiveTicket: null,
    dailyDay: "",
    dailyCards: [],
    dailyMarks: [null, null, null],
    deskDay: "",
    deskWagered: 0,
    deskPaid: 0,
    deskBest: 0,
    deskTicketWon: 0,
    deskTicketLost: 0,
  };
}

function num(v: unknown, fallback: number, min = 0, max = Number.POSITIVE_INFINITY): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function bool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (v === 1 || v === "t" || v === "true") return true;
  if (v === 0 || v === "f" || v === "false") return false;
  return fallback;
}

function pityMap(raw: unknown): PityMap {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!obj || typeof obj !== "object") return {};
  const out: PityMap = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.max(0, Math.floor(v));
  }
  return out;
}

function stampMs(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (v instanceof Date) {
    const n = v.getTime();
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v === "string") {
    const n = Date.parse(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

const TIERS: TierId[] = ["ulica", "okres", "kraj", "stat"];
const FLOORS: JobFloor[] = ["lacna", "stred", "draha"];
const KINDS: JobCard["kind"][] = ["wins", "deads", "tumbles", "live", "ticket", "pdf", "signal", "symbol", "buy", "hydra", "chain", "collect", "cash"];
const SCOPES: JobCard["scope"][] = ["base", "live", "any"];

function jobSave(raw: unknown): JobCard | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const floor = FLOORS.includes(r.floor as JobFloor) ? (r.floor as JobFloor) : null;
  const kind = KINDS.includes(r.kind as JobCard["kind"]) ? (r.kind as JobCard["kind"]) : null;
  if (!floor || !kind) return null;
  const cash = kind === "cash";
  const need = cash
    ? Math.min(500_000, Math.max(0.1, Math.round(num(r.need, 1) * 100) / 100))
    : Math.min(40, Math.max(1, Math.floor(num(r.need, 1))));
  return {
    id: typeof r.id === "string" ? r.id.slice(0, 64) : "job",
    floor,
    template: typeof r.template === "string" ? r.template.slice(0, 24) : kind,
    title: typeof r.title === "string" ? r.title.slice(0, 32) : "TIKET",
    detail: typeof r.detail === "string" ? r.detail.slice(0, 160) : "",
    goal: typeof r.goal === "string" ? r.goal.slice(0, 140) : undefined,
    stake: num(r.stake, 1000, 1, 200000),
    payout: num(r.payout, 1800, 1, 400000),
    need,
    have: cash
      ? Math.min(need, Math.max(0, Math.round(num(r.have, 0) * 100) / 100))
      : Math.min(need, Math.max(0, Math.floor(num(r.have, 0)))),
    limit: Math.min(400, Math.max(need, Math.floor(num(r.limit, need * 8)))),
    spun: Math.min(400, Math.max(0, Math.floor(num(r.spun, 0)))),
    kind,
    scope: SCOPES.includes(r.scope as JobCard["scope"]) ? (r.scope as JobCard["scope"]) : kind === "buy" ? "live" : "base",
    lockBet: num(r.lockBet, 0, 0, 1000),
    mystery: Boolean(r.mystery),
    payId: (["rj45", "router", "hap", "roof", "arris", "case", "meter", "pdf", "dacia"] as PayId[]).includes(
      r.payId as PayId,
    )
      ? (r.payId as PayId)
      : undefined,
    payIdB: (["rj45", "router", "hap", "roof", "arris", "case", "meter", "pdf", "dacia"] as PayId[]).includes(
      r.payIdB as PayId,
    )
      ? (r.payIdB as PayId)
      : undefined,
    needB: r.needB != null ? Math.min(40, Math.max(0, Math.floor(num(r.needB, 0)))) : undefined,
    haveB: r.haveB != null ? Math.min(40, Math.max(0, Math.floor(num(r.haveB, 0)))) : undefined,
    seal: r.seal === true ? true : undefined,
  };
}

function dailyCards(raw: unknown): JobCard[] {
  if (!Array.isArray(raw)) return [];
  const out: JobCard[] = [];
  for (const item of raw) {
    const job = jobSave(item);
    if (!job || job.mystery) continue;
    out.push(job);
    if (out.length === 3) break;
  }
  return out.length === 3 ? out : [];
}

function dailyMarks(raw: unknown): ("ok" | "fail" | null)[] {
  const list = Array.isArray(raw) ? raw : [];
  return [0, 1, 2].map((i) => (list[i] === "ok" || list[i] === "fail" ? list[i] : null));
}

function ticketSave(raw: unknown): TierId | null {
  const id = typeof raw === "string" ? raw : "";
  return TIERS.includes(id as TierId) ? (id as TierId) : null;
}

export function sanitizePlayerSave(raw: unknown): PlayerSave {
  const s = emptyPlayerSave();
  if (!raw || typeof raw !== "object") return s;
  const r = raw as Record<string, unknown>;
  s.balance = num(r.balance, START_BALANCE, 0, 1_000_000_000);
  s.betIndex = Math.min(BETS.length - 1, Math.max(0, Math.floor(num(r.betIndex, 4, 0, BETS.length - 1))));
  s.muted = bool(r.muted, false);
  s.turbo = bool(r.turbo, false);
  s.quick = bool(r.quick, false);
  s.ante = bool(r.ante, false);
  s.autoHalt = bool(r.autoHalt, true);
  s.bestWin = num(r.bestWin, 0, 0, 1_000_000_000);
  s.pityByBet = pityMap(r.pityByBet);
  s.rp = Math.max(0, Math.floor(num(r.rp, 0)));
  s.rankPeak = Math.max(0, Math.floor(num(r.rankPeak, 0)));
  s.rankShield = bool(r.rankShield, false);
  s.winStreak = Math.min(99, Math.max(0, Math.floor(num(r.winStreak, 0))));
  s.poolLocal = num(r.poolLocal, 500, 0, 1_000_000_000);
  s.reloadStreak = Math.min(20, Math.max(0, Math.floor(num(r.reloadStreak, 0))));
  s.spinsSinceReload = Math.min(10_000, Math.max(0, Math.floor(num(r.spinsSinceReload, 0))));
  s.lastDecayAt = stampMs(r.lastDecayAt);
  s.updatedAt = stampMs(r.updatedAt ?? r.updated_at);
  s.inFs = bool(r.inFs, false);
  s.fsLeft = Math.min(500, Math.max(0, Math.floor(num(r.fsLeft, 0))));
  s.fsTotal = Math.min(500, Math.max(0, Math.floor(num(r.fsTotal, 0))));
  s.fsCash = num(r.fsCash, 0, 0, 1_000_000_000);
  s.fsPlayed = Math.min(500, Math.max(0, Math.floor(num(r.fsPlayed, 0))));
  s.fsExtra = Math.min(500, Math.max(0, Math.floor(num(r.fsExtra, 0))));
  s.fsPeak = num(r.fsPeak, 0, 0, 1_000_000);
  s.fsBought = bool(r.fsBought, false);
  s.fsTriggerCash = num(r.fsTriggerCash, 0, 0, 1_000_000_000);
  s.globalMult = num(r.globalMult, 0, 0, 1_000_000);
  s.playerId = typeof r.playerId === "string" && r.playerId.length >= 8 ? r.playerId.slice(0, 64) : "";
  s.job = jobSave(r.job);
  s.pendingLiveTicket = ticketSave(r.pendingLiveTicket);
  s.dailyDay = typeof r.dailyDay === "string" ? r.dailyDay.slice(0, 16) : "";
  s.dailyCards = dailyCards(r.dailyCards);
  s.dailyMarks = s.dailyCards.length === 3 ? dailyMarks(r.dailyMarks) : [null, null, null];
  s.deskDay = typeof r.deskDay === "string" ? r.deskDay.slice(0, 16) : "";
  s.deskWagered = num(r.deskWagered, 0, 0, 1_000_000_000);
  s.deskPaid = num(r.deskPaid, 0, 0, 1_000_000_000);
  s.deskBest = num(r.deskBest, 0, 0, 1_000_000_000);
  s.deskTicketWon = num(r.deskTicketWon, 0, 0, 1_000_000_000);
  s.deskTicketLost = num(r.deskTicketLost, 0, 0, 1_000_000_000);
  if (!s.inFs || s.fsLeft <= 0) {
    s.inFs = false;
    s.fsLeft = 0;
    s.pendingLiveTicket = null;
  }
  return s;
}

function parseSlot(raw: string | null): PlayerSave | null {
  if (!raw) return null;
  try {
    return sanitizePlayerSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

function newer(a: PlayerSave | null, b: PlayerSave | null): PlayerSave | null {
  if (!a) return b;
  if (!b) return a;
  return a.updatedAt >= b.updatedAt ? a : b;
}

export function readLocalSave(): PlayerSave | null {
  try {
    let best = parseSlot(localStorage.getItem(SAVE_KEY));
    for (const key of LEGACY_KEYS) {
      best = newer(best, parseSlot(localStorage.getItem(key)));
    }
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith("parkizmus-save:")) continue;
      best = newer(best, parseSlot(localStorage.getItem(key)));
    }
    return best;
  } catch {
    return null;
  }
}

export function writeLocalSave(s: PlayerSave): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...s, updatedAt: s.updatedAt || Date.now() }));
  } catch {
    /* ignore quota */
  }
}
