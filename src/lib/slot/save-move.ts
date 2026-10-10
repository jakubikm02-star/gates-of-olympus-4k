/**
 * Moving a player from the old link (gates-of-olympus-4k.vercel.app) to the new one (parkizmus.vercel.app).
 *
 * localStorage is per origin and a cross-site iframe only sees partitioned storage, so the save is handed
 * over between two top-level windows that opened each other (popup or new tab) with postMessage:
 *
 *   A) new link → "PRENIESŤ HRU ZO STARÉHO LINKU" opens OLD/prenos#n=<nonce> as a popup.
 *      popup → opener   hello   (targetOrigin = NEW)
 *      opener → popup   ready   (targetOrigin = OLD)    popup shows the save and asks the player
 *      popup → opener   offer   (targetOrigin = NEW)    after the player confirms
 *      opener → popup   ack     (targetOrigin = OLD)    after the new link stored it
 *   B) old link → "PRESUNÚŤ HRU" (player already confirmed) opens NEW/#prenos=<nonce> in a new tab.
 *      tab → opener     hello   (targetOrigin = OLD)
 *      opener → tab     offer   (targetOrigin = NEW)
 *      tab → opener     ack     (targetOrigin = OLD)
 *
 * Every message is posted with the exact peer origin as targetOrigin, so the browser drops it when the
 * other window is anything else. Every received message must come from the expected origin, from the
 * exact window object of this session, carry the session nonce and the protocol tag. A session is
 * single use and expires. The old save is locked (read-only, MOVED_KEY) only after an ack from the new
 * origin, so an untrusted opener can neither read the save nor lock it.
 */
import { MOVED_KEY, emptyPlayerSave, type PlayerSave } from "./player-save.ts";
import { acceptSave } from "./save-port.ts";
import { START_BALANCE } from "./symbols.ts";

export { MOVED_KEY };

export const NEW_ORIGIN = "https://parkizmus.vercel.app";
export const OLD_ORIGIN = "https://gates-of-olympus-4k.vercel.app";
/** What players see and share. */
export const PRIMARY_HOST = "parkizmus.vercel.app";
export const PRIMARY_URL = `${NEW_ORIGIN}/`;
export const OLD_HOST = "gates-of-olympus-4k.vercel.app";

export const MOVE_TAG = "park-move";
export const MOVE_VERSION = 1;
export const MOVE_PATH = "/prenos";
/** Hash on the new link that marks a tab opened by the old link's PRESUNÚŤ button. */
export const MOVE_HASH_KEY = "prenos";
export const SESSION_MS = 3 * 60_000;
const MAX_PACK_CHARS = 400_000;
const NONCE_RE = /^[A-Za-z0-9_-]{22,64}$/;

export interface MoveOrigins {
  /** The new, primary link. */
  fresh: string;
  /** The old link that stays as a mirror for existing players. */
  old: string;
}

export type MoveRole = "new" | "old";

const LOCAL_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{2,5})?$/;

/**
 * Production origins, unless a build sets both VITE_PARK_NEW_ORIGIN / VITE_PARK_OLD_ORIGIN to two
 * distinct loopback origins (local end-to-end test). Anything else falls back to production, so a
 * stray env value can never point the move at a foreign site.
 */
export function resolveOrigins(env: Record<string, unknown> | undefined): MoveOrigins {
  const fresh = typeof env?.VITE_PARK_NEW_ORIGIN === "string" ? env.VITE_PARK_NEW_ORIGIN : "";
  const old = typeof env?.VITE_PARK_OLD_ORIGIN === "string" ? env.VITE_PARK_OLD_ORIGIN : "";
  if (fresh && old && fresh !== old && LOCAL_RE.test(fresh) && LOCAL_RE.test(old)) return { fresh, old };
  return { fresh: NEW_ORIGIN, old: OLD_ORIGIN };
}

function buildEnv(): Record<string, unknown> | undefined {
  try {
    // Vite inlines import.meta.env at build time; plain Node (tests) has none.
    return import.meta.env as unknown as Record<string, unknown> | undefined;
  } catch {
    return undefined;
  }
}

let cached: MoveOrigins | null = null;
export function moveOrigins(): MoveOrigins {
  if (!cached) cached = resolveOrigins(buildEnv());
  return cached;
}

export function roleOf(origin: string, o: MoveOrigins = moveOrigins()): MoveRole | null {
  if (origin === o.fresh) return "new";
  if (origin === o.old) return "old";
  return null;
}

export function hereRole(o: MoveOrigins = moveOrigins()): MoveRole | null {
  if (typeof window === "undefined") return null;
  return roleOf(window.location.origin, o);
}

/** Link to show and share: always the new one on the two public hosts. */
export function primaryUrl(o: MoveOrigins = moveOrigins()): string {
  return `${o.fresh}/`;
}

export function primaryLabel(o: MoveOrigins = moveOrigins()): string {
  return o.fresh.replace(/^https?:\/\//, "");
}

export function newNonce(rand: (a: Uint8Array) => Uint8Array = (a) => crypto.getRandomValues(a)): string {
  const bytes = rand(new Uint8Array(18));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function validNonce(n: unknown): n is string {
  return typeof n === "string" && NONCE_RE.test(n);
}

/** Nonce from "#n=…" (popup) or "#prenos=…" (new tab). */
export function nonceFromHash(hash: string, key: string): string {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const v = new URLSearchParams(raw).get(key) ?? "";
  return validNonce(v) ? v : "";
}

// ---------------------------------------------------------------- payload

export interface MovePack {
  save: PlayerSave;
  nick: string;
  stats: unknown;
}

export function cleanNick(v: unknown): string {
  if (typeof v !== "string") return "";
  const t = Array.from(v)
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c >= 0x20 && c !== 0x7f && ch !== "<" && ch !== ">";
    })
    .join("")
    .trim();
  return t.length <= 24 ? t : "";
}

/** Validate an incoming pack. Anything that is not a real save (credit, stamp, player id) is refused. */
export function readPack(raw: unknown): MovePack | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  let size = 0;
  try {
    size = JSON.stringify(r).length;
  } catch {
    return null;
  }
  if (size > MAX_PACK_CHARS) return null;
  const save = acceptSave(r.save);
  if (!save || !/^[A-Za-z0-9-]{8,64}$/.test(save.playerId)) return null;
  const stats = r.stats && typeof r.stats === "object" && !Array.isArray(r.stats) ? r.stats : null;
  return { save, nick: cleanNick(r.nick), stats };
}

/** Anything worth keeping: more than a fresh start. */
export function hasProgress(s: PlayerSave | null | undefined): boolean {
  if (!s) return false;
  const base = emptyPlayerSave();
  return (
    s.rp > 0 ||
    s.rankPeak > 0 ||
    s.bestWin > 0 ||
    Math.abs(s.balance - START_BALANCE) > 0.004 ||
    Boolean(s.job) ||
    s.inFs ||
    Boolean(s.bonusPending) ||
    s.chaseSpin >= 0 ||
    s.klienti !== base.klienti
  );
}

export type ImportDecision = "take" | "keep" | "ask";

/**
 * take: store the incoming save. keep: the new link already has the same player at least as new
 * (the old automatic hop copied it), nothing to overwrite. ask: two different games, the player picks.
 */
export function decideImport(local: PlayerSave | null, incoming: PlayerSave): ImportDecision {
  if (!hasProgress(local)) return "take";
  if (local && local.playerId && local.playerId === incoming.playerId) {
    return incoming.updatedAt > local.updatedAt ? "take" : "keep";
  }
  return "ask";
}

/** The stored copy: stamped now so no older cloud or mirror copy can win over it afterwards. */
export function importedSave(incoming: PlayerSave, now = Date.now()): PlayerSave {
  return { ...incoming, updatedAt: Math.max(now, incoming.updatedAt + 1) };
}

// ---------------------------------------------------------------- moved marker (old link)

export interface MovedMark {
  v: 1;
  to: string;
  at: number;
  playerId: string;
  /** Stamp of the save that was handed over. */
  updatedAt: number;
}

interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export function readMoved(store: KV | null | undefined): MovedMark | null {
  if (!store) return null;
  try {
    const raw = store.getItem(MOVED_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<MovedMark>;
    if (!o || o.v !== 1 || typeof o.to !== "string" || typeof o.at !== "number") {
      // Unknown content still locks: better read-only than playable twice.
      return { v: 1, to: NEW_ORIGIN, at: 0, playerId: "", updatedAt: 0 };
    }
    return {
      v: 1,
      to: o.to,
      at: o.at,
      playerId: typeof o.playerId === "string" ? o.playerId : "",
      updatedAt: typeof o.updatedAt === "number" ? o.updatedAt : 0,
    };
  } catch {
    return { v: 1, to: NEW_ORIGIN, at: 0, playerId: "", updatedAt: 0 };
  }
}

export function writeMoved(store: KV, mark: MovedMark): void {
  store.setItem(MOVED_KEY, JSON.stringify(mark));
}

// ---------------------------------------------------------------- messages

export type MoveKind = "hello" | "ready" | "offer" | "ack" | "cancel";

export interface MoveMsg {
  t: typeof MOVE_TAG;
  v: typeof MOVE_VERSION;
  k: MoveKind;
  n: string;
  pack?: MovePack;
  playerId?: string;
  updatedAt?: number;
}

export interface MsgTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

export interface MsgEventLike {
  origin: string;
  source: unknown;
  data: unknown;
}

export function makeMsg(k: MoveKind, n: string, extra: Partial<MoveMsg> = {}): MoveMsg {
  return { t: MOVE_TAG, v: MOVE_VERSION, k, n, ...extra };
}

/** The only gate for incoming messages: exact origin, exact window, protocol, nonce, allowed kind. */
export function readMsg(
  ev: MsgEventLike,
  want: { origin: string; source: unknown; nonce: string; kinds: readonly MoveKind[] },
): MoveMsg | null {
  if (!ev || ev.origin !== want.origin) return null;
  if (!want.source || ev.source !== want.source) return null;
  const d = ev.data as Partial<MoveMsg> | null;
  if (!d || typeof d !== "object") return null;
  if (d.t !== MOVE_TAG || d.v !== MOVE_VERSION) return null;
  if (!validNonce(want.nonce) || d.n !== want.nonce) return null;
  if (typeof d.k !== "string" || !want.kinds.includes(d.k as MoveKind)) return null;
  return d as MoveMsg;
}

// ---------------------------------------------------------------- sessions

export interface SourceSession {
  /** Feed every window "message" event. Returns what happened. */
  handle(ev: MsgEventLike): "ignored" | "peer" | "acked" | "cancel";
  /** Post the save to the new link. False if there is nothing to send or the session is over. */
  offer(): boolean;
  /** Tell the new link nothing is coming. */
  cancel(): void;
  readonly sent: MovePack | null;
  readonly done: boolean;
}

/**
 * Old link side. `peer` is the new-link window (opener in flow A, opened tab in flow B).
 * `pack` is read only when the player confirmed and the peer is live, never before.
 */
export function createSource(opts: {
  peer: MsgTarget;
  nonce: string;
  origins: MoveOrigins;
  pack: () => MovePack | null;
  /** Called with the ack once the new link stored the save. Lock the old copy here. */
  onAck: (ack: { playerId: string; updatedAt: number }, sent: MovePack) => void;
  now?: () => number;
}): SourceSession {
  const now = opts.now ?? Date.now;
  const born = now();
  let peerLive = false;
  let sent: MovePack | null = null;
  let done = false;
  const live = () => !done && now() - born < SESSION_MS;
  return {
    get sent() {
      return sent;
    },
    get done() {
      return done;
    },
    handle(ev) {
      if (!live()) return "ignored";
      const m = readMsg(ev, {
        origin: opts.origins.fresh,
        source: opts.peer,
        nonce: opts.nonce,
        kinds: sent ? ["ack", "cancel"] : ["hello", "ready", "cancel"],
      });
      if (!m) return "ignored";
      if (m.k === "cancel") {
        done = true;
        return "cancel";
      }
      if (m.k === "hello" || m.k === "ready") {
        peerLive = true;
        return "peer";
      }
      // ack: must name the player that was sent.
      if (!sent || m.playerId !== sent.save.playerId) return "ignored";
      done = true;
      opts.onAck({ playerId: sent.save.playerId, updatedAt: sent.save.updatedAt }, sent);
      return "acked";
    },
    offer() {
      if (!live() || !peerLive || sent) return false;
      const pack = opts.pack();
      if (!pack || !/^[A-Za-z0-9-]{8,64}$/.test(pack.save.playerId)) return false;
      sent = pack;
      opts.peer.postMessage(makeMsg("offer", opts.nonce, { pack }), opts.origins.fresh);
      return true;
    },
    cancel() {
      if (done) return;
      done = true;
      opts.peer.postMessage(makeMsg("cancel", opts.nonce), opts.origins.fresh);
    },
  };
}

export interface TargetSession {
  handle(ev: MsgEventLike): "ignored" | "hello" | "offer";
  /** The validated offer, once it arrived. */
  readonly offer: MovePack | null;
  /** Confirm the save was stored (or the same player is already here). Unlocks nothing, locks the old copy. */
  ack(): boolean;
  cancel(): void;
  readonly done: boolean;
}

/** New link side. `peer` is the old-link window (popup in flow A, opener in flow B). */
export function createTarget(opts: {
  peer: MsgTarget;
  nonce: string;
  origins: MoveOrigins;
  now?: () => number;
}): TargetSession {
  const now = opts.now ?? Date.now;
  const born = now();
  let offer: MovePack | null = null;
  let done = false;
  const live = () => !done && now() - born < SESSION_MS;
  const post = (m: MoveMsg) => opts.peer.postMessage(m, opts.origins.old);
  return {
    get offer() {
      return offer;
    },
    get done() {
      return done;
    },
    handle(ev) {
      if (!live()) return "ignored";
      const m = readMsg(ev, {
        origin: opts.origins.old,
        source: opts.peer,
        nonce: opts.nonce,
        kinds: offer ? [] : ["hello", "offer", "cancel"],
      });
      if (!m) return "ignored";
      if (m.k === "cancel") {
        done = true;
        return "ignored";
      }
      if (m.k === "hello") {
        post(makeMsg("ready", opts.nonce));
        return "hello";
      }
      const pack = readPack(m.pack);
      if (!pack) return "ignored";
      offer = pack;
      return "offer";
    },
    ack() {
      if (!live() || !offer) return false;
      done = true;
      post(makeMsg("ack", opts.nonce, { playerId: offer.save.playerId, updatedAt: offer.save.updatedAt }));
      return true;
    },
    cancel() {
      if (done) return;
      done = true;
      post(makeMsg("cancel", opts.nonce));
    },
  };
}

/** Hello from a window that was opened by its peer. */
export function sayHello(opener: MsgTarget, nonce: string, peerOrigin: string): void {
  opener.postMessage(makeMsg("hello", nonce), peerOrigin);
}
