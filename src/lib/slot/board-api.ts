const SUPA_URL = "https://xgpnmxkquxzbhgktjipa.supabase.co";
const SUPA_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncG5teGtxdXh6Ymhna3RqaXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMzI1MDgsImV4cCI6MjEwMTkwODUwOH0.KrNERJS8gxc1663oN73CaZ2ZqXZOQTX-AnoMwCmWQUo";

const NICK_KEY = "park-nick";
const SKIP_KEY = "park-nick-skip";
const HOW_KEY = "park-best-how";
const MARK_KEY = "park-best-mark";

export interface BoardRow {
  id: string;
  nick: string;
  wagered: number;
  paid: number;
  best: number;
  how: string;
  stake: number;
}

export function winHow(opts: {
  mode: "BASE" | "PARKNET" | "LÍSTOK" | "DUEL";
  pops?: number;
  pays?: string[];
  signal?: number;
  pdf?: number;
  mult?: number;
  spins?: number;
  ticket?: string;
  duel?: string;
}): string {
  if (opts.mode === "LÍSTOK") return `LÍSTOK ${opts.ticket ?? ""}`.trim().slice(0, 80);
  if (opts.mode === "DUEL") return ["DUEL", opts.duel].filter(Boolean).join(" · ").slice(0, 80);
  const bits: string[] = [opts.mode === "BASE" ? "BASE" : "4KA TV"];
  if (opts.mode === "BASE") {
    for (const name of (opts.pays ?? []).slice(0, 2)) bits.push(name);
    if ((opts.pops ?? 0) > 0 && bits.length < 4) bits.push(`${opts.pops} pop`);
  } else {
    if ((opts.signal ?? 0) > 1) bits.push(`SIGNÁL ${Math.round(opts.signal!)}×`);
    if ((opts.pdf ?? 0) > 0 && bits.length < 4) bits.push(`${opts.pdf}× PDF`);
    if ((opts.mult ?? 0) > 1 && bits.length < 4) bits.push(`${Math.round(opts.mult!)}×`);
    if ((opts.spins ?? 0) > 0 && bits.length < 4) bits.push(`${opts.spins} točení`);
  }
  return bits.slice(0, 4).join(" · ").slice(0, 80);
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

function parseMark(raw: string, day: string): { how: string; stake: number } | null {
  const cut = raw.indexOf("\t");
  if (cut < 0 || raw.slice(0, cut) !== day) return null;
  const rest = raw.slice(cut + 1);
  const stakeCut = rest.indexOf("\t");
  if (stakeCut < 0) return { how: rest, stake: 0 };
  const stake = Number(rest.slice(0, stakeCut));
  return { how: rest.slice(stakeCut + 1), stake: Number.isFinite(stake) ? stake : 0 };
}

export function readBestHow(day: string): string {
  return readBestMark(day).how;
}

export function readBestMark(day: string): { how: string; stake: number } {
  try {
    const marked = parseMark(localStorage.getItem(MARK_KEY) ?? "", day);
    if (marked) return marked;
    const raw = localStorage.getItem(HOW_KEY) ?? "";
    const cut = raw.indexOf("|");
    if (cut < 0 || raw.slice(0, cut) !== day) return { how: "", stake: 0 };
    return { how: raw.slice(cut + 1), stake: 0 };
  } catch {
    return { how: "", stake: 0 };
  }
}

export function writeBestHow(day: string, how: string, stake = 0): void {
  try {
    localStorage.setItem(MARK_KEY, `${day}\t${stake}\t${how}`);
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
      id: typeof o.id === "string" ? o.id : "",
      nick: typeof o.nick === "string" ? o.nick : "",
      wagered: n(o.wagered),
      paid: n(o.paid),
      best: n(o.best),
      how: typeof o.best_how === "string" ? o.best_how : "",
      stake: n(o.best_stake),
    };
  });
}

export async function saveNick(id: string, nick: string): Promise<string | null> {
  const clean = nick.trim().replace(/\s+/g, " ");
  if (clean.length < 2 || clean.length > 12) return "Meno má mať 2 až 12 znakov.";
  const res = await rpc("board_nick", { p_id: id, p_nick: clean });
  if (!res.ok) {
    const text = await res.text();
    if (text.includes("nick")) return "Meno má mať 2 až 12 znakov.";
    return "Meno sa nepodarilo uložiť.";
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
  stake = 0,
): Promise<void> {
  if (!id || !readNick()) return;
  const res = await rpc("board_put", {
    p_id: id,
    p_wagered: wagered,
    p_paid: paid,
    p_best: best,
    p_how: how,
    p_stake: stake,
  });
  if (!res.ok) throw new Error("board");
}

export async function fetchBoard(scope: "today" | "all"): Promise<BoardRow[]> {
  const res = await rpc(scope === "today" ? "board_today" : "board_all", {});
  if (!res.ok) throw new Error("board");
  return rows(await res.json());
}
