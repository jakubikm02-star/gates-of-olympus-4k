import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { createRng } from "./engine.ts";
import {
  KOLESO_CAP_X,
  KOLESO_PHRASES,
  KOLESO_SLICES,
  KOLESO_SOLVE_AT,
  KOLESO_SOLVE_FLAT,
  KOLESO_SOLVE_MUL,
  KOLESO_SPINS,
  KOLESO_SPINS_MAX,
  KOLESO_START,
  KOLESO_VIP,
  KOLESO_WHEEL,
  kolesoBase,
  kolesoCalledAfter,
  kolesoRows,
  kolesoVipOf,
  playKoleso,
} from "./koleso.ts";
import { kontrolaTargets } from "./bonus-ev.ts";
import { RANK_PERKS } from "./ranks.ts";
import { sanitizePlayerSave } from "./player-save.ts";
import { applyStat, cget, emptyStats } from "./stats.ts";
import { KOLESO_VO, cueKeys, cueSrc } from "./audio.ts";

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("KOLESO wheel + phrases", () => {
  it("16 equal slices, red value / black gag alternate, one of each gag", () => {
    assert.equal(KOLESO_SLICES, 16);
    KOLESO_WHEEL.forEach((s, i) => assert.equal(s.kind === "val", i % 2 === 0, `slice ${i}`));
    const gags = KOLESO_WHEEL.filter((s) => s.kind !== "val").map((s) => s.kind).sort();
    assert.deepEqual(gags, ["bankrot", "courier", "exek", "extra", "lost", "tax", "vowel", "x2"]);
  });
  it("every phrase fits the 16 × 4 board; no card 509 / 861; ids unique", () => {
    const ids = new Set<number>();
    for (const p of KOLESO_PHRASES) {
      assert.ok(kolesoRows(p.text), p.text);
      assert.ok(p.id !== 509 && p.id !== 861, `card ${p.id}`);
      assert.ok(!ids.has(p.id));
      ids.add(p.id);
    }
    assert.ok(KOLESO_PHRASES.length >= 30);
  });
  it("letters fold diacritics", () => {
    assert.equal(kolesoBase("Á"), "a");
    assert.equal(kolesoBase("ä"), "a");
    assert.equal(kolesoBase("Š"), "s");
    assert.equal(kolesoBase("ô"), "o");
    assert.equal(kolesoBase(","), null);
  });
});

describe("KOLESO run", () => {
  it("is deterministic per seed (reload replays the same run)", () => {
    for (const seed of [1, 42, 99_999]) assert.deepEqual(playKoleso(createRng(seed), { vip: 0.2 }), playKoleso(createRng(seed), { vip: 0.2 }));
  });
  it("respects spins, solve rule, cap and šek", () => {
    const rng = createRng(7);
    for (let i = 0; i < 20_000; i++) {
      const r = playKoleso(rng, { vip: 0.36 });
      assert.ok(r.steps.length >= 1 && r.steps.length <= KOLESO_SPINS_MAX);
      assert.ok(r.spins >= KOLESO_SPINS && r.spins <= KOLESO_SPINS_MAX);
      const last = r.steps[r.steps.length - 1];
      assert.equal(r.solved, last.solved);
      if (r.solved) assert.ok(last.shown >= KOLESO_SOLVE_AT - 1e-9);
      r.steps.slice(0, -1).forEach((s) => assert.ok(!s.solved));
      assert.ok(Math.abs(r.grossX - (r.solved ? r.bankX * KOLESO_SOLVE_MUL + KOLESO_SOLVE_FLAT : r.bankX)) < 1e-5);
      assert.ok(Math.abs(r.totalX - (Math.min(r.grossX, KOLESO_CAP_X) + 0.36)) < 1e-5);
      for (const s of r.steps) {
        if (s.kind === "bankrot") assert.equal(s.bankAfter, 0);
        assert.ok(s.bankAfter >= 0);
      }
      const seen = kolesoCalledAfter(r, r.steps.length);
      for (const c of KOLESO_START) assert.ok(seen.has(c));
    }
  });
  it("šek is paid even after BANKROT", () => {
    const rng = createRng(123);
    let found = false;
    for (let i = 0; i < 5000 && !found; i++) {
      const r = playKoleso(rng, { vip: 0.81 });
      if (r.steps.at(-1)?.kind === "bankrot" && !r.solved) {
        assert.ok(Math.abs(r.totalX - 0.81) < 1e-9);
        found = true;
      }
    }
    assert.ok(found);
  });
});

describe("KOLESO EV ≈ KONTROLA EV per rank (same RTP share)", () => {
  const targets = kontrolaTargets();
  const N = 300_000;
  const rng = createRng(4242);
  let s = 0;
  for (let i = 0; i < N; i++) s += playKoleso(rng, { vip: 0 }).totalX;
  const base = s / N;
  for (const p of RANK_PERKS) {
    it(`${p.id}: |KOLESO − KONTROLA| < 2 %`, () => {
      const ev = base + kolesoVipOf(p.id);
      assert.ok(Math.abs(ev / targets[p.id] - 1) < 0.02, `${p.id}: ${ev.toFixed(4)} vs ${targets[p.id].toFixed(4)}`);
    });
  }
  it("solve bonus is the approved 1,58×, šek never negative", () => {
    assert.equal(KOLESO_SOLVE_FLAT, 1.58);
    for (const v of Object.values(KOLESO_VIP)) assert.ok(v >= 0);
  });
});

describe("KOLESO save, stats, sfx, copy", () => {
  it("player save carries the explanation switch", () => {
    assert.equal(sanitizePlayerSave({ kolesoHelpOff: true }).kolesoHelpOff, true);
    assert.equal(sanitizePlayerSave({}).kolesoHelpOff, false);
    const s = sanitizePlayerSave({ bonusPending: { mode: "koleso", bet: 1, mod: null, modLeft: 0, at: 1, seed: 7 } });
    assert.equal(s.bonusPending?.mode, "koleso");
    assert.equal(s.bonusPending?.seed, 7);
  });
  it("stats count KOLESO results", () => {
    let s = emptyStats(1);
    s = applyStat(s, { t: "barMode", mode: "koleso" }, 2);
    s = applyStat(s, { t: "kolesoStart" }, 3);
    s = applyStat(s, { t: "koleso", cash: 5, solved: true, spins: 6, letters: 4, bankrot: 1, capped: false }, 4);
    assert.equal(cget(s, "bar.mode.koleso"), 1);
    assert.equal(cget(s, "koleso.start"), 1);
    assert.equal(cget(s, "koleso.paid"), 5);
  });
  it("sound cues + host lines exist, are listed in Settings and in the migration", () => {
    const keys = cueKeys();
    const settings = src("../../components/slot/Settings.tsx");
    const all = ["koleso_tick", "koleso_letter", "koleso_miss", "koleso_bankrot", "koleso_solve", ...KOLESO_VO.map((v) => `koleso_vo_${v}`)];
    for (const k of all) {
      assert.ok(keys.includes(k), k);
      assert.ok(settings.includes(`"${k}"`), `Settings lists ${k}`);
      assert.equal(typeof cueSrc(k), "string");
      assert.ok(/^[A-Za-z0-9_-]{1,40}$/.test(k));
    }
    for (const v of KOLESO_VO) assert.ok(cueSrc(`koleso_vo_${v}`).startsWith("/sfx/koleso/vo-"), v);
  });
  it("copy is Slovak and uses only the parody names", () => {
    const ui = src("../../components/slot/KolesoBonus.tsx") + src("../../components/slot/KolesoRules.tsx");
    for (const t of ["BANKROT", "TAJNIČKA", "Jožo Pročkár", "Betka Frekvencová", "Lukáš Adapter", "JUDr. Zabavil", "Daňová Danka", "Kuriér Nezastihol", "Peter Marcipán", "Už nezobrazovať", "Ťukni pre návrat", "Sponzorský šek"]) assert.ok(ui.includes(t), t);
    assert.ok(!/Marcin\b/.test(ui));
  });
});
