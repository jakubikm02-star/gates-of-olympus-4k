/**
 * Thin Supabase RPC client for player_stats backup.
 * Tests must inject a mock via setStatsApiFetch — never hit production.
 */
import { isStatsBackupEnabled, mergeStats, sanitizeStats, statsForCloud, type PlayerStats } from "./stats.ts";

const SUPA_URL = "https://xgpnmxkquxzbhgktjipa.supabase.co";
const SUPA_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncG5teGtxdXh6Ymhna3RqaXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMzI1MDgsImV4cCI6MjEwMTkwODUwOH0.KrNERJS8gxc1663oN73CaZ2ZqXZOQTX-AnoMwCmWQUo";

type FetchLike = typeof fetch;

let customFetch: FetchLike | null = null;
/** When set, all RPCs go through this instead of the network (tests / offline). */
let mockStore: Map<string, PlayerStats> | null = null;

export function setStatsApiFetch(fn: FetchLike | null): void {
  customFetch = fn;
}

export function useStatsMock(store?: Map<string, PlayerStats>): Map<string, PlayerStats> {
  mockStore = store ?? new Map();
  return mockStore;
}

export function clearStatsMock(): void {
  mockStore = null;
}

async function rpc(name: string, body: Record<string, unknown>, keepalive = false): Promise<unknown> {
  if (mockStore) {
    const id = String(body.p_id ?? "");
    if (name === "stats_get") return mockStore.get(id) ?? null;
    if (name === "stats_put") {
      const incoming = sanitizeStats(body.p_stats);
      const prev = mockStore.get(id);
      mockStore.set(id, prev ? mergeStats(prev, incoming) : incoming);
      return null;
    }
    if (name === "stats_drop") {
      mockStore.delete(id);
      return null;
    }
    return null;
  }
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
  if (!res.ok) throw new Error(`stats ${name} ${res.status}`);
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text) as unknown;
}

export async function statsPut(playerId: string, stats: PlayerStats, keepalive = false): Promise<void> {
  if (!playerId || playerId.length < 8) return;
  const includeHours = isStatsBackupEnabled();
  await rpc("stats_put", { p_id: playerId, p_stats: statsForCloud(stats, includeHours) }, keepalive);
}

export async function statsGet(playerId: string): Promise<PlayerStats | null> {
  if (!playerId || playerId.length < 8) return null;
  const raw = await rpc("stats_get", { p_id: playerId });
  if (!raw) return null;
  return sanitizeStats(raw);
}

export async function statsDrop(playerId: string): Promise<void> {
  if (!playerId || playerId.length < 8) return;
  await rpc("stats_drop", { p_id: playerId });
}

/** Merge remote into local when backup is enabled. Never throws. */
export async function pullAndMergeStats(
  playerId: string,
  local: PlayerStats,
): Promise<PlayerStats> {
  if (!isStatsBackupEnabled()) return local;
  try {
    const remote = await statsGet(playerId);
    if (!remote) return local;
    return mergeStats(local, remote);
  } catch {
    return local;
  }
}
