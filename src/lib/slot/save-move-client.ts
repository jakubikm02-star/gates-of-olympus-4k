/** Browser glue for save-move.ts: storage, windows, the moved-lock signal. */
import { holdSaveWrites, readLocalSave, writeLocalSave, MOVED_KEY, type PlayerSave } from "./player-save.ts";
import { flushMirrorPush, scheduleMirrorPush } from "./mirror-cloud.ts";
import { STATS_KEY, readStats, sanitizeStats, writeStats } from "./stats.ts";
import {
  MOVE_HASH_KEY,
  MOVE_PATH,
  cleanNick,
  hereRole,
  importedSave,
  moveOrigins,
  readMoved,
  writeMoved,
  type MovePack,
  type MovedMark,
} from "./save-move.ts";

const NICK_KEY = "park-nick";
const MOVED_EVENT = "park-moved";

function store(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The save on this (old) link, with a player id so the leaderboard and duels keep the same player. */
export function packHere(runningId = ""): MovePack | null {
  const save = readLocalSave();
  if (!save) return null;
  let next: PlayerSave = save;
  if (!/^[A-Za-z0-9-]{8,64}$/.test(save.playerId)) {
    const id = /^[A-Za-z0-9-]{8,64}$/.test(runningId) ? runningId : crypto.randomUUID();
    next = { ...save, playerId: id, updatedAt: save.updatedAt || Date.now() };
    writeLocalSave(next);
  }
  const s = store();
  let stats: unknown = null;
  try {
    const raw = s?.getItem(STATS_KEY);
    stats = raw ? JSON.parse(raw) : null;
  } catch {
    stats = null;
  }
  return { save: next, nick: cleanNick(s?.getItem(NICK_KEY) ?? ""), stats };
}

/**
 * Store an accepted pack on the new link and freeze further writes of this page until it reloads,
 * so the running game cannot write its older state back over the import.
 */
export function storeImport(pack: MovePack, hadProgress: boolean): PlayerSave {
  const save = importedSave(pack.save);
  writeLocalSave(save);
  scheduleMirrorPush(save);
  flushMirrorPush();
  if (pack.stats) {
    const mine = readStats();
    if (!hadProgress || Object.keys(mine.c).length === 0) writeStats(sanitizeStats(pack.stats));
  }
  holdSaveWrites();
  const s = store();
  try {
    if (s && pack.nick && !cleanNick(s.getItem(NICK_KEY) ?? "")) s.setItem(NICK_KEY, pack.nick);
  } catch {
    /* quota */
  }
  return save;
}

export function currentMoved(): MovedMark | null {
  if (hereRole() !== "old") return null;
  return readMoved(store());
}

/** Lock the old copy (read-only) after the new link confirmed it holds the save. */
export function markMoved(playerId: string, updatedAt: number): void {
  const s = store();
  if (!s) return;
  try {
    writeMoved(s, { v: 1, to: moveOrigins().fresh, at: Date.now(), playerId, updatedAt });
  } catch {
    return;
  }
  window.dispatchEvent(new Event(MOVED_EVENT));
}

export function movedSnapshot(): string | null {
  if (hereRole() !== "old") return null;
  try {
    return store()?.getItem(MOVED_KEY) ?? null;
  } catch {
    return null;
  }
}

export function subscribeMoved(fn: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === MOVED_KEY) fn();
  };
  window.addEventListener(MOVED_EVENT, fn);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(MOVED_EVENT, fn);
    window.removeEventListener("storage", onStorage);
  };
}

/** Flow A: the old link's bridge page as a popup. Must run inside the click handler. */
export function openOldBridge(nonce: string): Window | null {
  const url = `${moveOrigins().old}${MOVE_PATH}#n=${encodeURIComponent(nonce)}`;
  try {
    return window.open(url, "park-prenos", "popup=yes,width=440,height=720");
  } catch {
    return null;
  }
}

/** Flow B: the new link in a new tab that can talk back to this one. Must run inside the click handler. */
export function openNewLink(nonce: string): Window | null {
  const url = `${moveOrigins().fresh}/#${MOVE_HASH_KEY}=${encodeURIComponent(nonce)}`;
  try {
    return window.open(url, "_blank");
  } catch {
    return null;
  }
}

export function isStandalone(): boolean {
  try {
    if (window.matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches) return true;
  } catch {
    /* old browser */
  }
  return Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

export const PULL_EVENT = "park-move-pull";
export const PUSH_EVENT = "park-move-push";

/** Ask the new-link layer to start flow A. Synchronous, so window.open still has the click's activation. */
export function requestPull(): void {
  window.dispatchEvent(new Event(PULL_EVENT));
}

/** Ask the old-link layer to open the move dialog. */
export function requestPush(): void {
  window.dispatchEvent(new Event(PUSH_EVENT));
}
