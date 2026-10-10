import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyPlayerSave, type PlayerSave } from "./player-save.ts";
import {
  NEW_ORIGIN,
  OLD_ORIGIN,
  SESSION_MS,
  cleanNick,
  createSource,
  createTarget,
  decideImport,
  hasProgress,
  importedSave,
  makeMsg,
  newNonce,
  nonceFromHash,
  readMoved,
  readMsg,
  readPack,
  resolveOrigins,
  roleOf,
  sayHello,
  validNonce,
  writeMoved,
  type MoveOrigins,
  type MovePack,
  type MsgEventLike,
} from "./save-move.ts";

const O: MoveOrigins = { fresh: NEW_ORIGIN, old: OLD_ORIGIN };
const EVIL = "https://parkizmus-vercel.app.evil.example";

function played(over: Partial<PlayerSave> = {}): PlayerSave {
  return {
    ...emptyPlayerSave(),
    balance: 12_345.5,
    rp: 880,
    rankPeak: 900,
    playerId: "11111111-2222-4333-8444-555555555555",
    updatedAt: Date.parse("2026-10-10T18:00:00Z"),
    ...over,
  };
}

/**
 * Minimal browser model: a window has an origin and listeners. postMessage(msg, targetOrigin) is
 * delivered only when targetOrigin equals the receiver's origin (like the real API), with the
 * sender's origin and window as event.origin / event.source, and a structured clone of the data.
 */
class FakeWin {
  listeners: ((ev: MsgEventLike) => void)[] = [];
  inbox: MsgEventLike[] = [];
  dropped: { msg: unknown; targetOrigin: string }[] = [];
  constructor(public origin: string) {}
  /** The handle another window holds for this one. */
  handleFor(sender: FakeWin) {
    return {
      postMessage: (msg: unknown, targetOrigin: string) => {
        if (targetOrigin !== this.origin) {
          this.dropped.push({ msg, targetOrigin });
          return;
        }
        const ev = { origin: sender.origin, source: sender.self, data: structuredClone(msg) };
        this.inbox.push(ev);
        for (const l of this.listeners) l(ev);
      },
    };
  }
  /** Stable identity used as event.source, like a WindowProxy. */
  self: object = {};
}

/** Wire a pair: what `a` sees as `b`, and the same proxy object b uses as event.source. */
function pair(a: FakeWin, b: FakeWin) {
  const bForA = b.handleFor(a);
  const aForB = a.handleFor(b);
  // event.source seen by a, when b posts, must be the same object a holds for b.
  b.self = bForA;
  a.self = aForB;
  return { bForA, aForB };
}

describe("origins", () => {
  it("uses production unless both overrides are distinct loopback origins", () => {
    assert.deepEqual(resolveOrigins(undefined), O);
    assert.deepEqual(resolveOrigins({}), O);
    assert.deepEqual(
      resolveOrigins({ VITE_PARK_NEW_ORIGIN: "http://localhost:8258", VITE_PARK_OLD_ORIGIN: "http://127.0.0.1:8258" }),
      { fresh: "http://localhost:8258", old: "http://127.0.0.1:8258" },
    );
    assert.deepEqual(resolveOrigins({ VITE_PARK_NEW_ORIGIN: EVIL, VITE_PARK_OLD_ORIGIN: "http://127.0.0.1:1" }), O);
    assert.deepEqual(resolveOrigins({ VITE_PARK_NEW_ORIGIN: "http://localhost:1", VITE_PARK_OLD_ORIGIN: "http://localhost:1" }), O);
    assert.deepEqual(resolveOrigins({ VITE_PARK_NEW_ORIGIN: "http://localhost.evil.com", VITE_PARK_OLD_ORIGIN: "http://127.0.0.1:2" }), O);
  });

  it("gives a role only to the two exact public origins", () => {
    assert.equal(roleOf("https://parkizmus.vercel.app", O), "new");
    assert.equal(roleOf("https://gates-of-olympus-4k.vercel.app", O), "old");
    assert.equal(roleOf("http://parkizmus.vercel.app", O), null);
    assert.equal(roleOf("https://parkizmus.vercel.app.evil.example", O), null);
    assert.equal(roleOf("https://gates-of-olympus-4k-abc123-team.vercel.app", O), null);
  });
});

describe("nonce", () => {
  it("is url-safe, long enough and parsed only from the expected hash key", () => {
    const n = newNonce();
    assert.ok(validNonce(n), n);
    assert.notEqual(n, newNonce());
    assert.equal(nonceFromHash(`#n=${n}`, "n"), n);
    assert.equal(nonceFromHash(`#prenos=${n}`, "prenos"), n);
    assert.equal(nonceFromHash(`#prenos=${n}`, "n"), "");
    assert.equal(nonceFromHash("#n=short", "n"), "");
    assert.equal(nonceFromHash("#n=<script>alert(1)</script>xxxxxxxxxxxx", "n"), "");
  });
});

describe("message gate", () => {
  const src = {};
  const n = newNonce();
  const want = { origin: NEW_ORIGIN, source: src, nonce: n, kinds: ["hello"] as const };
  it("accepts only exact origin, exact window, tag, version, nonce and kind", () => {
    assert.ok(readMsg({ origin: NEW_ORIGIN, source: src, data: makeMsg("hello", n) }, want));
    assert.equal(readMsg({ origin: EVIL, source: src, data: makeMsg("hello", n) }, want), null);
    assert.equal(readMsg({ origin: NEW_ORIGIN, source: {}, data: makeMsg("hello", n) }, want), null);
    assert.equal(readMsg({ origin: NEW_ORIGIN, source: null, data: makeMsg("hello", n) }, { ...want, source: null }), null);
    assert.equal(readMsg({ origin: NEW_ORIGIN, source: src, data: makeMsg("hello", newNonce()) }, want), null);
    assert.equal(readMsg({ origin: NEW_ORIGIN, source: src, data: makeMsg("ack", n) }, want), null);
    assert.equal(readMsg({ origin: NEW_ORIGIN, source: src, data: { ...makeMsg("hello", n), t: "other" } }, want), null);
    assert.equal(readMsg({ origin: NEW_ORIGIN, source: src, data: { ...makeMsg("hello", n), v: 2 } }, want), null);
    assert.equal(readMsg({ origin: NEW_ORIGIN, source: src, data: "hello" }, want), null);
  });
});

describe("pack", () => {
  it("keeps a real save with its player id, nick and stats", () => {
    const p = readPack({ save: played(), nick: "Fero", stats: { v: 1, c: { spins: 3 } } });
    assert.ok(p);
    assert.equal(p.save.balance, 12_345.5);
    assert.equal(p.save.rp, 880);
    assert.equal(p.save.playerId, played().playerId);
    assert.equal(p.nick, "Fero");
  });
  it("refuses junk, missing ids, bad ids and oversize payloads", () => {
    assert.equal(readPack(null), null);
    assert.equal(readPack({ save: { balance: 1 } }), null);
    assert.equal(readPack({ save: played({ playerId: "" }) }), null);
    assert.equal(readPack({ save: played({ playerId: "bad id with spaces!!" }) }), null);
    assert.equal(readPack({ save: played(), stats: { blob: "x".repeat(500_000) } }), null);
  });
  it("cleans nicknames", () => {
    assert.equal(cleanNick("  Jano "), "Jano");
    assert.equal(cleanNick("<b>x</b>"), "bx/b");
    assert.equal(cleanNick("x".repeat(30)), "");
    assert.equal(cleanNick(5), "");
  });
});

describe("import decision", () => {
  it("takes into an empty or fresh link", () => {
    assert.equal(hasProgress(emptyPlayerSave()), false);
    assert.equal(decideImport(null, played()), "take");
    assert.equal(decideImport({ ...emptyPlayerSave(), playerId: "x".repeat(12) }, played()), "take");
  });
  it("same player: newer wins, an equal or newer copy here is kept", () => {
    const here = played({ updatedAt: played().updatedAt + 60_000, balance: 99 });
    assert.equal(decideImport(here, played()), "keep");
    assert.equal(decideImport(played(), played()), "keep");
    assert.equal(decideImport(played(), played({ updatedAt: played().updatedAt + 1 })), "take");
  });
  it("two different games with progress: ask", () => {
    assert.equal(decideImport(played({ playerId: "99999999-2222-4333-8444-555555555555" }), played()), "ask");
  });
  it("stamps the stored copy so no older mirror copy beats it", () => {
    const future = played({ updatedAt: Date.parse("2030-01-01") });
    assert.equal(importedSave(future, 5).updatedAt, future.updatedAt + 1);
    assert.equal(importedSave(played(), Date.parse("2026-10-11")).updatedAt, Date.parse("2026-10-11"));
  });
});

describe("moved marker", () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };
  it("round-trips and still locks on garbage", () => {
    const s = mem();
    assert.equal(readMoved(s), null);
    writeMoved(s, { v: 1, to: NEW_ORIGIN, at: 5, playerId: "p", updatedAt: 4 });
    assert.deepEqual(readMoved(s), { v: 1, to: NEW_ORIGIN, at: 5, playerId: "p", updatedAt: 4 });
    s.setItem("parkizmus-moved", "{oops");
    assert.ok(readMoved(s));
    s.setItem("parkizmus-moved", "1");
    assert.ok(readMoved(s));
  });
});

function packOf(save: PlayerSave): MovePack {
  return { save, nick: "Fero", stats: null };
}

describe("flow A: new link opens the old link's bridge popup", () => {
  it("moves the save only after the player confirms, and locks the old copy after the ack", () => {
    const fresh = new FakeWin(O.fresh);
    const old = new FakeWin(O.old);
    const { bForA: popupFromNew, aForB: openerFromPopup } = pair(fresh, old);
    const nonce = newNonce();
    const target = createTarget({ peer: popupFromNew, nonce, origins: O });
    fresh.listeners.push((ev) => target.handle(ev));
    let locked: { playerId: string; updatedAt: number } | null = null;
    let reads = 0;
    const source = createSource({
      peer: openerFromPopup,
      nonce,
      origins: O,
      pack: () => {
        reads += 1;
        return packOf(played());
      },
      onAck: (a) => {
        locked = a;
      },
    });
    const states: string[] = [];
    old.listeners.push((ev) => states.push(source.handle(ev)));

    sayHello(openerFromPopup, nonce, O.fresh);
    assert.deepEqual(states, ["peer"], "new link answered ready");
    assert.equal(reads, 0, "the save is not read before the player confirms");
    assert.equal(target.offer, null);

    assert.equal(source.offer(), true);
    assert.equal(reads, 1);
    const got = target.offer as MovePack | null;
    assert.ok(got);
    assert.equal(got.save.playerId, played().playerId);
    assert.equal(locked, null, "not locked before the new link stored it");
    assert.equal(source.offer(), false, "single offer per session");

    assert.equal(target.ack(), true);
    assert.deepEqual(states, ["peer", "acked"]);
    assert.deepEqual(locked, { playerId: played().playerId, updatedAt: played().updatedAt });
    assert.equal(target.ack(), false, "single ack");
  });

  it("an attacker that opens the bridge gets nothing and cannot lock the old save", () => {
    const evil = new FakeWin(EVIL);
    const old = new FakeWin(O.old);
    const { aForB: openerFromPopup, bForA: popupFromEvil } = pair(evil, old);
    const nonce = newNonce(); // the attacker built the URL, so it knows the nonce
    let locked = false;
    const source = createSource({
      peer: openerFromPopup,
      nonce,
      origins: O,
      pack: () => packOf(played()),
      onAck: () => {
        locked = true;
      },
    });
    old.listeners.push((ev) => source.handle(ev));

    sayHello(openerFromPopup, nonce, O.fresh);
    assert.equal(evil.inbox.length, 0, "hello addressed to the new origin is dropped at the attacker");
    assert.equal(evil.dropped.length, 1);

    // The attacker forges ready + ack with the right nonce from its own origin.
    popupFromEvil.postMessage(makeMsg("ready", nonce), O.old);
    assert.equal(source.offer(), false, "no live peer, nothing offered");
    popupFromEvil.postMessage(makeMsg("ack", nonce, { playerId: played().playerId }), O.old);
    assert.equal(locked, false);
    // Even if a confused UI offered, the save is posted to the new origin only and never reaches the attacker.
    const s2 = createSource({ peer: openerFromPopup, nonce, origins: O, pack: () => packOf(played()), onAck: () => {} });
    s2.handle({ origin: O.fresh, source: openerFromPopup, data: makeMsg("ready", nonce) });
    assert.equal(s2.offer(), true);
    assert.equal(evil.inbox.length, 0);
    assert.equal(JSON.stringify(evil.dropped).includes("12345.5"), true, "the browser dropped it");
  });
});

describe("flow B: old link opens the new link in a tab", () => {
  it("offers right after the new tab says hello and locks after the ack", () => {
    const old = new FakeWin(O.old);
    const fresh = new FakeWin(O.fresh);
    const { bForA: tabFromOld, aForB: openerFromTab } = pair(old, fresh);
    const nonce = newNonce();
    let locked = false;
    const source = createSource({
      peer: tabFromOld,
      nonce,
      origins: O,
      pack: () => packOf(played()),
      onAck: () => {
        locked = true;
      },
    });
    old.listeners.push((ev) => {
      if (source.handle(ev) === "peer") source.offer();
    });
    const target = createTarget({ peer: openerFromTab, nonce, origins: O });
    fresh.listeners.push((ev) => target.handle(ev));
    sayHello(openerFromTab, nonce, O.old);
    assert.equal(target.offer?.save.rp, 880);
    assert.equal(locked, false);
    target.ack();
    assert.equal(locked, true);
  });

  it("ignores another parkizmus tab, a wrong nonce and an ack for another player", () => {
    const old = new FakeWin(O.old);
    const fresh = new FakeWin(O.fresh);
    const other = new FakeWin(O.fresh);
    const { bForA: tabFromOld } = pair(old, fresh);
    const { bForA: otherFromOld } = pair(old, other);
    const nonce = newNonce();
    let locked = false;
    const source = createSource({ peer: tabFromOld, nonce, origins: O, pack: () => packOf(played()), onAck: () => (locked = true) });
    // Right origin, wrong window.
    assert.equal(source.handle({ origin: O.fresh, source: otherFromOld, data: makeMsg("hello", nonce) }), "ignored");
    assert.equal(source.handle({ origin: O.fresh, source: tabFromOld, data: makeMsg("hello", newNonce()) }), "ignored");
    assert.equal(source.handle({ origin: O.fresh, source: tabFromOld, data: makeMsg("hello", nonce) }), "peer");
    assert.equal(source.handle({ origin: O.fresh, source: tabFromOld, data: makeMsg("ack", nonce, { playerId: played().playerId }) }), "ignored", "ack before offer");
    source.offer();
    assert.equal(source.handle({ origin: O.fresh, source: tabFromOld, data: makeMsg("ack", nonce, { playerId: "someone-else-123" }) }), "ignored");
    assert.equal(locked, false);
    assert.equal(source.handle({ origin: O.fresh, source: tabFromOld, data: makeMsg("ack", nonce, { playerId: played().playerId }) }), "acked");
    assert.equal(locked, true);
  });

  it("the new link refuses offers from anything but the old origin and malformed saves", () => {
    const peer = { postMessage() {} };
    const nonce = newNonce();
    const t = createTarget({ peer, nonce, origins: O });
    assert.equal(t.handle({ origin: EVIL, source: peer, data: makeMsg("offer", nonce, { pack: packOf(played()) }) }), "ignored");
    assert.equal(t.handle({ origin: O.old, source: peer, data: makeMsg("offer", nonce, { pack: { save: { balance: 1e12 } } as unknown as MovePack }) }), "ignored");
    assert.equal(t.offer, null);
    assert.equal(t.handle({ origin: O.old, source: peer, data: makeMsg("offer", nonce, { pack: packOf(played()) }) }), "offer");
    assert.equal(t.handle({ origin: O.old, source: peer, data: makeMsg("offer", nonce, { pack: packOf(played({ balance: 1 })) }) }), "ignored", "first offer only");
    assert.equal((t.offer as MovePack | null)?.save.balance, 12_345.5);
  });

  it("sessions expire", () => {
    let now = 1000;
    const peer = { postMessage() {} };
    const nonce = newNonce();
    const s = createSource({ peer, nonce, origins: O, pack: () => packOf(played()), onAck: () => {}, now: () => now });
    now += SESSION_MS + 1;
    assert.equal(s.handle({ origin: O.fresh, source: peer, data: makeMsg("hello", nonce) }), "ignored");
    const t = createTarget({ peer, nonce, origins: O, now: () => now });
    now += SESSION_MS + 1;
    assert.equal(t.handle({ origin: O.old, source: peer, data: makeMsg("offer", nonce, { pack: packOf(played()) }) }), "ignored");
  });

  it("cancel from the new link ends the old session without locking", () => {
    const peer = { postMessage() {} };
    const nonce = newNonce();
    let locked = false;
    const s = createSource({ peer, nonce, origins: O, pack: () => packOf(played()), onAck: () => (locked = true) });
    s.handle({ origin: O.fresh, source: peer, data: makeMsg("hello", nonce) });
    s.offer();
    assert.equal(s.handle({ origin: O.fresh, source: peer, data: makeMsg("cancel", nonce) }), "cancel");
    assert.equal(s.handle({ origin: O.fresh, source: peer, data: makeMsg("ack", nonce, { playerId: played().playerId }) }), "ignored");
    assert.equal(locked, false);
  });
});

describe("read-only lock in player-save", () => {
  it("blocks local writes once the save moved away, and after holdSaveWrites", async () => {
    const m = new Map<string, string>();
    const ls = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      key: (i: number) => [...m.keys()][i] ?? null,
      get length() {
        return m.size;
      },
    };
    (globalThis as { localStorage?: unknown }).localStorage = ls;
    try {
      const ps = await import("./player-save.ts");
      ps.writeLocalSave(played());
      assert.equal(ps.readLocalSave()?.rp, 880);
      m.set(ps.MOVED_KEY, JSON.stringify({ v: 1, to: NEW_ORIGIN, at: 1, playerId: "p", updatedAt: 1 }));
      ps.writeLocalSave(played({ rp: 1 }));
      assert.equal(ps.readLocalSave()?.rp, 880, "moved: read-only");
      m.delete(ps.MOVED_KEY);
      ps.writeLocalSave(played({ rp: 2 }));
      assert.equal(ps.readLocalSave()?.rp, 2);
      ps.holdSaveWrites();
      ps.writeLocalSave(played({ rp: 3 }));
      assert.equal(ps.readLocalSave()?.rp, 2, "held until reload");
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});
