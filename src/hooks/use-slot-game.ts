import { useCallback, useEffect, useRef, useState } from "react";
import {
  ALL_ART,
  BETS,
  FS_RETRIGGER,
  FS_RETRIGGER_SCATTERS,
  FS_TRIGGER_SCATTERS,
  fsTriggerSpins,
  MAX_WIN_X,
  WIN_POP_X,
  PAY_SYMBOLS,
  SCATTER,
  START_BALANCE,
  TICKETS,
  payName,
  scatterPay,
  type Cell,
  type PayId,
} from "@/lib/slot/symbols";
import {
  cloneGrid,
  countScatters,
  createRng,
  emptyGrid,
  evaluate,
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
import { applyRankDelta, applyWeeklyDecay, bannerFromX, buyXOf, dropOneDivision, fsSpinsOf, nextRebate, perkOf, rpFromDead, rpFromJob, rpFromSpin, settleBuyRank, standing, RELOAD_STABILIZE, WEEK_MS, type RankBreakdown, type RankFlash } from "@/lib/slot/ranks";
import * as sfx from "@/lib/slot/audio";
import { formatMoney } from "@/lib/slot/format";
import { emptyPlayerSave, readLocalSave, writeLocalSave, type PlayerSave } from "@/lib/slot/player-save";
import { emptyBoard, isEligibleBet, ticketResolve, TIER_BY_ID, type BoardSnap, type JackpotHit, type TierId } from "@/lib/slot/jackpot";
import { fetchParkPool, postParkClaim, postParkSpin, withRetry, type PoolSpinResult } from "@/lib/slot/jackpot-api";
import { bumpDesk, bumpLocalDesk, bumpTicketDesk, deskToday, emptyDesk, fetchDesk, ticketProfit, type DeskDay } from "@/lib/slot/desk-api";
import { putBoard, readBestMark, readBestRecipe, readNick, saveNick, skipNick, winHow, writeBestHow, writeBestRecipe } from "@/lib/slot/board-api";
import { emptyTally, mergeTally, notePays, recipeTumbles, topCans, topPays, type SeqTally, type WinRecipe } from "@/lib/slot/win-recipe";
import { HEAT_MAX, heatFromWin } from "@/lib/slot/heat";
import { ZASAH, modMul, rollTarget, rollWindows, tickMod, windowCount, type ChaseMod, type ChaseModKind, type ChaseOutcome, type ChaseState, type HackWindow } from "@/lib/slot/zasah";
import { BUILD_ID, dropStaleCaches, hardReload, releaseMatches } from "@/lib/slot/release";
import { startDuel, tickDuel, confirmSwap, duelLeft, applyPeerTick, makeRoomCode, canDuelSpin, duelWinner, duelPot, duelCreditDelta, forfeitDuel, type Duel, type DuelMode, type DuelLink } from "@/lib/slot/duel";
import { duelForfeit, duelLeave, duelTick } from "@/lib/slot/duel-api";
import {
  canSpend,
  dealJobs,
  freshDaily,
  jobParknetBroke,
  jobShownGoal,
  jobStatus,
  stampDaily,
  tickJob,
  freeSpinsLabel,
  JOB_BANK,
  type DailyBoard,
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

/** Modifier step shown on the win meter: gross → net with a chip. */
export interface TaxFly {
  kind: ChaseModKind;
  gross: number;
  net: number;
  delta: number;
}

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



function decodeArt(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timer = window.setTimeout(finish, 8000);
    img.onload = () => {
      window.clearTimeout(timer);
      if (typeof img.decode === "function") void img.decode().then(finish, finish);
      else finish();
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      finish();
    };
    img.decoding = "async";
    img.src = src;
  });
}

/** Two frames so the spin strip is on screen before the stop clock starts. */
function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(() => requestAnimationFrame(finish));
    window.setTimeout(finish, 48);
  });
}

export function useSlotGame() {
  const [started, setStarted] = useState(false);
  const [bootReady, setBootReady] = useState(false);
  const [bootPct, setBootPct] = useState(0);
  const [booting, setBooting] = useState(false);
  const bootingRef = useRef(false);
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
  const [pickClear, setPickClear] = useState(false);
  const [pityByBet, setPityByBet] = useState<PityMap>({});
  const [pityDelta, setPityDelta] = useState(0);
  const [rp, setRp] = useState(0);
  const [rankPeak, setRankPeak] = useState(0);
  const [rankShield, setRankShield] = useState(false);
  const [rankDelta, setRankDelta] = useState(0);
  const [rankTick, setRankTick] = useState(0);
  const [rankFlash, setRankFlash] = useState<RankFlash | null>(null);
  const [bustAsk, setBustAsk] = useState(false);
  const [exekucia, setExekucia] = useState<{ from: string; peak: string; infinite: boolean } | null>(null);
  const rankQ = useRef<RankFlash[]>([]);
  const [winTier, setWinTier] = useState(0);
  const [rankOpen, setRankOpen] = useState(false);
  const [winStreak, setWinStreak] = useState(0);
  const [rankParts, setRankParts] = useState<RankBreakdown | null>(null);
  const [pots, setPots] = useState(emptyBoard().pots);
  const potsRef = useRef(pots);
  potsRef.current = pots;
  const jpShowRef = useRef(false);
  const [jpHit, setJpHit] = useState<JackpotHit | null>(null);
  const [ticketLock, setTicketLock] = useState(false);
  const pendingLiveTicketRef = useRef<TierId | null>(null);
  const [job, setJob] = useState<JobCard | null>(null);
  const [ticketSeal, setTicketSeal] = useState<{ job: JobCard; verdict: "ok" | "fail" } | null>(null);
  const jobRef = useRef<JobCard | null>(null);
  const rebateRef = useRef({ paid: 0, spins: 0 });
  const [jobOffer, setJobOffer] = useState<JobCard[] | null>(null);
  const [daily, setDaily] = useState<DailyBoard | null>(null);
  const dailyRef = useRef<DailyBoard | null>(null);
  const [spendOpen, setSpendOpen] = useState(false);
  const [jobToast, setJobToast] = useState<string | null>(null);
  const [lcdFlash, setLcdFlash] = useState<{ job: JobCard; verdict: "ok" | "fail" } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const [autoOn, setAutoOn] = useState(false);
  const [autoHalt, setAutoHalt] = useState(true);
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
  const autoHaltRef = useRef(true);
  const busyRef = useRef(false);
  const extraFsRef = useRef(0);
  const triggerScatterRef = useRef(FS_TRIGGER_SCATTERS);
  const flyKey = useRef(1);
  const lastPaidXRef = useRef(0);
  const roundCashRef = useRef(0);
  const [duel, setDuel] = useState<Duel | null>(null);
  const duelRef = useRef<Duel | null>(null);
  const [duelOpen, setDuelOpen] = useState(false);
  const [duelLink, setDuelLink] = useState<DuelLink | null>(null);
  const duelLinkRef = useRef<DuelLink | null>(null);
  const [duelPeer, setDuelPeer] = useState("");
  const pendingPeerTick = useRef<{ have: number; score: number } | null>(null);
  const duelSettled = useRef(false);
  const duelBlanks = useRef(0);
  const settleGen = useRef(0);
  const duelFastRef = useRef(false);
  const skipDuelTick = useRef(false);
  const autoFloorRef = useRef(0);
  const bannerWait = useRef<(() => void) | null>(null);
  const bannerOpen = useRef(false);
  const pickWait = useRef<(() => void) | null>(null);
  const pickOpenRef = useRef(false);
  const pickEndedRef = useRef(false);
  const pickTotalXRef = useRef(0);
  const pickClearRef = useRef(false);
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
  const [desk, setDesk] = useState<DeskDay>(emptyDesk);
  const [mine, setMine] = useState<DeskDay>(emptyDesk);
  const mineRef = useRef<DeskDay>(emptyDesk());
  const bestHowRef = useRef("");
  const bestStakeRef = useRef(0);
  const bestRecipeRef = useRef<WinRecipe | null>(null);
  /** What the last runSequence paid with (symbols, cans, scatters). */
  const lastTallyRef = useRef<SeqTally>(emptyTally());
  /** Free-spin feature total, folded spin by spin. */
  const fsTallyRef = useRef<SeqTally>(emptyTally());
  const fsAnteRef = useRef(false);
  const heatRef = useRef(0);
  const [heat, setHeat] = useState(0);
  const klientiRef = useRef(0);
  const [klienti, setKlienti] = useState(0);
  const chaseRef = useRef<ChaseState | null>(null);
  const [chase, setChase] = useState<ChaseState | null>(null);
  const modRef = useRef<ChaseMod | null>(null);
  const [chaseMod, setChaseMod] = useState<ChaseMod | null>(null);
  const [hackWindows, setHackWindows] = useState<HackWindow[]>([]);
  const [activeWindow, setActiveWindow] = useState(-1);
  const [windowPhase, setWindowPhase] = useState<"travel" | "hover" | "land" | "reveal">("reveal");
  const [chaseCard, setChaseCard] = useState<null | { outcome: ChaseOutcome; line: string; rp: number }>(null);
  const chaseCardRef = useRef(chaseCard);
  const [taxFly, setTaxFly] = useState<TaxFly | null>(null);
  const [taxKey, setTaxKey] = useState(0);
  const staleRef = useRef(false);
  const [stale, setStale] = useState(false);
  const [nick, setNick] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [nickAsk, setNickAsk] = useState(false);

  turboRef.current = turbo;
  quickRef.current = quick;
  anteRef.current = ante;
  inFsRef.current = inFs;
  balanceRef.current = balance;
  betIndexRef.current = betIndex;
  autoRef.current = autoOn;
  autoHaltRef.current = autoHalt;
  busyRef.current = busy;
  gridRef.current = grid;
  duelRef.current = duel;
  duelLinkRef.current = duelLink;
  chaseCardRef.current = chaseCard;

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
    modMul: 1,
  });
  const resumeOnce = useRef(false);

  const applySave = useCallback((s: PlayerSave) => {
    setBalance(s.balance);
    setBetIndex(s.betIndex);
    setMuted(s.muted);
    setTurbo(s.turbo);
    setQuick(s.quick);
    setAnte(s.ante);
    setAutoHalt(s.autoHalt !== false);
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
    setDeviceId(playerIdRef.current);
    heatRef.current = s.heat ?? 0;
    setHeat(heatRef.current);
    klientiRef.current = s.klienti ?? 0;
    setKlienti(klientiRef.current);
    if (s.chaseSpin >= 0) {
      const restored: ChaseState = {
        spin: s.chaseSpin,
        target: s.chaseTarget,
        hits: s.chaseHits,
        strikes: s.chaseStrikes,
      };
      chaseRef.current = restored;
      setChase(restored);
      if (restored.strikes >= 2) sfx.startHeartbeat();
    } else {
      chaseRef.current = null;
      setChase(null);
    }
    if (s.chaseMod && s.chaseModLeft > 0) {
      const restoredMod = { kind: s.chaseMod, left: s.chaseModLeft };
      modRef.current = restoredMod;
      setChaseMod(restoredMod);
    } else {
      modRef.current = null;
      setChaseMod(null);
    }
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
      modMul: s.fsModMul || 1,
    };
    const loadedRaw = s.job ? { ...s.job, lockBet: s.job.lockBet || BETS[s.betIndex] } : null;
    const loaded =
      loadedRaw?.seal && !(s.inFs && s.fsLeft > 0)
        ? { ...loadedRaw, seal: false, spun: loadedRaw.limit }
        : loadedRaw;
    const dead = Boolean(loaded && loaded.spun >= loaded.limit && loaded.have < loaded.need);
    setJob(dead ? null : loaded);
    jobRef.current = dead ? null : loaded;
    pendingLiveTicketRef.current = s.pendingLiveTicket;
    if (s.dailyCards.length === 3 && s.dailyDay === deskToday()) {
      const board = { day: s.dailyDay, cards: s.dailyCards, marks: s.dailyMarks };
      dailyRef.current = board;
      setDaily(board);
    } else {
      dailyRef.current = null;
      setDaily(null);
    }
    const day = deskToday();
    const sameDay = s.deskDay === day;
    let ticketLost = sameDay ? s.deskTicketLost : 0;
    if (dead && loaded) {
      ticketLost = +(ticketLost + Math.max(0, loaded.stake)).toFixed(2);
      setTicketSeal({ job: loaded, verdict: "fail" });
    }
    const mineDay: DeskDay = {
      day,
      wagered: sameDay ? s.deskWagered : 0,
      paid: sameDay ? s.deskPaid : 0,
      best: sameDay ? s.deskBest : 0,
      wins: 0,
      ticketWon: sameDay ? s.deskTicketWon : 0,
      ticketLost,
    };
    mineRef.current = mineDay;
    const mark = readBestMark(mineDay.day);
    bestHowRef.current = mark.how;
    bestStakeRef.current = mark.stake;
    bestRecipeRef.current = readBestRecipe(mineDay.day);
    setNick(readNick());
    setMine(mineDay);
    saveSnapRef.current = {
      ...s,
      job: dead ? null : s.job,
      deskDay: day,
      deskWagered: mineDay.wagered,
      deskPaid: mineDay.paid,
      deskBest: mineDay.best,
      deskTicketWon: mineDay.ticketWon,
      deskTicketLost: mineDay.ticketLost,
      heat: heatRef.current,
      klienti: klientiRef.current,
      chaseSpin: chaseRef.current ? chaseRef.current.spin : -1,
      chaseTarget: chaseRef.current?.target ?? null,
      chaseHits: chaseRef.current?.hits ?? 0,
      chaseStrikes: chaseRef.current?.strikes ?? 0,
      chaseMod: modRef.current?.kind ?? null,
      chaseModLeft: modRef.current?.left ?? 0,
      fsModMul: fsSessionRef.current.modMul,
    };
    if (dead) writeLocal(saveSnapRef.current);
  }, []);

  const flushSave = useCallback((payload?: PlayerSave) => {
    if (!readySave.current) return;
    const next = payload ?? { ...saveSnapRef.current, updatedAt: Date.now() };
    saveSnapRef.current = next;
    writeLocal(next);
  }, []);

  const bumpToday = useCallback((wager: number, win: number, how = "", maxStake = 0, recipe: WinRecipe | null = null) => {
    const day = deskToday();
    const prevBest = mineRef.current.day === day ? mineRef.current.best : 0;
    if (mineRef.current.day !== day) {
      bestHowRef.current = "";
      bestStakeRef.current = 0;
      bestRecipeRef.current = null;
    }
    if (win > prevBest && how) {
      bestHowRef.current = how;
      bestStakeRef.current = maxStake;
      writeBestHow(day, how, maxStake);
    }
    if (win > prevBest && win > 0) {
      bestRecipeRef.current = recipe;
      writeBestRecipe(day, recipe);
    }
    const nextMine = bumpLocalDesk(mineRef.current, wager, win);
    mineRef.current = nextMine;
    setMine(nextMine);
    void bumpDesk(wager, win)
      .then(setDesk)
      .catch(() => {});
    if (readNick() && playerIdRef.current) {
      void putBoard(
        playerIdRef.current,
        nextMine.wagered,
        nextMine.paid,
        nextMine.best,
        bestHowRef.current,
        bestStakeRef.current,
        bestRecipeRef.current,
      ).catch(() => {});
    }
  }, []);

  const noteTicket = useCallback((won: number, lost: number) => {
    const nextMine = bumpTicketDesk(mineRef.current, won, lost);
    mineRef.current = nextMine;
    setMine(nextMine);
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
      dailyDay: dailyRef.current?.day ?? "",
      dailyCards: dailyRef.current?.cards ?? [],
      dailyMarks: dailyRef.current?.marks ?? [null, null, null],
      autoHalt: autoHaltRef.current,
      deskDay: mineRef.current.day,
      deskWagered: mineRef.current.wagered,
      deskPaid: mineRef.current.paid,
      deskBest: mineRef.current.best,
      deskTicketWon: mineRef.current.ticketWon,
      deskTicketLost: mineRef.current.ticketLost,
      heat: heatRef.current,
      klienti: klientiRef.current,
      chaseSpin: chaseRef.current ? chaseRef.current.spin : -1,
      chaseTarget: chaseRef.current?.target ?? null,
      chaseHits: chaseRef.current?.hits ?? 0,
      chaseStrikes: chaseRef.current?.strikes ?? 0,
      chaseMod: modRef.current?.kind ?? null,
      chaseModLeft: modRef.current?.left ?? 0,
      fsModMul: fsSessionRef.current.modMul,
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
      autoHalt,
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
      dailyDay: dailyRef.current?.day ?? "",
      dailyCards: dailyRef.current?.cards ?? [],
      dailyMarks: dailyRef.current?.marks ?? [null, null, null],
      deskDay: mineRef.current.day,
      deskWagered: mineRef.current.wagered,
      deskPaid: mineRef.current.paid,
      deskBest: mineRef.current.best,
      deskTicketWon: mineRef.current.ticketWon,
      deskTicketLost: mineRef.current.ticketLost,
      heat: heatRef.current,
      klienti: klientiRef.current,
      chaseSpin: chaseRef.current ? chaseRef.current.spin : -1,
      chaseTarget: chaseRef.current?.target ?? null,
      chaseHits: chaseRef.current?.hits ?? 0,
      chaseStrikes: chaseRef.current?.strikes ?? 0,
      chaseMod: modRef.current?.kind ?? null,
      chaseModLeft: modRef.current?.left ?? 0,
      fsModMul: fsSessionRef.current.modMul,
    };
    saveSnapRef.current = payload;
    writeLocal(payload);
  }, [hydrated, balance, betIndex, muted, turbo, quick, ante, autoHalt, bestWin, pityByBet, rp, rankPeak, rankShield, winStreak, pots, reloadStreak, weekDue, fsLeft, inFs, globalMult, job, daily, heat, klienti, chase, chaseMod]);

  useEffect(() => {
    let stop = false;
    const check = async () => {
      if (stop || staleRef.current || BUILD_ID === "local") return;
      try {
        const ok = await releaseMatches();
        if (ok || stop || staleRef.current) return;
        if (busyRef.current || chaseRef.current || chaseCardRef.current) return;
        staleRef.current = true;
        setStale(true);
        await dropStaleCaches();
        hardReload();
      } catch {
        /* a dropped network does not kill the current build */
      }
    };
    void check();
    const id = window.setInterval(() => void check(), 20000);
    const onShow = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      stop = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, []);

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
    if (!busyRef.current && !jpShowRef.current) setPots(s.pots);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void withRetry(fetchParkPool)
      .then(applyBoard)
      .catch(() => {});
    void fetchDesk()
      .then(setDesk)
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
    const deskId = window.setInterval(() => {
      void fetchDesk()
        .then(setDesk)
        .catch(() => {});
    }, 4000);
    return () => {
      window.clearInterval(id);
      window.clearInterval(deskId);
    };
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
      const ms = rankFlash.event === "up" || rankFlash.event === "down" ? 1800 : 1200;
      const t = window.setTimeout(() => setRankFlash(null), ms);
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
    }, 1400);
    return () => window.clearTimeout(t);
  }, [rankTick]);

  useEffect(() => {
    if (!jobToast) return;
    const t = window.setTimeout(() => setJobToast(null), 1800);
    return () => window.clearTimeout(t);
  }, [jobToast]);

  useEffect(() => {
    if (!lcdFlash) return;
    const t = window.setTimeout(() => setLcdFlash(null), 4000);
    return () => window.clearTimeout(t);
  }, [lcdFlash]);

  const dur = useCallback((base: number) => {
    if (duelFastRef.current || abort.current.skip) return 0;
    if (turboRef.current) return Math.round(base * 0.34);
    if (quickRef.current) return Math.round(base * 0.62);
    return base;
  }, []);

  const start = useCallback(async () => {
    if (bootingRef.current) return;
    bootingRef.current = true;
    setBooting(true);
    sfx.unlockAudio();
    sfx.setMuted(muted);
    await Promise.race([
      sfx.whenSpinReady(),
      new Promise<void>((resolve) => window.setTimeout(resolve, 2200)),
    ]);
    sfx.startAmbience();
    setStarted(true);
    setPhase(inFsRef.current && fsSessionRef.current.left > 0 ? "fs" : "idle");
    setBooting(false);
    bootingRef.current = false;
  }, [muted]);

  useEffect(() => {
    let cancel = false;
    const arts = ALL_ART;
    let n = 0;
    void Promise.all(
      arts.map((src) =>
        decodeArt(src).then(() => {
          n += 1;
          if (!cancel) setBootPct(Math.round((n / arts.length) * 100));
        }),
      ),
    ).then(() => {
      if (!cancel) setBootReady(true);
    });
    return () => {
      cancel = true;
    };
  }, []);

  const toggleMute = useCallback(() => {
    sfx.unlockAudio();
    setMuted((m) => {
      const n = !m;
      sfx.setMuted(n);
      if (!n && (chaseRef.current?.strikes ?? 0) >= 2) sfx.startHeartbeat();
      return n;
    });
  }, []);

  const changeBet = useCallback((dir: -1 | 1) => {
    if (busyRef.current || jobRef.current || duelRef.current || duelLinkRef.current || chaseRef.current) {
      if (chaseRef.current) setJobToast("Počas ZÁSAHU zamknuté");
      return;
    }
    setBetIndex((i) => Math.min(BETS.length - 1, Math.max(0, i + dir)));
    sfx.playClick();
  }, []);

  useEffect(() => () => sfx.stopHeartbeat(), []);

  const askBust = useCallback(() => {
    if (busyRef.current || inFsRef.current || duelRef.current || chaseRef.current || chaseCardRef.current) return;
    if (balanceRef.current >= BETS[0]) return;
    setBustAsk(true);
    sfx.playClick();
  }, []);

  const cancelBust = useCallback(() => {
    setBustAsk(false);
    sfx.playClick();
  }, []);

  const confirmBust = useCallback(() => {
    if (busyRef.current || balanceRef.current >= BETS[0]) {
      setBustAsk(false);
      return;
    }
    setBustAsk(false);
    const before = standing(rankRef.current.rp);
    const peakStand = standing(Math.max(rankRef.current.peak, rankRef.current.rp));
    const from = `${before.name}${before.roman ? ` ${before.roman}` : ""}`;
    const peak = `${peakStand.name}${peakStand.roman ? ` ${peakStand.roman}` : ""}`;
    rankRef.current = { rp: 0, peak: Math.max(rankRef.current.peak, rankRef.current.rp), shield: false };
    setRp(0);
    setRankPeak(rankRef.current.peak);
    setRankShield(false);
    setRankDelta(before.rp ? -before.rp : 0);
    setRankParts(null);
    streakRef.current = 0;
    holdUsedRef.current = false;
    setWinStreak(0);
    heatRef.current = 0;
    setHeat(0);
    modRef.current = null;
    setChaseMod(null);
    fsSessionRef.current = { ...fsSessionRef.current, modMul: 1 };
    reloadStreakRef.current = 0;
    spinsSinceReloadRef.current = 0;
    setReloadStreak(0);
    setBalance(START_BALANCE);
    setRankFlash({
      event: "bust",
      before,
      after: standing(0),
      applied: before.rp ? -before.rp : 0,
    });
    setExekucia({ from, peak, infinite: peakStand.id === "nekonecno" && peakStand.rp > 0 });
    setSpinTape((t) => [{ label: "EXEKÚCIA", amount: "KREDIT IV" }, ...t].slice(0, 8));
    setTopLine("EXEKÚCIA · KREDIT IV");
    setMessage(`Kredit ${START_BALANCE}`);
    sfx.playThunder();
  }, []);

  useEffect(() => {
    if (!exekucia) return;
    const t = window.setTimeout(() => setExekucia(null), 3400);
    return () => window.clearTimeout(t);
  }, [exekucia]);

  const pushRank = useCallback((delta: number, parts?: RankBreakdown | null) => {
    if (!delta) return;
    const res = applyRankDelta(rankRef.current, delta);
    rankRef.current = res.save;
    setRp(res.save.rp);
    setRankPeak(res.save.peak);
    setRankShield(res.save.shield);
    setRankDelta(res.applied);
    setRankTick((n) => n + 1);
    setRankParts(parts ?? null);
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
    const event = res.event ?? (res.applied > 0 ? "gain" : res.applied < 0 ? "loss" : null);
    if (event) {
      const flash: RankFlash = {
        event,
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

  const armChase = useCallback((stake: number): boolean => {
    if (chaseRef.current || heatRef.current < HEAT_MAX) return false;
    if (duelRef.current || duelLinkRef.current || inFsRef.current) return false;
    if (balanceRef.current < stake * ZASAH.COST_X) {
      setMessage("ZÁSAH ČAKÁ · málo kreditu");
      return false;
    }
    heatRef.current = 0;
    setHeat(0);
    const next: ChaseState = { spin: 0, target: null, hits: 0, strikes: 0 };
    chaseRef.current = next;
    setChase(next);
    setHackWindows([]);
    autoRef.current = false;
    setAutoOn(false);
    setAutoLeft(0);
    setAutoReason("AUTO STOP · ZÁSAH");
    setTopLine("ZÁSAH · 10 SPINOV");
    setMessage("ZÁSAH");
    sfx.playSiren();
    return true;
  }, []);

  const noteHeat = useCallback((amount: number, bet: number, _hold = false) => {
    if (chaseRef.current) return;
    if (!(amount > 0) || !(bet > 0)) return;
    const add = heatFromWin(amount / bet);
    if (add <= 0) return;
    heatRef.current = Math.min(HEAT_MAX, heatRef.current + add);
    setHeat(heatRef.current);
  }, []);

  const endChase = useCallback((outcome: ChaseOutcome, betNow: number) => {
    chaseRef.current = null;
    setChase(null);
    setActiveWindow(-1);
    sfx.stopHeartbeat();
    sfx.stopChaseBed();
    let rp: number = ZASAH.RP.neutral;
    let line = "Unikol si len tak-tak";
    if (outcome === "escape") {
      const next = { kind: "bezDane" as const, left: ZASAH.MOD_SPINS };
      modRef.current = next;
      setChaseMod(next);
      rp = ZASAH.RP.escape;
      klientiRef.current += Math.max(1, Math.round(betNow * 4));
      line = "15 spinov BEZ DANE ×1.23";
      sfx.playEscape();
    } else if (outcome === "unik") {
      const next = { kind: "danUrad" as const, left: ZASAH.MOD_SPINS };
      modRef.current = next;
      setChaseMod(next);
      rp = ZASAH.RP.unik;
      line = "15 spinov −23 % pre daňový úrad";
      sfx.playTaxLoss();
    } else {
      klientiRef.current += Math.max(1, Math.round(betNow));
      sfx.playChaseNeutral();
      // A running BEZ DANE / DAŇOVÝ ÚRAD modifier keeps counting. Neutral does not cancel it.
    }
    setKlienti(klientiRef.current);
    pushRank(rp);
    const card = { outcome, line, rp };
    chaseCardRef.current = card;
    setChaseCard(card);
    setTopLine(line);
    setMessage(line);
    persistNow();
  }, [persistNow, pushRank]);

  const waitForBanner = useCallback((hold: number | "click" = 2800) => {
    return new Promise<void>((resolve) => {
      bannerWait.current = resolve;
      if (hold === "click") return;
      window.setTimeout(() => {
        if (bannerWait.current !== resolve) return;
        bannerOpen.current = false;
        setBanner(null);
        bannerWait.current = null;
        resolve();
      }, hold);
    });
  }, []);

  const payPoolHit = useCallback(
    async (board: BoardSnap, how = "", recipe: WinRecipe | null = null) => {
      const credit = board.credit > 0 ? board.credit : 0;
      const jackpots = board.hits;
      const main = jackpots[0] ?? {
        id: "ulica" as TierId,
        name: "1-FTTB",
        payout: credit,
        table: 0,
        poolBefore: 0,
        share: 1,
      };
      const payout = jackpots.reduce((s, h) => s + h.payout, 0) + credit;
      if (payout <= 0) return;
      const live = potsRef.current[main.id]?.pool ?? 0;
      const poolBefore = main.poolBefore > 0 ? main.poolBefore : live;
      const share = main.share > 0 ? main.share : TIER_BY_ID[main.id].winnerShare;
      const shown: JackpotHit = { ...main, payout: main.payout, poolBefore, share };
      jpShowRef.current = true;
      setJpHit(shown);
      setDisplayWin((w) => +(w + payout).toFixed(2));
      setSpinWin((w) => +(w + payout).toFixed(2));
      setBalance((b) => +(b + payout).toFixed(2));
      setBestWin((w) => Math.max(w, payout));
      bumpToday(0, payout, how, BETS[betIndexRef.current] ?? 0, recipe);
      noteHeat(payout, BETS[betIndexRef.current] ?? 0);
      setSpinTape((t) => [{ label: shown.name, amount: formatMoney(payout) }, ...t].slice(0, 8));
      if (autoRef.current && !duelRef.current) {
        autoRef.current = false;
        setAutoOn(false);
        setAutoLeft(0);
        setAutoReason("AUTO STOP · JACKPOT");
      }
      setPhase("max");
      setTopLine(
        `${shown.name} ${formatMoney(poolBefore)} · ${Math.round(share * 100)} % = ${formatMoney(shown.payout)}`,
      );
      sfx.playMaxWin();
      try {
        await wait(2400);
      } finally {
        setJpHit(null);
        jpShowRef.current = false;
        setPots(board.pots);
      }
    },
    [bumpToday, noteHeat],
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
        await payPoolHit(claimed, `LÍSTOK ${TICKETS[tier].name}`, { v: 1, mode: "ticket", pays: [], ticket: tier });
      } catch {
        /* keep lock off */
      }
      setTicketLock(false);
    },
    [applyBoard, payPoolHit],
  );

  const stampDailyJob = useCallback((card: JobCard, mark: "ok" | "fail") => {
    const cur = dailyRef.current;
    if (!cur) return;
    const next = stampDaily(cur, card, mark);
    if (next === cur) return;
    dailyRef.current = next;
    setDaily(next);
  }, []);

  const settleJob = useCallback((ev: JobEvent) => {
    if (duelRef.current) return;
    const cur = jobRef.current;
    if (!cur) return;
    const next = tickJob(cur, ev);
    const st = jobStatus(next);
    if (st === "ok") {
      jobRef.current = null;
      setJob(null);
      setBalance((b) => +(b + next.payout).toFixed(2));
      noteHeat(next.payout, next.stake || BETS[betIndexRef.current] || 0);
      const profit = ticketProfit(next.payout, next.stake);
      noteTicket(profit.won, profit.lost);
      const parts = rpFromJob(next.payout, next.stake);
      if (parts.total) pushRank(parts.total, parts);
      setSpinTape((t) => [{ label: "TIKET", amount: `+${formatMoney(next.payout)} · +${parts.total} RP` }, ...t].slice(0, 8));
      setLcdFlash({ job: next, verdict: "ok" });
      setTicketSeal({ job: next, verdict: "ok" });
      stampDailyJob(next, "ok");
      sfx.playTicketOk();
    } else if (st === "fail") {
      jobRef.current = null;
      setJob(null);
      noteTicket(0, next.stake);
      setSpinTape((t) => [{ label: "TIKET", amount: `−${formatMoney(next.stake)}` }, ...t].slice(0, 8));
      autoRef.current = false;
      setAutoOn(false);
      setAutoLeft(0);
      setLcdFlash({ job: next, verdict: "fail" });
      setTicketSeal({ job: next, verdict: "fail" });
      stampDailyJob(next, "fail");
      sfx.playThunder();
    } else {
      jobRef.current = next;
      setJob(next);
    }
  }, [pushRank, stampDailyJob, noteTicket, noteHeat]);

  const failParknetJob = useCallback((cur: JobCard) => {
    const burned = { ...cur, seal: false, spun: cur.limit };
    jobRef.current = null;
    setJob(null);
    noteTicket(0, burned.stake);
    setSpinTape((t) => [{ label: "TIKET", amount: `−${formatMoney(burned.stake)}` }, ...t].slice(0, 8));
    autoRef.current = false;
    setAutoOn(false);
    setAutoLeft(0);
    setLcdFlash({ job: burned, verdict: "fail" });
    setTicketSeal({ job: burned, verdict: "fail" });
    stampDailyJob(burned, "fail");
    setTopLine("NEÚSPEŠNÝ TIKET · MÁLO KREDITU NA 4KA TV");
    sfx.playThunder();
  }, [stampDailyJob, noteTicket]);

  useEffect(() => {
    if (busy || inFs || duel) return;
    const cur = jobRef.current;
    if (!cur) return;
    const betNow = cur.lockBet > 0 ? cur.lockBet : BETS[betIndexRef.current];
    const rankId = standing(rankRef.current.rp).id;
    const perk = perkOf(rankId);
    const spinCost = ante ? +(betNow * perk.anteMul).toFixed(2) : betNow;
    const buyCost = +(betNow * buyXOf(rankId)).toFixed(2);
    if (!jobParknetBroke(cur, balance, spinCost, buyCost)) return;
    failParknetJob(cur);
  }, [balance, job, busy, inFs, duel, ante, failParknetJob]);

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
      setPickKillId(id);
      sfx.playThunder();
      window.setTimeout(() => setPickEnded(true), 640);
    } else {
      pickTotalXRef.current = +(pickTotalXRef.current + tile.payX).toFixed(4);
      setPickRevealed(nextRev);
      const cleared = pickTilesRef.current.every((t, i) => t.kind === "odtah" || nextRev[i]);
      if (cleared) {
        pickTotalXRef.current = +(pickTotalXRef.current * 2).toFixed(4);
        pickEndedRef.current = true;
        pickClearRef.current = true;
        setPickClear(true);
        sfx.playTicketOk();
        window.setTimeout(() => setPickEnded(true), 640);
      } else {
        sfx.playCollect();
      }
      setPickTotalX(pickTotalXRef.current);
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
    pickClearRef.current = false;
    setPickClear(false);
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
    const escrow = Boolean(duelRef.current && duelRef.current.phase !== "done");
    if (cash > 0) {
      if (!escrow) setBalance((b) => +(b + cash).toFixed(2));
      noteHeat(cash, betNow);
      setDisplayWin(cash);
      setSpinWin(cash);
      setBestWin((w) => Math.max(w, cash));
      setSpinTape((t) => [{ label: "KONTROLA", amount: formatMoney(cash) }, ...t].slice(0, 8));
      roundCashRef.current = +(roundCashRef.current + cash).toFixed(2);
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
    setMessage(
      pickClearRef.current ? `Zaplatil si všetko parkovné · ${formatMoney(cash)}` : cash > 0 ? `KONTROLA ${formatMoney(cash)}` : "Odťah bez pokuty",
    );
  }, [waitForPick, pushRank, noteResult, noteHeat]);

  const runSequence = useCallback(
    async (opts?: { buy?: boolean; free?: boolean }): Promise<"fs" | "ok" | "max" | "pick"> => {
      const currentBet = BETS[betIndexRef.current];
      const perk = perkOf(standing(rankRef.current.rp).id);
      const currentStake = anteRef.current ? +(currentBet * perk.anteMul).toFixed(2) : currentBet;
      const isFree = !!opts?.free;
      const chasing =
        !isFree && !opts?.buy && !duelRef.current && (chaseRef.current != null || armChase(currentStake));
      let cost = opts?.buy ? +(currentBet * buyXOf(perk.id)).toFixed(2) : isFree ? 0 : currentStake;
      if (chasing) cost = +(currentStake * ZASAH.COST_X).toFixed(2);

      if (!isFree && balanceRef.current < cost) {
        skipDuelTick.current = true;
        setMessage("Nedostatok kreditu — doplň demo zostatok");
        return "ok";
      }
      skipDuelTick.current = false;
      if (chasing) sfx.startChaseBed();
      setHackWindows([]);
      setActiveWindow(-1);
      setWindowPhase("reveal");

      setWinMask(null);
      if (!isFree) {
        setSpinWin(0);
        setBaseWin(0);
      }
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

      if (cost > 0) {
        setBalance((b) => +(b - cost).toFixed(2));
        spinsSinceReloadRef.current += 1;
        if (spinsSinceReloadRef.current >= RELOAD_STABILIZE && reloadStreakRef.current > 0) {
          reloadStreakRef.current = 0;
          setReloadStreak(0);
        }
      }

      const poolP: Promise<{ ticket?: TierId | null } | null> = isFree
        ? pendingLiveTicketRef.current
          ? Promise.resolve(null)
          : feedPool({ stake: 0, eligible: false, skip: true })
        : cost > 0
          ? feedPool({
              stake: cost,
              eligible: isEligibleBet(currentBet) || !!opts?.buy,
              skip: true,
            })
          : Promise.resolve(null);

      const spunAt = performance.now();
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
      sfx.unlockAudio();
      sfx.startSpin();
      sfx.duckMusic(0.42);

      await afterPaint();
      const pot = await poolP;
      const spunTicket = pot?.ticket ?? null;

      const rng = createRng();
      let next = opts?.buy
        ? generateBuyGrid(rng)
        : generateGrid(rng, opts?.free ? false : anteRef.current, !!opts?.free);
      if (spunTicket) next = plantTicket(next, spunTicket, rng);

      const STOPS = [520, 620, 730, 850, 990, 1180];
      const already = performance.now() - spunAt;
      await wait(dur(Math.max(0, STOPS[0] - already)), abort.current);
      if (chasing && chaseRef.current && !chaseRef.current.target) {
        const aimed = { ...chaseRef.current, target: rollTarget(Math.random) };
        chaseRef.current = aimed;
        setChase(aimed);
      }
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
        const inBonus = isFree || inFsRef.current;
        if (landedScatters >= 2) {
          setAnticipate(true);
          setReelFast(true);
          if (!inBonus) {
            sfx.setSpinEnergy(0.08);
            sfx.startAnticipate();
          }
        }
        const tease = landedScatters >= 3 ? 900 : landedScatters >= 2 ? 720 : 0;
        await wait(dur(STOPS[c] - tMark) + tease, abort.current);
        tMark = STOPS[c];
        setStoppedCols(c + 1);
        sfx.setSpinEnergy(landedScatters >= 2 && !(isFree || inFsRef.current) ? 0.08 : 1 - (c + 1) / 6);
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
      const wantId = jobRef.current?.payId;
      let shownCount = 0;
      if (wantId) {
        for (const row of next) for (const cell of row) if (cell.kind === "pay" && cell.payId === wantId) shownCount += 1;
      }
      const landDrop = zeusDropCount(rng, isFree || inFsRef.current, false);
      const inDuel = Boolean(duelRef.current && duelRef.current.phase !== "done");
      const bonusCan = !inDuel && perk.orbBonus > 0 && rng() < 0.2 ? perk.orbBonus : 0;
      const landN = landDrop > 0 ? landDrop + bonusCan : 0;
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
      const payHits = new Set<PayId>();
      const tally = emptyTally();
      const fsNow = isFree || inFsRef.current;
      if (!fsNow && scatterPeak >= FS_TRIGGER_SCATTERS) pendingFs = true;
      const DEAD = ["RAMPA STOJÍ", "VALCE SPALI", "NIČ. ZNOVA.", "POKUTA BEZ LÍSTKA", "ZÓNA TICHÁ"];

      for (;;) {
        setPhase("eval");
        const ev = evaluate(board);
        scatterPeak = Math.max(scatterPeak, ev.scatterCount);
        const cl = ev.wins.filter((w) => w.payId !== "scatter").length;
        clusterCount += cl;
        for (const w of ev.wins) {
          if (w.payId !== "scatter") payHits.add(w.payId);
        }
        notePays(tally, ev.wins);
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
          setTopLine(`${scatterPeak}× 4KA TV`);
        } else if (fsNow && scatterPeak >= FS_RETRIGGER_SCATTERS && !retriggered) {
          retriggered = true;
          extraFsRef.current = FS_RETRIGGER;
          sfx.playThunder();
          setShake(true);
          window.setTimeout(() => setShake(false), 520);
          setTopLine(`+${FS_RETRIGGER} 4KA TV`);
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
        if (!isFree) setDisplayWin(cashNow);
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
        const inDuel = Boolean(duelRef.current && duelRef.current.phase !== "done");
        const bonusCan = !inDuel && perk.orbBonus > 0 && rng() < 0.2 ? perk.orbBonus : 0;
        const moreN = more > 0 ? more + bonusCan : 0;
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
      if (pendingFs) triggerScatterRef.current = scatterPeak;
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

      const orbs = listOrbs(board);
      const orbSum = orbs.reduce((s, o) => s + o.mult, 0);
      const willThrow = sequenceX > 0 && orbSum > 0;
      let applied = 1;
      tally.scatters = scatterPeak;
      tally.tumbles = tumbleN;
      if (willThrow) tally.cans = orbs.map((o) => o.mult);
      lastTallyRef.current = tally;

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
        setSeqMult(applied);
        const baseCash = +(sequenceX * currentBet).toFixed(2);
        const boosted = +(sequenceX * applied * currentBet).toFixed(2);
        setBaseWin(baseCash);
        setSpinWin(baseCash);
        if (!isFree) setDisplayWin(baseCash);
        await wait(dur(120), abort.current);
        setSpinWin(boosted);
        if (!isFree) setDisplayWin(boosted);
        setTopLine(`TUMBLE ${formatMoney(boosted)}`);
        sfx.playMult();
        await wait(dur(520), abort.current);
        setThrowBolt(false);
        setActivatingMult(false);
      } else {
        setSeqMult(1);
      }

      let paidX = sequenceX * applied;
      if (chasing) paidX *= ZASAH.BOOST;
      let hitMax = false;
      const remain = MAX_WIN_X - featureXRef.current;
      if (paidX >= remain) {
        paidX = Math.max(0, remain);
        hitMax = true;
      }
      featureXRef.current += paidX;
      const cash0 = +(paidX * currentBet).toFixed(2);
      const mul = !chasing && !isFree && !opts?.buy && !duelRef.current ? modMul(modRef.current) : 1;
      const cash = +(cash0 * mul).toFixed(2);
      const taxDelta = +(cash - cash0).toFixed(2);
      setTaxFly(null);
      if (pendingFs) fsSessionRef.current.modMul = opts?.buy ? 1 : mul;
      let chaseEnded = false;
      if (chasing && chaseRef.current) {
        const live = chaseRef.current;
        const rolled = rollWindows(Math.random, board, live, windowCount(live.spin));
        const slow = live.hits >= 3 ? 1.6 : 1;
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const shown: HackWindow[] = [];
        let hits = live.hits;
        let strikes = live.strikes;
        for (let i = 0; i < rolled.windows.length; i += 1) {
          const w = rolled.windows[i];
          shown.push(w);
          setHackWindows([...shown]);
          setActiveWindow(i);
          const reveal = () => {
            if (w.result === "hit") hits += 1;
            else if (w.result === "fs") strikes += 1;
            const partial: ChaseState = { ...live, hits, strikes };
            chaseRef.current = partial;
            setChase(partial);
            if (strikes >= 2) sfx.startHeartbeat();
          };
          if (reduced || abort.current.skip) {
            setWindowPhase("reveal");
            reveal();
            continue;
          }
          setWindowPhase("travel");
          sfx.playHackTravel();
          await wait(dur(420 * slow), abort.current);
          setWindowPhase("hover");
          await wait(dur(180 * slow), abort.current);
          setWindowPhase("land");
          reveal();
          if (w.result === "hit") sfx.playHack();
          else if (w.result === "fs") sfx.playStrike();
          // Land holds long enough for the corner snap, flicker and the FS badge drop.
          await wait(dur(260 * slow), abort.current);
          setWindowPhase("reveal");
          await wait(dur(200 * slow), abort.current);
          await wait(dur(160 * slow), abort.current);
        }
        setActiveWindow(-1);
        const played = live.spin + 1;
        if (rolled.outcome || played >= ZASAH.SPINS) {
          chaseEnded = true;
          endChase(rolled.outcome ?? "neutral", currentBet);
        } else {
          const nextChase: ChaseState = { ...rolled.next, spin: played, target: rollTarget(Math.random) };
          chaseRef.current = nextChase;
          setChase(nextChase);
          persistNow();
        }
      }
      if (!chasing && !isFree && !opts?.buy && !duelRef.current && modRef.current) {
        const nextMod = tickMod(modRef.current);
        modRef.current = nextMod;
        setChaseMod(nextMod);
      }
      if (cash > 0 && !chaseEnded) noteHeat(cash, currentBet, Boolean(isFree || opts?.buy || pendingFs || inFsRef.current));
      if (!isFree && cash0 > 0 && Math.abs(taxDelta) >= 0.01) {
        // Gross first, then the modifier chip, then the meter glides to the net amount.
        setSpinWin(cash0);
        setDisplayWin(cash0);
        await wait(dur(520), abort.current);
        setTaxKey((k) => k + 1);
        setTaxFly({ kind: taxDelta < 0 ? "danUrad" : "bezDane", gross: cash0, net: cash, delta: taxDelta });
        sfx.playMult();
        await wait(dur(260), abort.current);
      }
      setSpinWin(cash);
      if (!isFree) setDisplayWin(cash);
      if (Math.abs(taxDelta) >= 0.01 && !isFree && cash0 > 0) await wait(dur(900), abort.current);

      lastPaidXRef.current = currentBet > 0 ? cash / currentBet : 0;
      if (!isFree) roundCashRef.current = cash;
      if (cash > 0) {
        setSpinTape((t) => [{ label: `${Math.round(lastPaidXRef.current * 100) / 100}×`, amount: formatMoney(cash) }, ...t].slice(0, 8));
      } else {
        setSpinTape((t) => [{ label: "0×", amount: DEAD[Math.floor(Math.random() * DEAD.length)] }, ...t].slice(0, 8));
      }

      if (cash > 0) {
        setBestWin((w) => Math.max(w, cash));
      }
      await wait(dur(400));
      const escrow = Boolean(duelRef.current && duelRef.current.phase !== "done");
      if (cash > 0 && !isFree && !inFsRef.current && !escrow) {
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
        if (cash0 > 0) {
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
          if (!escrow) {
            const step = nextRebate({
              rate: 0,
              bet: currentBet,
              paid: rebateRef.current.paid,
              spins: rebateRef.current.spins,
              dead: false,
            });
            rebateRef.current = { paid: step.paid, spins: step.spins };
          }
        } else {
          noteResult(false);
          const dead = rpFromDead(currentBet, standing(rankRef.current.rp).entry);
          if (dead.total) pushRank(dead.total, dead);
          if (perk.deadRebate > 0 && !escrow) {
            const step = nextRebate({
              rate: perk.deadRebate,
              bet: currentBet,
              paid: rebateRef.current.paid,
              spins: rebateRef.current.spins,
              dead: true,
            });
            rebateRef.current = { paid: step.paid, spins: step.spins };
            if (step.pay > 0) setBalance((b) => +(b + step.pay).toFixed(2));
          } else if (!escrow && !isFree) {
            const step = nextRebate({
              rate: 0,
              bet: currentBet,
              paid: rebateRef.current.paid,
              spins: rebateRef.current.spins,
              dead: false,
            });
            rebateRef.current = { paid: step.paid, spins: step.spins };
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

      const boughtFs = Boolean(opts?.free && fsSessionRef.current.bought);
      const liveSpin = Boolean(isFree || inFsRef.current);
      if (!opts?.buy) {
        settleJob({
          win: cash0 > 0,
          dead: cash0 <= 0,
          tumbles: tumbleN,
          live: pendingFs,
          ticket: landed?.ticket ?? null,
          pdf: pdfHit,
          signal: 0,
          clusters: clusterCount,
          orbs: willThrow,
          pays: [...payHits],
          orbSum: willThrow ? orbSum : 0,
          orbCount: willThrow ? orbs.length : 0,
          bought: boughtFs,
          liveSpin,
          shown: shownCount,
          cash,
        });
      }

      if (!isFree && cost > 0) {
        const how =
          cash > 0 && !opts?.buy
            ? winHow({
                mode: "BASE",
                pops: tumbleN,
                pays: [...payHits].slice(0, 2).map((id) => payName(id)),
              })
            : "";
        const recipe: WinRecipe | null =
          cash > 0 && !opts?.buy
            ? {
                v: 1,
                mode: chasing ? "zasah" : "base",
                pays: topPays(tally),
                cans: willThrow ? topCans(tally.cans) : undefined,
                mult: willThrow && applied > 1 ? applied : undefined,
                scatters: scatterPeak >= 3 ? scatterPeak : undefined,
                tumbles: tumbleN > 0 ? tumbleN : undefined,
                ante: anteRef.current || undefined,
                mod: chasing ? ZASAH.BOOST : mul !== 1 ? mul : undefined,
              }
            : null;
        bumpToday(cost, opts?.buy ? 0 : cash, how, currentBet, recipe);
      }

      if (!jpShowRef.current) setPots(boardRef.current.pots);
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
        const halt =
          autoRef.current &&
          autoHaltRef.current &&
          (kind === "big" || kind === "mega" || kind === "epic" || kind === "max");
        await waitForBanner(halt ? "click" : 2800);
      }

      setWinMask(null);
      setClusterPay(null);
      setPayHint(null);
      setWinTier(0);
      setPhase("idle");
      if (chaseRef.current) {
        const c = chaseRef.current;
        setTopLine(`ZÁSAH · SPIN ${c.spin + 1}/10 · HACK ${c.hits}/4 · FS ${c.strikes}/3`);
        setMessage(`ZÁSAH · ${c.target ? payName(c.target) : "CIEĽ"}`);
      } else {
        setTopLine(
          isFree || inFsRef.current
            ? "3× 4KA TV PRIDÁ TOČENIA"
            : "SYMBOLY PLATIA KDEKOĽVEK NA OBRAZOVKE",
        );
        setMessage(cash > 0 ? "" : pendingPick ? "KONTROLA" : isFree ? "" : DEAD[Math.floor(Math.random() * DEAD.length)]);
      }
      sfx.duckMusic(1);

      if (hitMax) return "max";
      if (pendingFs) return "fs";
      if (pendingPick) return "pick";
      return "ok";
    },
    [dur, waitForBanner, pushRank, noteResult, feedPool, runTicket, settleJob, armChase, endChase, noteHeat, persistNow],
  );

  const settleDuel = useCallback((d: Duel) => {
    if (d.phase !== "done" || duelSettled.current) return;
    duelSettled.current = true;
    autoRef.current = false;
    setAutoOn(false);
    setAutoLeft(0);
    setAutoReason(null);
    if (d.kind === "online") {
      const delta = duelCreditDelta(d, d.you);
      if (delta) setBalance((b) => +(b + delta).toFixed(2));
    } else {
      const pot = duelPot(d);
      if (pot) setBalance((b) => +(b + pot).toFixed(2));
    }
    const pot = duelPot(d);
    const w = d.forfeit != null ? (d.forfeit === 0 ? 1 : 0) : duelWinner(d);
    if (d.forfeit != null) {
      setTopLine(d.forfeit === d.you ? "VZDAL SI SA · stack berie súper" : `SÚPER SA VZDAL · BANK ${formatMoney(pot)}`);
      setJobToast(d.forfeit === d.you ? "VZDAŤ" : `BANK ${formatMoney(pot)}`);
    } else if (w === null) {
      setTopLine("DUEL REMÍZA · každý si necháva svoju výhru");
      setJobToast("REMÍZA");
    } else {
      const take = `${d.seats[w].name} BERIE BANK ${formatMoney(pot)}`;
      setTopLine(take);
      setJobToast(`BANK ${formatMoney(pot)}`);
      setSpinTape((t) => [{ label: "DUEL BANK", amount: formatMoney(pot) }, ...t].slice(0, 8));
      if (w === d.you && pot > 0) {
        const mine = Math.round(d.seats[d.you].score);
        const other = Math.round(d.seats[d.you === 0 ? 1 : 0].score);
        bumpToday(0, pot, winHow({ mode: "DUEL", duel: `${mine} vs ${other}` }), BETS[betIndexRef.current] ?? 0, {
          v: 1,
          mode: "duel",
          pays: [],
          vs: [mine, other],
        });
      }
    }
    const link = duelLinkRef.current;
    if (d.kind === "online" && link) {
      void duelTick(link.room, link.role, d.seats[d.you].have, d.seats[d.you].score, {
        name: link.name,
        ante: Boolean(link.ante),
        net: false,
      }).catch(() => {});
    }
  }, [bumpToday, noteHeat]);

  const playRound = useCallback(
    async (opts?: { buy?: boolean; resumeFs?: boolean }) => {
      if (busyRef.current || chaseCardRef.current) return;
      const gate = duelRef.current;
      if (
        gate &&
        gate.phase === "play" &&
        gate.kind === "online" &&
        !opts?.resumeFs &&
        !inFsRef.current &&
        !opts?.buy &&
        !canDuelSpin(gate)
      ) {
        return;
      }
      if (opts?.buy && duelRef.current) return;
      busyRef.current = true;
      setBusy(true);
      abort.current.aborted = false;
      roundCashRef.current = 0;
      if (!opts?.buy && !opts?.resumeFs && !inFsRef.current) setDisplayWin(0);
      setTaxFly(null);

      try {

      const playFsSpins = async () => {
        const sess = fsSessionRef.current;
        let hitCap = false;
        const duelCap = duelRef.current && duelRef.current.phase !== "done" ? Date.now() + 90_000 : 0;
        persistNow();
        while (sess.left > 0) {
          if (duelCap && Date.now() >= duelCap) {
            duelFastRef.current = true;
            abort.current.skip = true;
          }
          setFsLeft(sess.left);
          persistNow();
          const inner = await runSequence({ free: true });
          mergeTally(fsTallyRef.current, lastTallyRef.current);
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
            setMessage(`+${freeSpinsLabel(add)}`);
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
        duelFastRef.current = false;
        return hitCap;
      };

      const closeFs = async (hitCap: boolean, applyBoughtRank: (returned: number, extra: { mult: number; bannerHit: boolean; retriggers?: number }) => void) => {
        const sess = fsSessionRef.current;
        const betNow = BETS[betIndexRef.current];
        const mul = sess.bought ? 1 : sess.modMul || 1;
        const fsPaid = +(sess.cash * mul).toFixed(2);
        const fsCash = fsPaid;
        const featureTotal = +(fsPaid + sess.triggerCash).toFixed(2);
        await wait(400);
        setInFs(false);
        inFsRef.current = false;
        setFsLeft(0);
        setGlobalMult(0);
        globalMultRef.current = 0;
        setDisplayWin(featureTotal);
        setSpinWin(featureTotal);
        setBannerMeta({
          spins: sess.played,
          extra: sess.extra,
          peakMult: sess.peak,
          terminated: hitCap,
        });
        bannerOpen.current = true;
        setBanner("fsTotal");
        setBannerAmount(featureTotal);
        setPhase(hitCap ? "max" : "big");
        setTopLine("4KA TV SKONČILA");
        setMessage(featureTotal > 0 ? `VÝHRA ${formatMoney(featureTotal)}` : "4KA TV SKONČILA");
        if (featureTotal > 0 || hitCap) sfx.playBigWin();
        else sfx.playPayout();
        sfx.stopLiveBed();
        const escrow = Boolean(duelRef.current && duelRef.current.phase !== "done");
        if (fsPaid > 0 && !escrow) setBalance((b) => +(b + fsPaid).toFixed(2));
        if (featureTotal > 0) {
          bumpToday(
            0,
            featureTotal,
            winHow({
              mode: "PARKNET",
              spins: sess.played,
              mult: sess.peak,
            }),
            betNow,
            {
              v: 1,
              mode: sess.bought ? "buy" : "fs",
              pays: topPays(fsTallyRef.current),
              cans: topCans(fsTallyRef.current.cans),
              mult: sess.peak > 1 ? sess.peak : undefined,
              scatters: fsTallyRef.current.scatters >= 3 ? fsTallyRef.current.scatters : undefined,
              tumbles: recipeTumbles(fsTallyRef.current.tumbles),
              spins: sess.played || undefined,
              extra: sess.extra || undefined,
              ante: (!sess.bought && fsAnteRef.current) || undefined,
              mod: mul !== 1 ? mul : undefined,
            },
          );
        }
        roundCashRef.current = featureTotal;
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
          modMul: 1,
        };
        persistNow();
        await waitForBanner("click");
        setBannerMeta(null);
        const stashed = pendingLiveTicketRef.current;
        pendingLiveTicketRef.current = null;
        if (stashed) await runTicket(stashed);
        if (!bought) {
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
            featureOver: true,
          });
        } else {
          settleJob({
            win: false,
            dead: false,
            tumbles: 0,
            live: false,
            ticket: stashed,
            pdf: false,
            signal: 0,
            clusters: 0,
            orbs: false,
            spun: false,
            bought: true,
            buyOver: true,
            featureOver: true,
          });
        }
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
        setDisplayWin(+(sess.triggerCash + sess.cash).toFixed(2));
        setMessage(freeSpinsLabel(sess.left));
        setTopLine(`4KA TV · ${sess.left}`);
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
      const mathRank = duelRef.current && duelRef.current.phase !== "done" ? "kredit" : rankIdNow;
      const fsCount = fsTriggerSpins(triggerScatterRef.current, fsSpinsOf(mathRank));
      const applyBoughtRank = makeApplyBought(betNow, buyCost, buyXNow, rankIdNow);

      if (autoRef.current && autoHaltRef.current && !duelRef.current) {
        if (r === "fs") {
          autoRef.current = false;
          setAutoOn(false);
          setAutoLeft(0);
          setAutoReason("AUTO STOP · 4KA TV");
        } else if (r === "pick") {
          autoRef.current = false;
          setAutoOn(false);
          setAutoLeft(0);
          setAutoReason("AUTO STOP · KONTROLA");
        } else if (lastPaidXRef.current >= 20) {
          autoRef.current = false;
          setAutoOn(false);
          setAutoLeft(0);
          setAutoReason("AUTO STOP · BIG WIN");
        } else if (balanceRef.current <= autoFloorRef.current) {
          autoRef.current = false;
          setAutoOn(false);
          setAutoLeft(0);
          setAutoReason("AUTO STOP · 50% KREDIT");
        }
      } else if (autoRef.current && r === "pick") {
        autoRef.current = false;
        setAutoOn(false);
        setAutoLeft(0);
        setAutoReason("AUTO STOP · KONTROLA");
      }

      if (r === "fs") {
        await wait(300);
        fsTallyRef.current = { ...emptyTally(), scatters: triggerScatterRef.current };
        mergeTally(fsTallyRef.current, lastTallyRef.current);
        // tumbles = cascades during the free spins only, not the trigger spin
        fsTallyRef.current.tumbles = 0;
        fsAnteRef.current = Boolean(anteRef.current && !opts?.buy);
        fsSessionRef.current = {
          left: fsCount,
          total: fsCount,
          cash: 0,
          played: 0,
          extra: 0,
          peak: 0,
          bought: Boolean(opts?.buy),
          triggerCash,
          modMul: opts?.buy ? 1 : fsSessionRef.current.modMul || 1,
        };
        setInFs(true);
        inFsRef.current = true;
        setPhase("fs");
        setDisplayWin(triggerCash);
        setGlobalMult(0);
        globalMultRef.current = 0;
        setFsLeft(fsCount);
        setFsTotal(fsCount);
        setMessage(freeSpinsLabel(fsCount));
        persistNow();
        sfx.playFsStart();
        sfx.startLiveBed();
        bannerOpen.current = true;
        setBanner("fs");
        setBannerAmount(fsCount);
        setTopLine(`GRATULUJEME · 4KA TV · ${fsCount}`);
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

      const live = duelRef.current;
      if (live?.phase === "play" && !skipDuelTick.current) {
        const next = tickDuel(live, roundCashRef.current);
        duelRef.current = next;
        setDuel(next);
        duelBlanks.current = 0;
        if (next.phase === "swap" || next.phase === "done") {
          autoRef.current = false;
          setAutoOn(false);
          setAutoLeft(0);
          setAutoReason(null);
        }
        if (next.phase === "done") settleDuel(next);
      }
    } catch {
      sfx.stopLiveBed();
      sfx.stopSpin();
      sfx.stopAnticipate();
      setBanner(null);
      bannerOpen.current = false;
      setPhase(inFsRef.current ? "fs" : "idle");
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
    [dur, runSequence, waitForBanner, runPick, pushRank, noteResult, persistNow, runTicket, settleJob, settleDuel],
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
    if (!started || staleRef.current) return;
    if (busyRef.current) return;
    if (inFsRef.current) {
      void playRound({ resumeFs: true });
      return;
    }
    const d = duelRef.current;
    if (d) {
      if (d.phase !== "play") return;
      if (!canDuelSpin(d)) return;
    }
    await playRound();
  }, [started, playRound]);

  const buyBonus = useCallback(() => {
    if (chaseRef.current) {
      setJobToast("Počas ZÁSAHU zamknuté");
      return;
    }
    if (!started || busyRef.current || inFsRef.current) return;
    if (duelRef.current || duelLinkRef.current) return;
    setBuyAsk(true);
  }, [started]);

  const cancelBuy = useCallback(() => setBuyAsk(false), []);

  const confirmBuy = useCallback(async () => {
    if (chaseRef.current) {
      setJobToast("Počas ZÁSAHU zamknuté");
      return;
    }
    if (!started || busyRef.current || inFsRef.current || duelRef.current) return;
    setBuyAsk(false);
    await playRound({ buy: true });
  }, [started, playRound]);

  const ensureDaily = useCallback(() => {
    const day = deskToday();
    const cur = dailyRef.current;
    if (cur && cur.day === day && cur.cards.length === 3) return cur;
    const next = freshDaily(createRng(), balanceRef.current, BETS[betIndexRef.current], day);
    dailyRef.current = next;
    setDaily(next);
    return next;
  }, []);

  const openSpend = useCallback(() => {
    if (chaseRef.current) {
      setJobToast("Počas ZÁSAHU zamknuté");
      return;
    }
    if (busyRef.current || inFsRef.current) return;
    if (duelRef.current) return;
    if (!canSpend(balanceRef.current)) return;
    ensureDaily();
    if (!jobRef.current) {
      const dealt = dealJobs(createRng(), balanceRef.current, BETS[betIndexRef.current]);
      setJobOffer(dealt.filter((c) => c.mystery));
    }
    setSpendOpen(true);
    sfx.playClick();
  }, [ensureDaily]);

  const takeJob = useCallback((card: JobCard) => {
    if (chaseRef.current) {
      setJobToast("Počas ZÁSAHU zamknuté");
      return;
    }
    if (busyRef.current || inFsRef.current || jobRef.current || duelRef.current) return;
    if (!canSpend(balanceRef.current)) return;
    if (balanceRef.current < card.stake) return;
    const board = dailyRef.current;
    if (!card.mystery) {
      const i = board?.cards.findIndex((c) => c.id === card.id) ?? -1;
      if (!board || i < 0 || board.marks[i]) return;
    }
    const betNow = BETS[betIndexRef.current];
    const taken = { ...card, lockBet: card.lockBet || betNow };
    setBalance((b) => +(b - taken.stake).toFixed(2));
    jobRef.current = taken;
    setJob(taken);
    setTicketSeal(null);
    setSpendOpen(Boolean(taken.mystery));
    setTopLine(`${jobShownGoal(taken)} · stávka ${formatMoney(taken.lockBet)} zamknutá`);
    if (taken.mystery) {
      setJobToast(`OTRS OTVORENÝ · ${jobShownGoal(taken)}`);
    }
    sfx.playClick();
  }, []);

  const startAuto = useCallback((n: number) => {
    if (busyRef.current || inFsRef.current || chaseRef.current) {
      if (chaseRef.current) setJobToast("Počas ZÁSAHU zamknuté");
      return;
    }
    const d = duelRef.current;
    if (d && d.phase !== "play") return;
    if (d && !canDuelSpin(d)) return;
    const capped = d ? Math.min(n, duelLeft(d)) : n;
    if (capped <= 0) return;
    autoFloorRef.current = balanceRef.current * 0.5;
    setAutoReason(null);
    setAutoOn(true);
    autoRef.current = true;
    setAutoLeft(capped);
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
      const live = duelRef.current;
      if (live && !canDuelSpin(live)) return;
      setAutoLeft((n) => n - 1);
      await playRound();
    })();
    return () => {
      cancel = true;
    };
  }, [autoOn, autoLeft, busy, inFs, started, playRound, duel]);

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
      if (chaseCardRef.current && (e.code === "Space" || e.code === "Enter" || e.code === "Escape")) {
        chaseCardRef.current = null;
        setChaseCard(null);
        return;
      }
      if (busyRef.current) return;
      const live = duelRef.current;
      if (live && !canDuelSpin(live)) return;
      if (!inFsRef.current) void playRound();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, playRound, stopReels, closeBanner, finishPick]);

  const duelSpinOpen = Boolean(
    duel && duel.kind === "online" && duel.phase === "play" && !busy && !inFs && canDuelSpin(duel),
  );
  useEffect(() => {
    if (!duelSpinOpen) return;
    const t = window.setTimeout(() => {
      const cur = duelRef.current;
      if (!cur || cur.phase !== "play" || busyRef.current || inFsRef.current || !canDuelSpin(cur)) return;
      duelBlanks.current += 1;
      if (duelBlanks.current >= 3) {
        const link = duelLinkRef.current;
        if (link) {
          void duelForfeit(link.room, cur.you === 0 ? "host" : "guest", {
            have: cur.seats[cur.you].have,
            score: cur.seats[cur.you].score,
          }).catch(() => {});
        }
        const next = forfeitDuel(cur, cur.you);
        duelRef.current = next;
        setDuel(next);
        settleDuel(next);
        return;
      }
      const betNow = BETS[betIndexRef.current];
      const perk = perkOf(standing(rankRef.current.rp).id);
      const cost = anteRef.current ? +(betNow * perk.anteMul).toFixed(2) : betNow;
      if (balanceRef.current >= cost) setBalance((b) => +(Math.max(0, b - cost)).toFixed(2));
      const next = tickDuel(cur, 0);
      duelRef.current = next;
      setDuel(next);
      setTopLine(`ČAS · SPIN ${next.seats[cur.you].have} = 0`);
      if (next.phase === "done") settleDuel(next);
    }, 20_000);
    return () => window.clearTimeout(t);
  }, [duelSpinOpen, settleDuel]);

  return {
    started,
    bootReady,
    bootPct,
    booting,
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
      if (busyRef.current || duelRef.current || duelLinkRef.current || chaseRef.current) {
        if (chaseRef.current) setJobToast("Počas ZÁSAHU zamknuté");
        return;
      }
      setAnte(v);
      sfx.playClick();
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
    pickClear,
    pickTotalX,
    pickKillId,
    pickPicks,
    revealPick,
    finishPick,
    pity,
    pityDelta,
    pityGoal: PITY_GOAL,
    heat,
    windows: hackWindows,
    activeWindow,
    windowPhase,
    chase: chase && {
      ...chase,
      total: ZASAH.SPINS,
      windows: hackWindows,
      phase: windowPhase,
      activeWindow,
      tension: chase.strikes >= 2 ? "danger" : chase.hits >= 3 ? "close" : null,
    },
    chaseMod,
    chaseCard,
    dismissChaseCard: () => {
      chaseCardRef.current = null;
      setChaseCard(null);
    },
    taxFly,
    taxKey,
    rank: standing(rp),
    rankPeak,
    rankShield,
    rankDelta,
    rankTick,
    rankFlash,
    rankOpen,
    setRankOpen,
    winStreak,
    rankParts,
    perk,
    buyX,
    weekDue,
    weekTarget: standing(dropOneDivision(rp)),
    pots,
    desk,
    mine,
    stale,
    nick,
    deviceId,
    nickAsk,
    setNickName: async (name: string) => {
      const id = playerIdRef.current || crypto.randomUUID();
      playerIdRef.current = id;
      setDeviceId(id);
      const err = await saveNick(id, name);
      if (!err) {
        setNick(readNick());
        setNickAsk(false);
        persistNow();
        const mineNow = mineRef.current;
        if (mineNow.wagered > 0 || mineNow.paid > 0 || mineNow.best > 0) {
          void putBoard(
            id,
            mineNow.wagered,
            mineNow.paid,
            mineNow.best,
            bestHowRef.current,
            bestStakeRef.current,
            bestRecipeRef.current,
          ).catch(() => {});
        }
      }
      return err;
    },
    dismissNick: () => {
      skipNick();
      setNickAsk(false);
    },
    jpHit,
    ticketLock,
    poolEligible: isEligibleBet(bet),
    clearRankFlash: () => setRankFlash(null),
    autoOn,
    autoHalt,
    setAutoHalt: (v: boolean) => {
      setAutoHalt(v);
      autoHaltRef.current = v;
    },
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
    refill: askBust,
    bustAsk,
    askBust,
    cancelBust,
    confirmBust,
    exekucia,
    dismissExekucia: () => setExekucia(null),
    broke: balance < BETS[0],
    bestWin,
    canSpin:
      started &&
      !stale &&
      !busy &&
      !inFs &&
      !buyAsk &&
      !chaseCard &&
      balance >= stake &&
      (!duel || (duel.phase === "play" && canDuelSpin(duel))),
    canBuy:
      started &&
      !stale &&
      !busy &&
      !inFs &&
      !buyAsk &&
      !duel &&
      !duelLink &&
      !chase &&
      balance >= +(bet * buyX).toFixed(2),
    surplus: canSpend(balance),
    spendOpen,
    setSpendOpen,
    openSpend,
    takeJob,
    job,
    ticketSeal,
    jobOffer,
    daily,
    jobToast,
    lcdFlash,
    surplusX: JOB_BANK,
    duel,
    duelOpen,
    setDuelOpen,
    duelLink,
    duelPeer,
    setDuelPeer,
    hostDuel: (mode: DuelMode, name: string, betAmt?: number, need = 10, anteOn = false) => {
      if (chaseRef.current) return "Počas ZÁSAHU zamknuté";
      if (duelRef.current) return "Už beží duel.";
      if (inFsRef.current) {
        setTopLine("DOTOČ 4KA TV, POTOM DUEL");
        return "Dotoč 4KA TV, potom duel.";
      }
      const stake = betAmt && betAmt > 0 ? betAmt : BETS[betIndexRef.current];
      const spins = need > 0 ? Math.round(need) : 10;
      if (balanceRef.current < +(stake * spins * 1.2).toFixed(2)) return "Málo kreditu.";
      const i = BETS.reduce((best, v, idx) => (Math.abs(v - stake) < Math.abs(BETS[best] - stake) ? idx : best), 0);
      setBetIndex(i);
      betIndexRef.current = i;
      setAnte(anteOn);
      anteRef.current = anteOn;
      const room = makeRoomCode();
      setDuelLink({
        room,
        role: "host",
        name: name.trim().slice(0, 16) || "HRÁČ 1",
        mode,
        bet: BETS[i],
        need: spins,
        ante: anteOn,
      });
      setDuelPeer("");
      setDuelOpen(true);
      sfx.playClick();
      return "";
    },
    joinDuel: (mode: DuelMode, name: string, code: string, betAmt?: number, need = 10, anteOn = false) => {
      if (chaseRef.current) return "Počas ZÁSAHU zamknuté";
      if (duelRef.current) return "Už beží duel.";
      if (inFsRef.current) {
        setTopLine("DOTOČ 4KA TV, POTOM DUEL");
        return "Dotoč 4KA TV, potom duel.";
      }
      const room = code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 4);
      if (room.length < 4) return "Kód má 4 znaky.";
      const stake = betAmt && betAmt > 0 ? betAmt : BETS[betIndexRef.current];
      const spins = need > 0 ? Math.round(need) : 10;
      if (balanceRef.current < +(stake * spins * 1.2).toFixed(2)) return "Málo kreditu.";
      const i = BETS.reduce((best, v, idx) => (Math.abs(v - stake) < Math.abs(BETS[best] - stake) ? idx : best), 0);
      setBetIndex(i);
      betIndexRef.current = i;
      setAnte(anteOn);
      anteRef.current = anteOn;
      setDuelLink({
        room,
        role: "guest",
        name: name.trim().slice(0, 16) || "HRÁČ 2",
        mode,
        bet: BETS[i],
        need: spins,
        ante: anteOn,
      });
      setDuelPeer("");
      setDuelOpen(true);
      sfx.playClick();
      return "";
    },
    beginOnline: (peerName: string, bet: number, mode: DuelMode, need = 10, anteOn = false) => {
      if (chaseRef.current) return "Počas ZÁSAHU zamknuté";
      const link = duelLinkRef.current;
      if (!link) return;
      if (duelRef.current?.room === link.room && duelRef.current.phase === "play") return;
      const you: 0 | 1 = link.role === "host" ? 0 : 1;
      const hostName = link.role === "host" ? link.name : peerName;
      const guestName = link.role === "guest" ? link.name : peerName;
      const spins = need > 0 ? Math.round(need) : link.need || 10;
      const i = BETS.reduce((best, v, idx) => (Math.abs(v - bet) < Math.abs(BETS[best] - bet) ? idx : best), 0);
      setBetIndex(i);
      betIndexRef.current = i;
      const anteMatch = anteOn || link.ante;
      setAnte(anteMatch);
      anteRef.current = anteMatch;
      const next = startDuel({
        mode: mode === "live" ? "spins" : mode,
        a: hostName,
        b: guestName,
        bet: BETS[i],
        kind: "online",
        you,
        room: link.room,
        need: spins,
      });
      duelSettled.current = false;
      duelBlanks.current = 0;
      duelRef.current = next;
      setDuel(next);
      setDuelOpen(false);
      setTopLine("SYMBOLY PLATIA KDEKOĽVEK NA OBRAZOVKE");
      const pending = pendingPeerTick.current;
      if (pending) {
        pendingPeerTick.current = null;
        const synced = applyPeerTick(next, pending.have, pending.score);
        duelRef.current = synced;
        setDuel(synced);
        if (synced.phase === "done") settleDuel(synced);
      }
    },
    applyRemoteTick: (have: number, score: number) => {
      const cur = duelRef.current;
      if (!cur || cur.kind !== "online") {
        pendingPeerTick.current = { have, score };
        return;
      }
      const next = applyPeerTick(cur, have, score);
      duelRef.current = next;
      setDuel(next);
      if (next.phase === "done") settleDuel(next);
    },
    notePeerNet: (net: boolean) => {
      const cur = duelRef.current;
      if (!cur || Boolean(cur.peerNet) === net) return;
      const next = { ...cur, peerNet: net };
      duelRef.current = next;
      setDuel(next);
    },
    noteForfeit: (who: 0 | 1) => {
      const cur = duelRef.current;
      if (!cur || cur.phase === "done" || duelSettled.current) return;
      const next = forfeitDuel(cur, who);
      duelRef.current = next;
      setDuel(next);
      settleDuel(next);
    },
    foldDuel: () => {
      const cur = duelRef.current;
      if (!cur || cur.phase !== "play") return;
      const who: 0 | 1 = cur.kind === "online" ? cur.you : cur.turn;
      const link = duelLinkRef.current;
      if (cur.kind === "online" && link) {
        void duelForfeit(link.room, who === 0 ? "host" : "guest", {
          have: cur.seats[who].have,
          score: cur.seats[who].score,
        }).catch(() => {});
      }
      const next = forfeitDuel(cur, who);
      duelRef.current = next;
      setDuel(next);
      settleDuel(next);
    },
    beginDuel: (mode: DuelMode, a: string, b: string, betAmt?: number, need = 10, anteOn = false) => {
      if (chaseRef.current) return "Počas ZÁSAHU zamknuté";
      if (busyRef.current) return "Počkaj, kým dotočí.";
      if (inFsRef.current) return "Dotoč 4KA TV, potom duel.";
      if (duelRef.current) return "Už beží duel.";
      const stake = betAmt && betAmt > 0 ? betAmt : BETS[betIndexRef.current];
      const spins = need > 0 ? Math.round(need) : 10;
      if (balanceRef.current < +(stake * spins * 1.2).toFixed(2)) return "Málo kreditu.";
      const i = BETS.reduce((best, v, idx) => (Math.abs(v - stake) < Math.abs(BETS[best] - stake) ? idx : best), 0);
      setBetIndex(i);
      betIndexRef.current = i;
      setAnte(anteOn);
      anteRef.current = anteOn;
      const next = startDuel({ mode, a, b, bet: BETS[i], need: spins });
      duelSettled.current = false;
      duelBlanks.current = 0;
      duelRef.current = next;
      setDuel(next);
      setDuelOpen(false);
      setTopLine("SYMBOLY PLATIA KDEKOĽVEK NA OBRAZOVKE");
      sfx.playClick();
      return "";
    },
    swapDuel: () => {
      const cur = duelRef.current;
      if (!cur || cur.phase !== "swap") return;
      const next = confirmSwap(cur);
      duelRef.current = next;
      setDuel(next);
      setTopLine(`DUEL · ${next.seats[1].name}`);
      sfx.playClick();
    },
    endDuel: () => {
      const cur = duelRef.current;
      const link = duelLinkRef.current;
      if (cur && cur.phase === "play") {
        const who: 0 | 1 = cur.kind === "online" ? cur.you : cur.turn;
        if (cur.kind === "online" && link) {
          void duelForfeit(link.room, who === 0 ? "host" : "guest", {
            have: cur.seats[who].have,
            score: cur.seats[who].score,
          }).catch(() => {});
        }
        const next = forfeitDuel(cur, who);
        duelRef.current = next;
        setDuel(next);
        settleDuel(next);
        return;
      }
      if (link && !cur) void duelLeave(link.room, link.role).catch(() => {});
      settleGen.current += 1;
      duelSettled.current = false;
      duelBlanks.current = 0;
      duelFastRef.current = false;
      duelRef.current = null;
      setDuel(null);
      setDuelLink(null);
      setDuelPeer("");
      setDuelOpen(false);
      setAutoReason(null);
      setTopLine("SYMBOLY PLATIA KDEKOĽVEK NA OBRAZOVKE");
    },
  };
}
