import { useCallback, useEffect, useRef, useState } from "react";
import {
  ALL_ART,
  BETS,
  FS_RETRIGGER,
  FS_RETRIGGER_SCATTERS,
  FS_TRIGGER_SCATTERS,
  MAX_WIN_X,
  WIN_POP_X,
  PAY_SYMBOLS,
  SCATTER,
  START_BALANCE,
  payName,
  scatterPay,
  type Cell,
} from "@/lib/slot/symbols";
import {
  cloneGrid,
  countScatters,
  createRng,
  emptyGrid,
  evaluate,
  expireOrbs,
  generateBuyGrid,
  generateGrid,
  findTicket,
  listOrbs,
  makeSpinStrip,
  plantTicket,
  punchHoles,
  tumble,
  wait,
  zeusDrop,
  zeusDropCount,
} from "@/lib/slot/engine";
import { bumpPity, dealPickBoard, pityGain, PITY_GOAL, readPity, spendPity, type PickTile, type PityMap } from "@/lib/slot/pick-bonus";
import { applyRankDelta, applyWeeklyDecay, bannerFromX, buyXOf, dropOneGroup, fsSpinsOf, perkOf, reloadPunish, rpFromDead, rpFromJob, rpFromSpin, settleBuyRank, standing, RELOAD_STABILIZE, WEEK_MS, type RankBreakdown, type RankFlash } from "@/lib/slot/ranks";
import * as sfx from "@/lib/slot/audio";
import { formatMoney } from "@/lib/slot/format";
import { emptyPlayerSave, readLocalSave, writeLocalSave, type PlayerSave } from "@/lib/slot/player-save";
import { emptyBoard, isEligibleBet, ticketResolve, type BoardSnap, type JackpotHit, type TierId } from "@/lib/slot/jackpot";
import { fetchParkPool, postParkClaim, postParkSpin, withRetry, type PoolSpinResult } from "@/lib/slot/jackpot-api";
import {
  canSpend,
  dealJobs,
  jobStatus,
  tickJob,
  rerollCost,
  JOB_BANK,
  type JobCard,
  type JobEvent,
} from "@/lib/slot/spend";

type Phase =
  | "boot"
  | "idle"
  | "spinning"
  | "landing"
  | "eval"
  | "win"
  | "pop"
  | "tumble"
  | "mult"
  | "fs"
  | "pick"
  | "big"
  | "max";

export type WinBanner = "win" | "big" | "mega" | "epic" | "max" | "fs" | "fsTotal" | "pool" | null;

export interface BannerMeta {
  spins: number;
  extra: number;
  peakMult: number;
  terminated: boolean;
}

function readLocal(): PlayerSave | null {
  return readLocalSave();
}

function writeLocal(s: PlayerSave): void {
  writeLocalSave(s);
}

function hasOrb(board: Cell[][]): boolean {
  return board.some((row) => row.some((c) => c.kind === "mult"));
}

export function useSlotGame() {
  const [started, setStarted] = useState(false);
  const [balance, setBalance] = useState(START_BALANCE);
  const [betIndex, setBetIndex] = useState(4);
  const [muted, setMuted] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [quick, setQuick] = useState(false);
  const [ante, setAnte] = useState(false);
  const [bestWin, setBestWin] = useState(0);
  const [grid, setGrid] = useState<Cell[][]>(() => emptyGrid());
  const [holdGrid, setHoldGrid] = useState<Cell[][] | null>(null);
  const gridRef = useRef<Cell[][]>(emptyGrid());
  const [reelFast, setReelFast] = useState(false);
  const [spinPace, setSpinPace] = useState<"up" | "full" | null>(null);
  const [cam, setCam] = useState<"stop" | "scatter" | "tumble" | null>(null);
  const [spinStrips, setSpinStrips] = useState<Cell[][] | null>(null);
  const [phase, setPhase] = useState<Phase>("boot");
  const [busy, setBusy] = useState(false);
  const [winMask, setWinMask] = useState<boolean[][] | null>(null);
  const [spinWin, setSpinWin] = useState(0);
  const [displayWin, setDisplayWin] = useState(0);
  const [baseWin, setBaseWin] = useState(0);
  const [fsLeft, setFsLeft] = useState(0);
  const [fsTotal, setFsTotal] = useState(0);
  const [inFs, setInFs] = useState(false);
  const [globalMult, setGlobalMult] = useState(0);
  const [seqMult, setSeqMult] = useState(0);
  const [banner, setBanner] = useState<WinBanner>(null);
  const [bannerAmount, setBannerAmount] = useState(0);
  const [bannerMeta, setBannerMeta] = useState<BannerMeta | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickTiles, setPickTiles] = useState<PickTile[]>([]);
  const [pickRevealed, setPickRevealed] = useState<boolean[]>([]);
  const [pickEnded, setPickEnded] = useState(false);
  const [pickTotalX, setPickTotalX] = useState(0);
  const [pickKillId, setPickKillId] = useState<number | null>(null);
  const [pickPicks, setPickPicks] = useState(0);
  const [pityByBet, setPityByBet] = useState<PityMap>({});
  const [pityDelta, setPityDelta] = useState(0);
  const [rp, setRp] = useState(0);
  const [rankPeak, setRankPeak] = useState(0);
  const [rankShield, setRankShield] = useState(false);
  const [rankDelta, setRankDelta] = useState(0);
  const [rankFlash, setRankFlash] = useState<RankFlash | null>(null);
  const rankQ = useRef<RankFlash[]>([]);
  const [winTier, setWinTier] = useState(0);
  const [rankOpen, setRankOpen] = useState(false);
  const [winStreak, setWinStreak] = useState(0);
  const [rankParts, setRankParts] = useState<RankBreakdown | null>(null);
  const [pots, setPots] = useState(emptyBoard().pots);
  const [jpHit, setJpHit] = useState<JackpotHit | null>(null);
  const [ticketLock, setTicketLock] = useState(false);
  const pendingLiveTicketRef = useRef<TierId | null>(null);
  const [job, setJob] = useState<JobCard | null>(null);
  const jobRef = useRef<JobCard | null>(null);
  const [jobOffer, setJobOffer] = useState<JobCard[] | null>(null);
  const [spendOpen, setSpendOpen] = useState(false);
  const [jobToast, setJobToast] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const [autoOn, setAutoOn] = useState(false);
  const [autoReason, setAutoReason] = useState<string | null>(null);
  const [throwBolt, setThrowBolt] = useState(false);
  const [shake, setShake] = useState(false);
  const [paytableOpen, setPaytableOpen] = useState(false);
  const [buyAsk, setBuyAsk] = useState(false);
  const [message, setMessage] = useState("8+ rovnakých symbolov kdekoľvek vyhráva");
  const [stoppedCols, setStoppedCols] = useState(6);
  const [anticipate, setAnticipate] = useState(false);
  const [activatingMult, setActivatingMult] = useState(false);
  const [struckUids, setStruckUids] = useState<number[]>([]);
  const [strike, setStrike] = useState<{ r: number; c: number } | null>(null);
  const [flies, setFlies] = useState<{ key: number; r: number; c: number; mult: number }[]>([]);
  const [expiredUids, setExpiredUids] = useState<number[]>([]);
  const [spinTape, setSpinTape] = useState<{ label: string; amount: string }[]>([]);
  const [clusterPay, setClusterPay] = useState<{ x: number; y: number; amount: string } | null>(null);
  const [payHint, setPayHint] = useState<{ count: number; src: string; amount: string; name: string } | null>(null);
  const [winLog, setWinLog] = useState<{ count: number; src: string; amount: string }[]>([]);
  const [topLine, setTopLine] = useState("SYMBOLY PLATIA KDEKOĽVEK NA OBRAZOVKE");

  const abort = useRef({ aborted: false, skip: false });
  const turboRef = useRef(turbo);
  const quickRef = useRef(quick);
  const anteRef = useRef(ante);
  const inFsRef = useRef(false);
  const globalMultRef = useRef(0);
  const balanceRef = useRef(balance);
  const betIndexRef = useRef(betIndex);
  const autoRef = useRef(false);
  const busyRef = useRef(false);
  const extraFsRef = useRef(0);
  const flyKey = useRef(1);
  const lastPaidXRef = useRef(0);
  const autoFloorRef = useRef(0);
  const bannerWait = useRef<(() => void) | null>(null);
  const bannerOpen = useRef(false);
  const pickWait = useRef<(() => void) | null>(null);
  const pickOpenRef = useRef(false);
  const pickEndedRef = useRef(false);
  const pickTotalXRef = useRef(0);
  const pickTilesRef = useRef<PickTile[]>([]);
  const pickRevealedRef = useRef<boolean[]>([]);
  const pityByBetRef = useRef<PityMap>({});
  const kontrolaArmedRef = useRef(false);
  const featureXRef = useRef(0);
  const rankRef = useRef({ rp: 0, peak: 0, shield: false });
  const streakRef = useRef(0);
  const holdUsedRef = useRef(false);
  const boardRef = useRef<BoardSnap>(emptyBoard());
  const playerIdRef = useRef("");
  const reserveLocalRef = useRef(0);
  const reloadStreakRef = useRef(0);
  const spinsSinceReloadRef = useRef(0);
  const lastDecayAtRef = useRef(0);
  const [reloadStreak, setReloadStreak] = useState(0);
  const [weekDue, setWeekDue] = useState(0);

  turboRef.current = turbo;
  quickRef.current = quick;
  anteRef.current = ante;
  inFsRef.current = inFs;
  balanceRef.current = balance;
  betIndexRef.current = betIndex;
  autoRef.current = autoOn;
  busyRef.current = busy;
  gridRef.current = grid;
  jobRef.current = job;

  const bet = BETS[betIndex];
  const rankId = standing(rp).id;
  const perk = perkOf(rankId);
  const stake = ante ? +(bet * perk.anteMul).toFixed(2) : bet;
  const buyX = buyXOf(rankId);
  const pity = readPity(pityByBet, bet);

  const saveSnapRef = useRef<PlayerSave>(emptyPlayerSave());
  const readySave = useRef(false);
  const fsSessionRef = useRef({
    left: 0,
    total: 0,
    cash: 0,
    played: 0,
    extra: 0,
    peak: 0,
    bought: false,
    triggerCash: 0,
  });
  const resumeOnce = useRef(false);

  const applySave = useCallback((s: PlayerSave) => {
    setBalance(s.balance);
    setBetIndex(s.betIndex);
    setMuted(s.muted);
    setTurbo(s.turbo);
    setQuick(s.quick);
    setAnte(s.ante);
    setBestWin(s.bestWin);
    pityByBetRef.current = s.pityByBet;
    setPityByBet(s.pityByBet);
    setRp(s.rp);
    setRankPeak(s.rankPeak);
    setRankShield(s.rankShield);
    rankRef.current = { rp: s.rp, peak: s.rankPeak, shield: s.rankShield };
    streakRef.current = s.winStreak;
    setWinStreak(s.winStreak);
    playerIdRef.current = s.playerId || playerIdRef.current || crypto.randomUUID();
    setPots(emptyBoard().pots);
    reloadStreakRef.current = s.reloadStreak ?? 0;
    spinsSinceReloadRef.current = s.spinsSinceReload ?? 0;
    setReloadStreak(reloadStreakRef.current);
    lastDecayAtRef.current = s.lastDecayAt ?? 0;
    setWeekDue(lastDecayAtRef.current > 0 ? lastDecayAtRef.current + WEEK_MS : 0);
    setInFs(Boolean(s.inFs && s.fsLeft > 0));
    inFsRef.current = Boolean(s.inFs && s.fsLeft > 0);
    setFsLeft(s.fsLeft ?? 0);
    setFsTotal(s.fsTotal ?? 0);
    setGlobalMult(s.globalMult ?? 0);
    globalMultRef.current = s.globalMult ?? 0;
    fsSessionRef.current = {
      left: s.fsLeft ?? 0,
      total: s.fsTotal ?? 0,
      cash: s.fsCash ?? 0,
      played: s.fsPlayed ?? 0,
      extra: s.fsExtra ?? 0,
      peak: s.fsPeak ?? 0,
      bought: Boolean(s.fsBought),
      triggerCash: s.fsTriggerCash ?? 0,
    };
    const loaded = s.job ? { ...s.job, lockBet: s.job.lockBet || BETS[s.betIndex] } : null;
    setJob(loaded);
    jobRef.current = loaded;
    pendingLiveTicketRef.current = s.pendingLiveTicket;
    saveSnapRef.current = s;
  }, []);

  const flushSave = useCallback((payload?: PlayerSave) => {
    if (!readySave.current) return;
    const next = payload ?? { ...saveSnapRef.current, updatedAt: Date.now() };
    saveSnapRef.current = next;
    writeLocal(next);
  }, []);

  const persistNow = useCallback(() => {
    if (!readySave.current) return;
    const sess = fsSessionRef.current;
    const next: PlayerSave = {
      ...saveSnapRef.current,
      balance: balanceRef.current,
      inFs: inFsRef.current,
      fsLeft: sess.left,
      fsTotal: sess.total,
      fsCash: sess.cash,
      fsPlayed: sess.played,
      fsExtra: sess.extra,
      fsPeak: sess.peak,
      fsBought: sess.bought,
      fsTriggerCash: sess.triggerCash,
      globalMult: globalMultRef.current,
      playerId: playerIdRef.current,
      rp: rankRef.current.rp,
      rankPeak: rankRef.current.peak,
      rankShield: rankRef.current.shield,
      job: jobRef.current,
      pendingLiveTicket: pendingLiveTicketRef.current,
      updatedAt: Date.now(),
    };
    saveSnapRef.current = next;
    writeLocal(next);
  }, []);

  const runWeeklyDecay = useCallback(() => {
    const now = Date.now();
    const res = applyWeeklyDecay(rankRef.current.rp, lastDecayAtRef.current, now);
    lastDecayAtRef.current = res.lastDecayAt;
    setWeekDue(res.lastDecayAt > 0 ? res.lastDecayAt + WEEK_MS : now + WEEK_MS);
    if (res.drops <= 0) return false;
    rankRef.current = { rp: res.rp, peak: rankRef.current.peak, shield: false };
    setRp(res.rp);
    setRankShield(false);
    setRankDelta(res.rp - res.before.rp);
    setRankFlash({
      event: "week",
      before: res.before,
      after: res.after,
      applied: res.rp - res.before.rp,
    });
    setTopLine(
      res.drops > 1
        ? `TÝŽDENNÝ DROP · ${res.drops} skupiny · ${res.after.name}`
        : `TÝŽDENNÝ DROP · ${res.before.name} → ${res.after.name}`,
    );
    sfx.playThunder();
    return true;
  }, []);

  useEffect(() => {
    const cached = readLocal();
    if (cached) applySave(cached);
    readySave.current = true;
    runWeeklyDecay();
    setHydrated(true);
  }, [applySave, runWeeklyDecay]);

  useEffect(() => {
    if (!hydrated || !readySave.current) return;
    const payload: PlayerSave = {
      balance,
      betIndex,
      muted,
      turbo,
      quick,
      ante,
      bestWin,
      pityByBet: { ...pityByBetRef.current },
      rp,
      rankPeak,
      rankShield,
      winStreak,
      poolLocal: boardRef.current.pots.stat.pool,
      playerId: playerIdRef.current,
      reloadStreak: reloadStreakRef.current,
      spinsSinceReload: spinsSinceReloadRef.current,
      lastDecayAt: lastDecayAtRef.current,
      updatedAt: Date.now(),
      inFs: inFsRef.current,
      fsLeft: fsSessionRef.current.left,
      fsTotal: fsSessionRef.current.total,
      fsCash: fsSessionRef.current.cash,
      fsPlayed: fsSessionRef.current.played,
      fsExtra: fsSessionRef.current.extra,
      fsPeak: fsSessionRef.current.peak,
      fsBought: fsSessionRef.current.bought,
      fsTriggerCash: fsSessionRef.current.triggerCash,
      globalMult: globalMultRef.current,
      job: jobRef.current,
      pendingLiveTicket: pendingLiveTicketRef.current,
    };
    saveSnapRef.current = payload;
    writeLocal(payload);
  }, [hydrated, balance, betIndex, muted, turbo, quick, ante, bestWin, pityByBet, rp, rankPeak, rankShield, winStreak, pots, reloadStreak, weekDue, fsLeft, inFs, globalMult, job]);

  useEffect(() => {
    const onHide = () => persistNow();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [persistNow]);

  const applyBoard = useCallback((s: BoardSnap) => {
    boardRef.current = s;
    if (!busyRef.current) setPots(s.pots);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void withRetry(fetchParkPool)
      .then(applyBoard)
      .catch(() => {});
  }, [hydrated, applyBoard]);

  useEffect(() => {
    if (!hydrated || !started) return;
    const tick = () => {
      if (busyRef.current) return;
      void withRetry(fetchParkPool)
        .then(applyBoard)
        .catch(() => {});
    };
    const id = window.setInterval(tick, 2500);
    return () => window.clearInterval(id);
  }, [hydrated, started, applyBoard]);

  useEffect(() => {
    const onHide = () => flushSave();
    const onVis = () => {
      if (document.visibilityState === "hidden") flushSave();
      if (document.visibilityState === "visible") runWeeklyDecay();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [flushSave, runWeeklyDecay]);

  useEffect(() => {
    if (rankFlash) {
      const t = window.setTimeout(() => setRankFlash(null), 900);
      return () => window.clearTimeout(t);
    }
    const next = rankQ.current.shift();
    if (next) setRankFlash(next);
  }, [rankFlash]);

  useEffect(() => {
    if (!rankDelta) return;
    const t = window.setTimeout(() => {
      setRankDelta(0);
      setRankParts(null);
    }, 2200);
    return () => window.clearTimeout(t);
  }, [rankDelta]);

  useEffect(() => {
    if (!jobToast) return;
    const t = window.setTimeout(() => setJobToast(null), 1800);
    return () => window.clearTimeout(t);
  }, [jobToast]);

  const dur = useCallback((base: number) => {
    if (turboRef.current) return Math.round(base * 0.34);
    if (quickRef.current) return Math.round(base * 0.62);
    return base;
  }, []);

  const start = useCallback(() => {
    sfx.unlockAudio();
    sfx.setMuted(muted);
    sfx.startAmbience();
    for (const src of ALL_ART) {
      const img = new Image();
      img.src = src;
    }
    setStarted(true);
    setPhase(inFsRef.current && fsSessionRef.current.left > 0 ? "fs" : "idle");
  }, [muted]);

  const toggleMute = useCallback(() => {
    sfx.unlockAudio();
    setMuted((m) => {
      const n = !m;
      sfx.setMuted(n);
      return n;
    });
  }, []);

  const changeBet = useCallback((dir: -1 | 1) => {
    if (busyRef.current || jobRef.current) return;
    setBetIndex((i) => Math.min(BETS.length - 1, Math.max(0, i + dir)));
    sfx.playClick();
  }, []);

  const refill = useCallback(() => {
    if (busyRef.current) return;
    const maxBet = BETS[BETS.length - 1];
    const nextStreak = reloadStreakRef.current + 1;
    const settled = reloadPunish({
      bet: BETS[betIndexRef.current],
      rp: rankRef.current.rp,
      streak: nextStreak,
      maxBet,
    });
    reloadStreakRef.current = nextStreak;
    spinsSinceReloadRef.current = 0;
    setReloadStreak(nextStreak);
    rankRef.current = { ...rankRef.current, shield: false };
    setRankShield(false);
    streakRef.current = 0;
    holdUsedRef.current = false;
    setWinStreak(0);
    const before = standing(rankRef.current.rp);
    const res = applyRankDelta(rankRef.current, settled.delta);
    rankRef.current = res.save;
    setRp(res.save.rp);
    setRankPeak(res.save.peak);
    setRankShield(res.save.shield);
    setRankDelta(res.applied || settled.delta);
    setRankParts(settled.parts);
    setRankFlash({
      event: "bust",
      before,
      after: res.after,
      applied: res.applied || settled.delta,
      parts: settled.parts,
    });
    setBalance((b) => +(b + START_BALANCE).toFixed(2));
    setSpinTape((t) => [{ label: "BANKROT", amount: `${settled.delta} RP` }, ...t].slice(0, 8));
    setTopLine(settled.delta ? `BANKROT ${settled.delta} RP` : "BANKROT");
    setMessage(`+${START_BALANCE} kredit · liga trest`);
  }, []);

  const pushRank = useCallback((delta: number, parts?: RankBreakdown | null) => {
    if (!delta) return;
    const res = applyRankDelta(rankRef.current, delta);
    rankRef.current = res.save;
    setRp(res.save.rp);
    setRankPeak(res.save.peak);
    setRankShield(res.save.shield);
    setRankDelta(res.applied);
    setRankParts(delta > 0 && parts ? parts : null);
    if (res.event === "up") {
      const perk = perkOf(res.after.id);
      if (perk.dripX > 0) {
        const drip = +(BETS[betIndexRef.current] * perk.dripX).toFixed(2);
        if (drip > 0 && !busyRef.current) {
          setBalance((b) => +(b + drip).toFixed(2));
          setSpinTape((t) => [{ label: "RANK DROP", amount: formatMoney(drip) }, ...t].slice(0, 8));
        }
      }
    }
    if (res.event) {
      const flash: RankFlash = {
        event: res.event,
        before: res.before,
        after: res.after,
        applied: res.applied,
        parts: parts ?? undefined,
      };
      setRankFlash(flash);
    }
  }, []);

  const noteResult = useCallback((paid: boolean) => {
    const perk = perkOf(standing(rankRef.current.rp).id);
    if (paid) {
      streakRef.current += 1;
      holdUsedRef.current = false;
    } else if (perk.streakHold && streakRef.current >= 2 && !holdUsedRef.current) {
      holdUsedRef.current = true;
    } else {
      streakRef.current = 0;
      holdUsedRef.current = false;
    }
    setWinStreak(streakRef.current);
    return streakRef.current;
  }, []);

  const feedPool = useCallback(async (opts: {
    stake: number;
    eligible: boolean;
    skip?: boolean;
  }): Promise<PoolSpinResult> => {
    try {
      const res = await withRetry(() =>
        postParkSpin({
          stake: opts.stake,
          eligible: opts.eligible,
          skip: !!opts.skip,
          player: playerIdRef.current,
        }),
      );
      applyBoard(res);
      return res;
    } catch {
      return { ...boardRef.current, ticket: null, force: false };
    }
  }, [applyBoard]);

  const closeBanner = useCallback(() => {
    if (!bannerOpen.current && !bannerWait.current) return;
    bannerOpen.current = false;
    setBanner(null);
    const done = bannerWait.current;
    bannerWait.current = null;
    sfx.playClick();
    done?.();
  }, []);

  const waitForBanner = useCallback(() => {
    return new Promise<void>((resolve) => {
      bannerWait.current = resolve;
      window.setTimeout(() => {
        if (bannerWait.current !== resolve) return;
        bannerOpen.current = false;
        setBanner(null);
        bannerWait.current = null;
        resolve();
      }, 2800);
    });
  }, []);

  const payPoolHit = useCallback(
    async (board: BoardSnap) => {
      const credit = board.credit > 0 ? board.credit : 0;
      const jackpots = board.hits;
      const main = jackpots[0] ?? { id: "ulica" as TierId, name: "ULICA", payout: credit, table: 0 };
      const payout = jackpots.reduce((s, h) => s + h.payout, 0) + credit;
      if (payout <= 0) return;
      const shown: JackpotHit = { ...main, payout: main.payout };
      setJpHit(shown);
      setDisplayWin((w) => +(w + payout).toFixed(2));
      setSpinWin((w) => +(w + payout).toFixed(2));
      setBalance((b) => +(b + payout).toFixed(2));
      setBestWin((w) => Math.max(w, payout));
      setSpinTape((t) => [{ label: shown.name, amount: formatMoney(payout) }, ...t].slice(0, 8));
      if (autoRef.current) {
        autoRef.current = false;
        setAutoOn(false);
        setAutoLeft(0);
        setAutoReason("AUTO STOP · JACKPOT");
      }
      setPhase("max");
      setTopLine(`${shown.name} · ${formatMoney(payout)}`);
      sfx.playMaxWin();
      await wait(2400);
      setJpHit(null);
      setPots(board.pots);
    },
    [],
  );

  const runTicket = useCallback(
    async (tier: TierId) => {
      setTicketLock(true);
      setPhase("max");
      sfx.playCollect();
      await wait(400);
      try {
        const claimed = await withRetry(() => postParkClaim(tier, playerIdRef.current));
        applyBoard(claimed);
        await payPoolHit(claimed);
      } catch {
        /* keep lock off */
      }
      setTicketLock(false);
    },
    [applyBoard, payPoolHit],
  );

  const settleJob = useCallback((ev: JobEvent) => {
    const cur = jobRef.current;
    if (!cur) return;
    const next = tickJob(cur, ev);
    const st = jobStatus(next);
    if (st === "ok") {
      jobRef.current = null;
      setJob(null);
      setBalance((b) => +(b + next.payout).toFixed(2));
      const parts = rpFromJob(next.payout, next.stake);
      if (parts.total) pushRank(parts.total, parts);
      setSpinTape((t) => [{ label: "ZÁKAZKA", amount: `+${formatMoney(next.payout)} · +${parts.total} RP` }, ...t].slice(0, 8));
      setJobToast(`ZÁKAZKA +${formatMoney(next.payout)} · +${parts.total} RP`);
      setTopLine(`ZÁKAZKA +${formatMoney(next.payout)}`);
      sfx.playCollect();
    } else if (st === "fail") {
      jobRef.current = null;
      setJob(null);
      setSpinTape((t) => [{ label: "PREHORELO", amount: `−${formatMoney(next.stake)}` }, ...t].slice(0, 8));
      setJobToast(`PREHORELO · TERMÍN PREŠIEL −${formatMoney(next.stake)}`);
      setTopLine(`TERMÍN PREŠIEL −${formatMoney(next.stake)}`);
      sfx.playThunder();
    } else {
      jobRef.current = next;
      setJob(next);
    }
  }, [pushRank]);

  const waitForPick = useCallback(() => {
    return new Promise<void>((resolve) => {
      pickWait.current = resolve;
    });
  }, []);

  const revealPick = useCallback((id: number) => {
    if (!pickOpenRef.current || pickEndedRef.current) return;
    if (pickRevealedRef.current[id]) return;
    const tile = pickTilesRef.current[id];
    if (!tile) return;
    const nextRev = pickRevealedRef.current.slice();
    nextRev[id] = true;
    pickRevealedRef.current = nextRev;
    sfx.playClick();
    setPickPicks((n) => n + 1);
    if (tile.kind === "odtah") {
      pickEndedRef.current = true;
      const all = nextRev.map(() => true);
      pickRevealedRef.current = all;
      setPickRevealed(all);
      setPickEnded(true);
      setPickKillId(id);
      sfx.playThunder();
    } else {
      pickTotalXRef.current = +(pickTotalXRef.current + tile.payX).toFixed(4);
      setPickRevealed(nextRev);
      setPickTotalX(pickTotalXRef.current);
      sfx.playCollect();
    }
  }, []);

  const finishPick = useCallback(() => {
    pickEndedRef.current = true;
    const done = pickWait.current;
    pickWait.current = null;
    sfx.playClick();
    done?.();
  }, []);

  const runPick = useCallback(async () => {
    const tiles = dealPickBoard(createRng());
    pickTilesRef.current = tiles;
    pickRevealedRef.current = tiles.map(() => false);
    pickTotalXRef.current = 0;
    pickEndedRef.current = false;
    pickOpenRef.current = true;
    setPickTiles(tiles);
    setPickRevealed(tiles.map(() => false));
    setPickTotalX(0);
    setPickEnded(false);
    setPickKillId(null);
    setPickPicks(0);
    setPickOpen(true);
    setPhase("pick");
    setTopLine("ZAPARKOVALI STE NESPRÁVNE");
    setMessage("Klikni na státie");
    sfx.playPickStart();
    kontrolaArmedRef.current = false;
    const betNow = BETS[betIndexRef.current];
    pityByBetRef.current = spendPity(pityByBetRef.current, betNow);
    setPityByBet(pityByBetRef.current);
    await waitForPick();
    const cash = +(pickTotalXRef.current * betNow).toFixed(2);
    if (cash > 0) {
      setBalance((b) => +(b + cash).toFixed(2));
      setDisplayWin(cash);
      setSpinWin(cash);
      setBestWin((w) => Math.max(w, cash));
      setSpinTape((t) => [{ label: "KONTROLA", amount: formatMoney(cash) }, ...t].slice(0, 8));
      sfx.playPayout();
      const streak = noteResult(true);
      const parts = rpFromSpin({
        cash,
        bet: betNow,
        mult: 1,
        tumbles: 0,
        streak,
        banner: bannerFromX(cash / betNow),
        kind: "pick",
        picks: pickTilesRef.current.filter((t, i) => pickRevealedRef.current[i] && t.kind !== "odtah").length,
        rankId: standing(rankRef.current.rp).id,
      });
      pushRank(parts.total, parts);
    } else {
      noteResult(false);
      const dead = rpFromDead(betNow, standing(rankRef.current.rp).entry);
      if (dead.total) pushRank(dead.total, dead);
    }
    pickOpenRef.current = false;
    setPickOpen(false);
    setPhase("idle");
    setTopLine("SYMBOLY PLATIA KDEKOĽVEK NA OBRAZOVKE");
    setMessage(cash > 0 ? `KONTROLA ${formatMoney(cash)}` : "Odťah bez pokuty");
  }, [waitForPick, pushRank, noteResult]);

  const runSequence = useCallback(
    async (opts?: { buy?: boolean; free?: boolean }): Promise<"fs" | "ok" | "max" | "pick"> => {
      const currentBet = BETS[betIndexRef.current];
      const perk = perkOf(standing(rankRef.current.rp).id);
      const currentStake = anteRef.current ? +(currentBet * perk.anteMul).toFixed(2) : currentBet;
      const isFree = !!opts?.free;
      const cost = opts?.buy ? +(currentBet * buyXOf(perk.id)).toFixed(2) : isFree ? 0 : currentStake;

      if (!isFree && balanceRef.current < cost) {
        setMessage("Nedostatok kreditu — doplň demo zostatok");
        return "ok";
      }

      setWinMask(null);
      setSpinWin(0);
      setBaseWin(0);
      setSeqMult(0);
      setClusterPay(null);
      setPayHint(null);
      setWinLog([]);
      setExpiredUids([]);
      setActivatingMult(false);
      setStruckUids([]);
      setStrike(null);
      setFlies([]);
      setWinTier(0);
      extraFsRef.current = 0;
      abort.current.skip = false;
      setReelFast(false);
      if (!isFree) featureXRef.current = 0;
      sfx.unlockAudio();
      sfx.startSpin();
      sfx.duckMusic(0.42);

      if (cost > 0) {
        setBalance((b) => +(b - cost).toFixed(2));
        spinsSinceReloadRef.current += 1;
        if (spinsSinceReloadRef.current >= RELOAD_STABILIZE && reloadStreakRef.current > 0) {
          reloadStreakRef.current = 0;
          setReloadStreak(0);
        }
      }

      let spunTicket: TierId | null = null;
      if (isFree) {
        if (!pendingLiveTicketRef.current) {
          const pot = await feedPool({ stake: 0, eligible: false, skip: true });
          spunTicket = pot.ticket ?? null;
        }
      } else if (cost > 0) {
        const pot = await feedPool({
          stake: cost,
          eligible: isEligibleBet(currentBet) || !!opts?.buy,
          skip: true,
        });
        spunTicket = pot.ticket ?? null;
      }

      setStoppedCols(0);
      setAnticipate(false);
      setHoldGrid(cloneGrid(gridRef.current));
      const spinRng = createRng();
      setSpinStrips(Array.from({ length: 6 }, () => makeSpinStrip(spinRng, isFree)));
      setPhase("spinning");
      setSpinPace("full");
      setCam(null);
      setTopLine("");
      setMessage("TOČÍ SA...");

      const rng = createRng();
      let next = opts?.buy
        ? generateBuyGrid(rng)
        : generateGrid(rng, opts?.free ? false : anteRef.current, !!opts?.free);
      if (spunTicket) next = plantTicket(next, spunTicket, rng);

      const STOPS = [520, 620, 730, 850, 990, 1180];
      await wait(dur(STOPS[0]), abort.current);
      setGrid(next);
      setPhase("landing");
      setStoppedCols(1);
      setMessage("");
      sfx.setSpinEnergy(5 / 6);
      sfx.playLand(0);

      let landedScatters = next.reduce((n, row) => n + (row[0].kind === "scatter" ? 1 : 0), 0);
      if (landedScatters > 0) sfx.playScatter(landedScatters);

      let pendingFs = false;
      let pendingPick = false;
      let pityAdd = 0;
      let tMark = STOPS[0];
      for (let c = 1; c < 6; c++) {
        if (landedScatters >= 2) {
          setAnticipate(true);
          setReelFast(true);
          sfx.startAnticipate();
        }
        const tease = landedScatters >= 3 ? 900 : landedScatters >= 2 ? 720 : 0;
        await wait(dur(STOPS[c] - tMark) + tease, abort.current);
        tMark = STOPS[c];
        setStoppedCols(c + 1);
        sfx.setSpinEnergy(landedScatters >= 2 ? 1 : 1 - (c + 1) / 6);
        sfx.playLand(c);
        const colN = next.reduce((n, row) => n + (row[c].kind === "scatter" ? 1 : 0), 0);
        if (colN > 0) {
          landedScatters += colN;
          sfx.playScatter(landedScatters);
        }
      }
      sfx.stopSpin();
      setSpinPace(null);
      setStoppedCols(6);
      await wait(dur(90));
      sfx.stopAnticipate();
      sfx.duckMusic(1);
      setAnticipate(false);
      setHoldGrid(null);
      setSpinStrips(null);
      setReelFast(false);
      abort.current.skip = false;

      let board = next;
      const landDrop = zeusDropCount(rng, isFree || inFsRef.current, false);
      const landN = landDrop > 0 ? landDrop + perk.orbBonus : 0;
      if (landN > 0) {
        setPhase("mult");
        setThrowBolt(true);
        sfx.playThunder();
        setTopLine("RAMPA PÚŠŤA NÁSOBIČE");
        const dropped = zeusDrop(board, rng, landN, isFree || inFsRef.current);
        board = dropped.grid;
        setGrid(cloneGrid(board));
        sfx.playMult();
        await wait(dur(480), abort.current);
        setThrowBolt(false);
      }

      const fillAnte = opts?.buy || opts?.free ? false : anteRef.current;
      let sequenceX = 0;
      let scatterPeak = countScatters(next);
      let scatterPayLocked = 0;
      let retriggered = false;
      let fsAnnounced = false;
      let tumbleN = 0;
      let pdfHit = false;
      let clusterCount = 0;
      const fsNow = isFree || inFsRef.current;
      if (!fsNow && scatterPeak >= FS_TRIGGER_SCATTERS) pendingFs = true;
      const DEAD = ["RAMPA STOJÍ", "VALCE SPALI", "NIČ. ZNOVA.", "POKUTA BEZ LÍSTKA", "ZÓNA TICHÁ"];

      for (;;) {
        setPhase("eval");
        const ev = evaluate(board);
        scatterPeak = Math.max(scatterPeak, ev.scatterCount);
        const cl = ev.wins.filter((w) => w.payId !== "scatter").length;
        clusterCount += cl;
        if (ev.wins.some((w) => w.payId === "pdf" && w.count >= 8)) pdfHit = true;

        if (ev.scatterCount > landedScatters) {
          sfx.playScatter(ev.scatterCount);
          landedScatters = ev.scatterCount;
          if (ev.scatterCount >= 3) {
            setShake(true);
            window.setTimeout(() => setShake(false), 320);
          }
        }

        if (!fsNow && scatterPeak >= FS_TRIGGER_SCATTERS) {
          pendingFs = true;
          setTopLine(`${scatterPeak}× SCATTER — FREE SPINS`);
        } else if (fsNow && scatterPeak >= FS_RETRIGGER_SCATTERS && !retriggered) {
          retriggered = true;
          extraFsRef.current = FS_RETRIGGER;
          sfx.playThunder();
          setShake(true);
          window.setTimeout(() => setShake(false), 520);
          setTopLine(`+${FS_RETRIGGER} FREE SPINS`);
        }

        const sPay = scatterPay(ev.scatterCount);
        const clusterX = ev.winX - sPay;
        const scatterDelta = Math.max(0, sPay - scatterPayLocked);
        scatterPayLocked = Math.max(scatterPayLocked, sPay);
        const winX = clusterX + scatterDelta;
        if (winX <= 0) break;

        const tumbleMask = ev.winMask.map((row, r) =>
          row.map((v, c) => {
            const k = board[r][c].kind;
            return k === "scatter" || k === "park" ? false : v;
          }),
        );
        const willPop = tumbleMask.some((row) => row.some(Boolean));

        setWinMask(ev.winMask);
        sequenceX += winX;
        const cashNow = +(sequenceX * currentBet).toFixed(2);
        setBaseWin(cashNow);
        const tier = sequenceX >= 50 ? 3 : sequenceX >= 20 ? 2 : sequenceX >= 5 ? 1 : 0;
        setWinTier(tier);

        const ranked = [...ev.wins].sort((a, b) => b.payX - a.payX);
        const main = ranked[0];
        if (main) {
          const rows = ranked.map((w) => {
            const src =
              w.payId === "scatter"
                ? SCATTER.src
                : (PAY_SYMBOLS.find((p) => p.id === w.payId)?.src ?? PAY_SYMBOLS[0].src);
            const amt = formatMoney(+(w.payX * currentBet).toFixed(2));
            return { count: w.count, src, amount: amt, payX: w.payX, cells: w.cells };
          });
          const top = rows[0];
          setPayHint({ count: top.count, src: top.src, amount: top.amount, name: payName(main.payId) });
          setWinLog((log) => [...log, ...rows.map(({ count, src, amount }) => ({ count, src, amount }))]);
          const avgR = main.cells.reduce((s, p) => s + p.r, 0) / main.cells.length;
          const avgC = main.cells.reduce((s, p) => s + p.c, 0) / main.cells.length;
          setClusterPay({
            x: ((avgC + 0.5) / 6) * 100,
            y: ((avgR + 0.5) / 5) * 100,
            amount: top.amount,
          });
        }

        setPhase("win");
        await wait(dur(160), abort.current);

        const small = sequenceX * currentBet <= currentBet * 0.5;
        setSpinWin(cashNow);
        setDisplayWin(cashNow);
        setTopLine(`TUMBLE ${formatMoney(cashNow)}`);
        await wait(dur(240), abort.current);
        if (pendingFs && !fsNow && !fsAnnounced) {
          fsAnnounced = true;
          sfx.playThunder();
        } else if (tier < 1) sfx.playCoin();
        else sfx.playWin(tier >= 2 ? "full" : "spark");
        await wait(dur(small ? 280 : 480), abort.current);
        await wait(dur(80), abort.current);

        if (!willPop) {
          setClusterPay(null);
          break;
        }

        setPhase("pop");
        setWinMask(tumbleMask);
        sfx.playPop();
        await wait(dur(240), abort.current);
        setGrid(punchHoles(board, tumbleMask));
        setWinMask(null);
        setClusterPay(null);
        setPayHint(null);
        await wait(dur(50), abort.current);
        board = tumble(board, tumbleMask, rng, fillAnte, fsNow);
        const more = zeusDropCount(rng, isFree || inFsRef.current, true);
        const moreN = more > 0 ? more + perk.orbBonus : 0;
        if (moreN > 0) {
          setThrowBolt(true);
          sfx.playZap();
          const dropped = zeusDrop(board, rng, moreN, isFree || inFsRef.current);
          board = dropped.grid;
          sfx.playMult();
        }
        setPhase("tumble");
        sfx.playTumble(tumbleN);
        setGrid(cloneGrid(board));
        tumbleN += 1;
        await wait(280);
        setThrowBolt(false);
        setGrid((g) =>
          g.map((row) => row.map((c) => (c.fall || c.gone ? { ...c, fall: 0, gone: false } : c))),
        );
        await wait(dur(80), abort.current);
      }

      if (!fsNow && scatterPeak >= FS_TRIGGER_SCATTERS) pendingFs = true;
      if (fsNow && scatterPeak >= FS_RETRIGGER_SCATTERS && !retriggered) {
        retriggered = true;
        extraFsRef.current = FS_RETRIGGER;
      }

      const miss = evaluate(board);
      if (sequenceX <= 0 && miss.nearMiss) {
        setTopLine(`${miss.nearMiss.count}/8 ${payName(miss.nearMiss.payId)}`);
        setMessage("SKORO");
        await wait(dur(180), abort.current);
      }

      if (!fsNow) {
        const dead = sequenceX <= 0;
        const add = pityGain(scatterPeak, dead);
        if (add > 0) {
          const nextMap = bumpPity(pityByBetRef.current, currentBet, add);
          const stored = readPity(nextMap, currentBet);
          if (stored >= PITY_GOAL) {
            pityByBetRef.current = spendPity(nextMap, currentBet);
            kontrolaArmedRef.current = true;
            pendingPick = true;
          } else {
            pityByBetRef.current = nextMap;
          }
          pityAdd = add;
          setPityDelta(add);
          window.setTimeout(() => setPityDelta(0), 1100);
          setPityByBet({ ...pityByBetRef.current });
        }
      }

      if ((isFree || inFsRef.current) && sequenceX <= 0 && hasOrb(board)) {
        setTopLine("BEZ VÝHRY PLECHOVKY PREPADNÚ");
        const gone = expireOrbs(board, rng);
        setExpiredUids(gone.expired);
        board = gone.grid;
        setGrid(cloneGrid(board));
        sfx.playPop();
        await wait(dur(360), abort.current);
        setExpiredUids([]);
      }

      const orbs = listOrbs(board);
      const orbSum = orbs.reduce((s, o) => s + o.mult, 0);
      const willThrow = sequenceX > 0 && orbSum > 0;
      let applied = 1;

      if (willThrow) {
        setPhase("mult");
        setActivatingMult(true);
        setThrowBolt(true);
        sfx.playThunder();
        await wait(dur(200), abort.current);
        for (const orb of orbs) {
          setStrike({ r: orb.r, c: orb.c });
          setStruckUids((ids) => [...ids, orb.uid]);
          sfx.playMult();
          const key = flyKey.current++;
          setFlies((f) => [...f, { key, r: orb.r, c: orb.c, mult: orb.mult }]);
          window.setTimeout(() => setFlies((f) => f.filter((x) => x.key !== key)), 700);
          await wait(dur(280), abort.current);
          setStrike(null);
          await wait(dur(40), abort.current);
        }
        if (isFree || inFsRef.current) {
          const gm = globalMultRef.current + orbSum;
          globalMultRef.current = gm;
          setGlobalMult(gm);
          applied = Math.max(1, gm);
        } else {
          applied = orbSum;
        }
        const gone = expireOrbs(board, rng);
        board = gone.grid;
        setGrid(cloneGrid(board));
        setSeqMult(applied);
        const baseCash = +(sequenceX * currentBet).toFixed(2);
        const boosted = +(sequenceX * applied * currentBet).toFixed(2);
        setBaseWin(baseCash);
        setSpinWin(baseCash);
        setDisplayWin(baseCash);
        await wait(dur(120), abort.current);
        setSpinWin(boosted);
        setDisplayWin(boosted);
        setTopLine(`TUMBLE ${formatMoney(boosted)}`);
        sfx.playMult();
        await wait(dur(520), abort.current);
        setThrowBolt(false);
        setActivatingMult(false);
      } else if ((isFree || inFsRef.current) && sequenceX > 0) {
        applied = Math.max(1, globalMultRef.current);
        setSeqMult(applied);
        if (applied > 1) setTopLine(`SIGNÁL ×${applied}`);
      } else {
        setSeqMult(1);
      }

      let paidX = sequenceX * applied;
      let hitMax = false;
      const remain = MAX_WIN_X - featureXRef.current;
      if (paidX >= remain) {
        paidX = Math.max(0, remain);
        hitMax = true;
      }
      featureXRef.current += paidX;
      const cash = +(paidX * currentBet).toFixed(2);
      if (cash > 0 && cash !== +(sequenceX * currentBet).toFixed(2)) {
        setSpinWin(cash);
        setDisplayWin(cash);
      }

      lastPaidXRef.current = currentBet > 0 ? cash / currentBet : 0;
      if (cash > 0) {
        setSpinTape((t) => [{ label: `${lastPaidXRef.current.toFixed(1)}×`, amount: formatMoney(cash) }, ...t].slice(0, 8));
      } else {
        setSpinTape((t) => [{ label: "0×", amount: DEAD[Math.floor(Math.random() * DEAD.length)] }, ...t].slice(0, 8));
      }

      if (cash > 0) {
        setBestWin((w) => Math.max(w, cash));
      }
      await wait(dur(400));
      if (cash > 0 && !isFree && !inFsRef.current) {
        setBalance((b) => +(b + cash).toFixed(2));
        sfx.playPayout();
      }
      const x = lastPaidXRef.current;
      let kind: WinBanner = null;
      if (hitMax) kind = "max";
      else if (x >= WIN_POP_X.epic) kind = "epic";
      else if (x >= WIN_POP_X.mega) kind = "mega";
      else if (x >= WIN_POP_X.big) kind = "big";

      if (!isFree && !opts?.buy && !pendingFs) {
        if (cash > 0) {
          const streak = noteResult(true);
          const parts = rpFromSpin({
            cash,
            bet: currentBet,
            mult: applied,
            tumbles: tumbleN,
            streak,
            banner: bannerFromX(x, hitMax),
            kind: "base",
            ante: anteRef.current && !opts?.buy,
            scatters: scatterPeak,
            rankId: standing(rankRef.current.rp).id,
          });
          pushRank(parts.total, parts);
        } else {
          noteResult(false);
          const dead = rpFromDead(currentBet, standing(rankRef.current.rp).entry);
          if (dead.total) pushRank(dead.total, dead);
          if (perk.deadRebate > 0) {
            const back = +(currentBet * perk.deadRebate).toFixed(2);
            if (back > 0) {
              setBalance((b) => +(b + back).toFixed(2));
            }
          }
        }
      }

      const landed = findTicket(board);
      const gate = ticketResolve(pendingFs, isFree, landed?.ticket ?? null);
      if (gate === "stash" && landed) {
        pendingLiveTicketRef.current = pendingLiveTicketRef.current ?? landed.ticket;
      } else if (gate === "claim" && landed) {
        await runTicket(landed.ticket);
      }

      if (!isFree && !opts?.buy) {
        settleJob({
          win: cash > 0,
          dead: cash <= 0,
          tumbles: tumbleN,
          live: pendingFs,
          ticket: landed?.ticket ?? null,
          pdf: pdfHit,
          signal: 0,
          clusters: clusterCount,
          orbs: orbSum > 0,
        });
      }

      setPots(boardRef.current.pots);
      setPityByBet({ ...pityByBetRef.current });
      if (pityAdd > 0) {
        setPityDelta(pityAdd);
        window.setTimeout(() => setPityDelta(0), 900);
      }

      if (kind && !isFree && !inFsRef.current) {
        bannerOpen.current = true;
        setBanner(kind);
        setBannerAmount(cash);
        if (kind === "max") sfx.playMaxWin();
        else sfx.playBigWin();
        setPhase(kind === "max" ? "max" : "big");
        await waitForBanner();
      }

      setWinMask(null);
      setClusterPay(null);
      setPayHint(null);
      setWinTier(0);
      setPhase("idle");
        setTopLine(
        isFree || inFsRef.current
          ? "3× 4tv OPÄŤ SPUSTÍ FEATURE"
          : "SYMBOLY PLATIA KDEKOĽVEK NA OBRAZOVKE",
      );
      setMessage(cash > 0 ? "" : pendingPick ? "KONTROLA" : isFree ? "" : DEAD[Math.floor(Math.random() * DEAD.length)]);
      sfx.duckMusic(1);

      if (hitMax) return "max";
      if (pendingFs) return "fs";
      if (pendingPick) return "pick";
      return "ok";
    },
    [dur, waitForBanner, pushRank, noteResult, feedPool, runTicket, settleJob],
  );

  const playRound = useCallback(
    async (opts?: { buy?: boolean; resumeFs?: boolean }) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      abort.current.aborted = false;
      if (!opts?.buy && !opts?.resumeFs && !inFsRef.current) setDisplayWin(0);

      try {

      const playFsSpins = async () => {
        const sess = fsSessionRef.current;
        let hitCap = false;
        persistNow();
        while (sess.left > 0) {
          setFsLeft(sess.left);
          persistNow();
          const inner = await runSequence({ free: true });
          sess.left -= 1;
          sess.played += 1;
          setFsLeft(sess.left);
          const betNow = BETS[betIndexRef.current];
          sess.cash = +(sess.cash + lastPaidXRef.current * betNow).toFixed(2);
          sess.peak = Math.max(sess.peak, globalMultRef.current);
          setDisplayWin(+(sess.triggerCash + sess.cash).toFixed(2));
          if (extraFsRef.current > 0) {
            const add = extraFsRef.current;
            extraFsRef.current = 0;
            sess.extra += add;
            sess.left += add;
            sess.total += add;
            setFsLeft(sess.left);
            setFsTotal(sess.total);
            setMessage(`+${add} voľných točení`);
            sfx.playScatter(4);
            persistNow();
            await wait(dur(720), abort.current);
          }
          persistNow();
          if (inner === "max") {
            hitCap = true;
            break;
          }
          await wait(dur(160), abort.current);
        }
        return hitCap;
      };

      const closeFs = async (hitCap: boolean, applyBoughtRank: (returned: number, extra: { mult: number; bannerHit: boolean; retriggers?: number }) => void) => {
        const sess = fsSessionRef.current;
        const betNow = BETS[betIndexRef.current];
        const fsCash = sess.cash;
        await wait(400);
        setInFs(false);
        inFsRef.current = false;
        setFsLeft(0);
        setGlobalMult(0);
        globalMultRef.current = 0;
        setDisplayWin(fsCash);
        setSpinWin(fsCash);
        setBannerMeta({
          spins: sess.played,
          extra: sess.extra,
          peakMult: sess.peak,
          terminated: hitCap,
        });
        bannerOpen.current = true;
        setBanner("fsTotal");
        setBannerAmount(fsCash);
        setPhase(hitCap ? "max" : "big");
        setTopLine("SIEŤ SPADLA");
        setMessage(fsCash > 0 ? `VÝHRA ${formatMoney(fsCash)}` : "SIEŤ SPADLA");
        if (fsCash > 0 || hitCap) sfx.playBigWin();
        else sfx.playPayout();
        sfx.stopLiveBed();
        if (fsCash > 0) setBalance((b) => +(b + fsCash).toFixed(2));
        const bought = sess.bought;
        const peak = sess.peak;
        const extra = sess.extra;
        const triggerCash = sess.triggerCash;
        fsSessionRef.current = {
          left: 0,
          total: 0,
          cash: 0,
          played: 0,
          extra: 0,
          peak: 0,
          bought: false,
          triggerCash: 0,
        };
        persistNow();
        await waitForBanner();
        setBannerMeta(null);
        const stashed = pendingLiveTicketRef.current;
        pendingLiveTicketRef.current = null;
        if (stashed) await runTicket(stashed);
        settleJob({
          win: fsCash > 0,
          dead: fsCash <= 0,
          tumbles: 0,
          live: true,
          ticket: stashed,
          pdf: false,
          signal: peak,
          clusters: 0,
          orbs: peak > 0,
          spun: false,
        });
        setPhase("idle");
        setTopLine("SYMBOLY PLATIA KDEKOĽVEK NA OBRAZOVKE");
        await wait(600);
        if (bought) {
          applyBoughtRank(+(fsCash + triggerCash).toFixed(2), {
            mult: Math.max(1, peak),
            bannerHit: hitCap,
            retriggers: extra > 0 ? Math.round(extra / FS_RETRIGGER) : 0,
          });
        } else if (fsCash > 0) {
          const streak = noteResult(true);
          const fx = betNow > 0 ? fsCash / betNow : 0;
          const parts = rpFromSpin({
            cash: fsCash,
            bet: betNow,
            mult: Math.max(1, peak),
            tumbles: 0,
            streak,
            banner: bannerFromX(fx, hitCap),
            kind: "fs",
            retriggers: extra > 0 ? Math.round(extra / FS_RETRIGGER) : 0,
            rankId: standing(rankRef.current.rp).id,
          });
          pushRank(parts.total, parts);
        } else {
          noteResult(false);
          const dead = rpFromDead(betNow, standing(rankRef.current.rp).entry);
          if (dead.total) pushRank(dead.total, dead);
        }
      };

      const makeApplyBought = (betNow: number, buyCost: number, buyXNow: number, rankIdNow: string) =>
        (returned: number, extra: { mult: number; bannerHit: boolean; retriggers?: number }) => {
          const profit = returned >= buyCost;
          const streak = noteResult(profit);
          const wx = buyCost > 0 ? returned / buyCost : 0;
          const settled = settleBuyRank({
            returned,
            bet: betNow,
            buyX: buyXNow,
            entry: standing(rankRef.current.rp).entry,
            extras: {
              mult: extra.mult,
              tumbles: 0,
              streak,
              banner: bannerFromX(wx, extra.bannerHit),
              retriggers: extra.retriggers,
              rankId: rankIdNow,
            },
          });
          if (settled.delta) pushRank(settled.delta, settled.parts);
        };

      if (opts?.resumeFs) {
        const sess = fsSessionRef.current;
        if (sess.left <= 0) {
          busyRef.current = false;
          setBusy(false);
          return;
        }
        const betNow = BETS[betIndexRef.current];
        const rankIdNow = standing(rankRef.current.rp).id;
        const buyXNow = buyXOf(rankIdNow);
        const buyCost = +(betNow * buyXNow).toFixed(2);
        setInFs(true);
        inFsRef.current = true;
        setPhase("fs");
        setFsLeft(sess.left);
        setFsTotal(sess.total);
        setDisplayWin(sess.cash);
        setMessage(`${sess.left} voľných točení`);
        setTopLine(`PARKNET LIVE · ${sess.left}`);
        persistNow();
        sfx.startLiveBed();
        const hitCap = await playFsSpins();
        await closeFs(hitCap, makeApplyBought(betNow, buyCost, buyXNow, rankIdNow));
        busyRef.current = false;
        setBusy(false);
        return;
      }

      const r = await runSequence(opts);
      const betNow = BETS[betIndexRef.current];
      const triggerCash = +(lastPaidXRef.current * betNow).toFixed(2);
      const rankIdNow = standing(rankRef.current.rp).id;
      const buyXNow = buyXOf(rankIdNow);
      const buyCost = +(betNow * buyXNow).toFixed(2);
      const fsCount = fsSpinsOf(rankIdNow);
      const applyBoughtRank = makeApplyBought(betNow, buyCost, buyXNow, rankIdNow);

      if (autoRef.current) {
        if (r === "fs") {
          autoRef.current = false;
          setAutoOn(false);
          setAutoLeft(0);
          setAutoReason("AUTO STOP · FREE SPINS — nespúšťa sa po bonuse");
        } else if (r === "pick") {
          autoRef.current = false;
          setAutoOn(false);
          setAutoLeft(0);
          setAutoReason("AUTO STOP · KONTROLA");
        } else if (lastPaidXRef.current >= 20) {
          autoRef.current = false;
          setAutoOn(false);
          setAutoLeft(0);
          setAutoReason("AUTO STOP · 20×");
        } else if (balanceRef.current <= autoFloorRef.current) {
          autoRef.current = false;
          setAutoOn(false);
          setAutoLeft(0);
          setAutoReason("AUTO STOP · 50% KREDIT");
        }
      }

      if (r === "fs") {
        await wait(300);
        fsSessionRef.current = {
          left: fsCount,
          total: fsCount,
          cash: 0,
          played: 0,
          extra: 0,
          peak: 0,
          bought: Boolean(opts?.buy),
          triggerCash,
        };
        setInFs(true);
        inFsRef.current = true;
        setPhase("fs");
        setDisplayWin(triggerCash);
        setGlobalMult(0);
        globalMultRef.current = 0;
        setFsLeft(fsCount);
        setFsTotal(fsCount);
        setMessage(`${fsCount} voľných točení`);
        persistNow();
        sfx.playFsStart();
        sfx.startLiveBed();
        bannerOpen.current = true;
        setBanner("fs");
        setBannerAmount(0);
        setTopLine("GRATULUJEME · 15 VOLNÝCH TOČENÍ");
        await waitForBanner();
        await wait(200);

        const hitCap = await playFsSpins();
        await closeFs(hitCap, applyBoughtRank);
      } else if (opts?.buy) {
        applyBoughtRank(triggerCash, { mult: 1, bannerHit: r === "max" });
      }

      if (r === "max") {
        kontrolaArmedRef.current = false;
      } else if (r === "pick" || kontrolaArmedRef.current) {
        kontrolaArmedRef.current = false;
        if (autoRef.current) {
          autoRef.current = false;
          setAutoOn(false);
          setAutoLeft(0);
          setAutoReason("AUTO STOP · KONTROLA");
        }
        await runPick();
      }
    } catch {
      setBanner(null);
      setPhase("idle");
      setAnticipate(false);
      setHoldGrid(null);
      setSpinStrips(null);
    } finally {
      busyRef.current = false;
      setBusy(false);
      abort.current.skip = false;
      abort.current.aborted = false;
    }
  },
    [dur, runSequence, waitForBanner, runPick, pushRank, noteResult, persistNow, runTicket, settleJob],
  );

  useEffect(() => {
    if (!started || !hydrated || resumeOnce.current) return;
    if (!inFsRef.current || fsSessionRef.current.left <= 0) return;
    resumeOnce.current = true;
    void playRound({ resumeFs: true });
  }, [started, hydrated, playRound]);

  const stopReels = useCallback(() => {
    abort.current.skip = true;
    setReelFast(true);
    sfx.stopAnticipate();
  }, []);

  const spin = useCallback(async () => {
    if (!started || inFsRef.current) return;
    if (busyRef.current) return;
    await playRound();
  }, [started, playRound]);

  const buyBonus = useCallback(() => {
    if (!started || busyRef.current || inFsRef.current) return;
    setBuyAsk(true);
  }, [started]);

  const cancelBuy = useCallback(() => setBuyAsk(false), []);

  const confirmBuy = useCallback(async () => {
    if (!started || busyRef.current || inFsRef.current) return;
    setBuyAsk(false);
    await playRound({ buy: true });
  }, [started, playRound]);

  const openSpend = useCallback(() => {
    if (busyRef.current || inFsRef.current) return;
    if (!canSpend(balanceRef.current)) return;
    if (!job) setJobOffer(dealJobs(createRng(), balanceRef.current, BETS[betIndexRef.current]));
    setSpendOpen(true);
    sfx.playClick();
  }, [job, jobOffer]);

  const takeJob = useCallback((card: JobCard) => {
    if (busyRef.current || inFsRef.current || jobRef.current) return;
    if (!canSpend(balanceRef.current)) return;
    if (balanceRef.current < card.stake) return;
    const betNow = BETS[betIndexRef.current];
    const taken = { ...card, lockBet: card.lockBet || betNow };
    setBalance((b) => +(b - taken.stake).toFixed(2));
    jobRef.current = taken;
    setJob(taken);
    setJobOffer(null);
    setSpendOpen(false);
    setTopLine(`${taken.title} · stávka ${formatMoney(taken.lockBet)} zamknutá`);
    sfx.playClick();
  }, []);

  const rerollJobs = useCallback(() => {
    if (busyRef.current || inFsRef.current) return;
    const cost = rerollCost(balanceRef.current, BETS[betIndexRef.current]);
    if (balanceRef.current < cost) return;
    if (!canSpend(balanceRef.current)) return;
    setBalance((b) => +(b - cost).toFixed(2));
    setJobOffer(dealJobs(createRng(), balanceRef.current - cost, BETS[betIndexRef.current]));
    sfx.playClick();
  }, []);

  const startAuto = useCallback((n: number) => {
    if (busyRef.current || inFsRef.current) return;
    autoFloorRef.current = balanceRef.current * 0.5;
    setAutoReason(null);
    setAutoOn(true);
    autoRef.current = true;
    setAutoLeft(n);
  }, []);

  const stopAuto = useCallback(() => {
    setAutoOn(false);
    autoRef.current = false;
    setAutoLeft(0);
  }, []);

  useEffect(() => {
    if (!autoOn || busy || inFs || !started) return;
    if (autoLeft <= 0) {
      setAutoOn(false);
      autoRef.current = false;
      return;
    }
    let cancel = false;
    void (async () => {
      await wait(200);
      if (cancel || !autoRef.current) return;
      setAutoLeft((n) => n - 1);
      await playRound();
    })();
    return () => {
      cancel = true;
    };
  }, [autoOn, autoLeft, busy, inFs, started, playRound]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.code !== "Enter" && e.code !== "Escape") return;
      e.preventDefault();
      if (!started) return;
      if (pickOpenRef.current) {
        if (pickEndedRef.current && (e.code === "Space" || e.code === "Enter")) finishPick();
        return;
      }
      if (bannerOpen.current) {
        closeBanner();
        return;
      }
      if (e.code !== "Space") return;
      if (busyRef.current) return;
      if (!inFsRef.current) void playRound();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, playRound, stopReels, closeBanner, finishPick]);

  return {
    started,
    start,
    balance,
    bet,
    stake,
    betIndex,
    changeBet,
    muted,
    toggleMute,
    turbo,
    setTurbo,
    quick,
    setQuick,
    ante,
    setAnte: (v: boolean) => {
      if (!busyRef.current) {
        setAnte(v);
        sfx.playClick();
      }
    },
    grid,
    holdGrid,
    phase,
    busy,
    winMask,
    spinWin,
    displayWin,
    baseWin,
    fsLeft,
    fsTotal,
    inFs,
    globalMult,
    seqMult,
    banner,
    bannerAmount,
    bannerMeta,
    closeBanner,
    pickOpen,
    pickTiles,
    pickRevealed,
    pickEnded,
    pickTotalX,
    pickKillId,
    pickPicks,
    revealPick,
    finishPick,
    pity,
    pityDelta,
    pityGoal: PITY_GOAL,
    rank: standing(rp),
    rankPeak,
    rankShield,
    rankDelta,
    rankFlash,
    rankOpen,
    setRankOpen,
    winStreak,
    rankParts,
    perk,
    buyX,
    weekDue,
    weekTarget: standing(dropOneGroup(rp)),
    pots,
    jpHit,
    ticketLock,
    poolEligible: isEligibleBet(bet),
    clearRankFlash: () => setRankFlash(null),
    autoOn,
    autoLeft,
    autoReason,
    startAuto,
    stopAuto,
    throwBolt,
    shake,
    paytableOpen,
    setPaytableOpen,
    message,
    stoppedCols,
    reelFast,
    spinPace,
    cam,
    spinStrips,
    winTier,
    anticipate,
    activatingMult,
    struckUids,
    strike,
    flies,
    clusterPay,
    payHint,
    winLog,
    spinTape,
    expiredUids,
    topLine,
    spin,
    stopReels,
    buyBonus,
    buyAsk,
    confirmBuy,
    cancelBuy,
    refill,
    reloadHit: reloadPunish({
      bet,
      rp,
      streak: reloadStreak + 1,
      maxBet: BETS[BETS.length - 1],
    }).delta,
    bestWin,
    canSpin: started && !busy && !inFs && !buyAsk && balance >= stake,
    canBuy: started && !busy && !inFs && !buyAsk && balance >= +(bet * buyX).toFixed(2),
    surplus: canSpend(balance),
    spendOpen,
    setSpendOpen,
    openSpend,
    takeJob,
    rerollJobs,
    job,
    jobOffer,
    jobToast,
    rerollCost: rerollCost(balance, bet),
    surplusX: JOB_BANK,
  };
}
