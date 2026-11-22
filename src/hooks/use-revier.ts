import { useCallback, useEffect, useRef, useState } from "react";
import * as sfx from "@/lib/slot/audio";
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
import type { Beat, Fx, Grade, LiveSpin, Plan, Run, SymId } from "@/lib/revier/types";

const BANNER_MS = 1150;
const LEAD_MS = 720;
const AUTO_STOP_MS = 1580;
const RESOLVE_MS = 780;
const REROLL_MS = 460;
const CRIT_MS = 620;
const ENEMY_MS = 1080;
const KILL_MS = 720;

export interface FloatText {
  id: number;
  text: string;
  tone: "dmg" | "crit" | "shield" | "heal" | "coin" | "stun" | "self";
  where: "foe" | "you";
}

export interface CoinToken {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export interface SkillAsk {
  reel: number;
  mode: "bar" | "dial";
  sym: SymId;
}

function snd(play: () => void) {
  try {
    play();
  } catch {
    /* the garage mix is optional */
  }
}

/**
 * Presentation clock for one night shift. Rules live in lib/revier; this only
 * plays them left to right and keeps the timers off the layout.
 */
export function useRevier(opts: { entry: number; onRecord: (run: Run) => void; onExit: () => void }) {
  const [run, setRun] = useState<Run>(() => createRun((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0, opts.entry));
  const runRef = useRef(run);
  const spinRef = useRef<LiveSpin | null>(null);
  const planRef = useRef<Plan | null>(null);
  const getters = useRef<Array<(() => number) | null>>([]);
  const autoStop = useRef(0);
  const timers = useRef<number[]>([]);
  const epoch = useRef(0);
  const noted = useRef(false);
  const grading = useRef(false);
  const skillAt = useRef(0);
  const seq = useRef(1);
  const onRecord = useRef(opts.onRecord);
  const onExit = useRef(opts.onExit);
  onRecord.current = opts.onRecord;
  onExit.current = opts.onExit;

  const [strips, setStrips] = useState<SymId[][]>([]);
  const [spinning, setSpinning] = useState<boolean[]>([]);
  const [landed, setLanded] = useState<(SymId | null)[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [pop, setPop] = useState<SymId | null>(null);
  const [crit, setCrit] = useState(false);
  const [dim, setDim] = useState(false);
  const [shake, setShake] = useState<"hit" | "crit" | null>(null);
  const [flash, setFlash] = useState<"hit" | "block" | "heal" | "crit" | null>(null);
  const [floats, setFloats] = useState<FloatText[]>([]);
  const [tokens, setTokens] = useState<CoinToken[]>([]);
  const [skill, setSkill] = useState<SkillAsk | null>(null);
  const [thud, setThud] = useState(0);

  const commit = useCallback((next: Run) => {
    runRef.current = next;
    setRun(next);
  }, []);

  const later = useCallback((ms: number, fn: () => void) => {
    const stamp = epoch.current;
    const id = window.setTimeout(() => {
      if (epoch.current !== stamp) return;
      fn();
    }, ms);
    timers.current.push(id);
  }, []);

  const clearClock = useCallback(() => {
    epoch.current += 1;
    window.clearTimeout(autoStop.current);
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  useEffect(() => () => clearClock(), [clearClock]);

  useEffect(() => {
    if (run.phase !== "dead" || noted.current) return;
    noted.current = true;
    onRecord.current(run);
  }, [run]);

  const pushFloat = useCallback((text: string, tone: FloatText["tone"], where: FloatText["where"]) => {
    const id = seq.current++;
    setFloats((list) => [...list, { id, text, tone, where }]);
    later(820, () => setFloats((list) => list.filter((row) => row.id !== id)));
  }, [later]);

  const burst = useCallback((kind: "hit" | "crit" | "block" | "heal") => {
    setFlash(kind);
    setShake(kind === "crit" ? "crit" : kind === "heal" ? null : "hit");
    later(kind === "crit" ? 560 : 340, () => {
      setFlash(null);
      setShake(null);
    });
  }, [later]);

  const showFx = useCallback((fx: Fx[], reel: number) => {
    for (const ev of fx) {
      if (ev.t === "hit" && ev.amount > 0) {
        pushFloat(ev.crit ? `${ev.amount}` : `−${ev.amount}`, ev.crit ? "crit" : "dmg", "foe");
        if (ev.bonus > 0) pushFloat(`VÝBOJ +${ev.bonus}`, "crit", "foe");
        snd(() => (ev.crit ? sfx.playWin("spark") : sfx.playStrike()));
        burst(ev.crit ? "crit" : "hit");
      } else if (ev.t === "shield" && ev.amount > 0) {
        pushFloat(`+${ev.amount}`, "shield", "you");
        snd(() => sfx.playClick());
      } else if (ev.t === "heal" && ev.amount > 0) {
        pushFloat(`+${ev.amount}`, "heal", "you");
        burst("heal");
        snd(() => sfx.playWin("spark"));
      } else if (ev.t === "coin" && ev.amount > 0) {
        pushFloat(`+${ev.amount}`, "coin", "you");
        snd(() => sfx.playCoin());
        const from = document.querySelector<HTMLElement>(`[data-reel="${reel}"]`);
        const to = document.querySelector<HTMLElement>("[data-coins]");
        const root = document.querySelector<HTMLElement>(".ns");
        if (from && to && root) {
          const fr = from.getBoundingClientRect();
          const tr = to.getBoundingClientRect();
          const id = seq.current++;
          setTokens((list) => [
            ...list,
            { id, x: fr.left + fr.width / 2, y: fr.top + fr.height / 2, dx: tr.left + tr.width / 2 - (fr.left + fr.width / 2), dy: tr.top + tr.height / 2 - (fr.top + fr.height / 2) },
          ]);
          later(760, () => setTokens((list) => list.filter((row) => row.id !== id)));
        }
      } else if (ev.t === "stun") {
        pushFloat("OMÁMENÝ", "stun", "foe");
        if (ev.slap > 0) pushFloat(`−${ev.slap}`, "dmg", "foe");
        snd(() => sfx.playZap());
      } else if (ev.t === "dot") {
        pushFloat(`JED ${ev.amount}`, "dmg", "foe");
      } else if (ev.t === "self") {
        pushFloat(`−${ev.amount}`, "self", "you");
        burst("hit");
        snd(() => sfx.playStrike());
      }
    }
  }, [burst, later, pushFloat]);

  const showDead = useCallback(() => {
    setSkill(null);
    setDim(false);
    setPop(null);
    setActive(null);
    grading.current = false;
  }, []);

  const startSpin = useCallback(() => {
    const up = playerUpkeep(runRef.current);
    commit(up.run);
    if (up.beat) {
      pushFloat(`−${up.beat.amount}`, "self", "you");
      burst("hit");
    }
    if (up.run.phase === "dead") {
      showDead();
      return;
    }
    const opened = beginSpin(up.run);
    if (!opened) return;
    commit(opened.run);
    spinRef.current = opened.spin;
    const blanks = opened.spin.blanks;
    setStrips(opened.spin.strips);
    setSpinning(blanks.map((blank) => !blank));
    setLanded(blanks.map((blank) => (blank ? "medzera" : null)));
    setPop(null);
    const reel = nextOpenReel(opened.spin);
    setActive(reel);
    arm(reel);
  }, [burst, commit, pushFloat, showDead]);

  const afterReels = useCallback(() => {
    setPop(null);
    setActive(null);
    const done = finishPlayer(runRef.current);
    commit(done);
    if (done.phase === "dead") {
      showDead();
      return;
    }
    if (done.phase === "shop") {
      burst("crit");
      snd(() => sfx.playCoin());
      later(KILL_MS, () => setDim(false));
      return;
    }
    later(260, () => foeTurn());
  }, [burst, commit, later, showDead]);

  const playReel = useCallback((index: number) => {
    const plan = planRef.current;
    if (!plan) return;
    if (runRef.current.phase === "dead") {
      showDead();
      return;
    }
    if (index >= plan.reels.length) {
      afterReels();
      return;
    }
    const step = plan.reels[index]!;
    setActive(step.reel);
    setPop(step.sym === "medzera" ? null : step.sym);
    if (step.skill) {
      grading.current = true;
      skillAt.current = index;
      setSkill({ reel: index, mode: step.skill, sym: step.sym });
      return;
    }
    const resolved = resolveReel(runRef.current, plan, index, "good");
    commit(resolved.run);
    showFx(resolved.fx, step.reel);
    later(RESOLVE_MS, () => playReel(index + 1));
  }, [afterReels, commit, later, showDead, showFx]);

  const openResolve = useCallback(() => {
    const spin = spinRef.current;
    if (!spin) return;
    const sealed = sealSpin(runRef.current, spin);
    commit(sealed.run);
    planRef.current = sealed.plan;
    const playReroll = (at: number) => {
      const plan = planRef.current;
      if (!plan) return;
      if (at >= plan.rerolls.length) {
        if (plan.critSym) {
          setCrit(true);
          setShake("crit");
          burst("crit");
          snd(() => sfx.playWin("full"));
          later(CRIT_MS, () => {
            setCrit(false);
            setShake(null);
            playReel(0);
          });
        } else {
          playReel(0);
        }
        return;
      }
      const swap = plan.rerolls[at]!;
      setActive(swap.reel);
      setLanded((prev) => {
        const next = prev.slice();
        next[swap.reel] = swap.to;
        return next;
      });
      setThud((n) => n + 1);
      snd(() => sfx.playClick());
      later(REROLL_MS, () => playReroll(at + 1));
    };
    playReroll(0);
  }, [burst, commit, later, playReel]);

  const halt = useCallback((reel: number) => {
    const spin = spinRef.current;
    if (!spin || nextOpenReel(spin) !== reel) return;
    window.clearTimeout(autoStop.current);
    const at = getters.current[reel]?.() ?? 0;
    const locked = lockReel(spin, reel, at);
    spinRef.current = locked;
    const sym = locked.strips[reel]?.[locked.index[reel] ?? 0] ?? "medzera";
    setLanded((prev) => {
      const next = prev.slice();
      next[reel] = sym;
      return next;
    });
    setSpinning((prev) => {
      const next = prev.slice();
      next[reel] = false;
      return next;
    });
    setThud((n) => n + 1);
    snd(() => {
      sfx.playLand(reel);
      sfx.playZboxSlam();
    });
    const nxt = nextOpenReel(locked);
    if (nxt >= 0) {
      setActive(nxt);
      arm(nxt);
    } else {
      setActive(null);
      later(160, () => openResolve());
    }
  }, [later, openResolve]);

  const arm = useCallback((reel: number) => {
    window.clearTimeout(autoStop.current);
    if (reel < 0) return;
    autoStop.current = window.setTimeout(() => halt(reel), AUTO_STOP_MS);
  }, [halt]);

  const foeTurn = useCallback(() => {
    setDim(true);
    setPop(null);
    const acted = enemyPhase(runRef.current);
    commit(acted.run);
    for (const beat of acted.beats) paintBeat(beat);
    later(ENEMY_MS, () => {
      setDim(false);
      if (acted.run.phase === "dead") showDead();
      else if (acted.run.phase === "shop") burst("crit");
      else later(LEAD_MS, () => startSpin());
    });
  }, [burst, commit, later, showDead, startSpin]);

  const paintBeat = (beat: Beat) => {
    if (beat.t === "whiff") {
      pushFloat("OMÁMENÝ", "stun", "foe");
      return;
    }
    if (beat.t === "block") {
      pushFloat(`ŠTÍT ${beat.blocked}`, "shield", "you");
      burst("block");
      snd(() => sfx.playClick());
      return;
    }
    if (beat.t === "hit") {
      if (beat.blocked > 0) pushFloat(`−${beat.blocked}`, "shield", "you");
      if (beat.amount > 0) pushFloat(`−${beat.amount}`, "self", "you");
      burst(beat.amount > 0 ? "hit" : "block");
      snd(() => sfx.playStrike());
      return;
    }
    if (beat.t === "poison" || beat.t === "dot") {
      pushFloat(`JED ${beat.amount}`, beat.t === "dot" ? "dmg" : "self", beat.t === "dot" ? "foe" : "you");
      return;
    }
    if (beat.t === "steal") {
      pushFloat(beat.amount > 0 ? `−${beat.amount}` : "NIČ", "coin", "you");
      return;
    }
    if (beat.t === "stun") pushFloat("PEČIATKA", "stun", "you");
    if (beat.t === "heal") pushFloat(beat.text, "heal", "foe");
  };

  const goFight = useCallback(() => {
    const opened = dismissBanner(runRef.current);
    commit(opened);
    later(LEAD_MS, () => startSpin());
  }, [commit, later, startSpin]);

  const confirm = useCallback(() => {
    const next = confirmDraft(runRef.current);
    if (next.phase !== "banner") return;
    commit(next);
    later(BANNER_MS, () => goFight());
  }, [commit, goFight, later]);

  const grade = useCallback((mark: Grade) => {
    if (!grading.current) return;
    grading.current = false;
    const plan = planRef.current;
    const index = skillAt.current;
    setSkill(null);
    if (!plan) return;
    const step = plan.reels[index];
    if (!step) return;
    const resolved = resolveReel(runRef.current, plan, index, mark);
    commit(resolved.run);
    showFx(resolved.fx, step.reel);
    const word = mark === "perfect" ? "PRESNE" : mark === "miss" ? "VEDĽA" : "DOBRÉ";
    pushFloat(word, mark === "miss" ? "self" : "crit", "you");
    later(RESOLVE_MS, () => playReel(index + 1));
  }, [commit, later, playReel, pushFloat, showFx]);

  const leave = useCallback(() => {
    const next = leaveShop(runRef.current);
    commit(next);
    setSpinning([]);
    setLanded([]);
    setStrips([]);
    if (next.phase === "banner") later(BANNER_MS, () => goFight());
    else later(LEAD_MS, () => startSpin());
  }, [commit, goFight, later, startSpin]);

  const giveUp = useCallback(() => {
    if (runRef.current.phase === "draft" || runRef.current.phase === "dead") {
      onExit.current();
      return;
    }
    clearClock();
    commit(resign(runRef.current));
    showDead();
  }, [clearClock, commit, showDead]);

  const bindReel = useCallback((reel: number, read: () => number) => {
    getters.current[reel] = read;
  }, []);

  return {
    run,
    strips,
    spinning,
    landed,
    active,
    pop,
    crit,
    dim,
    shake,
    flash,
    floats,
    tokens,
    skill,
    thud,
    bindReel,
    toggle: (sym: SymId) => commit(togglePick(runRef.current, sym)),
    confirm,
    stop: halt,
    grade,
    buy: (index: number) => commit(buyOffer(runRef.current, index)),
    heal: () => commit(buyHeal(runRef.current)),
    reroll: () => commit(rerollShop(runRef.current)),
    remove: (index: number) => commit(removeSymbol(runRef.current, index)),
    fourth: () => commit(buyFourthReel(runRef.current)),
    leave,
    giveUp,
    exit: () => onExit.current(),
  };
}
