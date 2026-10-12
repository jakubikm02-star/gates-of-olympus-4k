/**
 * Online count. Each open game checks in with its player id. The number is how many
 * ids were heard from in the last 50 seconds. One id is one player, even with two tabs.
 */

const SUPA_URL = "https://xgpnmxkquxzbhgktjipa.supabase.co";
const SUPA_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncG5teGtxdXh6Ymhna3RqaXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMzI1MDgsImV4cCI6MjEwMTkwODUwOH0.KrNERJS8gxc1663oN73CaZ2ZqXZOQTX-AnoMwCmWQUo";

/** How often an open, visible game checks in. */
export const ONLINE_BEAT_MS = 12_000;

/** 7-segment masks (a top, b upper right, c lower right, d bottom, e lower left, f upper left, g middle). */
export const SEG_ON: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abdeg",
  "3": "abcdg",
  "4": "bcfg",
  "5": "acdfg",
  "6": "acdefg",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
  "-": "g",
  O: "abcdef",
  N: "ceg",
  L: "def",
  I: "bc",
  E: "adefg",
};

export const ONLINE_LABEL = "ONLINE";

export function segMask(ch: string): string {
  return SEG_ON[ch] ?? "";
}

/** Two digits until 100, then three. Unknown stays two dashes. */
export function onlineDigits(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "--";
  const c = Math.max(0, Math.min(999, Math.floor(n)));
  return String(c).padStart(2, "0");
}

/** The green dot blinks only when a known count changes, not on the first reading. */
export function onlineBlink(prev: number | null, next: number | null): boolean {
  return prev != null && next != null && prev !== next;
}

export async function parkOnlineBeat(playerId: string): Promise<number | null> {
  const id = playerId.trim();
  if (id.length < 8) return null;
  const ctrl = new AbortController();
  const kill = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/rpc/park_online_beat`, {
      method: "POST",
      headers: {
        apikey: SUPA_ANON,
        Authorization: `Bearer ${SUPA_ANON}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_id: id.slice(0, 64) }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as unknown;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(kill);
  }
}
