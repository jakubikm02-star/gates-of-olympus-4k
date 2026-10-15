/** SMRŤ EGA client: anon RPCs on the game's Supabase project (see supabase/migrations/20261015_smrtega.sql). */
import type { EgoPrizeStatus, EgoState } from "./smrtega.ts";

const SUPA_URL = "https://xgpnmxkquxzbhgktjipa.supabase.co";
const SUPA_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncG5teGtxdXh6Ymhna3RqaXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMzI1MDgsImV4cCI6MjEwMTkwODUwOH0.KrNERJS8gxc1663oN73CaZ2ZqXZOQTX-AnoMwCmWQUo";

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
let fetcher: Fetcher = (u, i) => fetch(u, i);
/** Tests inject a mock; production Supabase is never hit from tests. */
export function setEgoFetcher(f: Fetcher): void {
  fetcher = f;
}

async function rpc(name: string, body: Record<string, unknown>): Promise<unknown> {
  const ctrl = new AbortController();
  const kill = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetcher(`${SUPA_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: SUPA_ANON, Authorization: `Bearer ${SUPA_ANON}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`ego ${name} ${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}`);
    return await res.json();
  } finally {
    clearTimeout(kill);
  }
}

const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
const time = (v: unknown): number | null => {
  if (v == null) return null;
  const t = typeof v === "number" ? v : Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export function parseEgoState(raw: unknown): EgoState {
  const o = obj(raw);
  const me = o.me ? obj(o.me) : null;
  const prize = o.prize ? obj(o.prize) : null;
  const leader = o.leader ? obj(o.leader) : null;
  const last = o.last_winner ? obj(o.last_winner) : null;
  const status = String(prize?.status ?? "");
  return {
    weekStart: time(o.week_start) ?? 0,
    weekEnd: time(o.week_end) ?? 0,
    now: time(o.now) ?? Date.now(),
    players: num(o.players),
    top: (Array.isArray(o.top) ? o.top : []).map((t) => {
      const x = obj(t);
      return { nick: String(x.nick ?? "Niekto"), score: num(x.score), admin: Boolean(x.admin) };
    }),
    me: me ? { joined: Boolean(me.joined), score: num(me.score), place: num(me.place), fee: num(me.fee), admin: Boolean(me.admin) } : null,
    leader: leader ? { nick: String(leader.nick ?? "Niekto"), score: num(leader.score) } : null,
    prize:
      prize && ["pending", "awarded", "revoked", "expired"].includes(status)
        ? { status: status as EgoPrizeStatus, deliveredAt: time(prize.delivered_at), expiresAt: time(prize.expires_at) }
        : null,
    lastWinner: last ? { nick: String(last.nick ?? "Niekto"), score: num(last.score) } : null,
  };
}

export async function egoCurrent(id: string): Promise<EgoState> {
  return parseEgoState(await rpc("ego_current", { p_id: id.slice(0, 64) }));
}

export interface EgoProgress {
  rp: number;
  spins: number;
  wagered: number;
}

export async function egoJoin(id: string, nick: string, p: EgoProgress, claimHash: string): Promise<{ ok: boolean; fee: number; error?: string }> {
  const o = obj(
    await rpc("ego_join", {
      p_id: id.slice(0, 64),
      p_nick: nick.slice(0, 24),
      p_rp: Math.floor(p.rp),
      p_spins: Math.floor(p.spins),
      p_wagered: +p.wagered.toFixed(2),
      p_claim_hash: claimHash,
    }),
  );
  return { ok: Boolean(o.ok), fee: num(o.fee), error: o.error ? String(o.error) : undefined };
}

export async function egoReport(id: string, p: EgoProgress): Promise<void> {
  await rpc("ego_report", { p_id: id.slice(0, 64), p_rp: Math.floor(p.rp), p_spins: Math.floor(p.spins), p_wagered: +p.wagered.toFixed(2) });
}

export async function egoClaim(id: string, secret: string): Promise<{ code: string | null; expiresAt: number | null; error?: string }> {
  const o = obj(await rpc("ego_claim", { p_id: id.slice(0, 64), p_secret: secret }));
  return { code: o.code ? String(o.code) : null, expiresAt: time(o.expires_at), error: o.error ? String(o.error) : undefined };
}

const SECRET_KEY = "parkizmus-smrtega-secret";

/** Per-device claim secret. Only its sha256 goes to the server at join; the secret itself unlocks the key. */
export function egoSecret(): string {
  try {
    let s = localStorage.getItem(SECRET_KEY);
    if (!s || s.length < 32) {
      const b = new Uint8Array(24);
      crypto.getRandomValues(b);
      s = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(SECRET_KEY, s);
    }
    return s;
  } catch {
    return "";
  }
}

export async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, "0")).join("");
}
