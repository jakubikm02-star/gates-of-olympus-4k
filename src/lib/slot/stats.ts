/**
 * Parkizmus lifetime personal statistics (GTA-style).
 * Pure reducers + localStorage — separate from PlayerSave / EXEKÚCIA.
 */
import { cleanRecipe, type WinRecipe } from "./win-recipe.ts";
import type { PayId } from "./symbols.ts";
import type { ChaseOutcome, FsSymId } from "./zasah.ts";
import type { JobCard, JobFloor } from "./spend.ts";
import type { TierId } from "./jackpot.ts";
import type { RankBreakdown, RankEvent } from "./ranks.ts";
import type { DuelKind } from "./duel.ts";

export const STATS_KEY = "parkizmus-stats-v1";
export const STATS_BACKUP_KEY = "parkizmus-stats-backup";
export const STATS_TAB_KEY = "parkizmus-stats-tab";

export interface PlayerStats {
  v: 1;
  since: number;
  updatedAt: number;
  c: Record<string, number>;
  hi: Record<string, number>;
  lo: Record<string, number>;
  first: Record<string, number>;
  rec: Record<string, WinRecipe | null>;
  hours: number[];
  weekdays: number[];
  run: {
    dead: number;
    chaseNoUnik: number;
    fsDry: number;
    dayStreak: number;
    lastDay: string;
    sessionStart: number;
    activeMs: number;
    lastInput: number;
  };
}

export type StatEvent =
  | {
      t: "spin";
      cost: number;
      bet: number;
      ante: boolean;
      chase: boolean;
      buy: boolean;
      free: boolean;
      cash: number;
      cash0: number;
      x: number;
      tumbles: number;
      clusters: number;
      orbs: number[];
      orbSum: number;
      applied: number;
      pays: { id: PayId; count: number }[];
      scatters: number;
      nearMiss: boolean;
      taxDelta: number;
      hitMax: boolean;
      turbo: boolean;
      quick: boolean;
      auto: boolean;
      pdfHit?: boolean;
      willThrow?: boolean;
      orbBoostExtra?: number;
      ticketLand?: boolean;
      chain?: boolean;
      cashback?: number;
      escrow?: boolean;
      holdKeep?: boolean;
      danUrad?: boolean;
      bezDane?: boolean;
      rankId?: string;
      recipe?: WinRecipe | null;
      stopReels?: boolean;
    }
  | { t: "fsStart"; bought: boolean; ante: boolean; scatters: number; spins: number }
  | {
      t: "fsEnd";
      total: number;
      trigger: number;
      played: number;
      extra: number;
      peak: number;
      bought: boolean;
      buyCost: number;
      modMul: number;
      gross: number;
      ms: number;
      recipe?: WinRecipe | null;
      empty?: boolean;
      resumed?: boolean;
    }
  | { t: "pick"; cash: number; safes: number; clear: boolean; fines: number; odtah?: boolean }
  | { t: "chaseStart"; fsSym: FsSymId }
  | { t: "chaseWindow"; result: "hit" | "fs" | "miss"; lock: boolean }
  | { t: "chaseEnd"; outcome: ChaseOutcome | "void"; spins: number; strikes: number; ms: number }
  | {
      t: "job";
      phase: "take" | "ok" | "fail";
      card: Pick<JobCard, "floor" | "kind" | "stake" | "payout" | "spun" | "limit" | "mystery" | "kindB" | "tries" | "triesUsed">;
      reason?: "clock" | "parknet" | "bet";
    }
  | { t: "jackpot"; tier: TierId; payout: number; poolBefore: number; credit: number; stash?: boolean }
  | {
      t: "rank";
      applied: number;
      event: RankEvent;
      after: string;
      parts?: RankBreakdown | null;
      drip?: number;
      weekDrops?: number;
    }
  | { t: "bust"; rpLost: number }
  | {
      t: "duel";
      result: "win" | "loss" | "draw";
      pot: number;
      forfeit: "me" | "peer" | null;
      kind: DuelKind;
      blanks?: number;
    }
  | { t: "session"; phase: "start" | "hide" | "show"; pwa: boolean }
  | {
      t: "ui";
      what: "mute" | "skipBanner" | "stopReels" | "autoStop" | "paytable" | "betDown" | "anteOff" | "skipCredit" | "build";
      why?: string;
    }
  | { t: "klienti"; n: number }
  | { t: "balance"; value: number };

const PAY_IDS: readonly PayId[] = ["rj45", "router", "hap", "roof", "arris", "case", "dacia", "meter", "pdf"];
const JOB_KINDS = [
  "wins",
  "deads",
  "tumbles",
  "live",
  "ticket",
  "pdf",
  "signal",
  "symbol",
  "buy",
  "hydra",
  "chain",
  "collect",
  "cash",
] as const;
const FLOORS: readonly JobFloor[] = ["lacna", "stred", "draha"];
const TIERS: readonly TierId[] = ["ulica", "okres", "kraj", "stat"];
const RANK_IDS = ["kredit", "sloboda", "smart", "telka", "optika", "duo", "fiveg", "nekonecno"] as const;
const FS_SYMS = [...PAY_IDS, "scatter"] as const;
const REC_KEYS = ["win.cash", "win.x", "fs.best", "buy.best", "pick.best", "ticket.best"] as const;

const C_PREFIXES = [
  "spins",
  "fs.",
  "ante.",
  "wagered",
  "paid",
  "ticket.",
  "win.",
  "dead",
  "cluster",
  "tumble",
  "chain",
  "orb.",
  "near",
  "cashback",
  "rank.",
  "hold",
  "escrow",
  "sym.",
  "pdf",
  "scatter",
  "can.",
  "signal",
  "park",
  "buy.",
  "retrigger",
  "pick.",
  "odtah",
  "fine",
  "chase.",
  "hack.",
  "lock",
  "strike",
  "tep",
  "escape",
  "unik",
  "neutral",
  "void",
  "fssym.",
  "blocked",
  "boost",
  "tax.",
  "saved.",
  "dan",
  "bez",
  "mod.",
  "heat",
  "job.",
  "otrs",
  "dual",
  "ok",
  "fail",
  "siet",
  "daily",
  "jp.",
  "credit.",
  "duel.",
  "blank",
  "rp.",
  "up",
  "down",
  "shield",
  "week",
  "league.",
  "parts.",
  "session",
  "playMs",
  "fsMs",
  "chaseMs",
  "pwa",
  "build",
  "mute",
  "skip",
  "stop",
  "autoStop.",
  "betDown",
  "anteOff",
  "skipCredit",
  "paytable",
  "klienti",
  "turbo",
  "quick",
  "auto",
  "day.",
  "cash.kind",
] as const;

function emptyRun(): PlayerStats["run"] {
  return {
    dead: 0,
    chaseNoUnik: 0,
    fsDry: 0,
    dayStreak: 0,
    lastDay: "",
    sessionStart: 0,
    activeMs: 0,
    lastInput: 0,
  };
}

export function emptyStats(now = Date.now()): PlayerStats {
  return {
    v: 1,
    since: now,
    updatedAt: now,
    c: {},
    hi: {},
    lo: {},
    first: {},
    rec: {},
    hours: Array.from({ length: 24 }, () => 0),
    weekdays: Array.from({ length: 7 }, () => 0),
    run: emptyRun(),
  };
}

function finiteNonNeg(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
  return n;
}

function allowCKey(k: string): boolean {
  if (!k || k.length > 64) return false;
  return C_PREFIXES.some((p) => k === p || k.startsWith(p));
}

function allowHiLo(k: string): boolean {
  return !!k && k.length <= 64 && /^[a-z0-9._+-]+$/i.test(k);
}

/** Whitelist keys; finite ≥ 0 numbers; recipes cleaned. */
export function sanitizeStats(raw: unknown, now = Date.now()): PlayerStats {
  const base = emptyStats(now);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const o = raw as Record<string, unknown>;
  const since = finiteNonNeg(o.since) ?? now;
  const updatedAt = finiteNonNeg(o.updatedAt) ?? now;
  const c: Record<string, number> = {};
  if (o.c && typeof o.c === "object" && !Array.isArray(o.c)) {
    for (const [k, v] of Object.entries(o.c as Record<string, unknown>)) {
      const n = finiteNonNeg(v);
      if (n !== null && allowCKey(k)) c[k] = n;
    }
  }
  const hi: Record<string, number> = {};
  if (o.hi && typeof o.hi === "object" && !Array.isArray(o.hi)) {
    for (const [k, v] of Object.entries(o.hi as Record<string, unknown>)) {
      const n = finiteNonNeg(v);
      if (n !== null && allowHiLo(k)) hi[k] = n;
    }
  }
  const lo: Record<string, number> = {};
  if (o.lo && typeof o.lo === "object" && !Array.isArray(o.lo)) {
    for (const [k, v] of Object.entries(o.lo as Record<string, unknown>)) {
      const n = finiteNonNeg(v);
      if (n !== null && allowHiLo(k)) lo[k] = n;
    }
  }
  const first: Record<string, number> = {};
  if (o.first && typeof o.first === "object" && !Array.isArray(o.first)) {
    for (const [k, v] of Object.entries(o.first as Record<string, unknown>)) {
      const n = finiteNonNeg(v);
      if (n !== null && allowHiLo(k)) first[k] = n;
    }
  }
  const rec: Record<string, WinRecipe | null> = {};
  if (o.rec && typeof o.rec === "object" && !Array.isArray(o.rec)) {
    let n = 0;
    for (const [k, v] of Object.entries(o.rec as Record<string, unknown>)) {
      if (!REC_KEYS.includes(k as (typeof REC_KEYS)[number]) && !allowHiLo(k)) continue;
      if (n >= 6) break;
      rec[k] = cleanRecipe(v);
      n += 1;
    }
  }
  const hours = Array.from({ length: 24 }, (_, i) => {
    const arr = Array.isArray(o.hours) ? o.hours : [];
    return finiteNonNeg(arr[i]) ?? 0;
  });
  const weekdays = Array.from({ length: 7 }, (_, i) => {
    const arr = Array.isArray(o.weekdays) ? o.weekdays : [];
    return finiteNonNeg(arr[i]) ?? 0;
  });
  const r = o.run && typeof o.run === "object" && !Array.isArray(o.run) ? (o.run as Record<string, unknown>) : {};
  return {
    v: 1,
    since,
    updatedAt,
    c,
    hi,
    lo,
    first,
    rec,
    hours,
    weekdays,
    run: {
      dead: Math.floor(finiteNonNeg(r.dead) ?? 0),
      chaseNoUnik: Math.floor(finiteNonNeg(r.chaseNoUnik) ?? 0),
      fsDry: Math.floor(finiteNonNeg(r.fsDry) ?? 0),
      dayStreak: Math.floor(finiteNonNeg(r.dayStreak) ?? 0),
      lastDay: typeof r.lastDay === "string" ? r.lastDay.slice(0, 16) : "",
      sessionStart: finiteNonNeg(r.sessionStart) ?? 0,
      activeMs: finiteNonNeg(r.activeMs) ?? 0,
      lastInput: finiteNonNeg(r.lastInput) ?? 0,
    },
  };
}

function bump(c: Record<string, number>, k: string, n = 1): void {
  if (!Number.isFinite(n) || n === 0) return;
  c[k] = (c[k] ?? 0) + n;
}

function setHi(hi: Record<string, number>, k: string, n: number): void {
  if (!Number.isFinite(n)) return;
  const cur = hi[k];
  if (cur === undefined || n > cur) hi[k] = n;
}

function setLo(lo: Record<string, number>, k: string, n: number): void {
  if (!Number.isFinite(n) || n < 0) return;
  const cur = lo[k];
  if (cur === undefined || n < cur) lo[k] = n;
}

function setFirst(first: Record<string, number>, k: string, now: number): void {
  if (first[k] === undefined) first[k] = now;
}

function setRec(rec: Record<string, WinRecipe | null>, k: string, recipe: WinRecipe | null | undefined, better: boolean): void {
  if (!better || !recipe) return;
  const keys = Object.keys(rec);
  if (!rec[k] && keys.length >= 6 && !keys.includes(k)) {
    // drop oldest non-core if needed
    const drop = keys.find((x) => !(REC_KEYS as readonly string[]).includes(x));
    if (drop) delete rec[drop];
    else return;
  }
  rec[k] = recipe;
}

function bratislavaParts(ms: number): { hour: number; weekday: number; day: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bratislava",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Math.min(23, Math.max(0, parseInt(get("hour") || "0", 10) % 24));
  const wdMap: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const weekday = wdMap[get("weekday")] ?? 0;
  return { hour, weekday, day };
}

function canBucket(v: number): string {
  if (v >= 100) return "100+";
  if (v >= 20) return "20-50";
  if (v >= 6) return "6-15";
  return "2-5";
}

/** Pure reducer — never mutates input. */
export function applyStat(s: PlayerStats, ev: StatEvent, now = Date.now()): PlayerStats {
  const next: PlayerStats = {
    v: 1,
    since: s.since || now,
    updatedAt: now,
    c: { ...s.c },
    hi: { ...s.hi },
    lo: { ...s.lo },
    first: { ...s.first },
    rec: { ...s.rec },
    hours: s.hours.slice(),
    weekdays: s.weekdays.slice(),
    run: { ...s.run },
  };
  const { c, hi, lo, first, rec, hours, weekdays, run } = next;

  switch (ev.t) {
    case "spin": {
      const paidSpin = !ev.free && !ev.buy && ev.cost > 0;
      if (ev.free) {
        bump(c, "fs.played");
      } else if (ev.buy) {
        bump(c, "buy.spins");
        bump(c, "wagered", ev.cost);
        bump(c, "buy.spent", ev.cost);
      } else if (paidSpin) {
        bump(c, "spins");
        bump(c, "wagered", ev.cost);
        if (ev.ante) bump(c, "ante.spins");
        if (ev.chase) bump(c, "chase.spins");
        if (ev.auto) bump(c, "auto");
        if (ev.turbo) bump(c, "turbo");
        if (ev.quick) bump(c, "quick");
        if (ev.rankId) bump(c, `league.${ev.rankId}`);
        const { hour, weekday, day } = bratislavaParts(now);
        hours[hour] = (hours[hour] ?? 0) + 1;
        weekdays[weekday] = (weekdays[weekday] ?? 0) + 1;
        if (run.lastDay !== day) {
          if (run.lastDay) {
            const prev = Date.parse(run.lastDay + "T12:00:00+02:00");
            const cur = Date.parse(day + "T12:00:00+02:00");
            const gap = Number.isFinite(prev) && Number.isFinite(cur) ? (cur - prev) / 86_400_000 : 99;
            run.dayStreak = gap === 1 ? run.dayStreak + 1 : 1;
          } else {
            run.dayStreak = 1;
          }
          run.lastDay = day;
          bump(c, "day.count");
          setHi(hi, "day.streak", run.dayStreak);
        }
        run.fsDry += 1;
        setHi(hi, "fs.dry", run.fsDry);
      }

      if (ev.cash > 0) bump(c, "paid", ev.cash);
      if (ev.escrow && ev.cash > 0) bump(c, "escrow", ev.cash);
      if (ev.holdKeep) bump(c, "hold");

      if (!ev.free) {
        if (ev.cash0 > 0) {
          bump(c, "win.spins");
          run.dead = 0;
          if (ev.x < 1) bump(c, "win.lt1");
          else if (ev.x <= 5) bump(c, "win.1-5");
          else if (ev.x < 20) bump(c, "win.5-20");
          if (ev.x >= 20) {
            bump(c, "win.big");
            setFirst(first, "win.big", now);
          }
          if (ev.x >= 35) {
            bump(c, "win.mega");
            setFirst(first, "win.mega", now);
          }
          if (ev.x >= 50) {
            bump(c, "win.epic");
            setFirst(first, "win.epic", now);
          }
          if (ev.x >= 250) {
            bump(c, "win.massive");
            setFirst(first, "win.massive", now);
          }
          if (ev.hitMax) {
            bump(c, "win.max");
            setFirst(first, "win.max", now);
          }
          setFirst(first, "win.first", now);
          const betterCash = (hi["win.cash"] ?? 0) < ev.cash;
          setHi(hi, "win.cash", ev.cash);
          setRec(rec, "win.cash", ev.recipe ?? null, betterCash);
          const betterX = (hi["win.x"] ?? 0) < ev.x;
          setHi(hi, "win.x", ev.x);
          setRec(rec, "win.x", ev.recipe ?? null, betterX);
          if (!ev.free) {
            const betterBase = (hi["win.base"] ?? 0) < ev.cash;
            setHi(hi, "win.base", ev.cash);
            if (betterBase) setRec(rec, "win.cash", ev.recipe ?? null, true);
          }
        } else if (paidSpin) {
          bump(c, "dead");
          run.dead += 1;
          setHi(hi, "dead.streak", run.dead);
          if (ev.cashback && ev.cashback > 0) bump(c, "cashback", ev.cashback);
          if (ev.holdKeep) bump(c, "hold");
        }
      }

      bump(c, "cluster", ev.clusters);
      bump(c, "tumble", ev.tumbles);
      if (ev.chain || ev.tumbles >= 2) bump(c, "chain");
      setHi(hi, "tumbles.max", ev.tumbles);
      setHi(hi, "cluster.maxSpin", ev.clusters);

      for (const p of ev.pays) {
        bump(c, `sym.${p.id}.wins`);
        bump(c, `sym.${p.id}.cells`, p.count);
        if (p.count >= 12) bump(c, `sym.${p.id}.12`);
        setHi(hi, "cluster.biggest", p.count);
        if (p.id === "pdf" && p.count >= 12) setFirst(first, "pdf.12", now);
      }
      if (ev.pdfHit) bump(c, "pdf.8");
      bump(c, "scatter", ev.scatters);
      if (!ev.free && ev.scatters === 3) bump(c, "scatter.3");
      if (ev.scatters >= 4) bump(c, `scatter.${Math.min(6, ev.scatters)}`);

      if (ev.orbs.length) {
        bump(c, "can.drop", ev.orbs.length);
        setHi(hi, "can.maxSpin", ev.orbs.length);
        setHi(hi, "can.sumMax", ev.orbSum);
        for (const o of ev.orbs) {
          bump(c, `can.tier.${canBucket(o)}`);
          if (o >= 500) {
            bump(c, "can.500");
            setFirst(first, "can.500", now);
          }
        }
        if (ev.cash0 <= 0) bump(c, "can.dead", ev.orbs.length);
      }
      if (ev.willThrow) bump(c, "orb.win");
      if (ev.orbBoostExtra && ev.orbBoostExtra > 0) bump(c, "orb.extra", ev.orbBoostExtra);
      if (ev.applied > 0) bump(c, "signal", ev.orbSum || ev.applied);
      if (ev.nearMiss) bump(c, "near");
      if (ev.ticketLand) bump(c, "park.land");

      if (ev.taxDelta < 0) {
        bump(c, "tax.paid", Math.abs(ev.taxDelta));
        setHi(hi, "tax.max", Math.abs(ev.taxDelta));
      } else if (ev.taxDelta > 0) {
        bump(c, "saved.tax", ev.taxDelta);
      }
      if (ev.danUrad) bump(c, "dan.spins");
      if (ev.bezDane) bump(c, "bez.spins");
      setHi(hi, "bet.max", ev.bet);
      break;
    }
    case "fsStart": {
      bump(c, "fs.start");
      if (ev.bought) {
        bump(c, "fs.bought");
        setFirst(first, "fs.buy", now);
      } else {
        bump(c, "fs.natural");
        if (ev.ante) bump(c, "fs.ante");
      }
      setFirst(first, "fs.first", now);
      if (ev.scatters >= 4) bump(c, `scatter.${Math.min(6, ev.scatters)}`);
      run.fsDry = 0;
      break;
    }
    case "fsEnd": {
      if (ev.resumed) {
        bump(c, "fs.resume");
        break;
      }
      bump(c, "fs.sessions");
      bump(c, "fs.paid", ev.total);
      bump(c, "paid", ev.total);
      bump(c, "fsMs", ev.ms);
      if (ev.extra > 0) {
        bump(c, "retrigger", Math.floor(ev.extra / 5) || 1);
        bump(c, "fs.extra", ev.extra);
        setFirst(first, "retrigger", now);
        setHi(hi, "fs.retriggerMax", Math.floor(ev.extra / 5) || 1);
      }
      setHi(hi, "fs.peak", ev.peak);
      setHi(hi, "fs.playedMax", ev.played);
      const better = (hi["fs.best"] ?? 0) < ev.total;
      setHi(hi, "fs.best", ev.total);
      setRec(rec, "fs.best", ev.recipe ?? null, better);
      if (ev.total <= 0 || ev.empty) bump(c, "fs.empty");
      if (ev.resumed) bump(c, "fs.resume");
      if (ev.modMul !== 1) bump(c, "mod.fs");
      if (ev.modMul < 1 && ev.gross > ev.total) bump(c, "tax.paid", ev.gross - ev.total);
      if (ev.modMul > 1 && ev.total > ev.gross) bump(c, "saved.tax", ev.total - ev.gross);
      if (ev.bought && ev.buyCost > 0) {
        const returned = ev.total + ev.trigger;
        bump(c, "buy.return", returned);
        if (returned >= ev.buyCost) bump(c, "buy.profit");
        const ratio = returned / ev.buyCost;
        const betterBuy = (hi["buy.best"] ?? 0) < ratio;
        setHi(hi, "buy.best", ratio);
        setRec(rec, "buy.best", ev.recipe ?? null, betterBuy);
      }
      break;
    }
    case "pick": {
      bump(c, "pick.start");
      bump(c, "pick.safes", ev.safes);
      bump(c, "pick.paid", ev.cash);
      bump(c, "paid", ev.cash);
      bump(c, "fine", ev.fines);
      if (ev.clear) {
        bump(c, "pick.clear");
        setFirst(first, "pick.clear", now);
      }
      if (ev.odtah || ev.safes === 0) bump(c, "odtah");
      const better = (hi["pick.best"] ?? 0) < ev.cash;
      setHi(hi, "pick.best", ev.cash);
      if (better) setRec(rec, "pick.best", null, true);
      break;
    }
    case "chaseStart": {
      bump(c, "chase.start");
      bump(c, "heat");
      bump(c, `fssym.${ev.fsSym}`);
      if (ev.fsSym === "scatter") bump(c, "blocked");
      break;
    }
    case "chaseWindow": {
      bump(c, "hack.total");
      bump(c, `hack.${ev.result}`);
      if (ev.lock) bump(c, "lock");
      if (ev.result === "fs") bump(c, "strike");
      break;
    }
    case "chaseEnd": {
      bump(c, "chase.end");
      bump(c, "chaseMs", ev.ms);
      if (ev.strikes >= 2) bump(c, "tep");
      if (ev.outcome === "escape") {
        bump(c, "escape");
        setFirst(first, "escape", now);
        run.chaseNoUnik += 1;
        setHi(hi, "chase.noUnik", run.chaseNoUnik);
        if (ev.spins <= 4) bump(c, "escape.early");
        setHi(hi, "chase.escapeSpins", ev.spins);
      } else if (ev.outcome === "unik") {
        bump(c, "unik");
        setFirst(first, "unik", now);
        run.chaseNoUnik = 0;
      } else if (ev.outcome === "neutral") {
        bump(c, "neutral");
        run.chaseNoUnik += 1;
        setHi(hi, "chase.noUnik", run.chaseNoUnik);
        setHi(hi, "chase.escapeSpins", ev.spins);
      } else {
        bump(c, "void");
      }
      break;
    }
    case "job": {
      const floor = ev.card.floor;
      const kind = ev.card.kind;
      if (ev.phase === "take") {
        bump(c, "job.take");
        bump(c, `job.floor.${floor}`);
        bump(c, `job.kind.${kind}.take`);
        bump(c, "ticket.stake", ev.card.stake);
        if (ev.card.mystery) bump(c, "otrs");
        if (ev.card.kindB || kind === "hydra") bump(c, "dual");
      } else if (ev.phase === "ok") {
        bump(c, "job.ok");
        bump(c, `job.kind.${kind}.ok`);
        bump(c, `job.floor.${floor}.ok`);
        bump(c, "ticket.paid", ev.card.payout);
        bump(c, "paid", ev.card.payout);
        const profit = ev.card.payout - ev.card.stake;
        bump(c, "ticket.profit", Math.max(0, profit));
        if (kind === "live") bump(c, "siet");
        if (kind === "cash") bump(c, "cash.kind", ev.card.payout);
        setFirst(first, "job.ok", now);
        if (ev.card.mystery) setFirst(first, "otrs.ok", now);
        const better = (hi["ticket.best"] ?? 0) < ev.card.payout;
        setHi(hi, "ticket.best", ev.card.payout);
        if (ev.card.spun === ev.card.limit) bump(c, "job.lastSpin");
        const speed = ev.card.limit > 0 ? ev.card.spun / ev.card.limit : 1;
        setLo(lo, "job.fastest", speed);
        if (ev.card.tries && ev.card.tries > 0) {
          const used = (ev.card.triesUsed ?? 0) / ev.card.tries;
          bump(c, "dual.triesSum", used);
          bump(c, "dual.triesN");
        }
      } else {
        bump(c, "job.fail");
        bump(c, `job.kind.${kind}.fail`);
        const reason = ev.reason ?? "clock";
        bump(c, `fail.${reason}`);
        bump(c, "ticket.lost", ev.card.stake);
        setHi(hi, "ticket.failStake", ev.card.stake);
      }
      break;
    }
    case "jackpot": {
      bump(c, `jp.${ev.tier}`);
      bump(c, "jp.paid", ev.payout);
      bump(c, "paid", ev.payout);
      setHi(hi, "jp.pool", ev.poolBefore);
      setHi(hi, "jp.best", ev.payout);
      setFirst(first, `jp.${ev.tier}`, now);
      if (ev.credit > 0) bump(c, "credit.split", ev.credit);
      if (ev.stash) bump(c, "jp.stash");
      break;
    }
    case "rank": {
      if (ev.applied > 0) bump(c, "rp.gain", ev.applied);
      else if (ev.applied < 0) bump(c, "rp.loss", Math.abs(ev.applied));
      if (ev.event === "up") {
        bump(c, "up");
        setFirst(first, `league.${ev.after}`, now);
      } else if (ev.event === "down") bump(c, "down");
      else if (ev.event === "shield") bump(c, "shield");
      else if (ev.event === "week") {
        bump(c, "week", ev.weekDrops ?? 1);
        bump(c, "rp.week", Math.abs(ev.applied));
      }
      if (ev.drip && ev.drip > 0) bump(c, "rank.drip", ev.drip);
      if (ev.parts) {
        bump(c, "parts.fromSum", ev.parts.fromSum ?? 0);
        bump(c, "parts.fromMult", ev.parts.fromMult ?? 0);
        bump(c, "parts.fromStreak", ev.parts.fromStreak ?? 0);
        bump(c, "parts.fromTumble", ev.parts.fromTumble ?? 0);
        bump(c, "parts.fromBanner", ev.parts.fromBanner ?? 0);
        bump(c, "parts.fromBonus", ev.parts.fromBonus ?? 0);
      }
      if (ev.applied > 0) setHi(hi, "rp.maxGain", ev.applied);
      if (ev.applied < 0) setHi(hi, "rp.maxLoss", Math.abs(ev.applied));
      break;
    }
    case "bust": {
      bump(c, "bust");
      bump(c, "rp.bust", ev.rpLost);
      setFirst(first, "bust", now);
      break;
    }
    case "duel": {
      bump(c, "duel.play");
      bump(c, `duel.${ev.kind}`);
      bump(c, `duel.${ev.result}`);
      if (ev.forfeit === "me") bump(c, "duel.forfeit.me");
      if (ev.forfeit === "peer") bump(c, "duel.forfeit.peer");
      if (ev.result === "win") {
        bump(c, "duel.pot", ev.pot);
        setFirst(first, "duel.win", now);
      }
      if (ev.blanks) bump(c, "blank", ev.blanks);
      break;
    }
    case "session": {
      if (ev.phase === "start") {
        bump(c, "session");
        run.sessionStart = now;
        run.lastInput = now;
        run.activeMs = 0;
        setFirst(first, "play.first", now);
        first["play.last"] = now;
        if (ev.pwa) bump(c, "pwa");
      } else if (ev.phase === "hide" || ev.phase === "show") {
        if (run.lastInput > 0 && run.sessionStart > 0) {
          const idleGap = now - run.lastInput;
          if (idleGap < 60_000) run.activeMs += Math.max(0, idleGap);
        }
        if (ev.phase === "hide" && run.activeMs > 0) {
          bump(c, "playMs", run.activeMs);
          setHi(hi, "session.max", run.activeMs);
          run.activeMs = 0;
        }
        run.lastInput = now;
        first["play.last"] = now;
      }
      break;
    }
    case "ui": {
      if (ev.what === "mute") bump(c, "mute");
      else if (ev.what === "skipBanner") bump(c, "skip");
      else if (ev.what === "stopReels") bump(c, "stop");
      else if (ev.what === "autoStop") bump(c, `autoStop.${ev.why ?? "other"}`);
      else if (ev.what === "paytable") bump(c, "paytable");
      else if (ev.what === "betDown") bump(c, "betDown");
      else if (ev.what === "anteOff") bump(c, "anteOff");
      else if (ev.what === "skipCredit") bump(c, "skipCredit");
      else if (ev.what === "build") bump(c, "build");
      break;
    }
    case "klienti": {
      bump(c, "klienti", ev.n);
      break;
    }
    case "balance": {
      setHi(hi, "balance.max", ev.value);
      setLo(lo, "balance.low", ev.value);
      break;
    }
    default:
      break;
  }

  return next;
}

/** Merge two stats blobs: c/hi/hours/weekdays = max per key; lo/first = min; recipes prefer higher companion hi. */
export function mergeStats(a: PlayerStats, b: PlayerStats): PlayerStats {
  const A = sanitizeStats(a);
  const B = sanitizeStats(b);
  const c: Record<string, number> = { ...A.c };
  for (const [k, v] of Object.entries(B.c)) c[k] = Math.max(c[k] ?? 0, v);
  const hi: Record<string, number> = { ...A.hi };
  for (const [k, v] of Object.entries(B.hi)) hi[k] = Math.max(hi[k] ?? 0, v);
  const lo: Record<string, number> = { ...A.lo };
  for (const [k, v] of Object.entries(B.lo)) {
    lo[k] = lo[k] === undefined ? v : Math.min(lo[k], v);
  }
  const first: Record<string, number> = { ...A.first };
  for (const [k, v] of Object.entries(B.first)) {
    first[k] = first[k] === undefined ? v : Math.min(first[k], v);
  }
  const rec: Record<string, WinRecipe | null> = { ...A.rec };
  for (const [k, v] of Object.entries(B.rec)) {
    const aHi = A.hi[k] ?? 0;
    const bHi = B.hi[k] ?? 0;
    if (bHi > aHi || (bHi === aHi && v && !rec[k])) rec[k] = v;
  }
  const hours = A.hours.map((v, i) => Math.max(v, B.hours[i] ?? 0));
  const weekdays = A.weekdays.map((v, i) => Math.max(v, B.weekdays[i] ?? 0));
  const run = {
    dead: Math.max(A.run.dead, B.run.dead),
    chaseNoUnik: Math.max(A.run.chaseNoUnik, B.run.chaseNoUnik),
    fsDry: Math.max(A.run.fsDry, B.run.fsDry),
    dayStreak: Math.max(A.run.dayStreak, B.run.dayStreak),
    lastDay: A.run.lastDay >= B.run.lastDay ? A.run.lastDay : B.run.lastDay,
    sessionStart: Math.max(A.run.sessionStart, B.run.sessionStart),
    activeMs: Math.max(A.run.activeMs, B.run.activeMs),
    lastInput: Math.max(A.run.lastInput, B.run.lastInput),
  };
  return {
    v: 1,
    since: Math.min(A.since || Date.now(), B.since || Date.now()),
    updatedAt: Math.max(A.updatedAt, B.updatedAt),
    c,
    hi,
    lo,
    first,
    rec,
    hours,
    weekdays,
    run,
  };
}

export function readStats(): PlayerStats {
  if (typeof localStorage === "undefined") return emptyStats();
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return emptyStats();
    return sanitizeStats(JSON.parse(raw));
  } catch {
    return emptyStats();
  }
}

export function writeStats(s: PlayerStats): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(sanitizeStats(s)));
  } catch {
    /* quota */
  }
}

export function clearStats(): PlayerStats {
  const empty = emptyStats();
  writeStats(empty);
  return empty;
}

export function isStatsBackupEnabled(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(STATS_BACKUP_KEY) === "1";
}

export function setStatsBackupEnabled(on: boolean): void {
  if (typeof localStorage === "undefined") return;
  if (on) localStorage.setItem(STATS_BACKUP_KEY, "1");
  else localStorage.removeItem(STATS_BACKUP_KEY);
}

/** Strip hours/weekdays for cloud sync when backup is off — caller decides. */
export function statsForCloud(s: PlayerStats, includeHours: boolean): PlayerStats {
  const clean = sanitizeStats(s);
  if (includeHours) return clean;
  return { ...clean, hours: Array.from({ length: 24 }, () => 0), weekdays: Array.from({ length: 7 }, () => 0) };
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h <= 0 && m <= 0) return "0 min";
  if (h <= 0) return `${m} min`;
  if (m <= 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function formatBratislava(ms: number): string {
  if (!ms) return "—";
  try {
    return new Intl.DateTimeFormat("sk-SK", {
      timeZone: "Europe/Bratislava",
      day: "numeric",
      month: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ms));
  } catch {
    return "—";
  }
}

export function cget(s: PlayerStats, k: string): number {
  return s.c[k] ?? 0;
}

export function rate(num: number, den: number): number | null {
  if (!(den > 0)) return null;
  return num / den;
}

export function pct(num: number, den: number): string {
  const r = rate(num, den);
  if (r === null) return "—";
  return `${(r * 100).toFixed(1)} %`;
}

export { PAY_IDS, JOB_KINDS, FLOORS, TIERS, RANK_IDS, FS_SYMS, REC_KEYS };
