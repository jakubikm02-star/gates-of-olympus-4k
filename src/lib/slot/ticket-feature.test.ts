import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRng } from "./engine.ts";
import {
  FEATURE_TEMPLATE_IDS,
  JOB_RANGES,
  dealFeature,
  dealJobs,
  dealOtrs,
  featureOf,
  jobClock,
  jobMeter,
  jobStatus,
  tickJob,
  type BonusResult,
  type JobCard,
  type JobEvent,
  type JobFloor,
} from "./spend.ts";
import { ticketBonus } from "./ticket-bonus.ts";
import { sanitizePlayerSave } from "./player-save.ts";
import { makeStream } from "../../../scripts/feature-sim/stream.ts";
import { playTicket } from "../../../scripts/feature-sim/play.ts";

const FLOORS: JobFloor[] = ["lacna", "stred", "draha"];
const base: JobEvent = { win: false, dead: true, tumbles: 0, live: false, ticket: null, pdf: false, signal: 0, clusters: 0, orbs: false };
const spin = (o: Partial<JobEvent> = {}): JobEvent => ({ ...base, ...o });
const bonus = (b: Partial<BonusResult> & { mode: BonusResult["mode"] }): JobEvent =>
  spin({ spun: false, dead: false, bonus: { x: 0, safes: 0, cleared: false, canSum: 0, rounds: 0, ...b } });
const card = (id: string, floor: JobFloor = "stred", seed = 1): JobCard => dealFeature(id, floor, createRng(seed), 5000, 1);
const withNeed = (j: JobCard, need: number, limit = j.limit): JobCard => ({ ...j, need, limit });

describe("feature tickets: generator", () => {
  it("every template × floor deals inside its ranges, steps of 5, ≤ 400 spins, Slovak goal + marker tag", () => {
    const rng = createRng(3);
    for (const id of FEATURE_TEMPLATE_IDS) {
      for (const floor of FLOORS) {
        const r = JOB_RANGES[id][floor];
        for (let k = 0; k < 40; k++) {
          const j = dealFeature(id, floor, rng, 5000, 1);
          assert.ok(j.need >= r.need[0] && j.need <= r.need[1], `${id} ${floor} need ${j.need}`);
          assert.ok(j.limit >= r.window[0] && j.limit <= r.window[1], `${id} ${floor} limit ${j.limit}`);
          assert.equal(j.limit % 5, 0);
          assert.ok(j.limit <= 400);
          assert.ok(j.payout > j.stake, "pays more than the stake");
          const tag = { zasah: "ZÁSAH", kontrola: "KONTROLA", zbox: "Ž-BOX", bar: "BONUS BAR" }[featureOf(id)!];
          assert.ok(j.detail.endsWith(`· ${tag}`), j.detail);
          assert.match(j.goal ?? "", /ZÁSAH|KONTROL|Ž-BOX|baru/);
        }
      }
    }
  });

  it("Slovak plurals in goals", () => {
    assert.match(withGoal("listky", 2), /^2 lístky v jednej KONTROLE$/);
    assert.match(withGoal("zasielky", 5), /^5 zásielok v jednom Ž-BOXE$/);
    assert.match(withGoal("okna", 4), /^4 kolá v jednom Ž-BOXE$/);
    assert.match(withGoal("hack", 4), /únik BEZ DANE/);
  });

  it("dealJobs: a feature card in about half of the deals, at most one, priplatok only on drahá; OTRS never", () => {
    const rng = createRng(77);
    let withFeat = 0;
    const seen = new Set<string>();
    const n = 3000;
    for (let i = 0; i < n; i++) {
      const jobs = dealJobs(rng, 5000, 1);
      const three = jobs.slice(0, 3).filter((j) => featureOf(j.template));
      assert.ok(three.length <= 1);
      if (three.length) withFeat++;
      for (const j of jobs) {
        if (!featureOf(j.template)) continue;
        seen.add(j.template);
        if (j.template === "priplatok") assert.equal(j.floor, "draha");
      }
      const o = dealOtrs(rng, 5000, 1);
      assert.equal(featureOf(o.template), null);
      assert.equal(featureOf(o.templateB), null);
    }
    assert.ok(withFeat / n > 0.45 && withFeat / n < 0.55, `${withFeat / n}`);
    assert.deepEqual([...seen].sort(), [...FEATURE_TEMPLATE_IDS].sort());
  });
});

function withGoal(id: string, need: number): string {
  for (let s = 1; s < 400; s++) {
    for (const f of FLOORS) {
      const j = card(id, f, s);
      if (j.need === need) return j.goal ?? "";
    }
  }
  return "";
}

describe("feature tickets: progress", () => {
  it("ZÁSAH starts count, spins only base spins (ZÁSAH spins yes, 4KA TV no)", () => {
    let j = withNeed(card("zasah"), 2, 10);
    j = tickJob(j, spin({ chasing: true, chaseStart: true, chaseHits: 0, chaseX: 0 }));
    assert.equal(j.have, 1);
    assert.equal(j.spun, 1);
    j = tickJob(j, spin({ liveSpin: true }));
    assert.equal(j.spun, 1, "4KA TV spin spends nothing");
    j = tickJob(j, spin({ chasing: true }));
    assert.equal(j.spun, 2);
    j = tickJob(j, spin({ chaseStart: true, chasing: true }));
    assert.equal(jobStatus(j), "ok");
  });

  it("HACK and ZÁSAH win count inside one ZÁSAH (running best)", () => {
    let h = withNeed(card("hack"), 3, 30);
    h = tickJob(h, spin({ chasing: true, chaseStart: true, chaseHits: 1 }));
    h = tickJob(h, spin({ chasing: true, chaseHits: 2, chaseOver: true }));
    assert.equal(h.have, 2);
    h = tickJob(h, spin({ chasing: true, chaseStart: true, chaseHits: 1 }));
    assert.equal(h.have, 2, "a new ZÁSAH does not lower the best");
    h = tickJob(h, spin({ chasing: true, chaseHits: 3 }));
    assert.equal(jobStatus(h), "ok");
    let l = withNeed(card("lup"), 5, 30);
    l = tickJob(l, spin({ chasing: true, chaseStart: true, chaseX: 4.99, win: true }));
    assert.equal(l.have, 4);
    assert.equal(jobMeter(l), "4×/5×");
    l = tickJob(l, spin({ chasing: true, chaseX: 5.2, win: true }));
    assert.equal(jobStatus(l), "ok");
    // a non-ZÁSAH win never counts
    const l2 = tickJob(withNeed(card("lup"), 5, 30), spin({ win: true, cash: 50 }));
    assert.equal(l2.have, 0);
  });

  it("bar points add up, bar bonuses count, mode-specific goals ignore the other mode", () => {
    let k = withNeed(card("kvota"), 40, 20);
    for (let i = 0; i < 5; i++) k = tickJob(k, spin({ pityAdd: 2 }));
    k = tickJob(k, spin({ pityAdd: 30 }));
    assert.equal(k.have, 40);
    assert.equal(jobStatus(k), "ok");
    let u = withNeed(card("urad"), 2, 50);
    u = tickJob(u, bonus({ mode: "zbox", x: 1 }));
    u = tickJob(u, bonus({ mode: "kontrola", x: 0 }));
    assert.equal(jobStatus(u), "ok", "any mode, even a zero KONTROLA");
    assert.equal(u.spun, 0, "the bonus spends no spin");
    let ls = withNeed(card("listky"), 3, 50);
    ls = tickJob(ls, bonus({ mode: "zbox", safes: 9 }));
    assert.equal(ls.have, 0, "Ž-BOX parcels are no KONTROLA pins");
    ls = tickJob(ls, bonus({ mode: "kontrola", safes: 3, x: 2.5 }));
    assert.equal(jobStatus(ls), "ok");
    let z = withNeed(card("zasielky"), 5, 50);
    z = tickJob(z, bonus({ mode: "kontrola", safes: 8 }));
    assert.equal(z.have, 0);
    z = tickJob(z, bonus({ mode: "zbox", safes: 5 }));
    assert.equal(jobStatus(z), "ok");
    let p = withNeed(card("priplatok", "draha"), 2, 50);
    assert.equal(jobMeter(p), "–/×2");
    p = tickJob(p, bonus({ mode: "zbox", canSum: 3 }));
    assert.equal(jobStatus(p), "ok");
    let o = withNeed(card("okna"), 6, 50);
    o = tickJob(o, bonus({ mode: "zbox", rounds: 5 }));
    assert.equal(o.have, 5);
    let w = withNeed(card("uradvyhra"), 4, 50);
    w = tickJob(w, bonus({ mode: "zbox", x: 4.0 }));
    assert.equal(jobStatus(w), "ok");
    let pk = withNeed(card("pokuta"), 3, 50);
    pk = tickJob(pk, bonus({ mode: "zbox", x: 9 }));
    assert.equal(pk.have, 0);
  });

  it("a bonus armed on the last spin is still played (seal), then the ticket resolves", () => {
    let u = withNeed(card("listky"), 2, 2);
    u = tickJob(u, spin());
    u = tickJob(u, spin({ pityAdd: 2, bonusArmed: true }));
    assert.equal(jobStatus(u), "run");
    assert.equal(u.seal, true);
    assert.equal(jobClock(u), "ČAKÁ NA BONUS");
    const ok = tickJob(u, bonus({ mode: "kontrola", safes: 2 }));
    assert.equal(jobStatus(ok), "ok");
    const fail = tickJob(u, bonus({ mode: "zbox", safes: 7 }));
    assert.equal(jobStatus(fail), "fail");
    // last spin without a bonus: fails right away
    let v = withNeed(card("listky"), 2, 1);
    v = tickJob(v, spin());
    assert.equal(jobStatus(v), "fail");
  });

  it("a ZÁSAH running at the last spin is played out (seal), not cut off", () => {
    let h = withNeed(card("hack"), 4, 1);
    h = tickJob(h, spin({ chasing: true, chaseStart: true, chaseHits: 1 }));
    assert.equal(jobStatus(h), "run");
    assert.equal(jobClock(h), "ČAKÁ NA KONIEC ZÁSAHU");
    h = tickJob(h, spin({ chasing: true, chaseHits: 3 }));
    assert.equal(jobStatus(h), "run");
    const done = tickJob(h, spin({ chasing: true, chaseHits: 4, chaseOver: true }));
    assert.equal(jobStatus(done), "ok");
    const over = tickJob(h, spin({ chasing: true, chaseHits: 3, chaseOver: true }));
    assert.equal(jobStatus(over), "fail");
  });

  it("classic tickets never see a bar bonus result", () => {
    const jobs = dealJobs(createRng(5), 5000, 1).filter((j) => !featureOf(j.template));
    for (const j of jobs) assert.equal(tickJob(j, bonus({ mode: "kontrola", x: 5, safes: 4 })), j);
  });
});

describe("feature tickets: markers + save", () => {
  it("on-card marker per feature", () => {
    const want: Record<string, [string, string]> = {
      zasah: ["zasah", "ZÁSAH"],
      hack: ["zasah", "ZÁSAH"],
      kvota: ["bar", "BONUS"],
      urad: ["bar", "BONUS"],
      listky: ["kontrola", "KONTROLA"],
      zasielky: ["zbox", "Ž-BOX"],
    };
    for (const [id, [need, pill]] of Object.entries(want)) {
      const info = ticketBonus(card(id, id === "priplatok" ? "draha" : "stred"));
      assert.equal(info.need, need, id);
      assert.equal(info.pill, pill, id);
      assert.ok(info.badge.length > 4 && info.hint.length > 20);
      assert.equal(info.cta, null);
    }
  });

  it("survives the player save (window not stretched to bar points)", () => {
    const j = { ...card("kvota", "draha"), have: 33, spun: 12 };
    const s = sanitizePlayerSave({ job: j });
    assert.equal(s.job?.kind, "bar");
    assert.equal(s.job?.limit, j.limit);
    assert.equal(s.job?.need, j.need);
    assert.equal(s.job?.have, 33);
    const h = sanitizePlayerSave({ job: { ...card("hack"), seal: true } });
    assert.equal(h.job?.kind, "zasahBest");
    assert.equal(h.job?.seal, true);
  });
});

describe("feature tickets: achievable on the real engine", () => {
  it("each template clears near its floor's target (small sim; full table: scripts/feature-sim/play.ts)", () => {
    const streams = [makeStream(200_000, 31), makeStream(200_000, 32)];
    const rng = createRng(8);
    const target: Record<JobFloor, number> = { lacna: 0.766, stred: 0.593, draha: 0.396 };
    for (const id of FEATURE_TEMPLATE_IDS) {
      for (const floor of id === "priplatok" ? (["draha"] as JobFloor[]) : FLOORS) {
        let ok = 0;
        const n = 300;
        for (let t = 0; t < n; t++) {
          const s = streams[t % 2];
          const j = dealFeature(id, floor, rng, 5000, 1);
          if (jobStatus(playTicket(s, Math.floor(rng() * s.n), j).job) === "ok") ok++;
        }
        const r = ok / n;
        assert.ok(Math.abs(r - target[floor]) < 0.12, `${id} ${floor}: ${(r * 100).toFixed(1)} %`);
      }
    }
  });
});
