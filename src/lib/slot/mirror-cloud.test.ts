import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { MIRROR_BRIDGE_KEY, MIRROR_ORIGINS } from "./mirror-bridge.ts";
import { flushMirrorPush, pullMirrorSave, resetMirrorSession, scheduleMirrorPush, setMirrorFetch } from "./mirror-cloud.ts";
import { emptyPlayerSave, type PlayerSave } from "./player-save.ts";

function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      m.set(k, String(v));
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

function install() {
  const ls = memStorage();
  Object.defineProperty(globalThis, "localStorage", { value: ls, configurable: true });
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  ls.setItem(MIRROR_BRIDGE_KEY, btoa(s));
  return ls;
}

function player(patch: Partial<PlayerSave>): PlayerSave {
  return { ...emptyPlayerSave(), playerId: "player-1234", ...patch };
}

describe("mirror cloud", () => {
  afterEach(() => {
    setMirrorFetch(null);
    resetMirrorSession();
  });

  it("round-trips the newer save and ignores a blob it cannot open", async () => {
    install();
    const store = new Map<string, string>();
    const calls: string[] = [];
    setMirrorFetch(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { p_id?: string; p_blob?: string };
      const name = String(_url).includes("mirror_put") ? "put" : "get";
      calls.push(name);
      if (name === "put") {
        store.set(body.p_id || "", body.p_blob || "");
        return new Response(null, { status: 204 });
      }
      const blob = store.get(body.p_id || "") ?? null;
      return new Response(JSON.stringify(blob), { status: 200 });
    });
    const local = player({ balance: 20, updatedAt: 10 });
    scheduleMirrorPush(local);
    assert.equal(calls.length, 0);
    assert.equal(await pullMirrorSave(local), null);
    flushMirrorPush();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(calls.indexOf("put") >= 0, true);
    resetMirrorSession();
    const stale = player({ balance: 1, updatedAt: 5 });
    const got = await pullMirrorSave(stale);
    assert.equal(got?.balance, 20);
    assert.equal(got?.updatedAt, 10);
    store.set("player-1234", "not-a-real-seal");
    resetMirrorSession();
    assert.equal(await pullMirrorSave(stale), null);
  });

  it("does not upload when the pull failed", async () => {
    install();
    let calls = 0;
    setMirrorFetch(async () => {
      calls += 1;
      throw new Error("down");
    });
    const local = player({ balance: 9, updatedAt: 9 });
    assert.equal(await pullMirrorSave(local), null);
    scheduleMirrorPush(player({ balance: 99, updatedAt: 99 }));
    flushMirrorPush();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(calls, 1);
  });
});
