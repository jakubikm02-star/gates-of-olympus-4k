/**
 * Live MASÍVNA VÝHRA ping for everyone playing the normal game (not VERSUS).
 * A hit is posted when a spin pays 100× or more. Other phones poll and show a
 * small card for 3 seconds. Own hits are filtered out.
 */

const SUPA_URL = "https://xgpnmxkquxzbhgktjipa.supabase.co";
const SUPA_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncG5teGtxdXh6Ymhna3RqaXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMzI1MDgsImV4cCI6MjEwMTkwODUwOH0.KrNERJS8gxc1663oN73CaZ2ZqXZOQTX-AnoMwCmWQUo";

/** Floor for the live card other players see. The winner's own MASÍVNA banner stays at 250×. */
export const LIVE_HIT_MIN_X = 100;
export const LIVE_HIT_MS = 3000;

export interface LiveHit {
  id: number;
  nick: string;
  mult: number;
  amount: number;
}

export function liveHitOk(mult: number, amount: number, inDuel = false): boolean {
  return !inDuel && Number.isFinite(mult) && mult >= LIVE_HIT_MIN_X && Number.isFinite(amount) && amount > 0;
}

async function rpc(name: string, body: Record<string, unknown>): Promise<unknown> {
  const ctrl = new AbortController();
  const kill = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: SUPA_ANON,
        Authorization: `Bearer ${SUPA_ANON}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(String(res.status));
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("json")) return null;
    return await res.json();
  } finally {
    clearTimeout(kill);
  }
}

/** Fire and forget. A missing RPC or a duel must not affect the spin. */
export function postLiveHit(playerId: string, mult: number, amount: number, inDuel = false): void {
  if (!liveHitOk(mult, amount, inDuel) || playerId.length < 8) return;
  let nick = "Niekto";
  try {
    const saved = localStorage.getItem("park-nick")?.trim();
    if (saved) nick = saved.slice(0, 24);
  } catch {
    /* private mode */
  }
  void rpc("live_hit_put", {
    p_id: playerId.slice(0, 64),
    p_nick: nick,
    p_mult: Math.round(mult * 100) / 100,
    p_amount: Math.round(amount * 100) / 100,
  }).catch(() => {});
}

export async function liveHitHead(): Promise<number> {
  const raw = await rpc("live_hit_head", {});
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function liveHitPoll(after: number, selfId: string): Promise<LiveHit[]> {
  const raw = await rpc("live_hit_poll", { p_after: after, p_self: selfId.slice(0, 64) });
  if (!Array.isArray(raw)) return [];
  const out: LiveHit[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as { id?: unknown; nick?: unknown; mult?: unknown; amount?: unknown };
    const id = Number(o.id);
    const mult = Number(o.mult);
    const amount = Number(o.amount);
    const nick = typeof o.nick === "string" ? o.nick.trim() : "";
    if (!Number.isFinite(id) || id <= 0 || !nick || !liveHitOk(mult, amount)) continue;
    out.push({ id, nick: nick.slice(0, 24), mult, amount });
  }
  return out;
}
