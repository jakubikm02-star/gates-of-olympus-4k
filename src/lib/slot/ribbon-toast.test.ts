/**
 * Ribbon toast: one toast per newly earned ribbon, and it stacks above every game overlay.
 * Supabase is stubbed: no test here may reach production (xgpnmxkquxzbhgktjipa).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { before, describe, it } from "node:test";

before(() => {
  globalThis.fetch = (async (input: unknown) => {
    throw new Error(`network blocked in ribbon-toast test: ${String(input)}`);
  }) as typeof fetch;
});

const spin = (o: Record<string, unknown> = {}) => ({
  t: "spin",
  cost: 1,
  bet: 1,
  buy: false,
  free: false,
  cash0: 0,
  x: 0,
  tumbles: 0,
  hitMax: false,
  turbo: false,
  auto: false,
  ...o,
});

describe("ribbon toast queue", () => {
  it("toasts each new ribbon once, never a repeat of today's", async () => {
    const m = await import("./ribbon-store.ts");
    m.hydrateRibbons(null);
    m.dismissRibbonToast(true);
    // 10:00 Bratislava: no night ribbon in the way.
    let now = Date.parse("2026-10-24T10:00:00+02:00");
    for (let i = 0; i < 7; i++) m.pushStat(spin(), (now += 1000));
    assert.equal(m.toastSnapshot(), null);
    m.pushStat(spin(), (now += 1000));
    const first = m.toastSnapshot();
    assert.equal(first?.id, "mrtvy-spin");
    m.dismissRibbonToast(false);
    assert.equal(m.toastSnapshot(), null);
    // More dead spins: mrtvy-spin is already earned today, no second toast.
    for (let i = 0; i < 5; i++) m.pushStat(spin(), (now += 1000));
    assert.equal(m.toastSnapshot(), null);
    // A different ribbon toasts with a fresh nonce.
    m.pushStat(spin({ tumbles: 6, cash0: 5, x: 5 }), (now += 1000));
    const second = m.toastSnapshot();
    assert.equal(second?.id, "kaskada");
    assert.ok(second && first && second.nonce > first.nonce);
  });

  it("queues several ribbons from one event and shows them one after another", async () => {
    const m = await import("./ribbon-store.ts");
    m.dismissRibbonToast(true);
    const now = Date.parse("2026-10-24T10:30:00+02:00");
    m.pushStat(spin({ tumbles: 10, cash0: 300, x: 300 }), now);
    const seen: string[] = [];
    for (let i = 0; i < 5 && m.toastSnapshot(); i++) {
      seen.push(m.toastSnapshot()!.id);
      m.dismissRibbonToast(false);
    }
    assert.deepEqual([...seen].sort(), ["lavina", "masiv"]);
    assert.equal(m.toastSnapshot(), null);
  });
});

function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...cssFiles(p));
    else if (name.endsWith(".css")) out.push(p);
  }
  return out;
}

describe("ribbon toast stacking", () => {
  const root = join(import.meta.dirname, "..", "..");
  const rules: { sel: string; body: string; file: string }[] = [];
  for (const f of cssFiles(root)) {
    const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) rules.push({ sel: m[1]!.trim(), body: m[2]!, file: f });
  }
  const z = (body: string) => Number(/z-index:\s*(-?\d+)/.exec(body)?.[1] ?? NaN);
  const toast = rules.find((r) => r.sel === ".rib-toast" && /z-index/.test(r.body));

  it("sits above every fixed game overlay (banners, bonus scenes, sheets)", () => {
    assert.ok(toast, ".rib-toast rule with a z-index");
    const tz = z(toast.body);
    const above = rules
      .filter((r) => r !== toast && /position:\s*fixed/.test(r.body) && Number.isFinite(z(r.body)))
      // Debug HUD is a dev tool; the add-to-home sheet is portalled to <body>, outside the stage.
      // The Ribbony gallery opens from the toast itself, so it must sit above it.
      .filter((r) => !/debug-hud|a2hs|rg-back/.test(r.sel))
      .filter((r) => z(r.body) >= tz)
      .map((r) => `${r.sel} (${z(r.body)})`);
    assert.deepEqual(above, [], `overlays at or above the toast's ${tz}`);
  });

  it("lets taps through except on PRESKOČIŤ and the art/title (opens the ribbon detail)", () => {
    assert.match(toast!.body, /pointer-events:\s*none/);
    const skip = rules.find((r) => r.sel === ".rib-skip");
    assert.match(skip!.body, /pointer-events:\s*auto/);
    const open = rules.find((r) => r.sel === ".rib-toast-open");
    assert.match(open!.body, /pointer-events:\s*auto/);
  });

  it("the Ribbony gallery stacks above the toast", () => {
    const gallery = rules.find((r) => r.sel === ".rg-back" && /z-index/.test(r.body));
    assert.ok(gallery, ".rg-back rule with a z-index");
    assert.ok(z(gallery.body) > z(toast!.body));
  });
});
