import { useEffect, useRef, useState } from "react";
import * as sfx from "@/lib/slot/audio";
import { focusClone } from "@/lib/revier/blastbeat";
import { linkBetween, metaOf, procBonus, STAT_NAME } from "@/lib/revier/depth";
import { FEEL, type FeelTarget } from "@/lib/revier/feel";
import {
  armWager,
  beginSpin,
  buyEquip,
  buyFifthReel,
  buyFourthReel,
  buyHeal,
  buyKeys,
  buyOffer,
  buyStamp,
  confirmDraft,
  createRun,
  dismissBanner,
  enemyPhase,
  finishPlayer,
  previewDj,
  fireSuper,
  holdReel,
  leaveShop,
  lockReel,
  nextOpenReel,
  playerUpkeep,
  removeSymbol,
  rerollShop,
  resign,
  resolveReel,
  sealSpin,
  fortifySymbol,
  makePro,
  takeFace,
  togglePick,
  trainSymbol,
  upgradeSymbol,
} from "@/lib/revier/engine";
import { symDef, symMark } from "@/lib/revier/symbols";
import type { Beat, Plan, Run, SymId } from "@/lib/revier/types";
import type { Cue, FightHandle, FightSnap, WinSnap } from "@/nocna/fight-types";

export type Stage = "bench" | "draft" | "banner" | "ready" | "spin" | "preview" | "act" | "enemy" | "shop" | "dead";

export interface WinView extends WinSnap {
  sym: SymId | null;
}

type SpinBag = NonNullable<ReturnType<typeof beginSpin>>;

function snd(play: () => void) {
  try {
    play();
  } catch {
    /* audio is optional */
  }
}

function beatChip(beat: Beat): string {
  if (beat.text.startsWith("Činel") || beat.text.startsWith("Ventil") || beat.text.startsWith("Kapela") || beat.text.startsWith("Charizma") || beat.text.startsWith("Druhý") || beat.text.startsWith("Prijmi")) return beat.text;
  if (beat.t === "whiff") return "MINUTIE";
  if (beat.t === "stun") return "✦";
  if (beat.t === "heal") return `+${beat.amount}`;
  if (beat.t === "steal") return beat.amount > 0 ? `−${beat.amount}` : "0";
  if (beat.t === "block") return `🛡${beat.blocked || beat.amount}`;
  return `−${beat.amount}`;
}

function intentMark(intent: { kind: string; amount: number; turns?: number } | undefined): string {
  if (!intent) return "";
  if (intent.kind === "shield" || intent.kind === "heal") return `+${intent.amount}`;
  if (intent.kind === "steal") return String(intent.turns ?? 2);
  if (intent.kind === "double") return `${intent.amount}×2`;
  return String(intent.amount);
}

function turnLabel(stage: Stage, call: string) {
  if (stage === "enemy") return "ŤAH NEPRIATEĽA";
  if (stage === "spin") return "TOČÍ SA";
  if (stage === "shop") return "OBCHOD";
  if (stage === "dead") return "KONIEC";
  if (stage === "draft") return "VÝBER";
  return call ? `TVOJ ŤAH · ${call}` : "TVOJ ŤAH";
}

function buttonLabel(stage: Stage, picks: number) {
  if (stage === "bench") return "VÝBER SYMBOLOV";
  if (stage === "draft") return picks === 6 ? "NASTÚPIŤ" : `${picks}/6`;
  if (stage === "dead") return "NOVÁ SMENA";
  if (stage === "ready") return "ZATOČ";
  if (stage === "spin") return "STOP";
  return "ĎALEJ";
}

function couldSuspense(spin: SpinBag["spin"], enemy: Run["enemy"]): boolean {
  if (spin.index.filter((n) => n == null).length !== 1) return false;
  const counts = new Map<string, number>();
  const families = new Map<string, number>();
  let dmg = 0;
  spin.strips.forEach((strip, i) => {
    if (spin.index[i] == null) return;
    const sym = strip[spin.index[i] ?? 0];
    if (!sym || sym === "medzera") return;
    counts.set(sym, (counts.get(sym) ?? 0) + 1);
    const fam = metaOf(sym)?.family;
    if (fam) families.set(fam, (families.get(fam) ?? 0) + 1);
    dmg += symDef(sym)?.dmg ?? 0;
  });
  if ([...counts.values()].some((n) => n >= 2)) return true;
  if ([...families.values()].some((n) => n >= 2)) return true;
  return Boolean(enemy && dmg + 12 >= enemy.hp + enemy.shield);
}

function targetOf(sym: SymId): FeelTarget {
  return symDef(sym)?.aim ?? (sym === "stit" || sym === "parkvolt" || sym === "natural" ? "you" : sym === "konektor" ? "coin" : "foe");
}

/**
 * Turn machine. Nothing advances unless the player taps.
 * Pixi plays one symbol beat at a time; this hook only commits rules.
 */
export function useRevier(opts: { entry: number; onRecord: (run: Run) => void; onExit: () => void; meta?: Run["meta"]; loadout?: SymId[] }) {
  const [run, setRun] = useState<Run>(() => createRun((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0, opts.entry));
  const runRef = useRef(run);
  const stageRef = useRef<Stage>("bench");
  const [stage, setStage] = useState<Stage>("bench");
  const [windows, setWindows] = useState<WinView[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [bubble, setBubble] = useState<{ title: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [rychlo, setRychlo] = useState(false);
  const [shake, setShake] = useState(1);
  const [calm, setCalm] = useState(reduced);
  const [suspense, setSuspense] = useState(false);
  const [foeSpin, setFoeSpin] = useState(true);
  const rychloRef = useRef(false);
  rychloRef.current = rychlo;
  const planRef = useRef<Plan | null>(null);
  const spinRef = useRef<SpinBag | null>(null);
  const fight = useRef<FightHandle | null>(null);
  const pressRef = useRef<() => void>(() => {});
  const noted = useRef(false);
  const startShiftRef = useRef<() => void>(() => {});
  const hints = useRef({ spin: false, stop: false, atk: false });
  const onRecord = useRef(opts.onRecord);
  const onExit = useRef(opts.onExit);
  onRecord.current = opts.onRecord;
  onExit.current = opts.onExit;

  const commit = (next: Run) => {
    runRef.current = next;
    setRun(next);
  };
  const go = (next: Stage) => {
    stageRef.current = next;
    setStage(next);
  };

  useEffect(() => {
    if (run.phase !== "dead" || noted.current) return;
    noted.current = true;
    onRecord.current(run);
  }, [run]);

  const foeRoll = run.enemy?.roll ?? 0;
  const foeId = run.enemy?.id ?? "";
  useEffect(() => {
    if (!foeId) return;
    setFoeSpin(true);
    if (new URLSearchParams(window.location.search).has("reel")) return;
    const stop = window.setTimeout(() => setFoeSpin(false), reduced ? 80 : 1600);
    return () => window.clearTimeout(stop);
  }, [foeRoll, foeId, reduced]);

  const emptyWins = (n: number): WinView[] =>
    Array.from({ length: n }, () => ({ sym: null, mode: "empty" as const, crit: false, token: 0, chip: "" }));

  const showHint = (key: "spin" | "stop" | "atk", text: string) => {
    if (hints.current[key] || runRef.current.stats.fights > 1) return;
    hints.current[key] = true;
    setHint(text);
  };

  const openShop = (next: Run) => {
    commit(next);
    const offers = next.shop?.offers ?? [];
    setWindows(
      offers.map((o) => ({
        sym: o.sym,
        mode: "sit" as const,
        crit: false,
        token: 1,
        chip: String(o.price),
      })),
    );
    go("shop");
  };

  const enterReady = (next: Run) => {
    commit(next);
    setWindows(emptyWins(next.reels));
    setActive(null);
    planRef.current = null;
    go("ready");
    if (next.enemy?.boss && next.fightTurns === 0) setHint(next.enemy.taunt);
    else showHint("spin", "Ťukni ZATOČ.");
  };

  const spin = () => {
    if (stageRef.current !== "ready" || busy) return;
    setBubble(null);
    const up = playerUpkeep(runRef.current);
    commit(up.run);
    if (up.run.phase === "dead") {
      go("dead");
      return;
    }
    const opened = beginSpin(up.run);
    if (!opened) return;
    commit(opened.run);
    spinRef.current = opened;
    const wins: WinView[] = opened.spin.blanks.map((blank) => ({
      sym: blank ? "medzera" : null,
      mode: blank ? "empty" : "flicker",
      crit: false,
      token: 0,
      chip: "",
    }));
    setWindows(wins);
    const reel = nextOpenReel(opened.spin);
    setActive(reel);
    go("spin");
    showHint("stop", "Potom STOP.");
    snd(() => sfx.playClick());
  };

  const stop = (reel?: number) => {
    let spinLive = spinRef.current;
    if (stageRef.current !== "spin" || !spinLive) return;
    const open = nextOpenReel(spinLive.spin);
    if (open < 0) return;
    if (!rychloRef.current && reel != null && reel !== open) return;
    let locked = spinLive.spin;
    const land = (sym: SymId, at: number) => {
      setWindows((prev) => {
        const next = prev.slice();
        const cur = next[at] ?? { sym: null, mode: "empty" as const, crit: false, token: 0, chip: "" };
        next[at] = { ...cur, sym, mode: sym === "medzera" ? "empty" : "sit", token: cur.token + 1, chip: "" };
        return next;
      });
      snd(() => sfx.playLand(at));
    };
    do {
      const at = nextOpenReel(locked);
      if (at < 0) break;
      const idx = Math.floor(Math.random() * (locked.strips[at]?.length || 1));
      locked = lockReel(locked, at, idx);
      land((locked.strips[at]?.[locked.index[at] ?? 0] ?? "medzera") as SymId, at);
      if (!rychloRef.current) break;
    } while (nextOpenReel(locked) >= 0);
    spinRef.current = { ...spinLive, spin: locked };
    const nxt = nextOpenReel(locked);
    if (nxt >= 0) {
      setActive(nxt);
      setSuspense(couldSuspense(locked, runRef.current.enemy));
      if (couldSuspense(locked, runRef.current.enemy)) snd(() => sfx.playSoftHit("drop"));
      return;
    }
    setSuspense(false);
    const sealed = sealSpin(runRef.current, locked);
    commit(sealed.run);
    planRef.current = sealed.plan;
    setWindows(
      sealed.plan.reels.map((step) => ({
        sym: step.sym,
        mode: step.sym === "medzera" ? "empty" : "sit",
        crit: step.crit,
        token: 1,
        chip: symMark(step.sym, step.crit ? sealed.plan.critMul : 1)?.chip ?? "",
      })),
    );
    setActive(null);
    go("preview");
    showHint("atk", "Potom ĎALEJ.");
    if (sealed.plan.critSym) snd(() => sfx.playWin("spark"));
  };

  const attack = async () => {
    const plan = planRef.current;
    if (stageRef.current !== "preview" || !plan || busy) return;
    setBusy(true);
    setHint(null);
    setSuspense(false);
    go("act");
    const trivial = plan.reels.every((step) => {
      const def = symDef(step.sym);
      return !step.crit && (def?.dmg ?? 0) <= 10 && !def?.stun && def?.hook !== "burst";
    });
    fight.current?.setPace(rychloRef.current || trivial ? 1.55 : 1);
    if (plan.critSym && fight.current) {
      await fight.current.playFoe(plan.critMul >= 3 ? "MEGA" : "KRIT", "hit", "foe");
    }
    for (const step of plan.reels) {
      if (runRef.current.phase === "dead") break;
      const mark = symMark(step.sym, step.crit ? plan.critMul : 1);
      const rewind = plan.rerolls.some((r) => r.reel === step.reel);
      if (rewind && fight.current) {
        await fight.current.playCue({ reel: step.reel, sym: "restart", crit: false, rewind: true, chip: "↻", target: "foe" }, () => {});
      }
      if (step.sym === "medzera" || step.sym === "restart") continue;
      const resolved = resolveReel(runRef.current, plan, step.reel);
      const foe = runRef.current.enemy;
      const rough = (symDef(step.sym)?.dmg ?? 0) * (step.crit ? plan.critMul : 1);
      const slow = Boolean(foe && (rough >= foe.hp + foe.shield || (foe.hp <= foe.maxHp * 0.5 && step.reel === plan.reels.length - 1 && rough >= foe.hp)));
      const cue: Cue = {
        reel: step.reel,
        sym: step.sym,
        crit: step.crit,
        rewind: false,
        chip: trivial && !step.crit ? "" : (mark?.chip ?? ""),
        selfChip: step.sym === "natural" ? "❤−8" : undefined,
        target: targetOf(step.sym),
        slow,
        proc: procBonus(step.sym, step.reel, runRef.current.rng) || undefined,
        chem: step.reel > 0 ? Math.max(0, linkBetween(plan.lands)[step.reel - 1] ?? 0) || undefined : undefined,
      };
      if (slow) {
        snd(() => sfx.playSoftHit("riser"));
        fight.current?.setPace(0.62);
      }
      if (fight.current) {
        await fight.current.playCue(cue, () => {
          commit(resolved.run);
          if (cue.chem || cue.proc) snd(() => sfx.playChem());
          if (!trivial || step.crit || slow) snd(() => (step.crit || slow ? sfx.playSoftHit("big") : sfx.playSoftHit("hit")));
        });
      } else {
        commit(resolved.run);
      }
      if (slow) fight.current?.setPace(rychloRef.current || trivial ? 1.55 : 1);
      if (runRef.current.hp <= 0) {
        go("dead");
        setBusy(false);
        return;
      }
    }
    const done = finishPlayer(runRef.current);
    commit(done);
    setWindows(emptyWins(done.reels));
    if (done.phase === "dead") {
      go("dead");
      setBusy(false);
      return;
    }
    if (done.phase === "shop") {
      snd(() => sfx.playCoin());
      openShop(done);
      setBusy(false);
      return;
    }
    go("enemy");
    const lands = done.enemy?.lands.slice() ?? [];
    const countdown = (done.enemy?.charge?.left ?? 0) > 1;
    const clutch = Boolean(done.enemy?.charge && done.enemy.charge.left <= 1);
    if (!countdown && lands.length && fight.current) {
      for (let i = 0; i < lands.length; i++) {
        const sym = lands[i]!;
        const mark = symMark(sym);
        if (clutch && i === 0) snd(() => sfx.playSoftHit("riser"));
        await fight.current.playCue(
          {
            reel: i,
            row: "foe",
            sym,
            crit: clutch,
            rewind: false,
            chip: "",
            target: (symDef(sym)?.dmg ?? 0) > 0 ? "you" : "foe",
            slow: clutch,
          },
          () => {},
        );
      }
    }
    const acted = enemyPhase(done);
    const lethal = acted.beats.some((beat) => beat.t === "hit" && beat.amount >= done.hp);
    for (const beat of acted.beats) {
      const kind = beat.t === "block" ? "block" : beat.t === "whiff" ? "miss" : beat.t === "heal" ? "heal" : "hit";
      if (lethal && beat.t === "hit") snd(() => sfx.playSoftHit("drop"));
      if (beat.text.startsWith("Činel") || beat.text.startsWith("Kapela")) snd(() => sfx.playCymbal());
      if (beat.text.startsWith("Ventil")) snd(() => sfx.playSoftHit("riser"));
      if (beat.text.startsWith("Charizma") || beat.text.startsWith("Prijmi")) snd(() => sfx.playDjArp());
      if (fight.current) await fight.current.playFoe(beatChip(beat), kind, beat.t === "heal" ? "foe" : "you", lethal || clutch);
      if (beat.t === "hit" || beat.t === "block") snd(() => sfx.playSoftHit(lethal || clutch ? "big" : "hit"));
    }
    commit(acted.run);
    setWindows(emptyWins(acted.run.reels));
    if (acted.run.phase === "dead") go("dead");
    else if (acted.run.phase === "shop") openShop(acted.run);
    else go("ready");
    if (acted.run.phase === "fight") showHint("spin", "Ťukni ZATOČ.");
    setBusy(false);
  };

  const skip = () => {
    if (stageRef.current === "act" || stageRef.current === "enemy") fight.current?.skip();
  };

  const confirm = () => {
    const next = confirmDraft(runRef.current);
    if (next.phase !== "banner") return;
    commit(next);
    go("banner");
  };

  const advance = () => {
    if (stageRef.current !== "banner") return;
    const opened = dismissBanner(runRef.current);
    enterReady(opened);
  };

  const leave = () => {
    if (stageRef.current !== "shop") return;
    const next = leaveShop(runRef.current);
    commit(next);
    setWindows(emptyWins(next.reels));
    if (next.phase === "banner") go("banner");
    else enterReady(next);
  };

  const snap = (): FightSnap => {
    const live = runRef.current;
    const enemy = live.enemy;
    const floor = Math.min(6, Math.max(1, live.floor));
    const kind = typeof window === "undefined" ? "port" : window.innerWidth / Math.max(1, window.innerHeight) >= 1.45 ? "land" : window.innerWidth / Math.max(1, window.innerHeight) >= 1.05 ? "fold-land" : window.innerWidth / Math.max(1, window.innerHeight) >= 0.8 ? "fold-port" : "port";
    return {
      bg: `/nocna/backgrounds/${["bg-1-parkovisko", "bg-2-podzemna-garaz", "bg-3-odtahovy-dvor", "bg-4-mestsky-urad", "bg-5-kabinet-prednostu", "bg-6-ranna-spicka"][floor - 1]}-${kind}.webp`,
      enemyArt: enemy?.art ?? null,
      ehp: enemy?.hp ?? 0,
      emax: enemy?.maxHp ?? 1,
      eshield: enemy?.shield ?? 0,
      stunned: Boolean(enemy?.stunned),
      dot: enemy?.dot?.dmg ?? 0,
      hp: Math.max(0, live.hp),
      maxHp: live.maxHp,
      shield: live.shield,
      poison: live.poison?.dmg ?? 0,
      windows,
      reduced: calm || reduced,
      intent: intentMark(enemy?.intent),
      foeArt: null,
      foeWindows: (enemy?.lands ?? []).map((sym) => ({
        sym,
        mode: foeSpin && !calm ? "flicker" : "sit",
        crit: Boolean(enemy?.charge),
        token: enemy?.roll ?? 0,
        chip: symMark(sym)?.chip ?? "",
      })),
      links: linkBetween(windows.map((win) => (win.sym ?? "medzera") as SymId)),
      foeRoll: enemy?.roll ?? 0,
      charge: enemy?.charge?.left ?? 0,
      enraged: Boolean(enemy?.enraged),
      suspense,
      danger: live.hp > 0 && live.hp / Math.max(1, live.maxHp) <= 0.25,
      call: live.call.map((id) => STAT_NAME[id]).join(" "),
      super: live.super,
      shake,
      shop: stageRef.current === "shop",
      deck: stageRef.current === "shop" ? live.deck : [],
      phase: stageRef.current,
      button: buttonLabel(stageRef.current, live.picks.length),
      pulse: stageRef.current === "ready" || stageRef.current === "preview" || stageRef.current === "shop" || stageRef.current === "banner" || stageRef.current === "bench" || stageRef.current === "dead" || (stageRef.current === "draft" && live.picks.length === 6) || stageRef.current === "spin",
      coins: live.coins,
      floor,
      turn: turnLabel(stageRef.current, live.call.map((id) => STAT_NAME[id]).join(" ")),
      hint: hint ?? "",
      active,
      bpm: live.enemy?.dj?.bpm ?? 0,
      clones: (live.enemy?.dj?.clones ?? []).map((clone) => ({
        hp: clone.hp,
        max: clone.maxHp,
        black: clone.black,
        mark: clone.mark,
        armed: clone.armed,
      })),
      fan: live.enemy?.dj?.fan ?? null,
      focus: live.enemy?.dj?.focus ?? -1,
    };
  };

  const bindFight = (stageApi: FightHandle | null) => {
    fight.current = stageApi;
    stageApi?.setHooks({
      onPress: () => pressRef.current(),
      onDeck: (i) => {
        if (stageRef.current !== "shop") return;
        const next = removeSymbol(runRef.current, i);
        if (next !== runRef.current) openShop(next);
      },
      onReel: (i) => {
        if (stageRef.current === "shop") {
          const bought = buyOffer(runRef.current, i);
          if (bought !== runRef.current) openShop(bought);
          return;
        }
        if (stageRef.current === "spin") stop(i);
        else if (stageRef.current === "preview") {
          const row = planRef.current?.reels[i];
          const mark = row ? symMark(row.sym, row.crit ? (planRef.current?.critMul ?? 1) : 1) : null;
          if (mark && row) setBubble({ title: row.sym, text: mark.detail });
        }
      },
    });
    if (stageApi) stageApi.setSnap(snap());
  };

  useEffect(() => {
    fight.current?.setSnap(snap());
  });

  useEffect(() => {
    const dj = new URLSearchParams(window.location.search).get("dj");
    if (!dj) return;
    const next = previewDj(dj, opts.entry);
    commit(next);
    setRun(next);
    setWindows(
      Array.from({ length: next.reels }, () => ({
        sym: "blocek" as SymId,
        mode: "sit" as const,
        crit: false,
        token: 1,
        chip: "⚔15",
      })),
    );
    go(dj === "shop" ? "shop" : dj === "dead" ? "dead" : dj === "bench" ? "bench" : "ready");
  }, [opts.entry]);

  const who = stage === "enemy" ? "foe" : "you";
  const primary =
    stage === "bench"
      ? { label: "VÝBER SYMBOLOV", disabled: false, pulse: true, run: () => go("draft") }
      : stage === "draft"
      ? { label: buttonLabel("draft", run.picks.length), disabled: run.picks.length !== 6, pulse: run.picks.length === 6, run: confirm }
      : stage === "dead"
        ? { label: "NOVÁ SMENA", disabled: false, pulse: true, run: () => startShiftRef.current() }
      : stage === "banner"
        ? { label: "ĎALEJ", disabled: false, pulse: true, run: advance }
        : stage === "ready"
          ? { label: "ZATOČ", disabled: false, pulse: true, run: spin }
          : stage === "spin"
            ? { label: "STOP", disabled: active == null, pulse: active != null, run: () => stop(active ?? undefined) }
            : stage === "preview"
              ? { label: "ĎALEJ", disabled: false, pulse: true, run: () => void attack() }
              : stage === "act" || stage === "enemy"
                ? { label: "ĎALEJ", disabled: false, pulse: false, run: () => fight.current?.skip() }
                : stage === "shop"
                  ? { label: "ĎALEJ", disabled: false, pulse: true, run: leave }
                  : { label: "SPÄŤ", disabled: false, pulse: true, run: () => onExit.current() };

  startShiftRef.current = () => {
    let next = createRun((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0, opts.entry);
    if (opts.meta) next = { ...next, meta: opts.meta };
    const pack = opts.loadout ?? [];
    if (pack.length === 6) {
      const confirmed = confirmDraft({ ...next, picks: pack.slice() });
      if (confirmed.phase === "banner") {
        noted.current = false;
        commit(confirmed);
        setWindows([]);
        go("banner");
        return;
      }
    }
    noted.current = false;
    commit(next);
    setWindows([]);
    go("draft");
  };
  pressRef.current = primary.run;

  return {
    run,
    stage,
    who,
    windows,
    active,
    hint,
    bubble,
    busy,
    snap,
    bindFight,
    primary,
    dismissHint: () => setHint(null),
    closeBubble: () => setBubble(null),
    openBubble: (title: string, text: string) => setBubble({ title, text }),
    focusClone: (index: number) => {
      const next = focusClone(runRef.current, index);
      if (next !== runRef.current) commit(next);
    },
    toggle: (sym: SymId) => {
      if (stageRef.current !== "draft") return;
      commit(togglePick(runRef.current, sym));
    },
    stop,
    buy: (index: number) => {
      const next = buyOffer(runRef.current, index);
      if (next !== runRef.current) openShop(next);
    },
    heal: () => openShop(buyHeal(runRef.current)),
    reroll: () => openShop(rerollShop(runRef.current)),
    remove: (index: number) => openShop(removeSymbol(runRef.current, index)),
    fourth: () => openShop(buyFourthReel(runRef.current)),
    fifth: () => openShop(buyFifthReel(runRef.current)),
    face: (index: number) => openShop(takeFace(runRef.current, index)),
    keys: () => openShop(buyKeys(runRef.current)),
    stamp: () => openShop(buyStamp(runRef.current)),
    equip: (id: "uder" | "stit") => openShop(buyEquip(runRef.current, id)),
    upgrade: (sym: SymId) => openShop(upgradeSymbol(runRef.current, sym)),
    train: (sym: SymId) => openShop(trainSymbol(runRef.current, sym)),
    pro: (sym: SymId) => openShop(makePro(runRef.current, sym)),
    fortify: (sym: SymId) => openShop(fortifySymbol(runRef.current, sym)),
    wager: () => {
      if (stageRef.current !== "ready") return;
      const next = armWager(runRef.current);
      if (next !== runRef.current) commit(next);
    },
    hold: (reel: number) => {
      if (stageRef.current !== "ready") return;
      const next = holdReel(runRef.current, reel);
      if (next !== runRef.current) commit(next);
    },
    burst: () => {
      if (stageRef.current !== "ready") return;
      const next = fireSuper(runRef.current);
      if (next === runRef.current) return;
      if (next.phase === "shop") openShop(next);
      else if (next.phase === "dead") {
        commit(next);
        go("dead");
      } else commit(next);
    },
    suspense,
    rychlo,
    setRychlo,
    shake,
    setShake,
    calm,
    setCalm,
    hurry: () => {
      fight.current?.skip();
      fight.current?.setPace(3);
    },
    giveUp: () => {
      if (stageRef.current === "draft") {
        onExit.current();
        return;
      }
      if (stageRef.current === "dead") {
        onExit.current();
        return;
      }
      commit(resign(runRef.current));
      go("dead");
    },
    holdMs: FEEL.resultHoldMs,
  };
}
