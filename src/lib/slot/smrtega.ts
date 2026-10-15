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
/** Client report cadence: every N RP changes while joined. Display still moves on each change. */
export const EGO_REPORT_EVERY = 5;

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

/** Server score plus RP gained or lost since the RP the server last had. Null anchor = show the server score. */
export function egoLiveScore(serverScore: number, rpNow: number, rpAtReport: number | null): number {
  if (rpAtReport == null || !Number.isFinite(rpNow) || !Number.isFinite(rpAtReport)) return serverScore;
  return Math.round(serverScore + (rpNow - rpAtReport));
}

export interface EgoBoardRow {
  nick: string;
  score: number;
  admin: boolean;
  mine?: boolean;
}

/**
 * Player's row uses the live score and the visible top is re-sorted.
 * Place counts people we can see, plus anyone the server already had ahead of us and we have not passed.
 */
export function egoLiveBoard(
  top: readonly { nick: string; score: number; admin: boolean }[],
  me: { score: number; place: number; admin: boolean },
  liveScore: number,
  nick: string,
): { score: number; place: number; top: EgoBoardRow[] } {
  const rows = top.map((t, i) => ({ nick: t.nick, score: t.score, admin: t.admin, i }));
  let mineAt = rows.findIndex((t) => t.nick === nick && t.score === me.score && t.admin === me.admin);
  if (mineAt < 0) {
    const same = rows.filter((t) => t.score === me.score && t.admin === me.admin);
    if (same.length === 1) mineAt = rows.indexOf(same[0]!);
  }
  const inTop = mineAt >= 0;
  const others = rows.filter((_, i) => i !== mineAt);
  const wasAhead = (t: { score: number; i: number }) => t.score > me.score || (t.score === me.score && (!inTop || t.i < mineAt));
  const stillAhead = (t: { score: number; i: number }) => t.score > liveScore || (t.score === liveScore && wasAhead(t));
  const visibleAheadBefore = others.filter(wasAhead).length;
  const invisibleAhead = Math.max(0, me.place - 1 - visibleAheadBefore);
  const lowest = others.reduce((m, t) => Math.min(m, t.score), Number.POSITIVE_INFINITY);
  const invisibleNow = !inTop && others.length > 0 && liveScore > lowest ? 0 : invisibleAhead;
  const place = invisibleNow + others.filter(stillAhead).length + 1;
  const mine = {
    nick: inTop ? rows[mineAt]!.nick : nick || "Niekto",
    score: liveScore,
    admin: me.admin,
    mine: true,
    i: inTop ? rows[mineAt]!.i : 1_000_000,
  };
  const byRank = (a: { score: number; i: number; mine?: boolean }, b: { score: number; i: number; mine?: boolean }) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.mine && b.mine) return 0;
    if (a.mine) return wasAhead(b) ? 1 : -1;
    if (b.mine) return wasAhead(a) ? -1 : 1;
    return a.i - b.i;
  };
  const rankedOthers = [...others].sort(byRank);
  const ranked: { nick: string; score: number; admin: boolean; mine?: boolean }[] =
    place <= 10 ? [...others, mine].sort(byRank).slice(0, 10) : rankedOthers.slice(0, 10);
  return {
    score: liveScore,
    place,
    top: ranked.map((row) => ({
      nick: row.nick,
      score: row.score,
      admin: row.admin,
      ...(row.mine ? { mine: true } : {}),
    })),
  };
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

/** What the player last saw on the event card. Place, not score: score ticks would flash the badge mid-spin. */
export interface EgoSeen {
  weekStart: number;
  place: number;
  score: number;
  prize: EgoPrizeStatus | null;
}

export function egoSnapshot(s: EgoState): EgoSeen {
  return {
    weekStart: s.weekStart,
    place: s.me?.joined ? s.me.place : 0,
    score: s.me?.joined ? s.me.score : 0,
    prize: s.prize?.status ?? null,
  };
}

function livePrize(s: EgoState, now: number): EgoPrizeStatus | null {
  const p = s.prize;
  if (!p) return null;
  if (p.status === "pending") return "pending";
  if (p.status === "awarded" && (p.expiresAt == null || now < p.expiresAt)) return "awarded";
  return null;
}

/**
 * Exclamation on the trophy.
 * Stays on for a NEKONEČNO player while the week is open and they have not entered.
 * Comes back when their place changes, or when a prize is waiting and they have not opened it at that status.
 */
export function egoAttention(s: EgoState | null, rp: number, now: number, seen: EgoSeen | null): boolean {
  if (!s) return false;
  const prize = livePrize(s, now);
  if (prize && seen?.prize !== prize) return true;
  if (now < s.weekStart || now >= s.weekEnd) return false;
  if (!s.me?.joined) return rp >= EGO_FLOOR;
  if (!seen || seen.weekStart !== s.weekStart || seen.place !== s.me.place) return true;
  return false;
}

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

/** Live status line on the event card. */
export function egoBanner(s: EgoState | null, rp: number, now: number, live?: { score: number; place: number } | null): string {
  if (s?.prize?.status === "pending") return "vyhral si · kód sa pripravuje";
  if (s?.prize?.status === "awarded") return "vyhral si · ťukni pre 4KA TV kľúč";
  const left = s ? ` · končí o ${egoLeft(s.weekEnd - now)}` : "";
  if (s?.me?.joined) {
    const place = live?.place ?? s.me.place;
    const score = live?.score ?? s.me.score;
    const lead = s.leader ? ` · líder ${s.leader.nick} ${fmtRp(s.leader.score)}` : "";
    if (s.me.admin && place === 1) {
      const cash = s.top.find((t) => !t.admin);
      return `si 1. (bez nároku)${cash ? ` · cenu má zatiaľ ${cash.nick}` : ""}${left}`;
    }
    return `si ${place}. · ${fmtRp(score)} RP${lead}${left}`;
  }
  const miss = egoMissing(rp);
  if (rp < EGO_FLOOR) return `od NEKONEČNA · chýba ti ${fmtRp(miss).replace("+", "")} RP`;
  if (miss > 0) return `na vstupné chýba ${miss} RP`;
  return `výhra 4KA TV XL s archívom na 28 dní · vstupné ${egoFee(rp)} RP${left}`;
}
