import { clampPlayers, type DuelMode } from "./duel.ts";

const SUPA_URL = "https://xgpnmxkquxzbhgktjipa.supabase.co";
const SUPA_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhncG5teGtxdXh6Ymhna3RqaXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMzI1MDgsImV4cCI6MjEwMTkwODUwOH0.KrNERJS8gxc1663oN73CaZ2ZqXZOQTX-AnoMwCmWQUo";

/** One seat of a room row. */
export type DuelSnapSeat = {
  name: string;
  have: number;
  score: number;
  net: boolean;
  seen: number;
  /** Forfeited (3-4 seat rooms: `<seat>_out`; 2 seats: host_out / guest_out phase). */
  out: boolean;
};

export type DuelSnap = {
  code: string;
  /** Room size: 2 (DUEL, also every room of an older build), 3 (TRIPLE THREAT), 4 (FANTASTIC FOUR). */
  players: number;
  /** All seats, seat 0 = host. */
  seats: DuelSnapSeat[];
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
  ante: boolean;
  forfeit: 0 | 1 | null;
  hostNet: boolean;
  guestNet: boolean;
  hostSeen: number;
  guestSeen: number;
  updatedAt: number;
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
  updated_at?: string;
  /** VERSUS columns (supabase/migrations/20261004_versus_multi.sql); absent on 2-seat rooms / old schema. */
  players?: number | string | null;
  host_out?: boolean | null;
  guest_out?: boolean | null;
  p3_name?: string | null;
  p3_score?: number | string | null;
  p3_have?: number | string | null;
  p3_out?: boolean | null;
  p4_name?: string | null;
  p4_score?: number | string | null;
  p4_have?: number | string | null;
  p4_out?: boolean | null;
};

/** Column prefix of a seat: 0 host, 1 guest, 2 p3, 3 p4. */
export type SeatRef = "host" | "guest" | number;
const PREFIX = ["host", "guest", "p3", "p4"] as const;
export function seatPrefix(seat: SeatRef): (typeof PREFIX)[number] {
  if (seat === "host") return "host";
  if (seat === "guest") return "guest";
  return PREFIX[Math.max(0, Math.min(3, Math.floor(seat)))]!;
}

function num(v: number | string | null | undefined): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function unpack(raw: string): { name: string; ante: boolean; net: boolean; seen: number } {
  const parts = (raw || "").split("|");
  if (parts.length >= 3) {
    return {
      name: parts[0] || "HRÁČ",
      ante: parts[1] === "1",
      net: parts[2] === "1",
      seen: Number(parts[3]) || 0,
    };
  }
  const m = /^(.*)\|([01])$/.exec(raw || "");
  if (!m) return { name: raw || "", ante: false, net: false, seen: 0 };
  return { name: m[1] || "HRÁČ", ante: m[2] === "1", net: false, seen: 0 };
}

function pack(name: string, ante: boolean, net = false, seen = Date.now()): string {
  const clean = name.replace(/\|/g, "").trim().slice(0, 12) || "HRÁČ";
  return `${clean}|${ante ? "1" : "0"}|${net ? "1" : "0"}|${seen}`;
}

function snap(r: Row): DuelSnap {
  const players = clampPlayers(r.players ?? 2);
  const need = Math.max(1, Math.floor(num(r.need)));
  const cell = (p: (typeof PREFIX)[number]) => {
    const rec = r as unknown as Record<string, unknown>;
    const packed = unpack(String(rec[`${p}_name`] ?? ""));
    return {
      name: packed.name,
      have: Math.max(0, Math.floor(num(rec[`${p}_have`] as number | string | undefined))),
      score: num(rec[`${p}_score`] as number | string | undefined),
      net: packed.net,
      seen: packed.seen,
      out: rec[`${p}_out`] === true,
      ante: packed.ante,
    };
  };
  const all = PREFIX.slice(0, players).map(cell);
  const host = all[0]!;
  const guest = all[1]!;
  // 2 seats: a forfeit is the phase (works on the original table). 3-4 seats: per seat `<p>_out` columns.
  const forfeit: 0 | 1 | null = r.phase === "host_out" ? 0 : r.phase === "guest_out" ? 1 : null;
  if (players === 2 && forfeit != null) all[forfeit]!.out = true;
  const standing = all.filter((x) => !x.out);
  const done =
    players === 2
      ? forfeit != null || (host.have >= need && guest.have >= need)
      : r.phase === "play" && (standing.length <= 1 || all.every((x) => x.out || x.have >= need));
  return {
    code: r.code,
    players,
    seats: all.map(({ ante: _a, ...x }) => x),
    hostName: host.name,
    guestName: guest.name,
    mode: r.mode === "live" ? "live" : "spins",
    bet: num(r.bet),
    phase: done ? "done" : r.phase === "play" ? "play" : "wait",
    hostScore: host.score,
    hostHave: host.have,
    guestScore: guest.score,
    guestHave: guest.have,
    need,
    ante: host.ante,
    forfeit,
    hostNet: host.net,
    guestNet: guest.net,
    hostSeen: host.seen,
    guestSeen: guest.seen,
    updatedAt: Date.parse(r.updated_at || "") || 0,
  };
}

/** A raw room row as the client reads it (tests and stubs build rows and read them like the REST answer). */
export function rowToSnap(r: Record<string, unknown>): DuelSnap {
  return snap(r as unknown as Row);
}

/** Every seat of the room has a player. */
export function roomFull(s: Pick<DuelSnap, "seats">): boolean {
  return s.seats.length >= 2 && s.seats.every((x) => Boolean(x.name));
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
  need?: number;
  ante?: boolean;
  /** VERSUS size; 3-4 need the VERSUS columns (a 2-seat room writes only the original ones). */
  players?: number;
}): Promise<DuelSnap> {
  const need = input.need && input.need > 0 ? Math.round(input.need) : input.mode === "live" ? 1 : 10;
  const players = clampPlayers(input.players ?? 2);
  const extra =
    players > 2
      ? {
          players,
          host_out: false,
          guest_out: false,
          p3_name: "",
          p3_score: 0,
          p3_have: 0,
          p3_out: false,
          p4_name: "",
          p4_score: 0,
          p4_have: 0,
          p4_out: false,
        }
      : {};
  const rows = await rest("duel_rooms?on_conflict=code", {
    method: "POST",
    headers: { Prefer: "return=representation,resolution=merge-duplicates" },
    body: JSON.stringify({
      ...extra,
      code: input.code,
      host_name: pack(input.name, Boolean(input.ante)),
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
  return (await duelJoinSeat(code, name)).snap;
}

/** PostgREST filter that claims a free seat (its name still empty) of a room still in the lobby. */
export function claimQuery(code: string, seat: number): string {
  return `duel_rooms?code=eq.${encodeURIComponent(code)}&phase=eq.wait&${seatPrefix(seat)}_name=eq.`;
}

/**
 * Join a room and learn the seat. 2 seats: the guest seat (as before). 3-4 seats: the first free seat,
 * claimed with a conditional write (only while that seat's name is still empty), so two players joining
 * at the same moment never end up on one seat.
 */
export async function duelJoinSeat(code: string, name: string): Promise<{ snap: DuelSnap; seat: number }> {
  const cur = await duelPoll(code);
  if (cur.phase !== "wait") throw new Error("už beží");
  if (cur.players <= 2) {
    const rows = await rest(`duel_rooms?code=eq.${encodeURIComponent(code)}`, {
      method: "PATCH",
      body: JSON.stringify({ guest_name: pack(name, false, false, Date.now()), updated_at: new Date().toISOString() }),
    });
    if (!rows[0]) throw new Error("miestnosť neexistuje");
    return { snap: snap(rows[0]), seat: 1 };
  }
  for (let seat = 1; seat < cur.players; seat++) {
    if (cur.seats[seat]?.name) continue;
    const p = seatPrefix(seat);
    const rows = await rest(claimQuery(code, seat), {
      method: "PATCH",
      body: JSON.stringify({ [`${p}_name`]: pack(name, false, false, Date.now()), updated_at: new Date().toISOString() }),
    });
    if (rows[0]) return { snap: snap(rows[0]), seat };
  }
  throw new Error("miestnosť je plná");
}

export async function duelStart(code: string): Promise<DuelSnap> {
  const cur = await duelPoll(code);
  if (!roomFull(cur)) throw new Error(cur.players > 2 ? "čakám na všetkých" : "čakám súpera");
  const rows = await rest(`duel_rooms?code=eq.${encodeURIComponent(code)}&phase=eq.wait`, {
    method: "PATCH",
    body: JSON.stringify({ phase: "play", updated_at: new Date().toISOString() }),
  });
  return rows[0] ? snap(rows[0]) : { ...cur, phase: "play" };
}

export async function duelTick(
  code: string,
  role: SeatRef,
  have: number,
  score: number,
  pulse?: { name: string; ante: boolean; net: boolean },
): Promise<DuelSnap> {
  const p = seatPrefix(role);
  const patch: Record<string, unknown> = { [`${p}_have`]: have, [`${p}_score`]: score, updated_at: new Date().toISOString() };
  if (pulse) patch[`${p}_name`] = pack(pulse.name, pulse.ante, pulse.net, Date.now());
  // An out seat has its have pinned at `need` by the forfeit, so its own late ticks never land again.
  const haveCol = `${p}_have`;
  const rows = await rest(`duel_rooms?code=eq.${encodeURIComponent(code)}&${haveCol}=lte.${have}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (rows[0]) return snap(rows[0]);
  return duelPoll(code);
}

export async function duelForfeit(
  code: string,
  role: "host" | "guest",
  final?: { have: number; score: number },
): Promise<void> {
  const patch: Record<string, unknown> = {
    phase: role === "host" ? "host_out" : "guest_out",
    updated_at: new Date().toISOString(),
  };
  if (final) {
    if (role === "host") {
      patch.host_have = final.have;
      patch.host_score = final.score;
    } else {
      patch.guest_have = final.have;
      patch.guest_score = final.score;
    }
  }
  await rest(`duel_rooms?code=eq.${encodeURIComponent(code)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/** PostgREST filter of the conditional forfeit (see duelForfeitIf). */
export function forfeitQuery(code: string, out: SeatRef, need: number, by: "self" | "peer", players = 2): string {
  const n = Math.max(1, Math.floor(need));
  if (players > 2) {
    // 3-4 seats: that seat only, while the room plays, the seat is not out yet and has not finished.
    return `duel_rooms?code=eq.${encodeURIComponent(code)}&phase=eq.play&${seatPrefix(out)}_out=is.false&${seatPrefix(out)}_have=lt.${n}`;
  }
  let q = `duel_rooms?code=eq.${encodeURIComponent(code)}&phase=eq.play&or=(host_have.lt.${n},guest_have.lt.${n})`;
  if (by === "peer") q += `&${seatPrefix(out)}_have=lt.${n}`;
  return q;
}

/**
 * Conditional forfeit: the row only moves to `<out>_out` while it is still in play and not both seats
 * have finished (and, when forfeiting the peer, while the peer has not finished). Returns true when this
 * call made the transition, so a forfeit and a normal finish can never both be paid.
 * 3-4 seats: `<seat>_out = true` and its have pinned at `need` (the others play on).
 */
export async function duelForfeitIf(
  code: string,
  out: SeatRef,
  need: number,
  by: "self" | "peer",
  final?: { have: number; score: number },
  players = 2,
): Promise<boolean> {
  const n = Math.max(1, Math.floor(need));
  const p = seatPrefix(out);
  const patch: Record<string, unknown> =
    players > 2
      ? { [`${p}_out`]: true, [`${p}_have`]: n, updated_at: new Date().toISOString() }
      : { phase: p === "host" ? "host_out" : "guest_out", updated_at: new Date().toISOString() };
  if (final && by === "self") {
    if (players <= 2) patch[`${p}_have`] = final.have;
    patch[`${p}_score`] = final.score;
  }
  const rows = await rest(forfeitQuery(code, out, n, by, players), { method: "PATCH", body: JSON.stringify(patch) });
  return rows.length > 0;
}

export async function duelLeave(code: string, role: SeatRef, players = 2): Promise<void> {
  try {
    const p = seatPrefix(role);
    if (p === "host") {
      await rest(`duel_rooms?code=eq.${encodeURIComponent(code)}`, { method: "DELETE" });
      return;
    }
    if (players > 2) {
      // Leave the lobby: free my seat only (a running 3-4 seat duel is left through the forfeit).
      await rest(`duel_rooms?code=eq.${encodeURIComponent(code)}&phase=eq.wait`, {
        method: "PATCH",
        body: JSON.stringify({ [`${p}_name`]: "", [`${p}_have`]: 0, [`${p}_score`]: 0, updated_at: new Date().toISOString() }),
      });
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
