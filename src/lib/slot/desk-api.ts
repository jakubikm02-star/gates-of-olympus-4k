const SUPA_URL = "https://xgpnmxkquxzbhgktjipa.supabase.co";
const SUPA_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncG5teGtxdXh6Ymhna3RqaXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMzI1MDgsImV4cCI6MjEwMTkwODUwOH0.KrNERJS8gxc1663oN73CaZ2ZqXZOQTX-AnoMwCmWQUo";

export interface DeskDay {
  day: string;
  wagered: number;
  wins: number;
  paid: number;
  best: number;
  /** Payouts from tickets you cleared today. Not part of the machine counter. */
  ticketWon: number;
  /** Stakes of tickets that failed today. Not part of the machine counter. */
  ticketLost: number;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function deskToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(new Date());
}

function parse(raw: unknown): DeskDay {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    day: typeof o.day === "string" ? o.day : deskToday(),
    wagered: Math.max(0, num(o.wagered)),
    wins: Math.max(0, Math.floor(num(o.wins))),
    paid: Math.max(0, num(o.paid)),
    best: Math.max(0, num(o.best)),
    ticketWon: Math.max(0, num(o.ticketWon)),
    ticketLost: Math.max(0, num(o.ticketLost)),
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

export function emptyDesk(day = deskToday()): DeskDay {
  return { day, wagered: 0, wins: 0, paid: 0, best: 0, ticketWon: 0, ticketLost: 0 };
}

export function bumpLocalDesk(prev: DeskDay, stake: number, win: number): DeskDay {
  const day = deskToday();
  const base = prev.day === day ? prev : emptyDesk(day);
  const addStake = Math.max(0, stake);
  const addWin = Math.max(0, win);
  return {
    day,
    wagered: +(base.wagered + addStake).toFixed(2),
    wins: base.wins + (addWin > 0 ? 1 : 0),
    paid: +(base.paid + addWin).toFixed(2),
    best: Math.max(base.best, addWin),
    ticketWon: base.ticketWon,
    ticketLost: base.ticketLost,
  };
}

/** Ticket money stays off the machine turnover. Won = payout, lost = failed stake. */
export function bumpTicketDesk(prev: DeskDay, won: number, lost: number): DeskDay {
  const day = deskToday();
  const base = prev.day === day ? prev : emptyDesk(day);
  return {
    ...base,
    day,
    ticketWon: +(base.ticketWon + Math.max(0, won)).toFixed(2),
    ticketLost: +(base.ticketLost + Math.max(0, lost)).toFixed(2),
  };
}

export async function fetchDesk(): Promise<DeskDay> {
  const day = deskToday();
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
