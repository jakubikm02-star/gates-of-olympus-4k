/**
 * Server day (P0): the game's daily reset is midnight Europe/Bratislava, measured on the server clock.
 * The client asks /api/clock once at boot (and again every 30 min / on focus) and keeps the offset to its own
 * clock, so moving the phone's clock does not move the day. Offline / no answer: the local clock (offset 0).
 * DST-safe: the day and the next midnight come from Intl (tz database), never from a fixed +1/+2 h.
 */
export const DAY_TZ = "Europe/Bratislava";

let dayFmt: Intl.DateTimeFormat | null = null;
let partFmt: Intl.DateTimeFormat | null = null;

/** YYYY-MM-DD in Europe/Bratislava for the instant `ms`. */
export function braDay(ms: number): string {
  dayFmt ??= new Intl.DateTimeFormat("en-CA", { timeZone: DAY_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  return dayFmt.format(new Date(ms));
}

/** Offset of Europe/Bratislava from UTC at the instant `ms` (ms; +1 h winter, +2 h summer). */
export function braOffsetMs(ms: number): number {
  partFmt ??= new Intl.DateTimeFormat("en-US", {
    timeZone: DAY_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, number> = {};
  for (const x of partFmt.formatToParts(new Date(ms))) if (x.type !== "literal") p[x.type] = Number(x.value);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** The first Europe/Bratislava midnight strictly after `ms` (the next daily reset). */
export function braMidnightAfter(ms: number): number {
  const [y, m, d] = braDay(ms).split("-").map(Number);
  // Local midnight of the next calendar day = UTC midnight of that date minus the offset valid then.
  const utcMid = Date.UTC(y, m - 1, d + 1);
  let t = utcMid - braOffsetMs(utcMid);
  // Offset may differ on the two sides of a DST switch (switches are at 02:00/03:00, never at midnight,
  // but stay exact anyway): one correction step.
  t = utcMid - braOffsetMs(t);
  return t;
}

/** ms until the next daily reset. */
export function msToReset(ms: number): number {
  return Math.max(0, braMidnightAfter(ms) - ms);
}

/** "13:05:09" style countdown (hours can exceed 24 never: one day max). */
export function resetCountdown(msLeft: number): string {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export interface ClockReply {
  now: number;
  day: string;
  next: number;
  tz: string;
}

/** Server side of /api/clock. */
export function clockReply(now = Date.now()): ClockReply {
  return { now, day: braDay(now), next: braMidnightAfter(now), tz: DAY_TZ };
}

let offset = 0;
let synced = false;
let lastSync = 0;

/** Clock of the server as best known (local clock + offset learned from /api/clock). */
export function serverNow(): number {
  return Date.now() + offset;
}

export function serverDay(): string {
  return braDay(serverNow());
}

export function clockSynced(): boolean {
  return synced;
}

/** Tests / dev. */
export function setServerOffset(ms: number, isSynced = true): void {
  offset = ms;
  synced = isSynced;
}

/**
 * Learn the offset from /api/clock (midpoint of the round trip). Returns true when it worked. Repeated calls
 * within `minGapMs` are skipped. Never throws.
 */
export async function syncServerClock(
  fetcher: (url: string, init?: RequestInit) => Promise<Response> = (u, i) => fetch(u, i),
  minGapMs = 30 * 60 * 1000,
): Promise<boolean> {
  const t0 = Date.now();
  if (synced && t0 - lastSync < minGapMs) return true;
  try {
    const res = await fetcher(`/api/clock?t=${t0}`, { cache: "no-store", headers: { accept: "application/json" } });
    if (!res.ok) return false;
    const j = (await res.json()) as Partial<ClockReply>;
    const t1 = Date.now();
    if (typeof j.now !== "number" || !Number.isFinite(j.now)) return false;
    // A round trip slower than 10 s says nothing reliable about the clock.
    if (t1 - t0 > 10_000) return false;
    offset = Math.round(j.now - (t0 + t1) / 2);
    synced = true;
    lastSync = t1;
    return true;
  } catch {
    return false;
  }
}
