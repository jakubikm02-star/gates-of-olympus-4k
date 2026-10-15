/**
 * SMRŤ EGA: weekly NEKONEČNO-only event (návrh v3, kap. A). Pure logic, mirrored by
 * supabase/migrations/20261015_smrtega.sql (server is the source of truth for fee, score and winner).
 * - entry fee: clamp(2.5 % RP, 500, 2 500), rounded to 50, deducted on join; RP − fee must stay ≥ NEKONEČNO.
 * - score: net weekly RP = RP now − RP at join (before the fee). Gains and losses, company RP counts equally.
 * - window: Monday 01:00 → next Monday 01:00 Europe/Bratislava (DST-safe: 167 / 168 / 169 h weeks).
 * Does not touch spin math or RTP.
 */
import { braOffsetMs } from "./server-day.ts";

export const EGO_FLOOR = 2700;
export const EGO_FEE_PCT = 0.025;
export const EGO_FEE_MIN = 500;
export const EGO_FEE_MAX = 2500;
export const EGO_VALID_DAYS = 28;
export const EGO_SLOTS = 4;
export const EGO_REPORT_EVERY = 20;

export function egoFee(rp: number): number {
  const raw = Math.round((Math.max(0, rp) * EGO_FEE_PCT) / 50) * 50;
  return Math.min(EGO_FEE_MAX, Math.max(EGO_FEE_MIN, raw));
}

/** RP still missing to be allowed to join (0 = can join). Join needs rp ≥ floor and rp − fee ≥ floor. */
export function egoMissing(rp: number): number {
  if (rp < EGO_FLOOR) return EGO_FLOOR - rp;
  const need = EGO_FLOOR + egoFee(rp);
  if (rp >= need) return 0;
  // Smallest rp' ≥ rp with rp' − fee(rp') ≥ floor (fee is the min 500 in this range).
  let x = rp;
  while (x - egoFee(x) < EGO_FLOOR) x += 1;
  return x - rp;
}

export function egoScore(rpNow: number, rpStart: number): number {
  return Math.round(rpNow - rpStart);
}

/** Local wall clock (Bratislava) at a UTC instant, as UTC-based ms. */
function localMs(ms: number): number {
  return ms + braOffsetMs(ms);
}

/** UTC instant of a Bratislava wall-clock time (given as UTC-based ms). */
function fromLocal(local: number): number {
  let t = local - braOffsetMs(local);
  t = local - braOffsetMs(t);
  return t;
}

/** Start (Monday 01:00 Bratislava) of the event week that contains `ms`. */
export function egoWeekStart(ms: number): number {
  const shifted = localMs(ms) - 3_600_000; // treat Mon 00:00–00:59 as the previous week
  const d = new Date(shifted);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  const mondayLocal = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow, 1, 0, 0);
  return fromLocal(mondayLocal);
}

export function egoWeekEnd(ms: number): number {
  const start = egoWeekStart(ms);
  const l = new Date(localMs(start));
  return fromLocal(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() + 7, 1, 0, 0));
}

/** delivered + 28 days on the local wall clock. */
export function egoExpires(deliveredMs: number): number {
  const l = new Date(localMs(deliveredMs));
  return fromLocal(
    Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() + EGO_VALID_DAYS, l.getUTCHours(), l.getUTCMinutes(), l.getUTCSeconds()),
  );
}

export interface EgoEntryLite {
  id: string;
  score: number;
  reachedAt: number;
  fee: number;
  admin?: boolean;
  hard?: boolean;
  cooldown?: boolean;
  revoked?: boolean;
}

/** Same tie-break order as SQL: score desc, earlier reached_at, then id. */
export function egoRanking<T extends EgoEntryLite>(entries: T[]): T[] {
  return [...entries].sort((a, b) => b.score - a.score || a.reachedAt - b.reachedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Winner: best eligible (not admin, no hard flag, no cooldown, not revoked) with score ≥ 0.
 * A lone participant must also beat their own fee. Soft flags do not block. null = void week.
 */
export function egoWinner<T extends EgoEntryLite>(entries: T[], skip: ReadonlySet<string> = new Set()): T | null {
  const lone = entries.length === 1;
  for (const e of egoRanking(entries)) {
    if (e.admin || e.hard || e.cooldown || e.revoked || skip.has(e.id)) continue;
    if (e.score < 0) return null;
    if (lone && e.score < e.fee) return null;
    return e;
  }
  return null;
}

export function fmtRp(n: number): string {
  const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  return `${n < 0 ? "−" : n > 0 ? "+" : ""}${s}`;
}

export function egoLeft(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  return d > 0 ? `${d} d ${String(h).padStart(2, "0")} h` : `${h} h ${String(mm).padStart(2, "0")} min`;
}

export type EgoPrizeStatus = "pending" | "awarded" | "revoked" | "expired";

export interface EgoState {
  weekStart: number;
  weekEnd: number;
  now: number;
  players: number;
  top: { nick: string; score: number; admin: boolean }[];
  me: { joined: boolean; score: number; place: number; fee: number; admin: boolean } | null;
  leader: { nick: string; score: number } | null;
  prize: { status: EgoPrizeStatus; deliveredAt: number | null; expiresAt: number | null } | null;
  lastWinner: { nick: string; score: number } | null;
}

/** Text for the banner slot that alternates with the jackpot strip. */
export function egoBanner(s: EgoState | null, rp: number, now: number): string {
  if (s?.prize?.status === "pending") return "vyhral si · kód sa pripravuje";
  if (s?.prize?.status === "awarded") return "vyhral si · ťukni pre 4KA TV kľúč";
  const left = s ? ` · končí o ${egoLeft(s.weekEnd - now)}` : "";
  if (s?.me?.joined) {
    const lead = s.leader ? ` · líder ${s.leader.nick} ${fmtRp(s.leader.score)}` : "";
    if (s.me.admin && s.me.place === 1) {
      const cash = s.top.find((t) => !t.admin);
      return `si 1. (bez nároku)${cash ? ` · cenu má zatiaľ ${cash.nick}` : ""}${left}`;
    }
    return `si ${s.me.place}. · ${fmtRp(s.me.score)} RP${lead}${left}`;
  }
  const miss = egoMissing(rp);
  if (rp < EGO_FLOOR) return `od NEKONEČNA · chýba ti ${fmtRp(miss).replace("+", "")} RP`;
  if (miss > 0) return `na vstupné chýba ${miss} RP`;
  return `výhra 4KA TV XL s archívom na 28 dní · vstupné ${egoFee(rp)} RP${left}`;
}
