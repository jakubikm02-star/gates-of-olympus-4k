import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rowToSnap, type DuelSnap } from "./duel-api.ts";
import { newRoomSyncState, peerTicksFromSnap, peersAlone, roomSyncKey, startRoomSync, type RoomSyncApi, type RoomSyncState } from "./duel-sync.ts";
import type { DuelLink } from "./duel.ts";

const PREFIX = ["host", "guest", "p3", "p4"] as const;

/** In-memory room table with the same rules as the REST calls the client makes. */
function fakeRoom(players: number, need = 3) {
  const row: Record<string, unknown> = {
    code: "ABCD",
    mode: "spins",
    bet: 10,
    phase: "wait",
    need,
    players,
    updated_at: new Date(0).toISOString(),
  };
  for (const p of PREFIX) Object.assign(row, { [`${p}_name`]: "", [`${p}_have`]: 0, [`${p}_score`]: 0, [`${p}_out`]: false });
  const calls = { create: 0, join: 0, poll: 0, start: 0 };
  const now = Date.now();
  const api: RoomSyncApi = {
    create: async (i) => {
      calls.create += 1;
      // As the real upsert: a create wipes the room back to the lobby.
      row.phase = "wait";
      for (const p of PREFIX) Object.assign(row, { [`${p}_have`]: 0, [`${p}_score`]: 0 });
      row.host_name = `${i.name}|0|0|${now}`;
      return rowToSnap(row);
    },
    joinSeat: async (_code, name) => {
      calls.join += 1;
      if (row.phase !== "wait") throw new Error("už beží");
      for (let s = 1; s < players; s++) {
        if (String(row[`${PREFIX[s]}_name`] ?? "") === "") {
          row[`${PREFIX[s]}_name`] = `${name}|0|0|${now}`;
          return { snap: rowToSnap(row), seat: s };
        }
      }
      throw new Error("miestnosť je plná");
    },
    poll: async () => {
      calls.poll += 1;
      return rowToSnap(row);
    },
    start: async () => {
      calls.start += 1;
      if (row.phase === "wait") row.phase = "play";
      return rowToSnap(row);
    },
    forfeitIf: async () => false,
    leave: async () => {},
  };
  const spin = (seat: number, have: number, score: number) => {
    row[`${PREFIX[seat]}_have`] = have;
    row[`${PREFIX[seat]}_score`] = score;
    row[`${PREFIX[seat]}_name`] = String(row[`${PREFIX[seat]}_name`]).replace(/\|\d+$/, `|${Date.now()}`);
  };
  return { row, api, calls, spin };
}

/** Manual interval clock: `tick()` fires every live interval once and lets the async work settle. */
function clock() {
  const fns = new Map<number, () => void>();
  let id = 0;
  return {
    setInterval: (fn: () => void) => {
      id += 1;
      fns.set(id, fn);
      return id;
    },
    clearInterval: (x: unknown) => void fns.delete(x as number),
    live: () => fns.size,
    tick: async (n = 1) => {
      for (let k = 0; k < n; k++) {
        for (const fn of [...fns.values()]) fn();
        for (let i = 0; i < 10; i++) await Promise.resolve();
      }
    },
  };
}

/**
 * The DuelLink component around the sync, as React runs it: one RoomSyncState per mount, the sync effect
 * re-runs only when its deps change. `deps` = the effect deps (the fix: room + role).
 */
function seat(link: DuelLink, room: ReturnType<typeof fakeRoom>, c: ReturnType<typeof clock>, deps: (link: DuelLink) => string = roomSyncKey) {
  const st: RoomSyncState = newRoomSyncState(link);
  let cur = link;
  const ticks: { have: number; score: number; seat?: number }[] = [];
  const seen: Record<number, { have: number; score: number }> = {};
  const errs: string[] = [];
  let gone: number[] | null = null;
  const run = () =>
    startRoomSync({
      api: room.api,
      state: st,
      setInterval: c.setInterval,
      clearInterval: c.clearInterval,
      hooks: {
        getLink: () => cur,
        getBet: () => cur.bet,
        onGo: (info) => {
          gone = info.names.map((_, i) => i);
          // beginOnline: the hook rewrites the link with the seat and the room size.
          update({ ...cur, seat: info.you, players: info.names.length });
        },
        onTick: (have, score, s) => {
          ticks.push({ have, score, seat: s });
          seen[s ?? (st.seat === 0 ? 1 : 0)] = { have, score };
        },
        onForfeit: () => {},
        onPeerNet: () => {},
        onPeerName: () => {},
        setErr: (m) => void (m && errs.push(m)),
        setStatus: () => {},
        setNames: () => {},
      },
    });
  let stop = run();
  function update(next: DuelLink) {
    const restart = deps(next) !== deps(cur);
    cur = next;
    if (restart) {
      stop();
      stop = run();
    }
  }
  return { st, ticks, seen, errs, update, started: () => gone !== null, stop: () => stop(), link: () => cur };
}

const hostLink = (players: number): DuelLink => ({ room: "ABCD", role: "host", seat: 0, players, name: "Martin", mode: "spins", bet: 10, need: 3, ante: false });
const guestLink = (name: string): DuelLink => ({ room: "ABCD", role: "guest", name, mode: "spins", bet: 10, need: 3, ante: false });

describe("duel room sync (hotfix: guest poll survives the start)", () => {
  it("only room and role restart the sync; seat / players / bet / name do not", () => {
    const a = guestLink("Noizra");
    assert.equal(roomSyncKey(a), roomSyncKey({ ...a, seat: 1, players: 2, bet: 99, name: "x", need: 20, ante: true } as DuelLink));
    assert.notEqual(roomSyncKey(a), roomSyncKey({ ...a, room: "WXYZ" }));
    assert.notEqual(roomSyncKey(a), roomSyncKey({ ...a, role: "host" }));
  });

  it("2 seats: the guest keeps polling after the start and sees the host's spins and finish", async () => {
    const room = fakeRoom(2);
    const c = clock();
    const host = seat(hostLink(2), room, c);
    await c.tick();
    const guest = seat(guestLink("Noizra"), room, c);
    await c.tick(3);
    assert.ok(host.started() && guest.started());
    assert.equal(guest.link().players, 2, "beginOnline rewrote the guest link");
    assert.equal(room.calls.join, 1, "no re-join after the link update");
    assert.equal(room.calls.create, 1, "no re-create");
    assert.equal(room.row.phase, "play");
    const polls = room.calls.poll;
    room.spin(0, 1, 50);
    await c.tick();
    room.spin(0, 3, 120);
    await c.tick();
    assert.ok(room.calls.poll > polls, "guest + host keep polling");
    assert.deepEqual(guest.seen[0], { have: 3, score: 120 }, "guest sees the host at 3/3");
    room.spin(1, 3, 40);
    await c.tick();
    assert.deepEqual(host.seen[1], { have: 3, score: 40 });
    assert.deepEqual(guest.errs, [], "no 'už beží' from a second join");
    host.stop();
    guest.stop();
    assert.equal(c.live(), 0);
  });

  it("the pre-hotfix deps (whole link) would kill the guest's poll: the regression this guards", async () => {
    const room = fakeRoom(2);
    const c = clock();
    const oldDeps = (l: DuelLink) => JSON.stringify([l.room, l.role, l.name, l.mode, l.bet, l.need, l.ante, l.players]);
    seat(hostLink(2), room, c, oldDeps);
    await c.tick();
    const guest = seat(guestLink("Noizra"), room, c, oldDeps);
    await c.tick(3);
    // With the hotfix boot guard the restart no longer re-joins, so even the old deps keep the poll alive.
    assert.equal(room.calls.join, 1);
    room.spin(0, 3, 120);
    await c.tick();
    assert.deepEqual(guest.seen[0], { have: 3, score: 120 });
  });

  it("a restart after the start (any cause) never re-joins or re-creates, and marks the poll ready", async () => {
    for (const role of ["host", "guest"] as const) {
      const room = fakeRoom(2);
      room.row.phase = "play";
      room.row.host_name = `Martin|0|0|${Date.now()}`;
      room.row.guest_name = `Noizra|0|0|${Date.now()}`;
      const c = clock();
      const link = role === "host" ? hostLink(2) : { ...guestLink("Noizra"), seat: 1, players: 2 };
      // The duel already runs on this seat; the sync (re)starts, e.g. React strict mode re-running effects.
      const st = newRoomSyncState(link);
      st.started = true;
      const again = startRoomSync({
        api: room.api,
        state: st,
        setInterval: c.setInterval,
        clearInterval: c.clearInterval,
        hooks: {
          getLink: () => link,
          getBet: () => 10,
          onGo: () => assert.fail("no second go"),
          onTick: () => {},
          onForfeit: () => {},
          onPeerNet: () => {},
          onPeerName: () => {},
          setErr: (m) => assert.equal(m, ""),
          setStatus: () => {},
          setNames: () => {},
        },
      });
      const polls = room.calls.poll;
      await c.tick(2);
      assert.equal(room.calls.join, 0, `${role}: no re-join ("už beží")`);
      assert.equal(room.calls.create, 0, `${role}: a restart must not wipe the room`);
      assert.ok(room.calls.poll >= polls + 2, `${role}: polling`);
      assert.equal(room.row.phase, "play");
      again();
    }
  });

  it("odveta on the same code starts the next match once and does not re-join", async () => {
    const room = fakeRoom(2, 1);
    const c = clock();
    const rematches: number[] = [];
    const link = hostLink(2);
    const st = newRoomSyncState(link);
    const stop = startRoomSync({
      api: room.api,
      state: st,
      setInterval: c.setInterval,
      clearInterval: c.clearInterval,
      hooks: {
        getLink: () => link,
        getBet: () => 10,
        onGo: () => {},
        onTick: () => {},
        onForfeit: () => {},
        onPeerNet: () => {},
        onPeerName: () => {},
        onRematch: (info) => rematches.push(info.round ?? 0),
        setErr: () => {},
        setStatus: () => {},
        setNames: () => {},
      },
    });
    await c.tick(2);
    const guest = seat(guestLink("Noizra"), room, c);
    await c.tick(2);
    assert.equal(room.row.phase, "play");
    room.spin(0, 1, 5);
    room.spin(1, 1, 8);
    await c.tick();
    room.row.round = 2;
    room.row.phase = "play";
    room.row.host_have = 0;
    room.row.guest_have = 0;
    room.row.host_score = 0;
    room.row.guest_score = 0;
    const joins = room.calls.join;
    await c.tick();
    assert.deepEqual(rematches, [2]);
    await c.tick();
    assert.deepEqual(rematches, [2], "the same odveta is not announced twice");
    assert.equal(room.calls.join, joins);
    assert.equal(room.calls.create, 1);
    stop();
    guest.stop();
  });

  for (const n of [3, 4]) {
    it(`${n} seats: every guest keeps polling and sees every other seat finish`, async () => {
      const room = fakeRoom(n);
      const c = clock();
      const host = seat(hostLink(n), room, c);
      await c.tick();
      const guests = Array.from({ length: n - 1 }, (_, k) => seat(guestLink(`G${k + 1}`), room, c));
      await c.tick(4);
      assert.equal(room.row.phase, "play");
      assert.equal(room.calls.join, n - 1, "one join per guest");
      assert.equal(room.calls.create, 1);
      guests.forEach((g, k) => assert.equal(g.st.seat, k + 1));
      guests.forEach((g) => assert.equal(g.link().players, n));
      for (let s = 0; s < n; s++) room.spin(s, 3, 10 * (s + 1));
      await c.tick();
      for (const [k, g] of guests.entries()) {
        for (let s = 0; s < n; s++) {
          if (s === k + 1) continue;
          assert.deepEqual(g.seen[s], { have: 3, score: 10 * (s + 1) }, `guest ${k + 1} sees seat ${s}`);
        }
        assert.deepEqual(g.errs, []);
      }
      assert.deepEqual(host.seen[n - 1], { have: 3, score: 10 * n });
    });
  }
});

describe("peersAlone", () => {
  const seats = (seen: number, have = 0) => [
    { name: "A", have: 1, seen: 1_000 },
    { name: "B", have, seen },
  ];
  const base = { started: true, playSince: 1_000, now: 30_000, phase: "play" as const, me: 0, need: 5, goneMs: 20_000 };
  it("is false while the other seat still answers", () => {
    assert.equal(peersAlone({ ...base, seats: seats(25_000) }), false);
  });
  it("is true once the other seat has been quiet, and when the room dropped back to the lobby", () => {
    assert.equal(peersAlone({ ...base, seats: seats(1_000) }), true);
    assert.equal(peersAlone({ ...base, phase: "wait", seats: seats(25_000) }), true);
    assert.equal(peersAlone({ ...base, seats: [{ name: "A", have: 1, seen: 1_000 }, { name: "", have: 0, seen: 0 }] }), true);
  });
  it("is false when the other seat already finished its spins", () => {
    assert.equal(peersAlone({ ...base, seats: seats(1_000, 5) }), false);
  });
});

describe("peerTicksFromSnap (heartbeat safety net)", () => {
  const snapOf = (players: number, seats: { have: number; score: number; out?: boolean }[]): DuelSnap => {
    const row: Record<string, unknown> = { code: "ABCD", mode: "spins", bet: 1, phase: "play", need: 3, players };
    seats.forEach((x, i) => Object.assign(row, { [`${PREFIX[i]}_name`]: `P${i}|0|0|1`, [`${PREFIX[i]}_have`]: x.have, [`${PREFIX[i]}_score`]: x.score, [`${PREFIX[i]}_out`]: Boolean(x.out) }));
    return rowToSnap(row);
  };
  it("2 seats: the other seat, seat omitted", () => {
    const s = snapOf(2, [{ have: 2, score: 5 }, { have: 1, score: 3 }]);
    assert.deepEqual(peerTicksFromSnap(s, 1), [{ have: 2, score: 5, seat: undefined }]);
    assert.deepEqual(peerTicksFromSnap(s, 0), [{ have: 1, score: 3, seat: undefined }]);
  });
  it("3-4 seats: every other standing seat with its index, out seats skipped", () => {
    const s = snapOf(4, [{ have: 2, score: 5 }, { have: 1, score: 3 }, { have: 3, score: 0, out: true }, { have: 3, score: 9 }]);
    assert.deepEqual(peerTicksFromSnap(s, 1), [
      { have: 2, score: 5, seat: 0 },
      { have: 3, score: 9, seat: 3 },
    ]);
  });
});
