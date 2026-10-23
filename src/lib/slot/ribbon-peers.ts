/**
 * Latest ribbon other phones have shown us (duel name pack, or ribbon_today).
 * Cosmetic. A nick that two players share is not used as a key.
 */
import { isRibbonId } from "./ribbons.ts";

export interface PeerRibbon {
  id: string;
  ribbon: string;
  nick: string;
}

const byId = new Map<string, string>();
const byNick = new Map<string, string>();
const nickOwners = new Map<string, Set<string>>();
let stamp = 0;
const subs = new Set<() => void>();

function emit(): void {
  stamp += 1;
  for (const fn of subs) fn();
}

export function subscribePeers(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function peerStamp(): number {
  return stamp;
}

function nickKey(nick: string): string {
  return nick.trim().toLowerCase();
}

export function notePeerRibbon(id: string, nick: string, ribbon: string): void {
  const cleanId = id.trim();
  const cleanNick = nick.trim();
  const next = isRibbonId(ribbon) ? ribbon : "";
  let changed = false;
  if (cleanId) {
    const prev = byId.get(cleanId) ?? "";
    if (prev !== next) {
      if (next) byId.set(cleanId, next);
      else byId.delete(cleanId);
      changed = true;
    }
  }
  const key = nickKey(cleanNick);
  if (key && cleanId) {
    let owners = nickOwners.get(key);
    if (!owners) {
      owners = new Set();
      nickOwners.set(key, owners);
    }
    if (!owners.has(cleanId)) {
      owners.add(cleanId);
      if (next || owners.size > 1) changed = true;
    }
    if (owners.size === 1 && next) {
      if (byNick.get(key) !== next) {
        byNick.set(key, next);
        changed = true;
      }
    } else if (byNick.has(key)) {
      byNick.delete(key);
      changed = true;
    }
  }
  if (changed) emit();
}

/** Id the VERSUS lobby looks up. Not a nick key, so it cannot collide with the board. */
export function duelRibbonId(name: string): string {
  return `duel:${nickKey(name)}`;
}

/** Duel seats have a display name and no shared player id. */
export function noteDuelRibbon(name: string, ribbon: string): void {
  const key = nickKey(name);
  if (!key || key.startsWith("čaká") || key === "…") return;
  const next = isRibbonId(ribbon) ? ribbon : "";
  notePeerRibbon(duelRibbonId(name), "", next);
}

export function peerRibbon(opts: { id?: string; nick?: string }): string {
  const id = opts.id?.trim() ?? "";
  if (id && byId.has(id)) return byId.get(id)!;
  const key = opts.nick ? nickKey(opts.nick) : "";
  if (key && byNick.has(key)) return byNick.get(key)!;
  return "";
}

export function resetPeers(): void {
  byId.clear();
  byNick.clear();
  nickOwners.clear();
  emit();
}
