import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "node:test";
import {
  MIRROR_BRIDGE_KEY,
  MIRROR_HEAD_SCRIPT,
  MIRROR_ORIGINS,
  MIRROR_SAVE_KEY,
  carryStamp,
} from "./mirror-bridge.ts";

const A = MIRROR_ORIGINS[0];
const B = MIRROR_ORIGINS[1];

function mem(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem(k: string) {
      return m.has(k) ? (m.get(k) as string) : null;
    },
    setItem(k: string, v: string) {
      m.set(k, String(v));
    },
    key(i: number) {
      return [...m.keys()][i] ?? null;
    },
    get length() {
      return m.size;
    },
  };
}

function run(opts: {
  origin: string;
  href?: string;
  local: ReturnType<typeof mem>;
  session: ReturnType<typeof mem>;
  standalone?: boolean;
  online?: boolean;
}) {
  const url = new URL(opts.href || "/", opts.origin);
  const box: { replaced: string | null; cleaned: boolean } = { replaced: null, cleaned: false };
  const windowObj = {
    location: {
      origin: opts.origin,
      search: url.search,
      hash: url.hash,
      replace(next: string) {
        box.replaced = next;
      },
    },
    localStorage: opts.local,
    sessionStorage: opts.session,
    history: {
      replaceState() {
        box.cleaned = true;
      },
    },
    navigator: { standalone: Boolean(opts.standalone), onLine: opts.online !== false },
    matchMedia() {
      return { matches: Boolean(opts.standalone) };
    },
    crypto: globalThis.crypto,
    btoa: globalThis.btoa,
  };
  const context = vm.createContext({
    window: windowObj,
    URLSearchParams,
    decodeURIComponent,
    encodeURIComponent,
    JSON,
    Uint8Array,
    isFinite,
    Date,
    Number,
    String,
  });
  vm.runInContext(MIRROR_HEAD_SCRIPT, context);
  return box;
}

function save(balance: number, updatedAt: number, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ balance, updatedAt, playerId: "player-1234", ...extra });
}

describe("mirror bridge", () => {
  it("keeps the old stamp when the save body did not change", () => {
    const prev = { balance: 40, updatedAt: 50, note: "a" };
    const next = { balance: 40, note: "a", updatedAt: 999 };
    assert.equal(carryStamp(prev, next).updatedAt, 50);
    assert.equal(carryStamp(prev, { ...next, balance: 41 }).updatedAt > 50, true);
  });

  it("copies the newer save onto the other host and comes back", () => {
    const localA = mem({ [MIRROR_SAVE_KEY]: save(80, 200) });
    const localB = mem({ "olympus4k-v1": save(10, 100) });
    const sessA = mem();
    const sessB = mem();
    const hop = run({ origin: B, local: localB, session: sessB });
    assert.ok(hop.replaced?.startsWith(`${A}/?bridge=peer#`));
    const peerUrl = new URL(hop.replaced as string);
    const back = run({
      origin: A,
      href: `${peerUrl.pathname}${peerUrl.search}${peerUrl.hash}`,
      local: localA,
      session: sessA,
    });
    assert.ok(back.replaced?.startsWith(`${B}/?bridge=done#`));
    assert.equal(JSON.parse(localA.getItem(MIRROR_SAVE_KEY) || "{}").balance, 80);
    const doneUrl = new URL(back.replaced as string);
    const home = run({
      origin: B,
      href: `${doneUrl.pathname}${doneUrl.search}${doneUrl.hash}`,
      local: localB,
      session: sessB,
    });
    assert.equal(home.replaced, null);
    assert.equal(home.cleaned, true);
    assert.equal(localA.getItem(MIRROR_BRIDGE_KEY), localB.getItem(MIRROR_BRIDGE_KEY));
    assert.ok((localA.getItem(MIRROR_BRIDGE_KEY) || "").length >= 40);
    const again = run({ origin: B, local: localB, session: sessB });
    assert.equal(again.replaced, null);
  });

  it("does not send the new link away", () => {
    const localA = mem();
    const stay = run({ origin: A, local: localA, session: mem() });
    assert.equal(stay.replaced, null);
    assert.equal(stay.cleaned, false);
  });

  it("brings a save that only exists on the old host", () => {
    const localA = mem();
    const localB = mem({ [MIRROR_SAVE_KEY]: save(440, 900) });
    const hop = run({ origin: B, local: localB, session: mem() });
    const peerUrl = new URL(hop.replaced as string);
    const back = run({
      origin: A,
      href: `${peerUrl.pathname}${peerUrl.search}${peerUrl.hash}`,
      local: localA,
      session: mem(),
    });
    const doneUrl = new URL(back.replaced as string);
    run({
      origin: B,
      href: `${doneUrl.pathname}${doneUrl.search}${doneUrl.hash}`,
      local: localB,
      session: mem(),
    });
    assert.equal(JSON.parse(localA.getItem(MIRROR_SAVE_KEY) || "{}").balance, 440);
  });

  it("does not leave an installed app or an offline tab", () => {
    const local = mem({ [MIRROR_SAVE_KEY]: save(1, 1) });
    assert.equal(run({ origin: B, local, session: mem(), standalone: true }).replaced, null);
    assert.equal(run({ origin: B, local, session: mem(), online: false }).replaced, null);
    assert.equal(run({ origin: "http://127.0.0.1:8080", local, session: mem() }).replaced, null);
  });

  it("returns only to the other game host", () => {
    const hop = run({
      origin: A,
      href: "/?bridge=peer&next=https://evil.example",
      local: mem({ [MIRROR_SAVE_KEY]: save(3, 3) }),
      session: mem(),
    });
    assert.ok(hop.replaced?.startsWith(`${B}/?bridge=done#`));
    assert.equal(hop.replaced?.includes("evil.example"), false);
  });
});
