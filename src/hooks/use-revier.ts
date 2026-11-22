import { useEffect, useRef, useState } from "react";
import * as sfx from "@/lib/slot/audio";
import { FEEL, type FeelTarget } from "@/lib/revier/feel";
import {
  beginSpin,
  buyFourthReel,
  buyHeal,
  buyOffer,
  confirmDraft,
  createRun,
  dismissBanner,
  enemyPhase,
  finishPlayer,
  leaveShop,
  lockReel,
  nextOpenReel,
  playerUpkeep,
  removeSymbol,
  rerollShop,
  resign,
  resolveReel,
  sealSpin,
  togglePick,
} from "@/lib/revier/engine";
import { symMark } from "@/lib/revier/symbols";
import type { Beat, Plan, Run, SymId } from "@/lib/revier/types";
import type { Cue, FightHandle, FightSnap, WinSnap } from "@/nocna/fight-types";

export type Stage = "draft" | "banner" | "ready" | "spin" | "preview" | "act" | "enemy" | "shop" | "dead";

export interface WinView extends WinSnap {
  sym: SymId | null;
}

type LiveSpin = NonNullable<ReturnType<typeof beginSpin>>;

function snd(play: () => void) {
  try {
    play();
  } catch {
    /* audio is optional */
  }
}

function beatChip(beat: Beat): string {
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

function turnLabel(stage: Stage) {
  if (stage === "enemy") return "ŤAH NEPRIATEĽA";
  if (stage === "spin") return "TOČÍ SA";
  if (stage === "shop") return "OBCHOD";
  if (stage === "dead") return "KONIEC";
  if (stage === "draft") return "VÝBER";
  return "TVOJ ŤAH";
}

function buttonLabel(stage: Stage, picks: number) {
  if (stage === "draft") return picks === 3 ? "NASTÚPIŤ" : `${picks}/3`;
  if (stage === "ready") return "ZATOČ";
  if (stage === "spin") return "STOP";
  if (stage === "dead") return "SPÄŤ";
  return "ĎALEJ";
}

function targetOf(sym: SymId): FeelTarget {
  if (sym === "stit" || sym === "parkvolt" || sym === "natural") return "you";
  if (sym === "konektor") return "coin";
  return "foe";
}

/**
 * Turn machine. Nothing advances unless the player taps.
 * Pixi plays one symbol beat at a time; this hook only commits rules.
 */
export function useRevier(opts: { entry: number; onRecord: (run: Run) => void; onExit: () => void }) {
  const [run, setRun] = useState<Run>(() => createRun((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0, opts.entry));
  const runRef = useRef(run);
  const stageRef = useRef<Stage>("draft");
  const [stage, setStage] = useState<Stage>("draft");
  const [windows, setWindows] = useState<WinView[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [bubble, setBubble] = useState<{ title: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [rychlo, setRychlo] = useState(false);
  const [shake, setShake] = useState(1);
  const [calm, setCalm] = useState(reduced);
  const rychloRef = useRef(false);
  rychloRef.current = rychlo;
  const planRef = useRef<Plan | null>(null);
  const spinRef = useRef<LiveSpin | null>(null);
  const fight = useRef<FightHandle | null>(null);
  const pressRef = useRef<() => void>(() => {});
  const noted = useRef(false);
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
    showHint("spin", "Ťukni ZATOČ.");
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
      return;
    }
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
    go("act");
    fight.current?.setPace(rychloRef.current ? 1.5 : 1);
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
      const cue: Cue = {
        reel: step.reel,
        sym: step.sym,
        crit: step.crit,
        rewind: false,
        chip: mark?.chip ?? "",
        selfChip: step.sym === "natural" ? "❤−8" : undefined,
        target: targetOf(step.sym),
      };
      if (fight.current) {
        await fight.current.playCue(cue, () => {
          commit(resolved.run);
          snd(() => (step.crit ? sfx.playWin("full") : sfx.playStrike()));
        });
      } else {
        commit(resolved.run);
      }
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
    const acted = enemyPhase(done);
    for (const beat of acted.beats) {
      const kind = beat.t === "block" ? "block" : beat.t === "whiff" ? "miss" : beat.t === "heal" ? "heal" : "hit";
      if (fight.current) await fight.current.playFoe(beatChip(beat), kind);
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
      shake,
      shop: stageRef.current === "shop",
      deck: stageRef.current === "shop" ? live.deck : [],
      phase: stageRef.current,
      button: buttonLabel(stageRef.current, live.picks.length),
      pulse: stageRef.current === "ready" || stageRef.current === "preview" || stageRef.current === "shop" || stageRef.current === "banner" || (stageRef.current === "draft" && live.picks.length === 3) || stageRef.current === "spin",
      coins: live.coins,
      floor,
      turn: turnLabel(stageRef.current),
      hint: hint ?? "",
      active,
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

  const who = stage === "enemy" ? "foe" : "you";
  const primary =
    stage === "draft"
      ? { label: buttonLabel("draft", run.picks.length), disabled: run.picks.length !== 3, pulse: run.picks.length === 3, run: confirm }
      : stage === "banner"
        ? { label: "ĎALEJ", disabled: false, pulse: true, run: advance }
        : stage === "ready"
          ? { label: "ZATOČ", disabled: false, pulse: true, run: spin }
          : stage === "spin"
            ? { label: "STOP", disabled: active == null, pulse: active != null, run: () => stop(active ?? undefined) }
            : stage === "preview"
              ? { label: "ĎALEJ", disabled: false, pulse: true, run: () => void attack() }
              : stage === "act" || stage === "enemy"
                ? { label: "ĎALEJ", disabled: false, pulse: false, run: () => fight.current?.setPace(3) }
                : stage === "shop"
                  ? { label: "ĎALEJ", disabled: false, pulse: true, run: leave }
                  : { label: "SPÄŤ", disabled: false, pulse: true, run: () => onExit.current() };

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
    rychlo,
    setRychlo,
    shake,
    setShake,
    calm,
    setCalm,
    hurry: () => fight.current?.setPace(3),
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
