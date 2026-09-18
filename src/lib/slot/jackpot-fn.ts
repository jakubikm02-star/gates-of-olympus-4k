import { createServerFn } from "@tanstack/react-start";
import {
  applyDrop,
  contribution,
  parseMoney,
  POOL_CAP,
  POOL_SEED,
  reserveTake,
  shouldDrop,
  type PoolSnap,
} from "./jackpot";

/** Existing paused Supabase (not a new project). Public anon key + RPC only. */
const SUPA_URL = "https://xgpnmxkquxzbhgktjipa.supabase.co";
const SUPA_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncG5teGtxdXh6Ymhna3RqaXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMzI1MDgsImV4cCI6MjEwMTkwODUwOH0.KrNERJS8gxc1663oN73CaZ2ZqXZOQTX-AnoMwCmWQUo";

type PoolRow = {
  pool: unknown;
  hits: unknown;
  last_hit: unknown;
  reserve?: unknown;
};

function toSnap(row: PoolRow | undefined, extra?: Partial<PoolSnap>): PoolSnap {
  return {
    pool: parseMoney(row?.pool, POOL_SEED),
    hits: Math.max(0, Math.floor(Number(row?.hits) || 0)),
    lastHit: parseMoney(row?.last_hit, 0),
    hit: false,
    payout: 0,
    reserve: parseMoney(row?.reserve, 0),
    ...extra,
  };
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

async function rpc<T>(name: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SUPA_ANON,
      Authorization: `Bearer ${SUPA_ANON}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`pool rpc ${name} ${res.status} ${text.slice(0, 180)}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("json")) {
    throw new Error(`pool rpc ${name} not json`);
  }
  return (await res.json()) as T;
}

function hasDatabaseUrl(): boolean {
  return Boolean(typeof process !== "undefined" && process.env.DATABASE_URL?.trim());
}

async function viaSqlGet(): Promise<PoolSnap> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await sql`insert into park_pool (id, pool, seed) values (1, ${POOL_SEED}, ${POOL_SEED}) on conflict (id) do nothing`;
  const rows = await sql<PoolRow>`select pool, hits, last_hit, coalesce(reserve, 0) as reserve from park_pool where id = 1`;
  return toSnap(rows[0]);
}

async function viaSqlSpin(data: {
  stake: number;
  ante: boolean;
  eligible: boolean;
  force: boolean;
  skip: boolean;
}): Promise<PoolSnap> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const add = contribution(data.stake, { ante: data.ante, reduced: !data.eligible && !data.force });
  const resv = reserveTake(data.stake);
  await sql`insert into park_pool (id, pool, seed) values (1, ${POOL_SEED}, ${POOL_SEED}) on conflict (id) do nothing`;
  await sql`
    update park_pool
    set
      reserve = coalesce(reserve, 0) + ${resv} + greatest(0, pool + ${add} - ${POOL_CAP}),
      pool = least(${POOL_CAP}::numeric, pool + ${add}),
      updated_at = now()
    where id = 1
  `;
  const cur = await sql<PoolRow>`select pool, hits, last_hit, coalesce(reserve, 0) as reserve from park_pool where id = 1`;
  const now = toSnap(cur[0]);
  if (!shouldDrop(now.pool, { eligible: data.eligible, ante: data.ante, force: data.force, skip: data.skip }, Math.random)) {
    return now;
  }
  const { payout, next } = applyDrop(now.pool, now.reserve);
  if (payout <= 0) return now;
  await sql`
    update park_pool
    set pool = ${next},
        reserve = 0,
        hits = hits + 1,
        last_hit = ${payout},
        last_hit_at = now(),
        updated_at = now()
    where id = 1
  `;
  return { pool: next, hits: now.hits + 1, lastHit: payout, hit: true, payout, reserve: 0 };
}

export const getParkPool = createServerFn({ method: "GET" }).handler(async (): Promise<PoolSnap> => {
  if (hasDatabaseUrl()) return viaSqlGet();
  return snapFromRpc(await rpc<unknown>("park_pool_get"));
});

export const spinParkPool = createServerFn({ method: "POST" })
  .validator((raw: unknown) => {
    const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const stake = Number(o.stake ?? 0);
    if (!Number.isFinite(stake) || stake < 0 || stake > 20000) throw new Error("bad stake");
    return {
      stake,
      ante: Boolean(o.ante),
      eligible: Boolean(o.eligible),
      force: Boolean(o.force),
      skip: Boolean(o.skip),
    };
  })
  .handler(async ({ data }): Promise<PoolSnap> => {
    if (hasDatabaseUrl()) return viaSqlSpin(data);
    return snapFromRpc(
      await rpc<unknown>("park_pool_spin", {
        p_stake: data.stake,
        p_ante: data.ante,
        p_eligible: data.eligible,
        p_force: data.force,
        p_skip: data.skip,
      }),
    );
  });
