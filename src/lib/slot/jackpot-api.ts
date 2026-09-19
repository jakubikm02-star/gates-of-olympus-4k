import {
  emptyBoard,
  emptyPots,
  parseMoney,
  TIER_BY_ID,
  type BoardSnap,
  type JackpotHit,
  type TierId,
  type TierSnap,
} from "./jackpot";

const SUPA_URL = "https://xgpnmxkquxzbhgktjipa.supabase.co";
const SUPA_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncG5teGtxdXh6Ymhna3RqaXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMzI1MDgsImV4cCI6MjEwMTkwODUwOH0.KrNERJS8gxc1663oN73CaZ2ZqXZOQTX-AnoMwCmWQUo";

const TIER_IDS: TierId[] = ["ulica", "okres", "kraj", "stat"];

export interface PoolSpinInput {
  stake: number;
  eligible: boolean;
  skip?: boolean;
  player: string;
}

function potFrom(raw: unknown, id: TierId): TierSnap {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const def = TIER_BY_ID[id];
  return {
    id,
    pool: parseMoney(o.pool, def.seed),
    hits: Math.max(0, Math.floor(Number(o.hits) || 0)),
    lastHit: parseMoney(o.lastHit ?? o.last_hit, 0),
    hit: Boolean(o.hit),
    payout: parseMoney(o.payout, 0),
  };
}

export interface PoolSpinResult extends BoardSnap {
  ticket: TierId | null;
  force: boolean;
}

function ticketFrom(raw: unknown): TierId | null {
  const id = typeof raw === "string" ? raw : "";
  return TIER_BY_ID[id as TierId] ? (id as TierId) : null;
}

function boardFromRpc(raw: unknown): PoolSpinResult {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const potsRaw = o.pots && typeof o.pots === "object" ? (o.pots as Record<string, unknown>) : {};
  const pots = emptyPots();
  for (const id of TIER_IDS) pots[id] = potFrom(potsRaw[id], id);
  const hitsRaw = Array.isArray(o.hits) ? o.hits : [];
  const hits: JackpotHit[] = hitsRaw
    .map((h) => {
      const x = h && typeof h === "object" ? (h as Record<string, unknown>) : {};
      const id = String(x.id || "") as TierId;
      if (!TIER_BY_ID[id]) return null;
      return {
        id,
        name: TIER_BY_ID[id].name,
        payout: parseMoney(x.payout, 0),
        table: parseMoney(x.table, 0),
      };
    })
    .filter((h): h is JackpotHit => Boolean(h && h.payout > 0));
  return {
    pots,
    reserve: parseMoney(o.reserve, 0),
    hits,
    credit: parseMoney(o.credit, 0),
    ticket: ticketFrom(o.ticket),
    force: Boolean(o.force),
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

export async function fetchParkPool(): Promise<PoolSpinResult> {
  return boardFromRpc(await rpc("park_jackpot_get"));
}

export async function postParkSpin(input: PoolSpinInput): Promise<PoolSpinResult> {
  return boardFromRpc(
    await rpc("park_jackpot_spin", {
      p_stake: input.stake,
      p_eligible: input.eligible,
      p_skip: Boolean(input.skip),
      p_player: input.player.slice(0, 64),
    }),
  );
}

export async function postParkClaim(tier: TierId, player: string): Promise<PoolSpinResult> {
  return boardFromRpc(
    await rpc("park_jackpot_claim", {
      p_tier: tier,
      p_player: player.slice(0, 64),
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

export { emptyBoard };
