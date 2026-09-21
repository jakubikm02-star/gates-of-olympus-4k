import type { DuelMode } from "./duel";

const SUPA_URL = "https://xgpnmxkquxzbhgktjipa.supabase.co";
const SUPA_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncG5teGtxdXh6Ymhna3RqaXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMzI1MDgsImV4cCI6MjEwMTkwODUwOH0.KrNERJS8gxc1663oN73CaZ2ZqXZOQTX-AnoMwCmWQUo";

export type DuelSnap = {
  code: string;
  hostName: string;
  guestName: string;
  mode: DuelMode;
  bet: number;
  phase: "wait" | "play" | "done";
  hostScore: number;
  hostHave: number;
  guestScore: number;
  guestHave: number;
  need: number;
};

type Row = {
  code: string;
  host_name: string;
  guest_name: string | null;
  mode: string;
  bet: number | string;
  phase: string;
  host_score: number | string;
  host_have: number | string;
  guest_score: number | string;
  guest_have: number | string;
  need: number | string;
};

function num(v: number | string | null | undefined): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function snap(r: Row): DuelSnap {
  const hostHave = Math.max(0, Math.floor(num(r.host_have)));
  const guestHave = Math.max(0, Math.floor(num(r.guest_have)));
  const need = Math.max(1, Math.floor(num(r.need)));
  const done = hostHave >= need && guestHave >= need;
  return {
    code: r.code,
    hostName: r.host_name,
    guestName: r.guest_name || "",
    mode: r.mode === "live" ? "live" : "spins",
    bet: num(r.bet),
    phase: done ? "done" : r.phase === "play" ? "play" : "wait",
    hostScore: num(r.host_score),
    hostHave,
    guestScore: num(r.guest_score),
    guestHave,
    need,
  };
}

const headers: Record<string, string> = {
  apikey: SUPA_ANON,
  Authorization: `Bearer ${SUPA_ANON}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function rest(path: string, init?: RequestInit): Promise<Row[]> {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  });
  if (res.status === 204) return [];
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = body && typeof body === "object" ? (body as { message?: string }).message : "";
    throw new Error(err || "duel zlyhal");
  }
  return Array.isArray(body) ? (body as Row[]) : body ? [body as Row] : [];
}

export async function duelCreate(input: {
  code: string;
  name: string;
  mode: DuelMode;
  bet: number;
}): Promise<DuelSnap> {
  const need = input.mode === "live" ? 1 : 10;
  const rows = await rest("duel_rooms?on_conflict=code", {
    method: "POST",
    headers: { Prefer: "return=representation,resolution=merge-duplicates" },
    body: JSON.stringify({
      code: input.code,
      host_name: input.name,
      guest_name: "",
      mode: input.mode,
      bet: input.bet,
      phase: "wait",
      host_score: 0,
      host_have: 0,
      guest_score: 0,
      guest_have: 0,
      need,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!rows[0]) throw new Error("duel zlyhal");
  return snap(rows[0]);
}

export async function duelJoin(code: string, name: string): Promise<DuelSnap> {
  const cur = await duelPoll(code);
  if (cur.phase !== "wait") throw new Error("už beží");
  const rows = await rest(`duel_rooms?code=eq.${encodeURIComponent(code)}`, {
    method: "PATCH",
    body: JSON.stringify({ guest_name: name, updated_at: new Date().toISOString() }),
  });
  if (!rows[0]) throw new Error("miestnosť neexistuje");
  return snap(rows[0]);
}

export async function duelStart(code: string): Promise<DuelSnap> {
  const cur = await duelPoll(code);
  if (!cur.guestName) throw new Error("čakám súpera");
  const rows = await rest(`duel_rooms?code=eq.${encodeURIComponent(code)}&phase=eq.wait`, {
    method: "PATCH",
    body: JSON.stringify({ phase: "play", updated_at: new Date().toISOString() }),
  });
  return rows[0] ? snap(rows[0]) : { ...cur, phase: "play" };
}

export async function duelTick(
  code: string,
  role: "host" | "guest",
  have: number,
  score: number,
): Promise<DuelSnap> {
  const patch =
    role === "host"
      ? { host_have: have, host_score: score, updated_at: new Date().toISOString() }
      : { guest_have: have, guest_score: score, updated_at: new Date().toISOString() };
  const rows = await rest(`duel_rooms?code=eq.${encodeURIComponent(code)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!rows[0]) throw new Error("miestnosť neexistuje");
  return snap(rows[0]);
}

export async function duelLeave(code: string, role: "host" | "guest"): Promise<void> {
  try {
    if (role === "host") {
      await rest(`duel_rooms?code=eq.${encodeURIComponent(code)}`, { method: "DELETE" });
      return;
    }
    await rest(`duel_rooms?code=eq.${encodeURIComponent(code)}`, {
      method: "PATCH",
      body: JSON.stringify({
        guest_name: "",
        guest_have: 0,
        guest_score: 0,
        phase: "wait",
        updated_at: new Date().toISOString(),
      }),
    });
  } catch {
    /* ignore */
  }
}

export async function duelPoll(code: string): Promise<DuelSnap> {
  const rows = await rest(`duel_rooms?code=eq.${encodeURIComponent(code)}&select=*`);
  if (!rows[0]) throw new Error("miestnosť neexistuje");
  return snap(rows[0]);
}
