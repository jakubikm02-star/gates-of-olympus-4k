import { createServerFn } from "@tanstack/react-start";
import { applyDrop, contribution, parseMoney, shouldDrop, type PoolSnap } from "./jackpot";

type PoolRow = {
  pool: unknown;
  hits: unknown;
  last_hit: unknown;
};

function toSnap(row: PoolRow | undefined, extra?: Partial<PoolSnap>): PoolSnap {
  return {
    pool: parseMoney(row?.pool, 2500),
    hits: Math.max(0, Math.floor(Number(row?.hits) || 0)),
    lastHit: parseMoney(row?.last_hit, 0),
    hit: false,
    payout: 0,
    ...extra,
  };
}

export const getParkPool = createServerFn({ method: "GET" }).handler(async (): Promise<PoolSnap> => {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await sql`insert into park_pool (id, pool, seed) values (1, 2500.00, 2500.00) on conflict (id) do nothing`;
  const rows = await sql<PoolRow>`select pool, hits, last_hit from park_pool where id = 1`;
  return toSnap(rows[0]);
});

export const spinParkPool = createServerFn({ method: "POST" })
  .validator((raw: unknown) => {
    const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const stake = Number(o.stake);
    const tickets = Math.floor(Number(o.tickets));
    if (!Number.isFinite(stake) || stake < 0.01 || stake > 20000) throw new Error("bad stake");
    if (!Number.isFinite(tickets) || tickets < 1 || tickets > 8) throw new Error("bad tickets");
    return { stake, tickets };
  })
  .handler(async ({ data }): Promise<PoolSnap> => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const add = contribution(data.stake);
    await sql`insert into park_pool (id, pool, seed) values (1, 2500.00, 2500.00) on conflict (id) do nothing`;
    await sql`update park_pool set pool = pool + ${add}, updated_at = now() where id = 1`;
    const cur = await sql<PoolRow>`select pool, hits, last_hit from park_pool where id = 1`;
    const now = toSnap(cur[0]);
    if (!shouldDrop(now.pool, data.tickets, data.stake, Math.random)) return now;
    const { payout, next } = applyDrop(now.pool);
    if (payout <= 0) return now;
    await sql`
      update park_pool
      set pool = ${next},
          hits = hits + 1,
          last_hit = ${payout},
          last_hit_at = now(),
          updated_at = now()
      where id = 1
    `;
    return { pool: next, hits: now.hits + 1, lastHit: payout, hit: true, payout };
  });
