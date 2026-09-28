import { contractCatalog, setContractTitles } from "./spend";

const SUPA_URL = "https://xgpnmxkquxzbhgktjipa.supabase.co";
const SUPA_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncG5teGtxdXh6Ymhna3RqaXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMzI1MDgsImV4cCI6MjEwMTkwODUwOH0.KrNERJS8gxc1663oN73CaZ2ZqXZOQTX-AnoMwCmWQUo";

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

export function subscribeContracts(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

export async function loadContractTitles(): Promise<void> {
  try {
    const res = await rpc("job_titles", {});
    if (!res.ok) return;
    const rows = (await res.json()) as { key?: string; titles?: unknown }[];
    if (!Array.isArray(rows)) return;
    for (const row of contractCatalog()) setContractTitles(row.id, null);
    for (const row of rows) {
      if (!row.key || !Array.isArray(row.titles)) continue;
      const titles = row.titles.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
      if (titles.length) setContractTitles(row.key, titles);
    }
    emit();
  } catch {
    /* keep defaults */
  }
}

export async function saveContractTitles(id: string, titles: string[] | null, password: string): Promise<string | null> {
  const clean = titles?.map((s) => s.trim()).filter(Boolean) ?? null;
  if (clean && (clean.length < 1 || clean.some((s) => s.length > 28))) return "Názov má mať 1 až 28 znakov.";
  const res = await rpc("job_titles_put", { p_pass: password, p_key: id, p_titles: clean });
  if (!res.ok) {
    const text = await res.text();
    if (text.includes("denied")) return "Zlé heslo.";
    if (text.includes("size")) return "Názov má mať 1 až 28 znakov.";
    return "Názvy sa nepodarilo uložiť.";
  }
  setContractTitles(id, clean);
  emit();
  return null;
}

if (typeof window !== "undefined") void loadContractTitles();
