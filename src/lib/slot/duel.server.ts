import { z } from "zod";
import { getSql } from "@/lib/db";

const CODE = z.string().regex(/^[A-Z0-9]{4}$/);
const NAME = z.string().trim().min(1).max(16);
const MODE = z.enum(["spins", "live"]);

const createSchema = z.object({
  op: z.literal("create"),
  code: CODE,
  name: NAME,
  mode: MODE,
  bet: z.number().positive(),
});
const joinSchema = z.object({ op: z.literal("join"), code: CODE, name: NAME });
const startSchema = z.object({ op: z.literal("start"), code: CODE });
const tickSchema = z.object({
  op: z.literal("tick"),
  code: CODE,
  role: z.enum(["host", "guest"]),
  have: z.number().int().min(0).max(40),
  score: z.number().min(0),
});
const leaveSchema = z.object({
  op: z.literal("leave"),
  code: CODE,
  role: z.enum(["host", "guest"]),
});
const postSchema = z.discriminatedUnion("op", [
  createSchema,
  joinSchema,
  startSchema,
  tickSchema,
  leaveSchema,
]);

export type DuelSnap = {
  code: string;
  hostName: string;
  guestName: string;
  mode: "spins" | "live";
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
  guest_name: string;
  mode: string;
  bet: number | string;
  phase: string;
  host_score: number | string;
  host_have: number | string;
  guest_score: number | string;
  guest_have: number | string;
  need: number | string;
};

const globalRef = globalThis as typeof globalThis & { __duelSchema__?: Promise<void> };

function num(v: number | string | null | undefined): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function snap(r: Row): DuelSnap {
  const hostHave = Math.max(0, Math.floor(num(r.host_have)));
  const guestHave = Math.max(0, Math.floor(num(r.guest_have)));
  const need = Math.max(1, Math.floor(num(r.need)));
  const phase = hostHave >= need && guestHave >= need ? "done" : (r.phase as DuelSnap["phase"]);
  return {
    code: r.code,
    hostName: r.host_name,
    guestName: r.guest_name || "",
    mode: r.mode === "live" ? "live" : "spins",
    bet: num(r.bet),
    phase: phase === "done" || phase === "play" ? phase : "wait",
    hostScore: num(r.host_score),
    hostHave,
    guestScore: num(r.guest_score),
    guestHave,
    need,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function ensure() {
  const sql = await getSql();
  globalRef.__duelSchema__ ??= (async () => {
    await sql.query(
      `CREATE TABLE IF NOT EXISTS duel_rooms (
         code TEXT PRIMARY KEY,
         host_name TEXT NOT NULL,
         guest_name TEXT NOT NULL DEFAULT '',
         mode TEXT NOT NULL,
         bet DOUBLE PRECISION NOT NULL,
         phase TEXT NOT NULL DEFAULT 'wait',
         host_score DOUBLE PRECISION NOT NULL DEFAULT 0,
         host_have INT NOT NULL DEFAULT 0,
         guest_score DOUBLE PRECISION NOT NULL DEFAULT 0,
         guest_have INT NOT NULL DEFAULT 0,
         need INT NOT NULL DEFAULT 10,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );
  })().catch((err) => {
    globalRef.__duelSchema__ = undefined;
    throw err;
  });
  await globalRef.__duelSchema__;
  return sql;
}

async function load(code: string): Promise<Row | null> {
  const sql = await ensure();
  const rows = await sql.query<Row>(`SELECT * FROM duel_rooms WHERE code = $1`, [code]);
  return rows[0] ?? null;
}

async function prune() {
  const sql = await ensure();
  await sql.query(`DELETE FROM duel_rooms WHERE updated_at < now() - interval '2 hours'`);
}

export async function handleDuel(request: Request): Promise<Response> {
  try {
    if (request.method === "GET") {
      const url = new URL(request.url);
      const parsed = CODE.safeParse((url.searchParams.get("code") ?? "").toUpperCase());
      if (!parsed.success) return json({ error: "zlý kód" }, 400);
      if (Math.random() < 0.08) await prune();
      const row = await load(parsed.data);
      if (!row) return json({ error: "miestnosť neexistuje" }, 404);
      return json(snap(row));
    }
    if (request.method !== "POST") return json({ error: "method" }, 405);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "json" }, 400);
    }
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) return json({ error: "neplatná požiadavka" }, 400);
    const msg = parsed.data;
    const sql = await ensure();

    if (msg.op === "create") {
      await prune();
      const need = msg.mode === "live" ? 1 : 10;
      await sql.query(
        `INSERT INTO duel_rooms (code, host_name, mode, bet, need, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (code) DO UPDATE SET
           host_name = EXCLUDED.host_name,
           guest_name = '',
           mode = EXCLUDED.mode,
           bet = EXCLUDED.bet,
           phase = 'wait',
           host_score = 0, host_have = 0, guest_score = 0, guest_have = 0,
           need = EXCLUDED.need,
           updated_at = now()`,
        [msg.code, msg.name, msg.mode, msg.bet, need],
      );
      const row = await load(msg.code);
      return json(snap(row!));
    }

    const row = await load(msg.code);
    if (!row) return json({ error: "miestnosť neexistuje" }, 404);

    if (msg.op === "join") {
      if (row.phase !== "wait") return json({ error: "už beží" }, 409);
      await sql.query(
        `UPDATE duel_rooms SET guest_name = $2, updated_at = now() WHERE code = $1`,
        [msg.code, msg.name],
      );
      return json(snap((await load(msg.code))!));
    }

    if (msg.op === "start") {
      if (!row.guest_name) return json({ error: "čakám súpera" }, 409);
      await sql.query(
        `UPDATE duel_rooms SET phase = 'play', updated_at = now() WHERE code = $1 AND phase = 'wait'`,
        [msg.code],
      );
      return json(snap((await load(msg.code))!));
    }

    if (msg.op === "tick") {
      if (msg.role === "host") {
        await sql.query(
          `UPDATE duel_rooms SET host_have = GREATEST(host_have, $2), host_score = $3, updated_at = now() WHERE code = $1`,
          [msg.code, msg.have, msg.score],
        );
      } else {
        await sql.query(
          `UPDATE duel_rooms SET guest_have = GREATEST(guest_have, $2), guest_score = $3, updated_at = now() WHERE code = $1`,
          [msg.code, msg.have, msg.score],
        );
      }
      const next = (await load(msg.code))!;
      const s = snap(next);
      if (s.phase === "done" && next.phase !== "done") {
        await sql.query(`UPDATE duel_rooms SET phase = 'done', updated_at = now() WHERE code = $1`, [msg.code]);
      }
      return json(snap((await load(msg.code))!));
    }

    if (msg.role === "host") {
      await sql.query(`DELETE FROM duel_rooms WHERE code = $1`, [msg.code]);
      return json({ ok: true, gone: true });
    }
    await sql.query(
      `UPDATE duel_rooms SET guest_name = '', phase = 'wait', guest_have = 0, guest_score = 0, updated_at = now() WHERE code = $1`,
      [msg.code],
    );
    return json({ ok: true, gone: false });
  } catch (error) {
    console.error("[duel]", error);
    return json({ error: "duel zlyhal" }, 500);
  }
}
