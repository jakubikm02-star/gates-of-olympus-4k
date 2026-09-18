import { parseMoney, POOL_SEED, type PoolSnap } from "./jackpot";

/** One public operator pot. Every client hits this row. */
const SUPA_URL = "https://xgpnmxkquxzbhgktjipa.supabase.co";
const SUPA_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncG5teGtxdXh6Ymhna3RqaXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMzI1MDgsImV4cCI6MjEwMTkwODUwOH0.KrNERJS8gxc1663oN73CaZ2ZqXZOQTX-AnoMwCmWQUo";

export interface PoolSpinInput {
  stake: number;
  ante: boolean;
  eligible: boolean;
  force: boolean;
  skip?: boolean;
}

function snapFromRpc(raw: unknown): PoolSnap {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    pool: parseMoney(o.pool, POOL_SEED),
    hits: Math.max(0, Math.floor(Number(o.hits) || 0)),
    lastHit: parseMoney(o.lastHit ?? o.last_hit, 0),
    hit: Boolean(o.hit),
    payout: parseMoney(o.payout, 0),
    reserve: parseMoney(o.reserve, 0),
  };
}

async function rpc(name: string, body?: Record<string, unknown>): Promise<unknown> {
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
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`pool rpc ${name} ${res.status} ${text.slice(0, 180)}`);
    }
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("json")) throw new Error(`pool rpc ${name} not json`);
    return res.json();
  } finally {
    clearTimeout(kill);
  }
}

export async function fetchParkPool(): Promise<PoolSnap> {
  return snapFromRpc(await rpc("park_pool_get"));
}

export async function postParkSpin(input: PoolSpinInput): Promise<PoolSnap> {
  return snapFromRpc(
    await rpc("park_pool_spin", {
      p_stake: input.stake,
      p_ante: input.ante,
      p_eligible: input.eligible,
      p_force: input.force,
      p_skip: Boolean(input.skip),
    }),
  );
}

export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return await fn();
  }
}
