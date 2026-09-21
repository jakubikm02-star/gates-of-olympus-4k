import type { DuelMode } from "./duel";

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

async function read(res: Response): Promise<DuelSnap> {
  const body = (await res.json()) as DuelSnap & { error?: string };
  if (!res.ok) throw new Error(body.error || "duel zlyhal");
  return body;
}

export async function duelCreate(input: {
  code: string;
  name: string;
  mode: DuelMode;
  bet: number;
}): Promise<DuelSnap> {
  return read(
    await fetch("/api/duel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "create", ...input }),
    }),
  );
}

export async function duelJoin(code: string, name: string): Promise<DuelSnap> {
  return read(
    await fetch("/api/duel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "join", code, name }),
    }),
  );
}

export async function duelStart(code: string): Promise<DuelSnap> {
  return read(
    await fetch("/api/duel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "start", code }),
    }),
  );
}

export async function duelTick(
  code: string,
  role: "host" | "guest",
  have: number,
  score: number,
): Promise<DuelSnap> {
  return read(
    await fetch("/api/duel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "tick", code, role, have, score }),
    }),
  );
}

export async function duelLeave(code: string, role: "host" | "guest"): Promise<void> {
  await fetch("/api/duel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op: "leave", code, role }),
    keepalive: true,
  }).catch(() => {});
}

export async function duelPoll(code: string): Promise<DuelSnap> {
  return read(await fetch(`/api/duel?code=${encodeURIComponent(code)}`));
}
