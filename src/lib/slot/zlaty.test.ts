import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
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
  abortGold,
  claimGold,
  emptyZlaty,
  goldBoard,
  goldCash,
  goldOnLoad,
  goldWaiting,
  goldenWin,
  kontrolaRegularX,
  noteStake,
  recordGold,
  refund3Gold,
  sanitizeZlaty,
  settleGold,
  stampRefund3,
  usualStake,
  zlatyEnabled,
} from "./zlaty.ts";
import { CHANGELOG } from "./changelog.ts";
import { MIRROR_BRIDGE_KEY } from "./mirror-bridge.ts";
import { flushMirrorPush, pullMirrorSave, resetMirrorSession, scheduleMirrorPush, setMirrorFetch } from "./mirror-cloud.ts";

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
    assert.match(hook, /goldOnLoad\(s\.zlaty, Boolean\(s\.bonusPending\?\.gold\), braDay\(serverNow\(\)\)\)/);
    assert.match(hook, /stampRefund3\(save, braDay\(serverNow\(\)\)\)/);
    assert.match(hook, /hit: goldPickedRef\.current/);
    assert.equal((hook.match(/settleGold\(/g) ?? []).length, 1, "one settle path for spin, tumble, auto, turbo and tickets");
    assert.equal((hook.match(/abortGold\(/g) ?? []).length, 3, "duel, discarded bar, crash");
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

describe("golden win is the uplift, not the ordinary bonus cash", () => {
  const day = "2026-10-16";

  /** One KONTROLA pick list priced the way the hook prices it. `hit` is whether ZLATÁ POKUTA was tapped. */
  function priced(hit: boolean, payX: number[]) {
    const tiles = goldBoard(dealPickBoard(() => 0), 0, 0, ZLATA_POKUTA_X.kredit);
    const gold = tiles.find((t) => t.kind === "zlata");
    assert.ok(gold);
    const goldX = +payX.reduce((s, x) => s + x, 0).toFixed(4);
    const regX = kontrolaRegularX(
      tiles,
      tiles.map((t) => t.kind === "zlata" && hit),
      false,
      goldX,
    );
    const bet = 2;
    const cash = goldCash(Math.min(ZLATY_CAP_X, goldX), regX, bet, bet);
    const regular = +(regX * bet).toFixed(2);
    return { x: goldX, cash, extra: +(cash - regular).toFixed(2), hit, day, mode: "kontrola" as const };
  }

  it("a missed ZLATÁ POKUTA recharges even when other tickets paid", () => {
    const miss = priced(false, [2, 0.5]);
    assert.ok(miss.cash > 0, "ordinary tickets still pay");
    assert.equal(miss.extra, 0);
    assert.equal(goldenWin(miss), false);
    let z = claimGold(emptyZlaty(), day);
    assert.equal(goldWaiting(z, day), false);
    const settled = settleGold(z, miss);
    assert.equal(settled.recharged, true);
    assert.equal(settled.z.played, 0);
    assert.equal(goldWaiting(settled.z, day), true);
    const caught = priced(true, [ZLATA_POKUTA_X.kredit]);
    assert.ok(caught.extra > 0);
    assert.equal(goldenWin(caught), true);
    z = settleGold(claimGold(settled.z, day), caught).z;
    assert.equal(goldWaiting(z, day), false);
    assert.equal(z.played, 1);
  });

  it("zero-outcome recharge loop stays armed until a golden win", () => {
    let z = emptyZlaty();
    for (const mode of ["kontrola", "zbox", "koleso"] as const) {
      z = claimGold(z, day);
      const zero = settleGold(z, { mode, x: 0, cash: 0, extra: 0, day, hit: false });
      assert.equal(zero.recharged, true, mode);
      z = sanitizeZlaty(JSON.parse(JSON.stringify(zero.z)));
      assert.equal(goldWaiting(z, day), true, mode);
      assert.equal(z.played, 0);
      assert.equal(z.openDay, undefined);
    }
    // Ordinary cash with no golden uplift is the same loop, not a spend.
    z = claimGold(z, day);
    z = settleGold(z, { mode: "zbox", x: 4, cash: 8, extra: 0, day }).z;
    assert.equal(goldWaiting(z, day), true);
    z = settleGold(claimGold(z, day), { mode: "koleso", x: 6, cash: 12, extra: 3, day }).z;
    assert.equal(goldWaiting(z, day), false);
    assert.equal(z.played, 1);
    assert.equal(z.byMode.koleso.n, 1);
  });

  it("reload mid-bonus does not spend the day", () => {
    const claimed = claimGold(emptyZlaty(), day);
    // KONTROLA clears the pending row when the map opens. A reload arms the SIM again.
    const kont = goldOnLoad(sanitizeZlaty(JSON.parse(JSON.stringify(claimed))), false, day);
    assert.equal(goldWaiting(kont, day), true);
    assert.equal(kont.played, 0);
    assert.equal(kont.openDay, undefined);
    // Ž-BOX / KOLESO keep the pending gold, so the same run replays and is not a finished spend.
    const saved = sanitizePlayerSave({
      ...emptyPlayerSave(),
      zlaty: claimed,
      bonusPending: { mode: "zbox", bet: 1, mod: null, modLeft: 0, at: 1, seed: 3, gold: { day, stake: 1 } },
    });
    const mid = goldOnLoad(saved.zlaty, Boolean(saved.bonusPending?.gold), day);
    assert.equal(mid.openDay, day);
    assert.equal(mid.played, 0);
    assert.equal(goldWaiting(mid, day), false);
    const after = settleGold(mid, { mode: "zbox", x: 0, cash: 0, extra: 0, day });
    assert.equal(after.recharged, true);
    const round = sanitizeZlaty(JSON.parse(JSON.stringify(after.z)));
    assert.equal(goldWaiting(goldOnLoad(round, false, day), day), true);
  });

  it("autospin, turbo and a discarded bar do not spend gold before a golden win", () => {
    const hook = src("../../hooks/use-slot-game.ts");
    const show = hook.slice(hook.indexOf("const showGoldResult"), hook.indexOf("const finishGoldResult"));
    assert.match(show, /settleGold\(/);
    const settleAt = show.indexOf("settleGold(");
    const waitAt = show.indexOf("await new Promise");
    assert.ok(settleAt >= 0 && waitAt > settleAt, "the day is saved before the result card, so turbo and autospin cannot skip it");
    assert.match(hook, /autoRef\.current && autoHaltRef/);
    // Autospin starts the next spin only after playRound clears busy, which is after the awaited bonus.
    const play = hook.indexOf("const r = await runSequence");
    const bonus = hook.indexOf("await runBonus()", play);
    const cleared = hook.indexOf("busyRef.current = false", bonus);
    assert.ok(play > 0 && bonus > play && cleared > bonus);
    let z = emptyZlaty();
    // Three auto spins: two golden bonuses end with nothing, the third catches the win.
    for (let i = 0; i < 2; i++) {
      z = settleGold(claimGold(z, day), { mode: "kontrola", x: 1, cash: 2, extra: 0, day, hit: false }).z;
      assert.equal(goldWaiting(z, day), true, `auto ${i}`);
    }
    z = settleGold(claimGold(z, day), { mode: "kontrola", x: 8, cash: 16, extra: 12, day, hit: true }).z;
    assert.equal(z.played, 1);
    assert.equal(goldWaiting(z, day), false);
    // Max win, duel or a crash drops the reserved run. The SIM is armed in the same session, not only after a reload.
    const dropped = abortGold(claimGold(emptyZlaty(), day), day);
    assert.equal(goldWaiting(dropped, day), true);
    assert.equal(dropped.played, 0);
    assert.equal(dropped.openDay, undefined);
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

describe("one-time golden refund for 16. 10. and 17. 10.", () => {
  afterEach(() => {
    setMirrorFetch(null);
    resetMirrorSession();
  });

  it("Zmeny says the golden bonus was returned", () => {
    assert.ok(CHANGELOG.some((n) => n.day === "2026-10-16" && n.text.startsWith("Zlatý bonus vrátený")));
  });

  it("re-arms once when usedDay is 15. or 16. and the load day is 16. or 17.", () => {
    for (const today of ["2026-10-16", "2026-10-17"]) {
      for (const used of ["2026-10-15", "2026-10-16"]) {
        const spent = { ...claimGold(emptyZlaty(), used), openDay: used, teasedDay: used };
        const back = refund3Gold(spent, today);
        assert.equal(back.usedDay, "", `${today} ${used}`);
        assert.equal(back.openDay, undefined);
        assert.equal(back.teasedDay, "");
        assert.equal(back.refund3Day, today);
        assert.equal(goldWaiting(back, today), true);
        const again = claimGold(back, used);
        assert.equal(refund3Gold(again, today), again, "flag blocks a second refund");
        assert.equal(goldWaiting(again, used), false);
      }
    }
    assert.equal(refund3Gold(claimGold(emptyZlaty(), "2026-10-14"), "2026-10-16").refund3Day, undefined);
    assert.equal(refund3Gold(claimGold(emptyZlaty(), "2026-10-16"), "2026-10-18").refund3Day, undefined);
    const kept = sanitizeZlaty(JSON.parse(JSON.stringify(refund3Gold(claimGold(emptyZlaty(), "2026-10-16"), "2026-10-16"))));
    assert.equal(kept.refund3Day, "2026-10-16");
    assert.equal(kept.usedDay, "");
  });

  it("load path clears a spent 16. 10. and leaves a pending golden run to finish", () => {
    const back = goldOnLoad(claimGold(emptyZlaty(), "2026-10-16"), false, "2026-10-16");
    assert.equal(back.usedDay, "");
    assert.equal(back.openDay, undefined);
    assert.equal(back.refund3Day, "2026-10-16");
    const pending = goldOnLoad(claimGold(emptyZlaty(), "2026-10-16"), true, "2026-10-16");
    assert.equal(pending.usedDay, "2026-10-16");
    assert.equal(pending.refund3Day, undefined);
  });

  it("bumps updatedAt so an older mirror copy cannot restore the spent day", () => {
    const spent = {
      ...emptyPlayerSave(),
      playerId: "player-1234",
      updatedAt: 500,
      zlaty: claimGold(emptyZlaty(), "2026-10-16"),
    };
    const same = stampRefund3(spent, "2026-10-18", 9_000);
    assert.equal(same, spent);
    const stamped = stampRefund3(spent, "2026-10-16", 400);
    assert.notEqual(stamped, spent);
    assert.equal(stamped.updatedAt, 501);
    assert.equal(stamped.zlaty?.usedDay, "");
    assert.equal(stamped.zlaty?.refund3Day, "2026-10-16");
    assert.ok(stamped.updatedAt > spent.updatedAt);
    const ahead = stampRefund3({ ...spent, updatedAt: 8_000 }, "2026-10-17", 100);
    assert.equal(ahead.updatedAt, 8_001);
    const mid = stampRefund3(
      { ...spent, bonusPending: { mode: "zbox" as const, bet: 1, mod: null, modLeft: 0, at: 1, gold: { day: "2026-10-16", stake: 1 } } },
      "2026-10-16",
      9_000,
    );
    assert.equal(mid.updatedAt, 500);
    assert.equal(mid.zlaty?.usedDay, "2026-10-16");
  });

  it("mocked mirror stores the refund and does not hand back the spent copy", async () => {
    const ls = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (k: string) => (ls.has(k) ? (ls.get(k) as string) : null),
        setItem: (k: string, v: string) => ls.set(k, String(v)),
        removeItem: (k: string) => ls.delete(k),
        key: (i: number) => [...ls.keys()][i] ?? null,
        get length() {
          return ls.size;
        },
      },
      configurable: true,
    });
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    let key = "";
    for (const b of bytes) key += String.fromCharCode(b);
    ls.set(MIRROR_BRIDGE_KEY, btoa(key));
    const store = new Map<string, string>();
    const urls: string[] = [];
    setMirrorFetch(async (url, init) => {
      urls.push(String(url));
      const body = JSON.parse(String(init?.body)) as { p_id?: string; p_blob?: string };
      const name = String(url).includes("mirror_put") ? "put" : "get";
      if (name === "put") {
        store.set(body.p_id || "", body.p_blob || "");
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify(store.get(body.p_id || "") ?? null), { status: 200 });
    });
    const spent = {
      ...emptyPlayerSave(),
      playerId: "player-1234",
      updatedAt: 500,
      zlaty: claimGold(emptyZlaty(), "2026-10-16"),
    };
    assert.equal(await pullMirrorSave(spent), null);
    scheduleMirrorPush(spent);
    flushMirrorPush();
    await new Promise((r) => setTimeout(r, 20));
    resetMirrorSession();
    const local = { ...spent, updatedAt: 100 };
    const remote = await pullMirrorSave(local);
    assert.equal(remote?.zlaty?.usedDay, "2026-10-16");
    assert.equal(remote?.updatedAt, 500);
    const stamped = stampRefund3(remote ?? spent, "2026-10-16", 9_000);
    assert.equal(stamped.zlaty?.usedDay, "");
    assert.equal(stamped.zlaty?.openDay, undefined);
    assert.ok(stamped.updatedAt > 500);
    scheduleMirrorPush(stamped);
    flushMirrorPush();
    await new Promise((r) => setTimeout(r, 20));
    resetMirrorSession();
    const back = await pullMirrorSave({ ...spent, updatedAt: 500 });
    assert.equal(back?.zlaty?.usedDay, "");
    assert.equal(back?.zlaty?.refund3Day, "2026-10-16");
    assert.equal(back?.updatedAt, stamped.updatedAt);
    assert.ok(urls.length > 0);
    assert.ok(urls.every((u) => u.includes("/rest/v1/rpc/mirror_")));
  });
});
