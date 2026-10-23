/**
 * Today's ribbons on this phone. The save may carry a copy; the side key is
 * the one that updates on the spin. Server publish happens only when the
 * latest title (or the nick next to it) changes.
 */
import { setPackedRibbon } from "./duel-api.ts";
import { publishRibbon } from "./ribbon-api.ts";
import {
  RIBBON_KEY,
  TIER_RANK,
  emptyRibbonLog,
  latestRibbon,
  noteRibbon,
  ribbonById,
  ribbonFromStat,
  sanitizeRibbonLog,
  type RibbonEvent,
  type RibbonLog,
} from "./ribbons.ts";
import { braDay, serverNow } from "./server-day.ts";

const subs = new Set<() => void>();
let log: RibbonLog = emptyRibbonLog("", 0);
let loaded = false;
let toast: { id: string; nonce: number } | null = null;
let queue: string[] = [];
let nonce = 1;
let turbo = false;
let playerId = "";
let nick = "";
let sent = "";

function emit(): void {
  for (const fn of subs) fn();
}

export function subscribeRibbons(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

function readStored(): RibbonLog | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(RIBBON_KEY);
    if (!raw) return null;
    return sanitizeRibbonLog(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeStored(next: RibbonLog): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(RIBBON_KEY, JSON.stringify(next));
  } catch {
    /* private mode: the save copy still travels on the next persist */
  }
}

function ensure(): RibbonLog {
  if (!loaded) {
    loaded = true;
    const stored = readStored();
    log = stored ? roll(stored, serverNow()) : emptyRibbonLog(braDay(serverNow()), serverNow());
    setPackedRibbon(latestRibbon(log)?.id ?? "");
  }
  return log;
}

function roll(src: RibbonLog, now: number): RibbonLog {
  const day = braDay(now);
  if (src.day === day) return src;
  return emptyRibbonLog(day, 0);
}

function pick(a: RibbonLog | null, b: RibbonLog | null, now: number): RibbonLog {
  const day = braDay(now);
  const A = a ? roll(a, now) : emptyRibbonLog(day, 0);
  const B = b ? roll(b, now) : emptyRibbonLog(day, 0);
  if (A.at !== B.at) return A.at >= B.at ? A : B;
  return A.earned.length >= B.earned.length ? A : B;
}

export function hydrateRibbons(fromSave: unknown): void {
  const now = serverNow();
  log = pick(sanitizeRibbonLog(fromSave), readStored(), now);
  loaded = true;
  writeStored(log);
  setPackedRibbon(latestRibbon(log)?.id ?? "");
  emit();
  publishLatest();
}

export function ribbonLog(): RibbonLog {
  return ensure();
}

export function ribbonSnapshot(): RibbonLog {
  return ensure();
}

/** Stable identity: useSyncExternalStore compares this with Object.is. */
const SERVER_LOG: RibbonLog = emptyRibbonLog("", 0);

export function ribbonServerSnapshot(): RibbonLog {
  return SERVER_LOG;
}

export function latestRibbonId(): string {
  return latestRibbon(ensure())?.id ?? "";
}

export function toastSnapshot(): { id: string; nonce: number } | null {
  return toast;
}

export function setRibbonTurbo(on: boolean): void {
  turbo = on;
}

/** `skipAll` throws away the queue. A timeout advances to the next title. */
export function dismissRibbonToast(skipAll = false): void {
  if (skipAll) queue = [];
  const id = skipAll ? undefined : queue.shift();
  const next = id ? { id, nonce: nonce++ } : null;
  if (!toast && !next) return;
  toast = next;
  emit();
}

function announce(ids: string[]): void {
  if (!ids.length) return;
  const ranked = [...ids].sort((a, b) => rankOf(b) - rankOf(a));
  if (turbo) {
    const best = ranked[0]!;
    if (!toast || rankOf(best) >= rankOf(toast.id)) toast = { id: best, nonce: nonce++ };
    queue = [];
    emit();
    return;
  }
  queue.push(...ranked);
  if (!toast) {
    const id = queue.shift();
    toast = id ? { id, nonce: nonce++ } : null;
  }
  emit();
}

function rankOf(id: string): number {
  const def = ribbonById(id);
  return def ? TIER_RANK[def.tier] : 0;
}

function publishLatest(): void {
  const id = playerId;
  const rib = latestRibbon(log)?.id ?? "";
  if (!id || id.length < 8 || !rib) return;
  const key = `${id}|${nick}|${rib}|${log.day}`;
  if (key === sent) return;
  void publishRibbon(id, nick, rib).then((res) => {
    if (res === "ok") sent = key;
  });
}

export function bindRibbonPlayer(id: string, name: string): void {
  const nextId = id.trim();
  const nextNick = name.trim().slice(0, 24);
  if (nextId === playerId && nextNick === nick) return;
  playerId = nextId;
  nick = nextNick;
  publishLatest();
}

export function pushRibbon(ev: RibbonEvent, now = serverNow()): string[] {
  const prev = ensure();
  const res = noteRibbon(prev, ev, now);
  if (res.log === prev) return [];
  log = res.log;
  writeStored(log);
  setPackedRibbon(latestRibbon(log)?.id ?? "");
  if (res.fresh.length) {
    announce(res.fresh);
    publishLatest();
  } else {
    emit();
  }
  return res.fresh;
}

export function pushStat(ev: { t: string } & Record<string, unknown>, now = serverNow()): void {
  const mapped = ribbonFromStat(ev);
  if (mapped) pushRibbon(mapped, now);
}
