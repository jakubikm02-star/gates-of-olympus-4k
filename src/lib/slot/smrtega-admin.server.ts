/**
 * /api/smrtega-admin: Martin's SMRŤ EGA admin. Only a gate identity whose e-mail is in ADMIN_EMAILS (Vercel env), or the
 * EGO_ADMIN_TOKEN header, gets through; the server then calls the service_role-only ego_admin_* RPCs with SUPABASE_SERVICE_ROLE_KEY
 * (server env only, never shipped to the client). The stored key is write-only: no action returns it.
 */
import { gateIdentityFromHeaders, type GateIdentity } from "../auth/gate-identity.server.ts";
import { env } from "../env.server.ts";

const SUPA_URL_DEFAULT = "https://xgpnmxkquxzbhgktjipa.supabase.co";

export interface EgoAdminDeps {
  identify: (headers: Headers) => Promise<GateIdentity | null>;
  admins: () => string[];
  serviceKey: () => string | undefined;
  /** Fallback when the gate identity header is not available (plain Vercel deploy): EGO_ADMIN_TOKEN env. */
  adminToken: () => string | undefined;
  supaUrl: () => string;
  fetcher: (url: string, init?: RequestInit) => Promise<Response>;
}

export const defaultEgoAdminDeps: EgoAdminDeps = {
  identify: (h) => gateIdentityFromHeaders(h),
  admins: () =>
    (env("ADMIN_EMAILS") ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  serviceKey: () => env("SUPABASE_SERVICE_ROLE_KEY"),
  adminToken: () => env("EGO_ADMIN_TOKEN"),
  supaUrl: () => env("SUPABASE_URL") ?? SUPA_URL_DEFAULT,
  fetcher: (u, i) => fetch(u, i),
};

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store, max-age=0" } });

export async function handleEgoAdmin(request: Request, deps: EgoAdminDeps = defaultEgoAdminDeps): Promise<Response> {
  const who = await deps.identify(request.headers).catch(() => null);
  const email = who?.email?.toLowerCase() ?? "";
  const byEmail = Boolean(email) && deps.admins().includes(email);
  const want = deps.adminToken() ?? "";
  const byToken = want.length >= 24 && sameText(request.headers.get("x-ego-admin-token") ?? "", want);
  if (!byEmail && !byToken) return json({ error: "forbidden" }, 403);
  const key = deps.serviceKey();
  if (!key) return json({ error: "service_key_missing" }, 503);

  const call = async (name: string, body: Record<string, unknown> = {}) => {
    const res = await deps.fetcher(`${deps.supaUrl()}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return json({ error: "rpc", status: res.status }, 502);
    return json(await res.json());
  };

  if (request.method === "GET") return call("ego_admin_state");
  if (request.method !== "POST") return json({ error: "method" }, 405);
  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "body" }, 400);
  }
  const slot = Number(b.slot);
  const okSlot = Number.isInteger(slot) && slot >= 1 && slot <= 4;
  switch (b.action) {
    case "code": {
      const code = typeof b.code === "string" ? b.code.trim() : "";
      if (!okSlot || code.length < 4 || code.length > 64) return json({ error: "input" }, 400);
      return call("ego_admin_code", { p_slot: slot, p_code: code });
    }
    case "removed":
      if (!okSlot) return json({ error: "input" }, 400);
      return call("ego_confirm_removed", { p_slot: slot });
    case "revoke": {
      const id = Number(b.award);
      if (!Number.isInteger(id) || id <= 0) return json({ error: "input" }, 400);
      return call("ego_revoke", { p_award: id, p_reassign: Boolean(b.reassign) });
    }
    case "replace": {
      const id = Number(b.award);
      const code = typeof b.code === "string" ? b.code.trim() : "";
      if (!Number.isInteger(id) || id <= 0 || code.length < 4 || code.length > 64) return json({ error: "input" }, 400);
      return call("ego_admin_replace", { p_award: id, p_code: code });
    }
    case "player": {
      const pid = typeof b.playerId === "string" ? b.playerId.trim() : "";
      if (pid.length < 8 || pid.length > 64) return json({ error: "input" }, 400);
      return call("ego_admin_player", { p_id: pid, p_label: String(b.label ?? "Martin").slice(0, 40), p_on: b.on !== false });
    }
    default:
      return json({ error: "action" }, 400);
  }
}
