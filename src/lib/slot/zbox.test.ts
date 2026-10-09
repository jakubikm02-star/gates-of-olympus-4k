import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { createRng } from "./engine.ts";
import {
  CAN_TABLE,
  P_CAN,
  P_MOD,
  P_PARCEL,
  ZBOX_MODS,
  ZBOX_CAP_X,
  ZBOX_CELLS,
  ZBOX_FULL_MUL,
  ZBOX_LAYOUT,
  ZBOX_START,
  ZBOX_TIERS,
  ZBOX_VIP,
  ZBOX_WINDOWS,
  playZbox,
  zboxFilledAfter,
  zboxVipOf,
} from "./zbox.ts";
import { kontrolaExactEv, kontrolaPlay, kontrolaTargets } from "./bonus-ev.ts";
import { BONUS_MODES, drawBonusMode, sanitizePendingBonus, stripMs, stripTarget } from "./bonus-mode.ts";
import { sanitizePlayerSave } from "./player-save.ts";
import { applyStat, cget, emptyStats } from "./stats.ts";
import { cueKeys, cueSrc } from "./audio.ts";

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("Ž-BOX layout", () => {
  it("12 cells, 2 banks × 2 cols × 6 rows fully covered, no overlap", () => {
    assert.equal(ZBOX_CELLS, 12);
    for (const side of ["l", "r"] as const) {
      const grid = new Set<string>();
      for (const c of ZBOX_LAYOUT.filter((c) => c.side === side)) {
        for (let dc = 0; dc < c.w; dc++)
          for (let dr = 0; dr < c.h; dr++) {
            const k = `${c.col + dc}:${c.row + dr}`;
            assert.ok(!grid.has(k), `overlap ${side} ${k}`);
            grid.add(k);
          }
      }
      assert.equal(grid.size, 12, `bank ${side} fully covered`);
    }
  });
  it("tier tables never pay zero and grow with size", () => {
    for (const rows of Object.values(ZBOX_TIERS)) for (const r of rows) assert.ok(r.x > 0 && r.w > 0);
    const ev = (s: keyof typeof ZBOX_TIERS) => {
      const w = ZBOX_TIERS[s].reduce((a, r) => a + r.w, 0);
      return ZBOX_TIERS[s].reduce((a, r) => a + (r.x * r.w) / w, 0);
    };
    assert.ok(ev("s") < ev("m") && ev("m") <= ev("w") && ev("w") < ev("l"));
  });
});

describe("Ž-BOX engine", () => {
  it("same seed → same run (reload replays the run)", () => {
    for (const seed of [1, 2, 99, 123456]) assert.deepEqual(playZbox(createRng(seed)), playZbox(createRng(seed)));
  });

  it("invariants over many runs", () => {
    const rng = createRng(777);
    let sawCan = false;
    let sawMiss = false;
    for (let n = 0; n < 20000; n++) {
      const vip = n % 3 === 0 ? ZBOX_VIP.nekonecno : [];
      const p = playZbox(rng, { vip });
      assert.equal(p.start.length, ZBOX_START + vip.length);
      assert.ok(p.totalX > 0, "never a zero Ž-BOX");
      assert.ok(p.totalX <= ZBOX_CAP_X);
      assert.equal(p.capped, p.grossX > ZBOX_CAP_X);
      const ids = zboxFilledAfter(p, p.rounds.length).map((c) => c.id);
      assert.equal(new Set(ids).size, ids.length, "a cell fills at most once");
      assert.equal(p.full, ids.length === ZBOX_CELLS);
      // windows: reset to 3 on any delivery (+1 per PRESMEROVANIE), -1 on NEDORUČENÉ, end at 0 or full wall
      let w = ZBOX_WINDOWS;
      for (const r of p.rounds) {
        const exp = r.parcels.length ? ZBOX_WINDOWS + r.parcels.filter((x) => x.mod === "presmer").length : w - 1;
        assert.equal(r.windows, exp);
        if (!r.parcels.length) sawMiss = true;
        w = r.windows;
      }
      assert.ok(p.full || w === 0);
      // cans are summed, then multiply; full wall doubles
      assert.equal(p.canSum, p.cans.reduce((a, b) => a + b, 0));
      if (p.cans.length) sawCan = true;
      for (const c of p.cans) assert.ok(CAN_TABLE.some((t) => t.x === c));
      assert.equal(p.mult, (p.canSum || 1) * (p.full ? ZBOX_FULL_MUL : 1));
      assert.ok(Math.abs(p.grossX - p.sumX * p.mult) < 1e-3);
    }
    assert.ok(sawCan && sawMiss);
  });

  it("full wall is forced with p=1 → ×2", () => {
    const p = playZbox(createRng(5), { p: 1, q: 0 });
    assert.equal(p.full, true);
    assert.equal(p.rounds.length, 1);
    assert.equal(p.mult, ZBOX_FULL_MUL);
  });

  it("rank perk: priority parcels per rank", () => {
    assert.deepEqual(zboxVipOf("kredit"), []);
    assert.deepEqual(zboxVipOf(undefined), []);
    assert.equal(zboxVipOf("nekonecno").length, 2);
    const p = playZbox(createRng(3), { vip: zboxVipOf("smart") });
    assert.equal(p.start.filter((c) => c.vip).length, 1);
  });

  it("probabilities are the documented ones", () => {
    assert.equal(P_PARCEL, 0.0284);
    assert.equal(P_MOD, 0.12);
    assert.equal(P_CAN, 0.05);
  });

  it("modifiers: replaying the fx script gives the final values; every special acts", () => {
    const rng = createRng(31);
    const seen = new Set<string>();
    for (let n = 0; n < 20000; n++) {
      const p = playZbox(rng);
      const v = ZBOX_LAYOUT.map(() => 0);
      for (const c of p.start) v[c.id] = c.x;
      for (const r of p.rounds) {
        for (const c of r.parcels) {
          v[c.id] = c.x;
          for (const f of r.fx.filter((f) => f.by === c.id && !f.tick)) {
            seen.add(f.mod);
            assert.equal(f.mod, c.mod);
            for (const t of f.set) v[t.id] = t.x;
          }
        }
        for (const f of r.fx.filter((f) => f.tick)) {
          assert.equal(f.mod, "expres");
          for (const t of f.set) v[t.id] = t.x;
        }
        // every special parcel has exactly one landing action
        for (const c of r.parcels.filter((c) => c.mod)) assert.equal(r.fx.filter((f) => f.by === c.id && !f.tick).length, 1);
      }
      for (let i = 0; i < v.length; i++) assert.ok(Math.abs(v[i] - p.vals[i]) < 1e-9, `cell ${i}`);
      assert.ok(Math.abs(p.sumX - p.vals.reduce((a, b) => a + b, 0)) < 1e-3);
      assert.ok(p.vals.every((x) => x >= 0));
    }
    for (const m of ZBOX_MODS) assert.ok(seen.has(m.mod), `saw ${m.mod}`);
  });

  it("KURIÉR doubles 2–4 parcels, DOBIERKA adds to all, ZBERNÝ collects, SKLAD −10 %", () => {
    const rng = createRng(77);
    for (let n = 0; n < 30000; n++) {
      const p = playZbox(rng, { m: 1 });
      const before = ZBOX_LAYOUT.map(() => 0);
      for (const c of p.start) before[c.id] = c.x;
      for (const r of p.rounds) {
        for (const c of r.parcels) {
          before[c.id] = c.x;
          const f = r.fx.find((x) => x.by === c.id && !x.tick)!;
          if (f.mod === "kurier") {
            assert.ok(f.set.length >= Math.min(2, f.set.length) && f.set.length <= 4);
            for (const t of f.set) assert.ok(Math.abs(t.x - before[t.id] * 2) < 1e-3);
          }
          if (f.mod === "dobierka") for (const t of f.set) assert.ok(Math.abs(t.x - before[t.id] - before[c.id]) < 1e-3);
          if (f.mod === "sklad") for (const t of f.set) assert.ok(t.x <= before[t.id] + 1e-9 && t.x >= 0.05);
          if (f.mod === "zberny") assert.deepEqual(f.set.map((t) => t.id), [c.id]);
          for (const t of f.set) before[t.id] = t.x;
        }
        for (const f of r.fx.filter((x) => x.tick)) for (const t of f.set) before[t.id] = t.x;
      }
    }
  });
});

describe("Ž-BOX EV ≈ KONTROLA EV per rank (same RTP share)", () => {
  const targets = kontrolaTargets();
  const N = 150_000;
  for (const [rank, target] of Object.entries(targets)) {
    it(`${rank}: |Ž-BOX − KONTROLA| < 2.5 %`, () => {
      const rng = createRng(4242 + rank.length);
      const vip = zboxVipOf(rank);
      let s = 0;
      for (let i = 0; i < N; i++) s += playZbox(rng, { vip }).totalX;
      const ev = s / N;
      assert.ok(Math.abs(ev / target - 1) < 0.025, `${rank}: ${ev.toFixed(4)} vs ${target.toFixed(4)}`);
    });
  }
  it("KONTROLA simulation policy matches the closed form", () => {
    const rng = createRng(11);
    let s = 0;
    const N2 = 100_000;
    for (let i = 0; i < N2; i++) s += kontrolaPlay(rng, 0, 0);
    assert.ok(Math.abs(s / N2 / kontrolaExactEv(0, 0) - 1) < 0.02);
  });
});

describe("bonus mode draw", () => {
  it("1/3 each: KONTROLA / Ž-BOX / KOLESO", () => {
    const rng = createRng(2026);
    const n: Record<string, number> = { kontrola: 0, zbox: 0, koleso: 0 };
    for (let i = 0; i < 120_000; i++) n[drawBonusMode(rng)]++;
    for (const k of Object.keys(n)) assert.ok(Math.abs(n[k] / 120_000 - 1 / 3) < 0.01, JSON.stringify(n));
    assert.deepEqual(BONUS_MODES.map((m) => m.id), ["kontrola", "zbox", "koleso"]);
    assert.ok(BONUS_MODES.every((m) => m.weight === 1));
  });
  it("strip lands on the drawn tile; durations", () => {
    for (const m of BONUS_MODES) assert.equal(BONUS_MODES[stripTarget(m.id, 4) % BONUS_MODES.length].id, m.id);
    assert.equal(stripMs(false, false), 2000);
    assert.equal(stripMs(true, false), 1000);
    assert.ok(stripMs(false, true) < 1000);
  });
});

describe("pending bonus persistence", () => {
  it("sanitize keeps a valid pending bonus with its seed", () => {
    const p = sanitizePendingBonus({ mode: "zbox", bet: 2, mod: "bezDane", modLeft: 4, at: 5, seed: 1234 });
    assert.deepEqual(p, { mode: "zbox", bet: 2, mod: "bezDane", modLeft: 4, at: 5, seed: 1234 });
  });
  it("keeps a pending KOLESO with its seed", () => {
    assert.deepEqual(sanitizePendingBonus({ mode: "koleso", bet: 1, mod: null, modLeft: 0, at: 2, seed: 99 }), { mode: "koleso", bet: 1, mod: null, modLeft: 0, at: 2, seed: 99 });
  });
  it("rejects garbage, the retired mode 3 and zero bets", () => {
    assert.equal(sanitizePendingBonus(null), null);
    assert.equal(sanitizePendingBonus({ mode: "mode3", bet: 1 }), null);
    assert.equal(sanitizePendingBonus({ mode: "evil", bet: 1 }), null);
    assert.equal(sanitizePendingBonus({ mode: "zbox", bet: 0 }), null);
    assert.equal(sanitizePendingBonus({ mode: "zbox", bet: 1, seed: -1 })?.seed, undefined);
    assert.equal(sanitizePendingBonus({ mode: "kontrola", bet: 1, mod: "x", modLeft: 3 })?.mod, null);
  });
  it("round-trips through the player save (reload keeps the bonus)", () => {
    const s = sanitizePlayerSave({ bonusPending: { mode: "zbox", bet: 1, mod: null, modLeft: 0, at: 1, seed: 42 } });
    assert.equal(s.bonusPending?.mode, "zbox");
    assert.equal(s.bonusPending?.seed, 42);
    const again = sanitizePlayerSave(JSON.parse(JSON.stringify(s)));
    assert.deepEqual(again.bonusPending, s.bonusPending);
    assert.equal(sanitizePlayerSave({}).bonusPending, null);
  });
});

describe("stats + sfx + copy", () => {
  it("stats count modes and Ž-BOX results", () => {
    let s = emptyStats(1);
    s = applyStat(s, { t: "barMode", mode: "zbox" }, 2);
    s = applyStat(s, { t: "barMode", mode: "kontrola" }, 2);
    s = applyStat(s, { t: "zboxStart" }, 3);
    s = applyStat(s, { t: "zbox", cash: 7, parcels: 6, found: 4, full: true, cans: 1, rounds: 5, capped: false }, 4);
    assert.equal(cget(s, "bar.mode.zbox"), 1);
    assert.equal(cget(s, "bar.mode.kontrola"), 1);
    assert.equal(cget(s, "zbox.start"), 1);
    assert.equal(cget(s, "zbox.full"), 1);
    assert.equal(cget(s, "zbox.paid"), 7);
    assert.equal(s.hi["zbox.best"], 7);
  });
  it("Ž-BOX sound cues exist, are listed in Settings and have a default", () => {
    const keys = cueKeys();
    const settings = src("../../components/slot/Settings.tsx");
    const audio = src("./audio.ts");
    for (const k of ["zbox_beep", "zbox_scan", "zbox_scan2", "zbox_scan3", "zbox_scan4", "zbox_open", "zbox_miss", "zbox_slam", "zbox_full"]) {
      assert.ok(keys.includes(k), k);
      assert.ok(settings.includes(`"${k}"`), `Settings lists ${k}`);
      assert.equal(typeof cueSrc(k), "string");
    }
    assert.match(audio, /const ZBOX_SCAN_SLOTS = \["zbox_scan", "zbox_scan2", "zbox_scan3"\]/);
    assert.ok(audio.includes("playZboxScanTail"));
    assert.ok(src("../../components/slot/ZboxBonus.tsx").includes("playZboxScanTail"));
  });
  it("Ž-BOX copy is Slovak", () => {
    const ui = src("../../components/slot/ZboxBonus.tsx");
    for (const t of ["Nič nedoručené", "prázdne", "VŠETKO DORUČENÉ", "Doručovacie okná", "Kuriérsky príplatok", "Ž-BOX SA ZATVÁRA"]) assert.ok(ui.includes(t), t);
  });
});
