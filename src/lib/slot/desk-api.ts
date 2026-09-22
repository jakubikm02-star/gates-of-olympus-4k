const SUPA_URL = "https://xgpnmxkquxzbhgktjipa.supabase.co";
const SUPA_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncG5teGtxdXh6Ymhna3RqaXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMzI1MDgsImV4cCI6MjEwMTkwODUwOH0.KrNERJS8gxc1663oN73CaZ2ZqXZOQTX-AnoMwCmWQUo";

export interface DeskDay {
  day: string;
  wagered: number;
  wins: number;
  best: number;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(new Date());
}

function parse(raw: unknown): DeskDay {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    day: typeof o.day === "string" ? o.day : today(),
    wagered: Math.max(0, num(o.wagered)),
    wins: Math.max(0, Math.floor(num(o.wins))),
    best: Math.max(0, num(o.best)),
  };
}

async function rpc(name: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SUPA_ANON,
      Authorization: `Bearer ${SUPA_ANON}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`desk ${res.status}`);
  return res.json();
}

export function emptyDesk(): DeskDay {
  return { day: today(), wagered: 0, wins: 0, best: 0 };
}

export async function fetchDesk(): Promise<DeskDay> {
  const day = today();
  const res = await fetch(`${SUPA_URL}/rest/v1/desk_day?day=eq.${day}&select=*`, {
    headers: {
      apikey: SUPA_ANON,
      Authorization: `Bearer ${SUPA_ANON}`,
    },
  });
  if (!res.ok) throw new Error(`desk ${res.status}`);
  const rows = (await res.json()) as unknown[];
  return rows[0] ? parse(rows[0]) : emptyDesk();
}

export async function bumpDesk(stake: number, win: number): Promise<DeskDay> {
  const raw = await rpc("desk_bump", { p_stake: stake, p_win: win });
  return parse(Array.isArray(raw) ? raw[0] : raw);
}
