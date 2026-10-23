/**
 * Latest ribbon of each player, one row, written only when it changes.
 * The SQL in supabase/migrations/20261023_player_ribbon.sql is NOT applied.
 * Until it is, these calls 404 and the client stops trying. Tests pass a mock
 * fetcher and never touch production Supabase.
 */
import { publicId } from "./board-api.ts";
import { notePeerRibbon, resetPeers } from "./ribbon-peers.ts";
import { isRibbonId } from "./ribbons.ts";

const SUPA_URL = "https://xgpnmxkquxzbhgktjipa.supabase.co";
const SUPA_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncG5teGtxdXh6Ymhna3RqaXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMzI1MDgsImV4cCI6MjEwMTkwODUwOH0.KrNERJS8gxc1663oN73CaZ2ZqXZOQTX-AnoMwCmWQUo";

export type RibbonFetcher = (url: string, init?: RequestInit) => Promise<Response>;

let fetcher: RibbonFetcher = (url, init) => fetch(url, init);
let missing = false;

export function setRibbonFetcher(fn: RibbonFetcher | null): void {
  fetcher = fn ?? ((url, init) => fetch(url, init));
  missing = false;
}

export function ribbonSyncMissing(): boolean {
  return missing;
}

/** Test hook. */
export function resetRibbonNet(): void {
  missing = false;
  resetPeers();
}

async function rpc(name: string, body: Record<string, unknown>): Promise<Response> {
  return fetcher(`${SUPA_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SUPA_ANON,
      Authorization: `Bearer ${SUPA_ANON}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function publishRibbon(id: string, nick: string, ribbon: string): Promise<"ok" | "missing" | "fail"> {
  if (missing || !isRibbonId(ribbon) || !/^[A-Za-z0-9-]{8,64}$/.test(id)) return missing ? "missing" : "fail";
  try {
    const res = await rpc("ribbon_put", { p_id: id, p_nick: nick.trim().slice(0, 24), p_ribbon: ribbon });
    if (res.status === 404) {
      missing = true;
      return "missing";
    }
    if (!res.ok) return "fail";
    notePeerRibbon(id, nick, ribbon);
    const pub = await publicId(id);
    // Hash is an alias of the same player. A second nick owner would hide the badge on SMRŤ EGA.
    if (pub && pub !== id) notePeerRibbon(pub, "", ribbon);
    return "ok";
  } catch {
    return "fail";
  }
}

export async function refreshRibbons(): Promise<void> {
  if (missing) return;
  try {
    const res = await rpc("ribbon_today", {});
    if (res.status === 404) {
      missing = true;
      return;
    }
    if (!res.ok) return;
    const raw = (await res.json()) as unknown;
    const rows = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
    for (const item of rows) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const id = typeof o.player_id === "string" ? o.player_id : "";
      const nick = typeof o.nick === "string" ? o.nick : "";
      const ribbon = typeof o.ribbon === "string" ? o.ribbon : "";
      if (!id || !isRibbonId(ribbon)) continue;
      notePeerRibbon(id, nick, ribbon);
      const pub = await publicId(id);
      if (pub && pub !== id) notePeerRibbon(pub, "", ribbon);
    }
  } catch {
    /* offline: keep what we already showed */
  }
}

let watchers = 0;
let timer: ReturnType<typeof setInterval> | null = null;

/** Poll while a surface that shows other players is open. */
export function watchPeerRibbons(): () => void {
  watchers += 1;
  if (watchers === 1) {
    void refreshRibbons();
    timer = setInterval(() => void refreshRibbons(), 15_000);
  }
  return () => {
    watchers = Math.max(0, watchers - 1);
    if (watchers === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
