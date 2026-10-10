/**
 * Encrypted snapshot of the player save, keyed by playerId.
 * The blob is useless without the key that the bridge copies into both origins.
 * A bad blob is ignored. Nothing is uploaded until a pull has finished, so a failed
 * read cannot overwrite the other side with an older local copy.
 */
import { sanitizePlayerSave, type PlayerSave } from "./player-save.ts";
import { MIRROR_BRIDGE_KEY, MIRROR_ORIGINS } from "./mirror-bridge.ts";

const SUPA_URL = "https://xgpnmxkquxzbhgktjipa.supabase.co";
const SUPA_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncG5teGtxdXh6Ymhna3RqaXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMzI1MDgsImV4cCI6MjEwMTkwODUwOH0.KrNERJS8gxc1663oN73CaZ2ZqXZOQTX-AnoMwCmWQUo";

const MAX_BLOB = 48_000;

type FetchLike = typeof fetch;

let customFetch: FetchLike | null = null;
let pulled = false;
let remoteAt = 0;
let latest: PlayerSave | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

export function setMirrorFetch(fn: FetchLike | null): void {
  customFetch = fn;
}

export function resetMirrorSession(): void {
  pulled = false;
  remoteAt = 0;
  latest = null;
  if (timer) clearTimeout(timer);
  timer = null;
}

function active(): boolean {
  if (customFetch) return true;
  if (typeof window === "undefined") return false;
  return (MIRROR_ORIGINS as readonly string[]).includes(window.location.origin);
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64ToBytes(raw: string) {
  try {
    const bin = atob(raw);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function loadKey(): Promise<CryptoKey | null> {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(MIRROR_BRIDGE_KEY);
  if (!raw) return null;
  const bin = b64ToBytes(raw);
  if (!bin || bin.length !== 32) return null;
  return crypto.subtle.importKey("raw", bin, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function seal(key: CryptoKey, json: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(json)),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return bytesToB64(out);
}

async function openSeal(key: CryptoKey, blob: string): Promise<PlayerSave | null> {
  const raw = b64ToBytes(blob);
  if (!raw || raw.length < 13) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: raw.slice(0, 12) },
      key,
      raw.slice(12),
    );
    return sanitizePlayerSave(JSON.parse(new TextDecoder().decode(plain)));
  } catch {
    return null;
  }
}

async function rpc(name: string, body: Record<string, unknown>, keepalive = false): Promise<unknown> {
  const doFetch = customFetch ?? fetch;
  const res = await doFetch(`${SUPA_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SUPA_ANON,
      Authorization: `Bearer ${SUPA_ANON}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    keepalive,
  });
  if (!res.ok) throw new Error(`mirror ${name} ${res.status}`);
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text) as unknown;
}

function canSend(s: PlayerSave | null): s is PlayerSave {
  return Boolean(s && s.playerId.length >= 8 && s.playerId.length <= 64 && /^[A-Za-z0-9-]+$/.test(s.playerId));
}

async function mirrorPut(s: PlayerSave, keepalive = false): Promise<void> {
  if (!active() || !pulled || !canSend(s)) return;
  if (remoteAt && s.updatedAt < remoteAt) return;
  const key = await loadKey();
  if (!key) return;
  const blob = await seal(key, JSON.stringify(s));
  if (blob.length > MAX_BLOB) return;
  await rpc("mirror_put", { p_id: s.playerId, p_blob: blob }, keepalive);
}

function ensureListener(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("pagehide", () => {
    if (latest) void mirrorPut(latest, true);
  });
}

/** Remember the latest save. Upload waits until pullMirrorSave has resolved. */
export function scheduleMirrorPush(s: PlayerSave): void {
  latest = s;
  if (!active()) return;
  ensureListener();
  if (!pulled || !canSend(s)) return;
  if (remoteAt && s.updatedAt < remoteAt) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (latest) void mirrorPut(latest).catch(() => {});
  }, 1200);
}

export function flushMirrorPush(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (latest) void mirrorPut(latest, true).catch(() => {});
}

/**
 * Cloud copy strictly newer than `local`, or null.
 * Sets the session allowed to push, including when there is nothing remote yet.
 * A network error leaves pushing locked so we cannot clobber a save we failed to read.
 */
export async function pullMirrorSave(local: PlayerSave | null): Promise<PlayerSave | null> {
  if (!active()) {
    pulled = true;
    return null;
  }
  const id = local?.playerId ?? "";
  if (!canSend(local) && id.length < 8) {
    pulled = true;
    return null;
  }
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) {
    pulled = true;
    return null;
  }
  const key = await loadKey();
  if (!key) {
    pulled = true;
    return null;
  }
  try {
    const blob = await rpc("mirror_get", { p_id: id });
    pulled = true;
    if (typeof blob !== "string" || !blob) return null;
    const remote = await openSeal(key, blob);
    if (!remote || !remote.playerId) return null;
    remoteAt = remote.updatedAt;
    if (!local || remote.updatedAt > local.updatedAt) return remote;
    return null;
  } catch {
    return null;
  }
}
