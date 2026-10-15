import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { createRng } from "./engine.ts";
import { dealPickBoard, rankPeekIds } from "./pick-bonus.ts";
import { kontrolaExactEv, kontrolaRun } from "./bonus-ev.ts";
import { P_CAN, ZBOX_CAP_X, playZbox, zboxVipOf } from "./zbox.ts";
import { KOLESO_CAP_X, kolesoVipOf, playKoleso } from "./koleso.ts";
import { RANK_PERKS } from "./ranks.ts";
import { sanitizePendingBonus } from "./bonus-mode.ts";
import { emptyPlayerSave, sanitizePlayerSave } from "./player-save.ts";
import {
  STAKE_MIN_SAMPLES,
  STAKE_WINDOW,
  ZLATA_POKUTA_X,
  ZLATE_VYSEKY_G,
  ZLATY_CAP_X,
  ZLATY_CARDS,
  ZLATY_FLAG_DEFAULT,
  ZLATY_KURIER_K,
  ZLATY_TARGET_UP,
  claimGold,
  emptyZlaty,
  goldBoard,
  goldCash,
  goldWaiting,
  kontrolaRegularX,
  noteStake,
  recordGold,
  sanitizeZlaty,
  usualStake,
  zlatyEnabled,
} from "./zlaty.ts";

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

function upliftPaired(mode: "zbox" | "koleso", rank: string, runs: number, seed: number): number {
  const s = createRng(seed);
  let d = 0;
  for (let i = 0; i < runs; i++) {
    const sd = Math.floor(s() * 0x100000000);
    if (mode === "zbox") {
      const vip = zboxVipOf(rank);
      d += playZbox(createRng(sd), { vip, q: P_CAN * ZLATY_KURIER_K[rank], cap: ZLATY_CAP_X }).totalX - playZbox(createRng(sd), { vip }).totalX;
    } else {
      const vip = kolesoVipOf(rank);
      d += playKoleso(createRng(sd), { vip, gain: ZLATE_VYSEKY_G, cap: ZLATY_CAP_X }).totalX - playKoleso(createRng(sd), { vip }).totalX;
    }
  }
  return d / runs;
}

describe("ZLATÝ BONUS: math", () => {
  it("flag defaults ON (no window in node)", () => {
    assert.equal(ZLATY_FLAG_DEFAULT, true);
    assert.equal(zlatyEnabled(), true);
  });
  it("every rank has tuned parameters", () => {
    for (const p of RANK_PERKS) {
      assert.ok(ZLATA_POKUTA_X[p.id] > 5 && ZLATA_POKUTA_X[p.id] < 7, p.id);
      assert.ok(ZLATY_KURIER_K[p.id] > 1.8 && ZLATY_KURIER_K[p.id] < 2.4, p.id);
    }
  });
  it("ZLATÁ POKUTA: exact EV uplift = target ±0.005 for every rank, peek unchanged", () => {
    const tiles = dealPickBoard(() => 0);
    for (const p of RANK_PERKS) {
      const g = goldBoard(tiles, p.peekCap, p.peekCount, ZLATA_POKUTA_X[p.id]);
      assert.equal(g.filter((t) => t.kind === "zlata").length, 1);
      assert.deepEqual(rankPeekIds(g, p.peekCap, p.peekCount), rankPeekIds(tiles, p.peekCap, p.peekCount), p.id);
      const up = kontrolaExactEv(p.peekCap, p.peekCount, g) - kontrolaExactEv(p.peekCap, p.peekCount);
      assert.ok(Math.abs(up - ZLATY_TARGET_UP) < 0.005, `${p.id} ${up}`);
    }
  });
  it("ZLATÁ POKUTA: same picks, regular result recomputed exactly", () => {
    const p = RANK_PERKS[0];
    let checked = 0;
    for (let seed = 1; seed < 4000; seed++) {
      const a = kontrolaRun(createRng(seed), p.peekCap, p.peekCount);
      let board: ReturnType<typeof dealPickBoard> = [];
      const b = kontrolaRun(createRng(seed), p.peekCap, p.peekCount, (t) => (board = goldBoard(t, p.peekCap, p.peekCount, ZLATA_POKUTA_X.kredit)));
      assert.equal(a.safes, b.safes);
      // gold tile picked ⇔ the gold run paid more
      const picked = b.x - a.x > 1e-9;
      const reg = kontrolaRegularX(board, board.map((t) => t.kind === "zlata" && picked), b.cleared, b.x);
      assert.ok(Math.abs(reg - a.x) < 1e-6, `seed ${seed}`);
      checked += picked ? 1 : 0;
    }
    assert.ok(checked > 500);
  });
  it("Ž-BOX / KOLESO caps: default 30×, gold 100×", () => {
    assert.equal(playZbox(createRng(3)).cap, ZBOX_CAP_X);
    assert.equal(playZbox(createRng(3), { cap: 100 }).cap, 100);
    assert.equal(playKoleso(createRng(3)).cap, KOLESO_CAP_X);
    assert.equal(playKoleso(createRng(3), { cap: 100 }).cap, 100);
    for (let s = 0; s < 20000; s++) {
      const z = playZbox(createRng(s), { q: P_CAN * 2, cap: 100 });
      assert.ok(z.totalX <= 100 + 1e-9);
    }
  });
  it("ZLATÉ VÝSEKY keeps the wheel path (same slices, letters) and only scales the gains", () => {
    for (let s = 1; s < 3000; s++) {
      const a = playKoleso(createRng(s));
      const b = playKoleso(createRng(s), { gain: ZLATE_VYSEKY_G, cap: 100 });
      assert.deepEqual(
        a.steps.map((x) => [x.seg, x.letter, x.hits]),
        b.steps.map((x) => [x.seg, x.letter, x.hits]),
      );
      assert.equal(a.solved, b.solved);
      assert.ok(b.totalX >= a.totalX - 0.31 * 3, `seed ${s}`); // vowel cost can bite when the gold bank pays it and the normal one could not
    }
  });
  it("Ž-BOX and KOLESO uplift ≈ target (200 k paired runs, KREDIT + NEKONEČNO; 20 M acceptance in zlaty-sim)", () => {
    for (const r of ["kredit", "nekonecno"]) {
      const z = upliftPaired("zbox", r, 200_000, 41);
      const k = upliftPaired("koleso", r, 200_000, 43);
      assert.ok(Math.abs(z - ZLATY_TARGET_UP) < 0.08, `zbox ${r} ${z}`);
      assert.ok(Math.abs(k - ZLATY_TARGET_UP) < 0.03, `koleso ${r} ${k}`);
    }
  });
});

describe("ZLATÝ BONUS: usual stake (anti max-bet)", () => {
  it("median of the remembered stakes, bet when too few", () => {
    assert.equal(usualStake([], 50), 50);
    assert.equal(usualStake(Array(STAKE_MIN_SAMPLES - 1).fill(1), 1000), 1000);
    assert.equal(usualStake([...Array(120).fill(1), ...Array(80).fill(1000)], 1000), 1);
    assert.equal(usualStake([...Array(80).fill(1), ...Array(120).fill(1000)], 1000), 1000);
  });
  it("ring keeps the last STAKE_WINDOW stakes", () => {
    let z = emptyZlaty();
    for (let i = 0; i < STAKE_WINDOW + 50; i++) z = noteStake(z, i < 60 ? 1000 : 2);
    assert.equal(z.stakes.length, STAKE_WINDOW);
    assert.equal(z.stakes[0], 1000);
    assert.equal(usualStake(z.stakes, 1000), 2);
  });
  it("cash: normal part on the bet, gold uplift on min(bet, usual)", () => {
    assert.equal(goldCash(10, 4, 2, 5), 20); // bet ≤ usual: all on the bet
    assert.equal(goldCash(10, 4, 100, 1), 4 * 100 + 6 * 1);
    assert.equal(goldCash(2, 4, 100, 1), 4 * 100 - 2); // Ž-BOX gold path may pay less than its normal twin
    assert.equal(goldCash(0, 0, 100, 1), 0);
  });
});

describe("ZLATÝ BONUS: day state", () => {
  it("once per day, the next day it waits again", () => {
    let z = emptyZlaty();
    assert.equal(goldWaiting(z, "2026-10-11"), true);
    z = claimGold(z, "2026-10-11");
    assert.equal(goldWaiting(z, "2026-10-11"), false);
    assert.equal(goldWaiting(z, "2026-10-10"), false); // clock moved back: nothing
    assert.equal(goldWaiting(z, "2026-10-12"), true);
    assert.equal(goldWaiting(z, "2026-10-12", false), false); // flag off
  });
  it("stats and streak", () => {
    let z = emptyZlaty();
    z = recordGold(z, { mode: "koleso", x: 12, cash: 120, extra: 50, day: "2026-10-10" });
    z = recordGold(z, { mode: "zbox", x: 3, cash: 30, extra: 10, day: "2026-10-11" });
    assert.equal(z.streak, 2);
    z = recordGold(z, { mode: "kontrola", x: 40, cash: 400, extra: 300, day: "2026-10-13" });
    assert.equal(z.streak, 1);
    assert.equal(z.bestStreak, 2);
    assert.equal(z.played, 3);
    assert.equal(z.cash, 550);
    assert.equal(z.extra, 360);
    assert.equal(z.bestX, 40);
    assert.deepEqual(z.byMode.koleso, { n: 1, x: 12 });
  });
  it("sanitize drops junk, keeps good fields; old saves get an empty state (gold waiting)", () => {
    const z = sanitizeZlaty({ usedDay: "x", played: -3, stakes: [1, "a", 0, 5], byMode: { zbox: { n: 2, x: 9 } }, streak: 4, bestStreak: 1 });
    assert.equal(z.usedDay, "");
    assert.equal(z.played, 0);
    assert.deepEqual(z.stakes, [1, 5]);
    assert.deepEqual(z.byMode.zbox, { n: 2, x: 9 });
    assert.equal(z.bestStreak, 4);
    const old = sanitizePlayerSave({ ...emptyPlayerSave(), zlaty: undefined });
    assert.equal(goldWaiting(old.zlaty!, "2026-10-11"), true);
    const rt = sanitizePlayerSave(JSON.parse(JSON.stringify({ ...emptyPlayerSave(), zlaty: claimGold(emptyZlaty(), "2026-10-11") })));
    assert.equal(rt.zlaty!.usedDay, "2026-10-11");
  });
  it("pending bonus keeps its gold over a reload", () => {
    const p = sanitizePendingBonus({ mode: "zbox", bet: 2, mod: null, modLeft: 0, at: 5, seed: 7, gold: { day: "2026-10-11", stake: 1 } });
    assert.deepEqual(p?.gold, { day: "2026-10-11", stake: 1 });
    assert.equal(sanitizePendingBonus({ mode: "zbox", bet: 2, gold: { day: "bad", stake: 1 } })?.gold, undefined);
  });
});

describe("ZLATÝ BONUS: wiring", () => {
  const hook = src("../../hooks/use-slot-game.ts");
  it("day from the server clock, gold claimed when the bar fills, saved with the pending bonus", () => {
    assert.match(hook, /braDay\(serverNow\(\)\)/);
    assert.match(hook, /claimGold\(zlatyRef\.current, today\)/);
    assert.match(hook, /\.\.\.\(gold \? \{ gold \} : \{\}\)/);
    assert.match(hook, /syncServerClock\(\)/);
  });
  it("all three modes pay through goldCash and the 100× cap; RP from the regular part", () => {
    assert.equal((hook.match(/goldCash\(/g) ?? []).length, 3);
    assert.match(hook, /cap: ZLATY_CAP_X/);
    assert.equal((hook.match(/const rpCash = gold/g) ?? []).length, 3);
  });
  it("no gold in a duel", () => {
    assert.equal((hook.match(/&& !roundEscrowRef\.current \? (goldIn|pend\.gold) : null/g) ?? []).length, 3);
  });
  it("/api/clock route exists and needs no database", () => {
    const route = src("../../routes/api/clock.ts");
    assert.match(route, /clockReply\(\)/);
    assert.doesNotMatch(route, /supabase|@\/lib\/db/i);
  });
});

describe("ZLATÁ SIM reveal: art layers, pop-out stages, reduced motion", () => {
  const ui = src("../../components/slot/Zlaty.tsx");
  const css = src("../../components/slot/zlaty.css");
  const files = ["sim-closed", "sim-carrier", "sim-chip", "sim-chip-back", "teaser-sim", "card-kontrola", "card-zbox", "card-koleso", "result-frame"];
  it("every layer is a WebP with alpha in public/zlaty/", () => {
    for (const f of files) {
      const b = readFileSync(new URL(`../../../public/zlaty/${f}.webp`, import.meta.url));
      assert.equal(b.subarray(0, 4).toString(), "RIFF", f);
      assert.equal(b.subarray(8, 12).toString(), "WEBP", f);
      // lossy + alpha → VP8X chunk with the alpha flag (bit 4)
      assert.equal(b.subarray(12, 16).toString(), "VP8X", f);
      assert.ok(b[20] & 0x10, `${f} has alpha`);
      assert.match(ui, new RegExp(`"/zlaty/${f}\\.webp"`), `${f} referenced by literal URL`);
    }
  });
  it("closed card, empty carrier and chip (front + 100× back) are separate layers; stages crack → snap → flip → card", () => {
    for (const k of ["is-carrier", "is-closed", "zl-chip-flip", "is-back", "zl-cracks", "zl-hole-glow", "zl-beam"]) assert.ok(ui.includes(k), k);
    for (const st of [".st-1 .zl-cracks", ".st-2 .zl-chip", ".st-3 .zl-chip-flip", ".st-4 .zl-card", ".st-2 .is-closed"]) assert.ok(css.includes(st), st);
    assert.match(ui, /sfx\.playGoldCrack\(\)/);
  });
  it("UI says ZLATÁ SIM (no obálka); card names stay", () => {
    assert.match(ui, /ZLATÁ SIM/);
    assert.doesNotMatch(ui, /obálk/i);
    for (const m of ["kontrola", "zbox", "koleso"] as const) assert.ok(["ZLATÁ POKUTA", "ZLATÝ KURIÉR", "ZLATÉ VÝSEKY"].includes(ZLATY_CARDS[m].title));
  });
  it("reduced motion: jumps straight to the open SIM + card, nothing animates", () => {
    assert.match(ui, /useState<SimStage>\(reduced \? 4 : 0\)/);
    assert.match(css, /\.zl-reveal\.is-reduced \*[^{]*\{ animation: none !important; transition: none !important; \}/);
    assert.match(css, /prefers-reduced-motion: reduce[\s\S]*\.zl-reveal \.zl-beam/);
  });
});

describe("golden SIM recharges until a golden bonus pays", () => {
  it("a 0 golden run keeps today's gold waiting; a paying one spends it", async () => {
    const { emptyZlaty, claimGold, goldWaiting, settleGold } = await import("./zlaty.ts");
    const day = "2026-10-15";
    let z = claimGold(emptyZlaty(), day);
    assert.equal(goldWaiting(z, day), false);
    const zero = settleGold(z, { mode: "kontrola", x: 0, cash: 0, extra: 0, day });
    assert.equal(zero.recharged, true);
    assert.equal(goldWaiting(zero.z, day), true);
    assert.equal(zero.z.played, 0);
    z = claimGold(zero.z, day);
    const paid = settleGold(z, { mode: "zbox", x: 3, cash: 3, extra: 1, day });
    assert.equal(paid.recharged, false);
    assert.equal(goldWaiting(paid.z, day), false);
    assert.equal(paid.z.played, 1);
    assert.equal(goldWaiting(paid.z, "2026-10-16"), true);
  });
});

describe("one-time golden refund for 2026-10-15", () => {
  it("re-arms gold spent that day once; other days untouched", async () => {
    const { emptyZlaty, claimGold, goldWaiting, refundGold, sanitizeZlaty } = await import("./zlaty.ts");
    const z = claimGold(emptyZlaty(), "2026-10-15");
    const r = refundGold(z, "2026-10-15");
    assert.equal(goldWaiting(r, "2026-10-15"), true);
    const again = refundGold(sanitizeZlaty(JSON.parse(JSON.stringify(claimGold(r, "2026-10-15")))), "2026-10-15");
    assert.equal(goldWaiting(again, "2026-10-15"), false);
    assert.equal(refundGold(claimGold(emptyZlaty(), "2026-10-16"), "2026-10-16").refundDay, undefined);
  });
});

describe("gold recharge chain (refund → 0 → recharge → 0 → … → paid)", () => {
  it("every 0 run recharges, whatever armed the gold; a paid run spends it", async () => {
    const { emptyZlaty, claimGold, goldWaiting, settleGold, refundGold, reviveGold, sanitizeZlaty } = await import("./zlaty.ts");
    const day = "2026-10-15";
    const save = (z: unknown) => sanitizeZlaty(JSON.parse(JSON.stringify(z)));
    let z = settleGold(claimGold(emptyZlaty(), day), { mode: "zbox", x: 2, cash: 2, extra: 1, day }).z;
    assert.equal(goldWaiting(z, day), false);
    z = save(refundGold(z, day));
    assert.equal(goldWaiting(z, day), true);
    for (const mode of ["kontrola", "zbox", "koleso"] as const) {
      z = save(claimGold(z, day));
      const r = settleGold(z, { mode, x: 0, cash: 0, extra: 0, day });
      assert.equal(r.recharged, true);
      z = save(reviveGold(r.z, day));
      assert.equal(goldWaiting(z, day), true, mode);
    }
    z = save(settleGold(save(claimGold(z, day)), { mode: "kontrola", x: 5, cash: 5, extra: 4, day }).z);
    assert.equal(goldWaiting(save(reviveGold(z, day)), day), false);
  });
  it("gold claimed but never settled (closed mid-bonus) is armed again on load", async () => {
    const { emptyZlaty, claimGold, goldWaiting, reviveGold } = await import("./zlaty.ts");
    const day = "2026-10-16";
    const z = claimGold(emptyZlaty(), day);
    assert.equal(goldWaiting(reviveGold(z, day), day), true);
  });
  it("15.10 second re-arm: a save that spent gold today (0 not detectable) gets it once more", async () => {
    const { emptyZlaty, claimGold, goldWaiting, reviveGold, recordGold } = await import("./zlaty.ts");
    const day = "2026-10-15";
    const old = { ...recordGold(claimGold(emptyZlaty(), day), { mode: "zbox", x: 0, cash: 0, extra: 0, day }), refundDay: day, openDay: undefined };
    const once = reviveGold(old, day);
    assert.equal(goldWaiting(once, day), true);
    assert.equal(goldWaiting(reviveGold(claimGold(once, day), day), day), true, "still open → armed");
  });
});
