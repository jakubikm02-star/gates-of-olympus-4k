const SUPA_URL = "https://xgpnmxkquxzbhgktjipa.supabase.co";
const SUPA_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncG5teGtxdXh6Ymhna3RqaXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMzI1MDgsImV4cCI6MjEwMTkwODUwOH0.KrNERJS8gxc1663oN73CaZ2ZqXZOQTX-AnoMwCmWQUo";

const NICK_KEY = "park-nick";
const SKIP_KEY = "park-nick-skip";
const HOW_KEY = "park-best-how";

export interface BoardRow {
  nick: string;
  wagered: number;
  paid: number;
  best: number;
  how: string;
}

const BANNER: Record<string, string> = {
  big: "BIG",
  mega: "MEGA",
  epic: "SUPER MEGA",
  max: "MAX",
};

export function winHow(opts: {
  mode: "BASE" | "PARKNET" | "KÚPA";
  pops?: number;
  mult?: number;
  x?: number;
  scatters?: number;
  spins?: number;
  banner?: string | null;
}): string {
  const bits: string[] = [opts.mode];
  if ((opts.scatters ?? 0) >= 4) bits.push(`${opts.scatters} scatter`);
  if ((opts.spins ?? 0) > 0) bits.push(`${opts.spins} FS`);
  if ((opts.pops ?? 0) > 0) bits.push(`${opts.pops} pop`);
  if ((opts.mult ?? 0) > 1) bits.push(`${opts.mult}×`);
  if (opts.banner && BANNER[opts.banner]) bits.push(BANNER[opts.banner]);
  else if ((opts.x ?? 0) >= 1) bits.push(`${opts.x! >= 10 ? opts.x!.toFixed(0) : opts.x!.toFixed(1)}×`);
  return bits.join(" · ").slice(0, 80);
}

export function readNick(): string {
  try {
    return localStorage.getItem(NICK_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function nickSkipped(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

export function skipNick(): void {
  try {
    localStorage.setItem(SKIP_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function readBestHow(day: string): string {
  try {
    const raw = localStorage.getItem(HOW_KEY) ?? "";
    const cut = raw.indexOf("|");
    if (cut < 0) return "";
    return raw.slice(0, cut) === day ? raw.slice(cut + 1) : "";
  } catch {
    return "";
  }
}

export function writeBestHow(day: string, how: string): void {
  try {
    localStorage.setItem(HOW_KEY, `${day}|${how}`);
  } catch {
    /* ignore */
  }
}

async function rpc(name: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${SUPA_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SUPA_ANON,
      Authorization: `Bearer ${SUPA_ANON}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function rows(raw: unknown): BoardRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const o = item as Record<string, unknown>;
    const n = (v: unknown) => {
      const x = typeof v === "number" ? v : Number(v);
      return Number.isFinite(x) ? x : 0;
    };
    return {
      nick: typeof o.nick === "string" ? o.nick : "",
      wagered: n(o.wagered),
      paid: n(o.paid),
      best: n(o.best),
      how: typeof o.best_how === "string" ? o.best_how : "",
    };
  });
}

export async function saveNick(id: string, nick: string): Promise<string | null> {
  const clean = nick.trim().replace(/\s+/g, " ");
  if (clean.length < 2 || clean.length > 16) return "Prezývka má mať 2 až 16 znakov.";
  const res = await rpc("board_nick", { p_id: id, p_nick: clean });
  if (!res.ok) {
    const text = await res.text();
    if (text.includes("nick")) return "Prezývka má mať 2 až 16 znakov.";
    return "Prezývku sa nepodarilo uložiť.";
  }
  const saved = String(await res.json()).replace(/^"|"$/g, "");
  try {
    localStorage.setItem(NICK_KEY, saved);
    localStorage.removeItem(SKIP_KEY);
  } catch {
    /* ignore */
  }
  return null;
}

export async function putBoard(
  id: string,
  wagered: number,
  paid: number,
  best: number,
  how: string,
): Promise<void> {
  if (!id || !readNick()) return;
  const res = await rpc("board_put", {
    p_id: id,
    p_wagered: wagered,
    p_paid: paid,
    p_best: best,
    p_how: how,
  });
  if (!res.ok) throw new Error("board");
}

export async function fetchBoard(scope: "today" | "all"): Promise<BoardRow[]> {
  const res = await rpc(scope === "today" ? "board_today" : "board_all", {});
  if (!res.ok) throw new Error("board");
  return rows(await res.json());
}
