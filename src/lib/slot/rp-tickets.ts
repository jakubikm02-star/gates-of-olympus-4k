/**
 * RP from tickets (návrh /workspace/rp-tikety/navrh.md, TIER ×2).
 *
 * - A cleared ticket pays fixed RP by tier × league × type × stake factor, capped at TICKET_RP_CAP.
 * - A failed ticket costs TICKET_FAIL_SHARE of the same (capped) value.
 * - Positive spin RP is scaled: ×0.7 (or the league value, if higher) with an active ticket,
 *   ×1.0 … ×0.4 by league without one. Losses are never scaled.
 * - SUCHO: from 4KA TV league up, every paid spin without a ticket after SUCHO_GRACE costs 1 RP.
 * - Daily decay: a played day without a cleared ticket costs 1 % of RP above DAILY_FLOOR.
 * - SUCHO and the daily decay never push RP below RP_PROTECT_FLOOR.
 *
 * Credits / RTP are untouched: this module only moves RP.
 */
import { RANKS, type RankBreakdown } from "./ranks.ts";
import { featureOf, type JobCard, type JobFloor } from "./spend.ts";

export const TICKET_RP_BASE: Record<JobFloor, number> = { lacna: 100, stred: 200, draha: 460 };
export const TICKET_RP_CAP = 2000;
export const TICKET_FAIL_SHARE = 0.25;

export const TYPE_MULT = {
  twoGoal: 1.5,
  dual: 1.75,
  feature: 1.25,
  mystery: 1.2,
  daily: 1.5,
} as const;

/** League multiplier on ticket RP: KREDIT ×1.0 … NEKONEČNO ×2.0. */
export function leagueMult(entry: number): number {
  return 1 + Math.max(0, Math.min(10, entry)) / 10;
}

/** 0,20 € → ×0.64 … 1 000 € → ×1.0. Keeps tiny stakes from farming RP. */
export function stakeFactor(stake: number): number {
  const s = Math.max(0, stake);
  return 0.6 + 0.4 * Math.min(1, Math.log2(1 + s) / Math.log2(1001));
}

export interface TicketRp {
  ok: number;
  fail: number;
  base: number;
  league: number;
  type: number;
  stake: number;
  capped: boolean;
  /** Short label of the type bonuses, e.g. "2 ciele · denný". */
  tags: string[];
}

export type TicketRpCard = Pick<JobCard, "floor" | "stake" | "template" | "templateB" | "kindB" | "mystery" | "tries">;

function entryOf(rankId: string): number {
  return RANKS.find((r) => r.id === rankId)?.entry ?? 0;
}

export function ticketTypeMult(card: TicketRpCard): { mult: number; tags: string[] } {
  let mult = 1;
  const tags: string[] = [];
  if (card.tries != null) {
    mult *= TYPE_MULT.dual;
    tags.push("základ + 4KA TV");
  } else if (card.kindB) {
    mult *= TYPE_MULT.twoGoal;
    tags.push("2 ciele");
  }
  if (featureOf(card.template) || featureOf(card.templateB)) {
    mult *= TYPE_MULT.feature;
    tags.push("feature");
  }
  if (card.mystery) {
    mult *= TYPE_MULT.mystery;
    tags.push("OTRS");
  } else {
    mult *= TYPE_MULT.daily;
    tags.push("denný");
  }
  return { mult, tags };
}

/** RP for clearing (ok) or failing (fail, negative) this ticket in league `rankId`. */
export function ticketRp(card: TicketRpCard, rankId: string): TicketRp {
  const base = TICKET_RP_BASE[card.floor] ?? TICKET_RP_BASE.lacna;
  const league = leagueMult(entryOf(rankId));
  const { mult: type, tags } = ticketTypeMult(card);
  const stake = stakeFactor(card.stake);
  const raw = Math.round(base * league * type * stake);
  const ok = Math.min(TICKET_RP_CAP, raw);
  return { ok, fail: -Math.round(ok * TICKET_FAIL_SHARE), base, league, type, stake, capped: raw > TICKET_RP_CAP, tags };
}

/** Range of ok RP for the hidden OTRS card (min = one goal, max = dual + feature). */
export function mysteryRpRange(floor: JobFloor, stake: number, rankId: string): [number, number] {
  const lo = ticketRp({ floor, stake, template: "", mystery: true, kindB: "wins" }, rankId).ok;
  const hi = ticketRp({ floor, stake, template: "", templateB: "", mystery: true, tries: 1 }, rankId);
  const feat = Math.min(TICKET_RP_CAP, Math.round(hi.ok * TYPE_MULT.feature));
  return [lo, feat];
}

/** Spin RP multiplier without a ticket, by league. */
export const IDLE_MULT: Record<string, number> = {
  kredit: 1,
  sloboda: 1,
  smart: 0.8,
  telka: 0.6,
  optika: 0.55,
  duo: 0.5,
  fiveg: 0.45,
  nekonecno: 0.4,
};
export const ACTIVE_MULT = 0.7;

export function spinGainMult(rankId: string, ticketActive: boolean): number {
  const idle = IDLE_MULT[rankId] ?? 1;
  return ticketActive ? Math.max(ACTIVE_MULT, idle) : idle;
}

/** Scale a spin RP delta. Losses stay as they are; any gain keeps at least 1 RP. */
export function scaleSpinGain(delta: number, rankId: string, ticketActive: boolean): number {
  if (delta <= 0) return delta;
  return Math.max(1, Math.round(delta * spinGainMult(rankId, ticketActive)));
}

export const SUCHO_GRACE = 40;
export const SUCHO_WARN = [30, 40] as const;
export const SUCHO_MIN_ENTRY = 5;
export const SUCHO_TAX = 1;
export const RP_PROTECT_FLOOR = 1200;

/** SUCHO applies in this league (4KA TV and up). */
export function suchoLeague(rankId: string): boolean {
  return entryOf(rankId) >= SUCHO_MIN_ENTRY;
}

export interface SuchoStep {
  idle: number;
  /** RP change for this spin (0 or −1). */
  tax: number;
  /** Toast to show for this spin, if any. */
  warn: "soon" | "last" | "start" | null;
}

/** One paid spin without an active ticket. */
export function suchoStep(idle: number, rp: number, rankId: string): SuchoStep {
  const next = Math.min(100_000, Math.max(0, Math.floor(idle)) + 1);
  if (!suchoLeague(rankId)) return { idle: next, tax: 0, warn: null };
  const tax = next > SUCHO_GRACE && rp - SUCHO_TAX >= RP_PROTECT_FLOOR ? -SUCHO_TAX : 0;
  const warn = next === SUCHO_WARN[0] ? "soon" : next === SUCHO_WARN[1] ? "last" : next === SUCHO_GRACE + 1 ? "start" : null;
  return { idle: next, tax, warn };
}

/** Spins left until SUCHO starts taxing (0 = running). */
export function suchoLeft(idle: number): number {
  return Math.max(0, SUCHO_GRACE - Math.max(0, idle));
}

export const DAILY_FLOOR = 2700;
export const DAILY_SHARE = 0.01;

export interface RpDay {
  day: string;
  /** A paid spin happened on `day`. */
  played: boolean;
  /** A ticket was cleared on `day`. */
  ok: boolean;
}

export function freshRpDay(day: string): RpDay {
  return { day, played: false, ok: false };
}

/** RP lost to the daily decay for the closed day `prev` (≤ 0). */
export function dailyDecay(rp: number, prev: RpDay): number {
  if (!prev.played || prev.ok || rp <= DAILY_FLOOR) return 0;
  const loss = Math.round((rp - DAILY_FLOOR) * DAILY_SHARE);
  const room = Math.max(0, rp - RP_PROTECT_FLOOR);
  return -Math.min(loss, room);
}

/** Roll to `today`: returns the decay for the closed day and the new record. Same day → no-op. */
export function rollRpDay(rp: number, rec: RpDay, today: string): { loss: number; rec: RpDay; rolled: boolean } {
  if (rec.day === today) return { loss: 0, rec, rolled: false };
  // Only the last recorded day counts. Days without play are left to the weekly drop.
  return { loss: rec.day ? dailyDecay(rp, rec) : 0, rec: freshRpDay(today), rolled: true };
}

export function sanitizeRpDay(raw: unknown, today: string): RpDay {
  if (!raw || typeof raw !== "object") return freshRpDay(today);
  const r = raw as Record<string, unknown>;
  const day = typeof r.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.day) ? r.day : "";
  if (!day) return freshRpDay(today);
  return { day, played: r.played === true, ok: r.ok === true };
}

export function sanitizeIdle(raw: unknown): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : 0;
  return Math.min(100_000, Math.max(0, n));
}

/** Breakdown for a ticket / SUCHO / daily RP change (rankBits shows the one set field). */
export function rpParts(total: number, key: "fromTicket" | "fromSucho" | "fromDaily"): RankBreakdown {
  return {
    total,
    fromSum: 0,
    fromMult: 0,
    fromStreak: 0,
    fromTumble: 0,
    fromBanner: 0,
    fromBonus: 0,
    fromStake: 0,
    fromBuy: 0,
    fromReload: 0,
    [key]: total,
  };
}

/** Spin breakdown after the ticket rule scaled its total (fromScale = the cut, ≤ 0). */
export function scaledParts(parts: RankBreakdown | null | undefined, raw: number, scaled: number): RankBreakdown | null {
  if (scaled === raw) return parts ?? null;
  const base = parts ?? { total: raw, fromSum: raw, fromMult: 0, fromStreak: 0, fromTumble: 0, fromBanner: 0, fromBonus: 0, fromStake: 0, fromBuy: 0, fromReload: 0 };
  return { ...base, total: scaled, fromScale: (base.fromScale ?? 0) + scaled - raw };
}
