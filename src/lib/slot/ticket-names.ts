import type { TicketId } from "./symbols";

const SUPA_URL = "https://xgpnmxkquxzbhgktjipa.supabase.co";
const SUPA_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncG5teGtxdXh6Ymhna3RqaXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMzI1MDgsImV4cCI6MjEwMTkwODUwOH0.KrNERJS8gxc1663oN73CaZ2ZqXZOQTX-AnoMwCmWQUo";

export const TICKET_KEYS = ["ulica", "okres", "kraj", "stat"] as const satisfies readonly TicketId[];

const FALLBACK: Record<TicketId, string> = {
  ulica: "1-FTTB",
  okres: "2-FTTB",
  kraj: "3-FTTB",
  stat: "4-FTTB",
};

let names: Record<TicketId, string> = { ...FALLBACK };
const subs = new Set<() => void>();

function emit(): void {
  for (const fn of subs) fn();
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

export function ticketLabel(id: TicketId): string {
  return names[id] || FALLBACK[id];
}

export function ticketNameMap(): Record<TicketId, string> {
  return { ...names };
}

export function subscribeTicketNames(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

export async function loadTicketNames(): Promise<void> {
  try {
    const res = await rpc("ticket_names", {});
    if (!res.ok) return;
    const rows = (await res.json()) as { key?: string; name?: string }[];
    if (!Array.isArray(rows)) return;
    const next = { ...FALLBACK };
    for (const row of rows) {
      const key = row.key as TicketId;
      const label = (row.name || "").trim();
      if (key in FALLBACK && label) next[key] = label.slice(0, 16);
    }
    names = next;
    emit();
  } catch {
    /* keep defaults */
  }
}

export async function adminOk(password: string): Promise<"ok" | "denied" | "down"> {
  try {
    const res = await rpc("admin_ok", { p_pass: password });
    if (!res.ok) return "down";
    return (await res.json()) === true ? "ok" : "denied";
  } catch {
    return "down";
  }
}

export async function renameTicket(id: TicketId, label: string, password: string): Promise<string | null> {
  const clean = label.trim();
  if (!clean) return "Názov nesmie byť prázdny.";
  if (clean.length > 16) return "Najviac 16 znakov.";
  const res = await rpc("ticket_rename", { p_pass: password, p_key: id, p_name: clean });
  if (!res.ok) {
    const text = await res.text();
    if (text.includes("denied")) return "Zlé heslo.";
    if (text.includes("size")) return "Najviac 16 znakov.";
    return "Názov sa nepodarilo uložiť.";
  }
  names = { ...names, [id]: clean };
  emit();
  return null;
}

if (typeof window !== "undefined") void loadTicketNames();
