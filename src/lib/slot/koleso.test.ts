import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { createRng } from "./engine.ts";
import {
  KOLESO_CAP_X,
  KOLESO_FREQ,
  KOLESO_OFFER,
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
  KOLESO_COURIER,
  kolesoBase,
  kolesoCalledAfter,
  kolesoOffer,
  kolesoRows,
  kolesoVipOf,
  playKoleso,
  type KPicker,
} from "./koleso.ts";
import { kontrolaTargets } from "./bonus-ev.ts";
import { RANK_PERKS } from "./ranks.ts";
import { sanitizePlayerSave } from "./player-save.ts";
import { applyStat, cget, emptyStats } from "./stats.ts";
import { sanitizeKolesoPicks, sanitizePendingBonus } from "./bonus-mode.ts";
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
  it("40 parody phrases tagged 4ka-vop / paas: end with a period, no duplicates, fit the board", () => {
    const vop = KOLESO_PHRASES.filter((p) => p.src === "4ka-vop");
    const paas = KOLESO_PHRASES.filter((p) => p.src === "paas");
    assert.ok(vop.length >= 20 && paas.length >= 20, `${vop.length} / ${paas.length}`);
    const texts = new Set<string>();
    for (const p of KOLESO_PHRASES) {
      assert.ok(/\.$/.test(p.text), p.text);
      assert.ok(!texts.has(p.text.toLowerCase()), p.text);
      texts.add(p.text.toLowerCase());
    }
    for (const p of [...vop, ...paas]) assert.ok((kolesoRows(p.text)?.length ?? 9) <= 4, p.text);
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

describe("KOLESO letter choice (3 random letters, the player picks one)", () => {
  it("offer: up to 3 distinct uncalled letters, consonants first, always 3 rng calls", () => {
    const VOW = ["a", "e", "i", "o", "u", "y"];
    const CON = Object.keys(KOLESO_FREQ).filter((c) => !VOW.includes(c));
    const rng = createRng(5);
    for (let i = 0; i < 2000; i++) {
      const called = new Set(CON.filter(() => rng() < 0.5));
      let n = 0;
      const counted = () => {
        n++;
        return rng();
      };
      const o = kolesoOffer(counted, CON, VOW, called);
      assert.equal(n, KOLESO_OFFER);
      assert.equal(new Set(o).size, o.length);
      for (const c of o) assert.ok(!called.has(c));
      const left = CON.filter((c) => !called.has(c)).length;
      if (left >= 3) o.forEach((c) => assert.ok(CON.includes(c)));
    }
  });
  it("Jožo / auto = offer[0]; choices replay; the wheel path never depends on the choice", () => {
    const rng = createRng(77);
    for (let i = 0; i < 3000; i++) {
      const seed = Math.floor(rng() * 0x100000000);
      const a = playKoleso(createRng(seed));
      for (const st of a.steps) if (st.offer?.length) assert.equal(st.letter, st.offer[0]);
      // pick the last letter of every offer
      const picks: (string | null)[] = [];
      for (let k = 0; k < 6; k++) {
        const cur = playKoleso(createRng(seed), { picks });
        const st = cur.steps.find((x) => x.pickNo === picks.length);
        if (!st?.offer) break;
        picks.push(st.offer[st.offer.length - 1]);
      }
      const b = playKoleso(createRng(seed), { picks });
      const c = playKoleso(createRng(seed), { picks });
      assert.deepEqual(b, c);
      const n = Math.min(a.steps.length, b.steps.length);
      for (let k = 0; k < n; k++) {
        assert.equal(a.steps[k].seg, b.steps[k].seg);
        assert.equal(a.steps[k].jitter, b.steps[k].jitter);
        if (a.steps[k].kind === "courier") assert.equal(a.steps[k].parcel, b.steps[k].parcel);
      }
      for (const st of b.steps) if (st.chosen) assert.ok(st.offer?.includes(st.letter ?? ""));
    }
  });
  it("a pick that is not in the offer falls back to Jožo's tip", () => {
    const a = playKoleso(createRng(9));
    const b = playKoleso(createRng(9), { picks: ["q", "q", "q", "q", "q", "q"] });
    assert.deepEqual(a, b);
  });
  it("saved choices survive the player save (sanitized)", () => {
    assert.deepEqual(sanitizeKolesoPicks(["k", null, "Z", 3, "dd", "v"]), ["k", null, null, null, null, "v"]);
    const p = sanitizePendingBonus({ mode: "koleso", bet: 1, mod: null, modLeft: 0, at: 1, seed: 7, kpicks: ["r", null] });
    assert.deepEqual(p?.kpicks, ["r", null]);
    assert.equal(sanitizePendingBonus({ mode: "zbox", bet: 1, mod: null, modLeft: 0, at: 1, seed: 7, kpicks: ["r"] })?.kpicks, undefined);
  });
});

describe("KOLESO EV vs KONTROLA per rank with the letter choice (old payouts kept, RTP up: Martin 11. 10.)", () => {
  const targets = kontrolaTargets();
  const N = 120_000;
  const run = (picker?: KPicker) => {
    const rng = createRng(4242);
    let s = 0;
    for (let i = 0; i < N; i++) s += playKoleso(rng, { vip: 0, picker }).totalX;
    return s / N;
  };
  const nr = createRng(99);
  const greedy: KPicker = (o, i) => [...o].sort((a, b) => (i.cnt[b] ?? 0) - (i.cnt[a] ?? 0) || KOLESO_FREQ[b] - KOLESO_FREQ[a])[0];
  const hold: KPicker = (o, i) => {
    if (i.left >= 1) {
      const keep = o.filter((c) => (i.shown + (i.cnt[c] ?? 0)) / i.letters < KOLESO_SOLVE_AT);
      if (keep.length) return greedy(keep, i);
    }
    return greedy(o, i);
  };
  const jozo = run();
  const naive = run((o) => o[Math.floor(nr() * o.length)]);
  const strong = Math.max(run(greedy), run(hold));
  for (const p of RANK_PERKS) {
    it(`${p.id}: Jožo / naive ≥ KONTROLA, strong ≥ naive, strong ≤ +120 %`, () => {
      const t = targets[p.id];
      const v = kolesoVipOf(p.id);
      assert.ok((jozo + v) / t - 1 > -0.01, `jozo ${(jozo + v).toFixed(4)} vs ${t.toFixed(4)}`);
      assert.ok((naive + v) / t - 1 > -0.01, `naive ${(naive + v).toFixed(4)} vs ${t.toFixed(4)}`);
      assert.ok(strong > naive, "knowing the phrase pays");
      assert.ok((strong + v) / t - 1 < 1.2, `strong ${(strong + v).toFixed(4)} vs ${t.toFixed(4)}`);
    });
  }
  it("payouts are the pre-choice ones (slices, kuriér, solve, šek)", () => {
    const vals = KOLESO_WHEEL.filter((g) => g.kind === "val").map((g) => g.v).sort((a, b) => (a ?? 0) - (b ?? 0));
    assert.deepEqual(vals, [0.25, 0.25, 0.25, 0.4, 0.4, 0.7, 0.7, 1.5]);
    assert.deepEqual([...KOLESO_COURIER], [0, 0.5, 1, 2, 5]);
    assert.equal(KOLESO_SOLVE_MUL, 2);
    assert.equal(KOLESO_SOLVE_FLAT, 1.58);
    assert.deepEqual(KOLESO_VIP, { kredit: 0.04, sloboda: 0.04, smart: 0.21, telka: 0.36, optika: 0.44, duo: 0.66, fiveg: 0.81, nekonecno: 1.44 });
  });
});

describe("KOLESO under autospin: the player picks, autospin stops at the bonus start", () => {
  const hook = src("../../hooks/use-slot-game.ts");
  const kb = src("../../components/slot/KolesoBonus.tsx");
  const game = src("../../components/slot/SlotGame.tsx");
  it("runBonus kills autospin when the drawn mode is KOLESO, before the strip", () => {
    const body = hook.slice(hook.indexOf("const runBonus = useCallback"), hook.indexOf("const runSequence = useCallback"));
    const kill = body.indexOf('if (pend.mode === "koleso" && (autoRef.current || autoHoldRef.current || autoLeftRef.current > 0)) killAuto("AUTO STOP · KOLESO")');
    assert.ok(kill > 0, "killAuto on KOLESO");
    assert.ok(kill < body.indexOf("setModeStrip("), "before the mode strip");
    assert.ok(kill < body.indexOf("runKoleso("), "before the wheel");
    assert.match(body, /\[runPick, runZbox, runKoleso, noteStat, persistNow, killAuto\]/);
  });
  it("KONTROLA / Ž-BOX keep the queue (they skip nothing under autospin)", () => {
    const body = hook.slice(hook.indexOf("const runBonus = useCallback"), hook.indexOf("const runSequence = useCallback"));
    assert.equal((body.match(/killAuto\(/g) ?? []).length, 1);
  });
  it("the overlay has no autoplay switch: Jožo picks only on the timer, PRESKOČIŤ or in JOŽO mode", () => {
    assert.doesNotMatch(kb, /\bauto\?: boolean/);
    assert.doesNotMatch(kb, /Autohra/);
    assert.doesNotMatch(game, /auto=\{g\.koleso/);
    assert.doesNotMatch(hook, /auto: Boolean\(autoRef\.current\),\s*bet: betNow/);
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
