import { BETS, START_BALANCE } from "./symbols";
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
}

export function emptyPlayerSave(): PlayerSave {
  return {
    balance: START_BALANCE,
    betIndex: 4,
    muted: false,
    turbo: false,
    quick: false,
    ante: false,
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
const KINDS: JobCard["kind"][] = ["wins", "deads", "tumbles", "live", "ticket", "pdf", "signal", "dry"];

function jobSave(raw: unknown): JobCard | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const floor = FLOORS.includes(r.floor as JobFloor) ? (r.floor as JobFloor) : null;
  const kind = KINDS.includes(r.kind as JobCard["kind"]) ? (r.kind as JobCard["kind"]) : null;
  if (!floor || !kind) return null;
  const need = Math.min(40, Math.max(1, Math.floor(num(r.need, 1))));
  return {
    id: typeof r.id === "string" ? r.id.slice(0, 64) : "job",
    floor,
    template: typeof r.template === "string" ? r.template.slice(0, 24) : kind,
    title: typeof r.title === "string" ? r.title.slice(0, 24) : "ZÁKAZKA",
    detail: typeof r.detail === "string" ? r.detail.slice(0, 80) : "",
    stake: num(r.stake, 1000, 1, 200000),
    payout: num(r.payout, 1800, 1, 400000),
    need,
    have: Math.min(need, Math.max(0, Math.floor(num(r.have, 0)))),
    limit: Math.min(400, Math.max(need, Math.floor(num(r.limit, need * 8)))),
    spun: Math.min(400, Math.max(0, Math.floor(num(r.spun, 0)))),
    kind,
    lockBet: num(r.lockBet, 0, 0, 1000),
  };
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
