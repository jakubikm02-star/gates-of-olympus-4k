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
  FS_SYMBOL,
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
  withoutScatterPay,
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
import { drawBonusMode, type BonusModeId, type PendingBonus } from "@/lib/slot/bonus-mode";
import { playZbox, zboxVipOf, type ZPlay } from "@/lib/slot/zbox";
import { setZboxHelpOff, zboxHelpOff } from "@/lib/slot/zbox-help";
import { pauseTicket, resumePlan, ticketCounts, tickUnlessPaused, ticketReserve, type TicketPause } from "@/lib/slot/ticket-pause";
import { playKoleso, kolesoVipOf, type KPlay } from "@/lib/slot/koleso";
import { postLiveHit } from "@/lib/slot/live-hit";
import { kolesoHelpOff, setKolesoHelpOff } from "@/lib/slot/koleso-help";
import { freshRpDay, rollRpDay, rpParts, scaleSpinGain, scaledParts, suchoLeague, suchoStep, ticketRp, type RpDay } from "@/lib/slot/rp-tickets";
import { applyRankDelta, applyWeeklyDecay, bannerFromX, buyXOf, dropOneDivision, fsSpinsOf, nextRebate, perkOf, rpFromDead, rpFromSpin, settleBuyRank, standing, RELOAD_STABILIZE, WEEK_MS, type RankBreakdown, type RankFlash } from "@/lib/slot/ranks";
import * as sfx from "@/lib/slot/audio";
import { formatMoney } from "@/lib/slot/format";
import { emptyPlayerSave, readLocalSave, writeLocalSave, type PlayerSave } from "@/lib/slot/player-save";
import { carryStamp } from "@/lib/slot/mirror-bridge";
import { flushMirrorPush, pullMirrorSave, scheduleMirrorPush } from "@/lib/slot/mirror-cloud";
import {
  applyStat,
  isStatsBackupEnabled,
  readStats,
  writeStats,
  type PlayerStats,
  type StatEvent,
} from "@/lib/slot/stats";
import { pullAndMergeStats, statsPut } from "@/lib/slot/stats-api";
import { emptyBoard, isEligibleBet, ticketResolve, TIER_BY_ID, type BoardSnap, type JackpotHit, type TierId } from "@/lib/slot/jackpot";
import { fetchParkPool, postParkClaim, postParkSpin, withRetry, type PoolSpinResult } from "@/lib/slot/jackpot-api";
import { bumpDesk, bumpLocalDesk, bumpTicketDesk, deskToday, emptyDesk, fetchDesk, sameDesk, ticketProfit, type DeskDay } from "@/lib/slot/desk-api";
import { putBoard, readBestMark, readBestRecipe, readNick, saveNick, skipNick, winHow, writeBestHow, writeBestRecipe } from "@/lib/slot/board-api";
import { emptyTally, mergeTally, notePays, recipeTumbles, topCans, topPays, type SeqTally, type WinRecipe } from "@/lib/slot/win-recipe";
import { HEAT_MAX, heatFromWin } from "@/lib/slot/heat";
import { canEventCue, type CanEvent } from "@/lib/slot/cue-ready";
import { canBoltKey } from "@/lib/slot/can-sfx";
import { ReelScatterTracker, SETTLE_TIMEOUT_MS, cascadeCue, thirdScatterCue, type LandCue } from "@/lib/slot/scatter-sfx";
import { antiAfterSpin, antiCue, antiLevel, antiStreak, type AntiCue } from "@/lib/slot/anticipation";
import { ZASAH, applyMod, fsSpinX, fsZasahArmed, roundModScope, fsSymName, modMul, rollFsSymbol, rollTarget, rollWindows, stepMod, windowCount, type ChaseMod, type ModScope, type ChaseModKind, type ChaseOutcome, type ChaseState, type FsSymId, type HackWindow } from "@/lib/slot/zasah";
import { BUILD_ID, dropStaleCaches, hardReload, releaseMatches } from "@/lib/slot/release";
import {
  DUEL_DEPOSIT_MULT,
  bootDepositReason,
  canAffordDuel,
  depositTotal,
  forfeitReason,
  newDeposit,
  settleOnce,
  takeAppReloadMarker,
  writeAppReloadMarker,
  type DepositReason,
  type DepositSettlement,
  type DuelDeposit,
} from "@/lib/slot/duel-deposit";
import { clampPlayers, versusMode, abortDuel, startDuel, tickDuel, confirmSwap, duelLeft, applyPeerTick, makeRoomCode, canDuelSpin, duelWinner, forfeitDuel, reconcileDuel, duelSettleKey, duelOutcome, blankStep, duelBannerMs, duelHoldsReload, type Duel, type DuelMode, type DuelLink } from "@/lib/slot/duel";
import { duelForfeitIf, duelLeave, duelPoll, duelRematch, duelTick, duelVote, voteOutcome, type DuelSnap, type SeatVote } from "@/lib/slot/duel-api";
import {
  canSpend,
  dealJobs,
  freshDaily,
  jobParknetBroke,
  jobShownGoal,
  jobSplit,
  jobStatus,
  shownOnGrid,
  stampDaily,
  freeSpinsLabel,
  JOB_BANK,
  type DailyBoard,
  type JobCard,
  type JobEvent,
} from "@/lib/slot/spend";
import { nextFrame } from "@/lib/slot/frame-loop";

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

export type WinBanner = "win" | "big" | "mega" | "epic" | "massive" | "max" | "fs" | "fsTotal" | "pool" | null;

export interface BannerMeta {
  spins: number;
  extra: number;
  peakMult: number;
  terminated: boolean;
  /** 4KA TV triggered in ZÁSAH: wins were paid ×2. */
  zasah?: boolean;
}

function readLocal(): PlayerSave | null {
  return readLocalSave();
}

function writeLocal(s: PlayerSave): void {
  writeLocalSave(s);
  scheduleMirrorPush(s);
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

/** Shortest wait for the jackpot RPC, so turbo / tapped-stop spins still pick up a ticket on a quick network. */
const POOL_WAIT_MIN_MS = 250;

/** Resolves with the promise's value, or with null once `ms` passes. The promise keeps running either way. */
function settleWithin<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        window.clearTimeout(timer);
        resolve(v);
      },
      () => {
        window.clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

/** Two frames so the spin strip is on screen before the stop clock starts. */
/** Can drop / throw sound (lib/slot/cue-ready canEventCue): every drop is the Rampa slot, the throw is Hrom. */
function playCanCue(event: CanEvent): void {
  if (canEventCue(event) === "zap") sfx.playZap();
  else sfx.playThunder();
}

/** Spin counter for the can sound keys (lib/slot/can-sfx): one lightning strike plays once. */
let canSpinSeq = 0;

function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    nextFrame(() => nextFrame(finish));
    window.setTimeout(finish, 48);
  });
}

/**
 * A ref's initial value is evaluated on every render even though only the first one is used. Some of
 * these initialisers are not free (readStats parses the localStorage stats JSON, emptyDesk builds an
 * Intl.DateTimeFormat), and this hook renders ~20× per spin, so build them once.
 */
/** Pot polls (every 2.5 s) mostly return the same numbers. */
function samePots(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function useOnce<T>(init: () => T): T {
  return useState(init)[0];
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
  const gridRef = useRef<Cell[][]>(useOnce(emptyGrid));
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
  /** BEZ DANE / DAŇOVÝ ÚRAD step behind the banner amount (display only: the amount is already net). */
  const [bannerTax, setBannerTax] = useState<TaxFly | null>(null);
  /** Win in bet multiples for the banner on screen (MASÍVNA VÝHRA shows it). */
  const [bannerX, setBannerX] = useState(0);
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
  /** Mode strip of the filled bar (shows the mode drawn at the fill). */
  const [modeStrip, setModeStrip] = useState<{ mode: BonusModeId; key: number } | null>(null);
  /** Running Ž-BOX: the whole run is decided up front (playZbox), the overlay animates it. */
  const [zbox, setZbox] = useState<{ play: ZPlay; bet: number; gross: number; net: number; tax: ChaseModKind | null; key: number } | null>(null);
  /** Running KOLESO NEŠŤASTIA: decided up front (playKoleso), the overlay animates it. */
  const [koleso, setKoleso] = useState<{ play: KPlay; bet: number; gross: number; net: number; tax: ChaseModKind | null; key: number } | null>(null);
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
  const ticketLockRef = useRef(false);
  const pendingLiveTicketRef = useRef<TierId | null>(null);
  const [job, setJob] = useState<JobCard | null>(null);
  const [ticketSeal, setTicketSeal] = useState<{ job: JobCard; verdict: "ok" | "fail" } | null>(null);
  /** Display only: one-shot ticket animation (stake paid on accept / payout on success). */
  const [ticketFx, setTicketFx] = useState<{ id: number; kind: "pay" | "payout"; job: JobCard } | null>(null);
  const clearTicketFx = useCallback(() => setTicketFx(null), []);
  const jobRef = useRef<JobCard | null>(null);
  /** Ticket paused for a duel (persisted): locked bet + ante to restore when the duel is over. */
  const [ticketPause, setTicketPauseState] = useState<TicketPause | null>(null);
  const ticketPauseRef = useRef<TicketPause | null>(null);
  const setTicketPause = useCallback((p: TicketPause | null) => {
    ticketPauseRef.current = p;
    setTicketPauseState(p);
  }, []);
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
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsSnap, setStatsSnap] = useState<PlayerStats>(() => readStats());
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
  const statsRef = useRef<PlayerStats>(useOnce(readStats));
  const statsDirtyRef = useRef(false);
  const statsOpenRef = useRef(false);
  const statsLastWriteRef = useRef(0);
  const statsSyncTimer = useRef<number | null>(null);
  const chaseArmedAtRef = useRef(0);
  const fsStartedAtRef = useRef(0);
  const turboRef = useRef(turbo);
  const quickRef = useRef(quick);
  const anteRef = useRef(ante);
  const inFsRef = useRef(false);
  const globalMultRef = useRef(0);
  const balanceRef = useRef(balance);
  const betIndexRef = useRef(betIndex);
  const autoRef = useRef(false);
  /** Spins still queued. The ceremony must not zero this. */
  const autoLeftRef = useRef(0);
  /** Big win / jackpot is on screen during auto: keep the queue and resume after VIDENÉ. */
  const autoHoldRef = useRef(false);
  /** Spins still queued when the ceremony opened. VIDENÉ restores this if the counter was wiped. */
  const autoHoldLeftRef = useRef(0);
  const playRoundRef = useRef<() => Promise<void>>(async () => {});
  const autoHaltRef = useRef(true);
  const busyRef = useRef(false);
  const extraFsRef = useRef(0);
  const triggerScatterRef = useRef(FS_TRIGGER_SCATTERS);
  const flyKey = useRef(1);
  const lastPaidXRef = useRef(0);
  const roundCashRef = useRef(0);
  const [duel, setDuel] = useState<Duel | null>(null);
  const [duelAlone, setDuelAlone] = useState(false);
  const [duelVotes, setDuelVotes] = useState<SeatVote[]>([]);
  const duelRef = useRef<Duel | null>(null);
  const [duelOpen, setDuelOpen] = useState(false);
  const [duelLink, setDuelLink] = useState<DuelLink | null>(null);
  const duelLinkRef = useRef<DuelLink | null>(null);
  const [duelPeer, setDuelPeer] = useState("");
  /** Peer progress that arrived before the local duel object existed (keyed by seat). */
  const pendingPeerTick = useRef<Map<number, { have: number; score: number }> | null>(null);
  const duelSettled = useRef(false);
  /** Kaucia: the deposit paid on duel entry and not settled yet (mirrored in the local save). */
  const depositRef = useRef<DuelDeposit | null>(null);
  const [duelDeposit, setDuelDepositState] = useState<DuelDeposit | null>(null);
  const [depositNote, setDepositNote] = useState<DepositSettlement | null>(null);
  /** How my own seat went out, as far as this client knows (the room may say "timeout" instead). */
  const forfeitCauseRef = useRef<"fold" | "idle" | null>(null);
  /** Why the game aborted the running duel (room vanished, both seats dropped). */
  const abortReasonRef = useRef<DepositReason>("roomFailure");
  const duelBlanks = useRef(0);
  const settleGen = useRef(0);
  const duelFastRef = useRef(false);
  const skipDuelTick = useRef(false);
  /** The running round started inside a live duel: its wins are held back (decided once, at round start). */
  const roundEscrowRef = useRef(false);
  /** Start time of the current duel (part of the settle key). */
  const duelStartedAtRef = useRef(0);
  /** Duels already credited on this device (duel + seat + start), so a duel never pays twice. */
  const settledKeysRef = useRef<Set<string>>(new Set());
  const foldingRef = useRef(false);
  /** The current duel was credited on this device (gate for the deferred new-build reload). */
  const duelPaidRef = useRef(false);
  /** A new build was found while a duel held the reload: re-check right after the duel is paid / closed. */
  const reloadDeferredRef = useRef(false);
  const checkReleaseRef = useRef<() => void>(() => {});
  /** An online duel result is being confirmed with the room row (credit not yet applied). */
  const settlingRef = useRef(false);
  /** Odveta: the player asked, or the room already moved to the next match. */
  const wantRematchRef = useRef(false);
  const pendingRematchRef = useRef<{ names: string[]; round?: number; ante?: boolean } | null>(null);
  const rematchLockRef = useRef(false);
  const rematchFlushRef = useRef<() => void>(() => {});
  const rematchVoteFired = useRef(false);
  const dissolveFired = useRef(false);
  const endDuelRef = useRef<() => void>(() => {});
  const resolveVotesRef = useRef<(votes: SeatVote[]) => void>(() => {});
  const duelBlankTotal = useRef(0);
  const autoFloorRef = useRef(0);
  const bannerWait = useRef<(() => void) | null>(null);
  const bannerOpen = useRef(false);
  const jpWait = useRef<(() => void) | null>(null);
  /** Ignore STOP for a moment after VIDENÉ, so the same tap cannot clear the remaining spins. */
  const ceremonyUntil = useRef(0);
  const pickWait = useRef<(() => void) | null>(null);
  const pickOpenRef = useRef(false);
  const pickEndedRef = useRef(false);
  const pickTotalXRef = useRef(0);
  const pickClearRef = useRef(false);
  const pickTilesRef = useRef<PickTile[]>([]);
  const pickRevealedRef = useRef<boolean[]>([]);
  const pityByBetRef = useRef<PityMap>({});
  /** Win of the running ZÁSAH (× bet, ZÁSAH spins only) for feature tickets. Not saved: a reload restarts the sum. */
  const chaseXRef = useRef(0);
  const kontrolaArmedRef = useRef(false);
  /** Bar filled → drawn mode, saved with the player until the bonus starts (Ž-BOX: until it pays). */
  const bonusPendingRef = useRef<PendingBonus | null>(null);
  const stripWait = useRef<(() => void) | null>(null);
  const zboxWait = useRef<(() => void) | null>(null);
  const kolesoWait = useRef<(() => void) | null>(null);
  const bonusResumeOnce = useRef(false);
  /** Tax period of the spin that armed KONTROLA (null = none / ZÁSAH / duel). */
  const pickModRef = useRef<ChaseMod | null>(null);
  /** BEZ DANE / DAŇOVÝ ÚNIK delta of the last free spin (summed into the 4KA TV session). */
  const lastTaxDeltaRef = useRef(0);
  const featureXRef = useRef(0);
  const rankRef = useRef({ rp: 0, peak: 0, shield: false });
  const streakRef = useRef(0);
  const holdUsedRef = useRef(false);
  const boardRef = useRef<BoardSnap>(useOnce(emptyBoard));
  const playerIdRef = useRef("");
  const reserveLocalRef = useRef(0);
  const reloadStreakRef = useRef(0);
  const spinsSinceReloadRef = useRef(0);
  const lastDecayAtRef = useRef(0);
  /** SUCHO counter: paid spins without an active ticket (rp-tickets.ts). */
  const rpIdleRef = useRef(0);
  const [rpIdle, setRpIdle] = useState(0);
  /** Daily RP decay record: day, played, cleared ticket. */
  const rpDayRef = useRef<RpDay>(freshRpDay(""));
  const rollRpDayRef = useRef<() => void>(() => {});
  /** Daily decay notice: waits for the start screen, then shows ~4 s. */
  const [rpNotice, setRpNotice] = useState<{ text: string; id: number } | null>(null);
  const [reloadStreak, setReloadStreak] = useState(0);
  const [weekDue, setWeekDue] = useState(0);
  const [desk, setDeskState] = useState<DeskDay>(emptyDesk);
  /** Polled every 4 s: keep the old object when nothing changed, so React bails out of the render. */
  const setDesk = useCallback((d: DeskDay) => setDeskState((prev) => (sameDesk(prev, d) ? prev : d)), []);
  const [mine, setMine] = useState<DeskDay>(emptyDesk);
  const mineRef = useRef<DeskDay>(useOnce(() => emptyDesk()));
  const bestHowRef = useRef("");
  const bestStakeRef = useRef(0);
  const bestRecipeRef = useRef<WinRecipe | null>(null);
  /** What the last runSequence paid with (symbols, cans, scatters). */
  const lastTallyRef = useRef<SeqTally>(useOnce(emptyTally));
  /** Free-spin feature total, folded spin by spin. */
  const fsTallyRef = useRef<SeqTally>(useOnce(emptyTally));
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
  /** Chase-start notice: which symbol Finančná správa took over. */
  const [fsReveal, setFsReveal] = useState<null | { sym: FsSymId; key: number }>(null);
  const fsRevealWait = useRef<(() => void) | null>(null);
  const [taxFly, setTaxFly] = useState<TaxFly | null>(null);
  const [taxKey, setTaxKey] = useState(0);
  const staleRef = useRef(false);
  const startedRef = useRef(false);
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
  startedRef.current = started;
  autoRef.current = autoHoldRef.current || autoOn;
  if (!autoHoldRef.current) autoLeftRef.current = autoLeft;
  statsOpenRef.current = statsOpen;
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

  const saveSnapRef = useRef<PlayerSave>(useOnce(emptyPlayerSave));
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
    /** Legacy saves only (≠ 1): the whole bonus is multiplied at the end. New bonuses pay the modifier per free spin. */
    modMul: 1,
    /** Sum of the per-free-spin BEZ DANE / DAŇOVÝ ÚNIK deltas (display at the end of the bonus). */
    taxDelta: 0,
    /** Triggered by a ZÁSAH spin: free-spin wins pay ×2 (fsSpinX). */
    zasah: false,
  });
  /** The last runSequence was a ZÁSAH spin (decides a 4KA TV it triggers). */
  const lastChasingRef = useRef(false);
  /** Anticipations in a row without a 4KA TV (lib/slot/anticipation). Saved with the player. */
  const antiStreakRef = useRef(0);
  /** Scatter land sounds of the running spin (reels report via onReelSettled). */
  const reelSfxRef = useRef<{ id: number; tracker: ReelScatterTracker; settled: Promise<void>; done: () => void } | null>(null);
  const reelSfxSeq = useRef(0);
  const playLandCue = useCallback((cue: LandCue | null) => {
    if (!cue) return;
    cue.steps.forEach((st, i) => sfx.playScatterLand(st.n, st.delayMs, cue.thunder && i === cue.steps.length - 1));
  }, []);
  /** Grid: reel `c` visually stopped. Plays its scatters' land sounds (once per reel, in stop order). */
  const onReelSettled = useCallback(
    (c: number) => {
      const live = reelSfxRef.current;
      if (!live) return;
      playLandCue(live.tracker.reel(c));
      if (live.tracker.settled) live.done();
    },
    [playLandCue],
  );
  const [fsZasah, setFsZasah] = useState(false);
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
    bonusPendingRef.current = s.bonusPending ?? null;
    if (s.zboxHelpOff && !zboxHelpOff()) setZboxHelpOff(true);
    if (s.kolesoHelpOff && !kolesoHelpOff()) setKolesoHelpOff(true);
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
        fsSym: s.chaseFsSym,
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
    rpIdleRef.current = s.rpIdle ?? 0;
    setRpIdle(rpIdleRef.current);
    rpDayRef.current = s.rpDay ?? freshRpDay("");
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
      taxDelta: s.fsTaxDelta ?? 0,
      zasah: Boolean(s.fsZasah && s.inFs),
    };
    setFsZasah(Boolean(s.fsZasah && s.inFs));
    antiStreakRef.current = antiStreak(s.antiStreak);
    const loadedRaw = s.job ? { ...s.job, lockBet: s.job.lockBet || BETS[s.betIndex] } : null;
    const loaded =
      loadedRaw?.seal && !(s.inFs && s.fsLeft > 0)
        ? { ...loadedRaw, seal: false, spun: loadedRaw.limit }
        : loadedRaw;
    const dead = Boolean(
      loaded &&
        (jobSplit(loaded) ? jobStatus(loaded) === "fail" : loaded.spun >= loaded.limit && loaded.have < loaded.need),
    );
    if (loaded && !dead && !(s.inFs && s.fsLeft > 0)) {
      // A ticket locks its bet. An old or edited save can carry another betIndex; spin at the locked bet.
      const lockIdx = BETS.findIndex((b) => Math.abs(b - loaded.lockBet) < 0.001);
      if (lockIdx >= 0 && lockIdx !== s.betIndex) {
        setBetIndex(lockIdx);
        betIndexRef.current = lockIdx;
      }
    }
    setJob(dead ? null : loaded);
    jobRef.current = dead ? null : loaded;
    // A reload during a duel: the duel itself is gone (its kaucia is settled below), the paused ticket
    // stays paused until the resume effect puts the locked bet + ante back.
    ticketPauseRef.current = s.ticketPause ?? null;
    setTicketPauseState(s.ticketPause ?? null);
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
      chaseFsSym: chaseRef.current?.fsSym ?? null,
      chaseHits: chaseRef.current?.hits ?? 0,
      chaseStrikes: chaseRef.current?.strikes ?? 0,
      chaseMod: modRef.current?.kind ?? null,
      chaseModLeft: modRef.current?.left ?? 0,
      fsModMul: fsSessionRef.current.modMul,
      fsTaxDelta: fsSessionRef.current.taxDelta,
      fsZasah: fsSessionRef.current.zasah,
      antiStreak: antiStreakRef.current,
      bonusPending: bonusPendingRef.current,
      zboxHelpOff: zboxHelpOff(),
      kolesoHelpOff: kolesoHelpOff(),
      rpIdle: rpIdleRef.current,
      rpDay: rpDayRef.current,
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
      ticketPause: ticketPauseRef.current,
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
      chaseFsSym: chaseRef.current?.fsSym ?? null,
      chaseHits: chaseRef.current?.hits ?? 0,
      chaseStrikes: chaseRef.current?.strikes ?? 0,
      chaseMod: modRef.current?.kind ?? null,
      chaseModLeft: modRef.current?.left ?? 0,
      fsModMul: fsSessionRef.current.modMul,
      fsTaxDelta: fsSessionRef.current.taxDelta,
      fsZasah: fsSessionRef.current.zasah,
      antiStreak: antiStreakRef.current,
      bonusPending: bonusPendingRef.current,
      zboxHelpOff: zboxHelpOff(),
      kolesoHelpOff: kolesoHelpOff(),
      rpIdle: rpIdleRef.current,
      rpDay: rpDayRef.current,
      duelDeposit: depositRef.current,
      updatedAt: Date.now(),
    };
    saveSnapRef.current = next;
    writeLocal(next);
  }, []);

  const flushStats = useCallback((keepalive = false) => {
    writeStats(statsRef.current);
    statsLastWriteRef.current = Date.now();
    setStatsSnap(statsRef.current);
    if (!statsDirtyRef.current) return;
    if (!isStatsBackupEnabled()) return;
    const id = playerIdRef.current;
    if (!id || id.length < 8) return;
    statsDirtyRef.current = false;
    void statsPut(id, statsRef.current, keepalive).catch(() => {
      statsDirtyRef.current = true;
    });
  }, []);

  const noteStat = useCallback((ev: StatEvent) => {
    const next = applyStat(statsRef.current, ev);
    statsRef.current = next;
    statsDirtyRef.current = true;
    const now = Date.now();
    if (now - statsLastWriteRef.current >= 1000) {
      writeStats(next);
      statsLastWriteRef.current = now;
      setStatsSnap(next);
    }
    if (statsSyncTimer.current == null && isStatsBackupEnabled()) {
      statsSyncTimer.current = window.setTimeout(() => {
        statsSyncTimer.current = null;
        flushStats(false);
      }, 30_000);
    }
  }, [flushStats]);

  const openStats = useCallback(() => {
    if (busyRef.current || inFsRef.current || chaseRef.current) return;
    setStatsSnap(statsRef.current);
    setStatsOpen(true);
    sfx.playClick();
  }, []);

  const setDeposit = useCallback((d: DuelDeposit | null) => {
    depositRef.current = d;
    setDuelDepositState(d);
  }, []);

  const reportDeposit = useCallback(
    (st: DepositSettlement, toast: boolean) => {
      if (st.refund > 0) noteStat({ t: "duelDeposit", phase: "returned", amount: st.refund, reason: st.reason });
      if (st.burned > 0) noteStat({ t: "duelDeposit", phase: "burned", amount: st.burned, reason: st.reason });
      setDepositNote(st);
      if (!toast) return;
      if (st.burned > 0 && st.refund > 0) setJobToast(`KAUCIA −${formatMoney(st.burned)} · SPÄŤ +${formatMoney(st.refund)}`);
      else if (st.burned > 0) setJobToast(`KAUCIA PREPADLA −${formatMoney(st.burned)}`);
      else if (st.refund > 0) setJobToast(`KAUCIA SPÄŤ +${formatMoney(st.refund)}`);
    },
    [noteStat],
  );

  /** Pay the duel entry deposit: balance and the pending deposit hit the local save in one write. */
  const payDeposit = useCallback(
    (dep: DuelDeposit) => {
      const total = depositTotal(dep);
      balanceRef.current = +Math.max(0, balanceRef.current - total).toFixed(2);
      setBalance((b) => +Math.max(0, b - total).toFixed(2));
      setDeposit(dep);
      setDepositNote(null);
      persistNow();
      noteStat({ t: "duelDeposit", phase: "paid", amount: total });
    },
    [persistNow, noteStat, setDeposit],
  );

  /** Settle the pending deposit exactly once (refund or burn by reason). */
  const settleDeposit = useCallback(
    (reason: DepositReason, opts?: { burnSeat?: number; burnSeats?: number[]; toast?: boolean }) => {
      const res = settleOnce(depositRef.current, reason, { burnSeat: opts?.burnSeat, burnSeats: opts?.burnSeats });
      const st = res.settlement;
      if (!st) return null;
      setDeposit(null);
      if (st.refund > 0) {
        balanceRef.current = +(balanceRef.current + st.refund).toFixed(2);
        setBalance((b) => +(b + st.refund).toFixed(2));
      }
      persistNow();
      reportDeposit(st, opts?.toast !== false);
      return st;
    },
    [persistNow, reportDeposit, setDeposit],
  );

  const patchDeposit = useCallback(
    (patch: Partial<DuelDeposit>) => {
      const cur = depositRef.current;
      if (!cur) return;
      setDeposit({ ...cur, ...patch });
      persistNow();
    },
    [persistNow, setDeposit],
  );

  const closeStats = useCallback(() => {
    setStatsOpen(false);
    flushStats(false);
  }, [flushStats]);

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
    noteStat({
      t: "rank",
      applied: res.rp - res.before.rp,
      event: "week",
      after: res.after.id,
      weekDrops: res.drops,
    });
    sfx.playThunder();
    return true;
  }, [noteStat]);

  useEffect(() => {
    let cancel = false;
    let cached = readLocal();
    // Kaucia left pending by the previous page: settle it once, before anything else is saved.
    const marker = takeAppReloadMarker();
    const bootAt = cached?.updatedAt ?? 0;
    let bootDeposit: DepositSettlement | null = null;
    const foldDeposit = (save: PlayerSave | null) => {
      if (!save?.duelDeposit) return save;
      const reason = bootDepositReason(save.duelDeposit, marker, Date.now());
      const dep = reason ? settleOnce(save.duelDeposit, reason).settlement : null;
      bootDeposit = dep;
      return {
        ...save,
        balance: +(save.balance + (dep?.refund ?? 0)).toFixed(2),
        duelDeposit: null,
      };
    };
    cached = foldDeposit(cached);
    depositRef.current = null;
    if (cached) applySave(cached);

    const finish = () => {
      if (cancel || readySave.current) return;
      readySave.current = true;
      if (bootDeposit) {
        flushSave();
        reportDeposit(bootDeposit, true);
      }
      runWeeklyDecay();
      rollRpDayRef.current();
      setHydrated(true);
      flushMirrorPush();
    };

    // The other link may hold a newer save. Wait briefly so opening this page cannot stamp
    // over it. The hop in the document head has usually copied it into this origin already.
    const timer = window.setTimeout(finish, 1600);
    void pullMirrorSave(cached).then((remote) => {
      if (cancel) return;
      window.clearTimeout(timer);
      if (remote && remote.updatedAt > bootAt && !startedRef.current && !busyRef.current) {
        bootDeposit = null;
        cached = foldDeposit(remote);
        depositRef.current = null;
        if (cached) {
          applySave(cached);
          writeLocalSave(cached);
          scheduleMirrorPush(cached);
        }
      }
      finish();
    }).catch(() => {
      if (cancel) return;
      window.clearTimeout(timer);
      finish();
    });
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [applySave, runWeeklyDecay, flushSave, reportDeposit]);

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
      ticketPause: ticketPauseRef.current,
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
      chaseFsSym: chaseRef.current?.fsSym ?? null,
      chaseHits: chaseRef.current?.hits ?? 0,
      chaseStrikes: chaseRef.current?.strikes ?? 0,
      chaseMod: modRef.current?.kind ?? null,
      chaseModLeft: modRef.current?.left ?? 0,
      fsModMul: fsSessionRef.current.modMul,
      fsTaxDelta: fsSessionRef.current.taxDelta,
      fsZasah: fsSessionRef.current.zasah,
      antiStreak: antiStreakRef.current,
      bonusPending: bonusPendingRef.current,
      zboxHelpOff: zboxHelpOff(),
      kolesoHelpOff: kolesoHelpOff(),
      rpIdle: rpIdleRef.current,
      rpDay: rpDayRef.current,
      duelDeposit: depositRef.current,
    };
    const stamped = carryStamp(saveSnapRef.current, payload);
    saveSnapRef.current = stamped;
    writeLocal(stamped);
  }, [hydrated, balance, betIndex, muted, turbo, quick, ante, autoHalt, bestWin, pityByBet, rp, rankPeak, rankShield, winStreak, pots, reloadStreak, weekDue, fsLeft, inFs, globalMult, job, ticketPause, daily, heat, klienti, chase, chaseMod]);

  useEffect(() => {
    let stop = false;
    const check = async () => {
      if (stop || staleRef.current || BUILD_ID === "local") return;
      try {
        const ok = await releaseMatches();
        if (ok || stop || staleRef.current) return;
        if (busyRef.current || chaseRef.current || chaseCardRef.current) return;
        if (
          duelHoldsReload({
            duel: duelRef.current,
            lobby: Boolean(duelLinkRef.current && !duelRef.current),
            paid: duelPaidRef.current,
            roundRunning: busyRef.current || inFsRef.current || fsSessionRef.current.left > 0 || settlingRef.current,
          })
        ) {
          // Reload after the duel: it is not saved, a reload now would forfeit it.
          reloadDeferredRef.current = true;
          return;
        }
        reloadDeferredRef.current = false;
        staleRef.current = true;
        setStale(true);
        noteStat({ t: "ui", what: "build" });
        await dropStaleCaches();
        // App-initiated: a deposit still pending at the next boot is refunded, not burned.
        writeAppReloadMarker("version");
        hardReload();
      } catch {
        /* a dropped network does not kill the current build */
      }
    };
    checkReleaseRef.current = () => void check();
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
    const onHide = () => {
      persistNow();
      flushStats(true);
      noteStat({
        t: "session",
        phase: typeof document !== "undefined" && document.visibilityState === "hidden" ? "hide" : "show",
        pwa: typeof window !== "undefined" && !!window.matchMedia?.("(display-mode: standalone)").matches,
      });
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [persistNow, flushStats, noteStat]);

  const applyBoard = useCallback((s: BoardSnap) => {
    boardRef.current = s;
    if (!busyRef.current && !jpShowRef.current) setPots((prev) => (samePots(prev, s.pots) ? prev : s.pots));
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
      // Not while the reels run: a counter change would re-render the board mid-spin.
      if (busyRef.current) return;
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
      if (document.visibilityState === "visible") {
        runWeeklyDecay();
        rollRpDayRef.current();
      }
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
    try {
      sfx.unlockAudio();
      sfx.setMuted(muted);
      await Promise.race([
        Promise.resolve()
          .then(() => sfx.whenSpinReady())
          .catch(() => {}),
        new Promise<void>((resolve) => window.setTimeout(resolve, 2200)),
      ]);
      try {
        sfx.startAmbience();
      } catch {
        /* audio is optional */
      }
    } finally {
      setStarted(true);
      setPhase(inFsRef.current && fsSessionRef.current.left > 0 ? "fs" : "idle");
      setBooting(false);
      bootingRef.current = false;
      const pwa =
        typeof window !== "undefined" &&
        (window.matchMedia("(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)").matches ||
          Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
      noteStat({ t: "session", phase: "start", pwa });
      if (isStatsBackupEnabled() && playerIdRef.current) {
        void pullAndMergeStats(playerIdRef.current, statsRef.current).then((m) => {
          statsRef.current = m;
          writeStats(m);
          setStatsSnap(m);
        });
      }
    }
  }, [muted, noteStat]);

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
    noteStat({ t: "ui", what: "mute" });
    setMuted((m) => {
      const n = !m;
      sfx.setMuted(n);
      if (!n && (chaseRef.current?.strikes ?? 0) >= 2) sfx.startHeartbeat();
      return n;
    });
  }, []);

  const changeBet = useCallback((dir: -1 | 1) => {
    if (busyRef.current || inFsRef.current || fsSessionRef.current.left > 0) return;
    // Lowering the bet is always a way out. A ticket and a duel keep their locked bet (they end on their own when unaffordable).
    if (jobRef.current || duelRef.current || duelLinkRef.current || (chaseRef.current && dir > 0)) {
      if (chaseRef.current && dir > 0) setJobToast("Počas ZÁSAHU zamknuté");
      return;
    }
    setBetIndex((i) => Math.min(BETS.length - 1, Math.max(0, i + dir)));
    sfx.playClick();
  }, []);

  useEffect(() => () => sfx.stopHeartbeat(), []);

  /** Bankruptcy only when nothing can still pay out: no spin running, no free spins pending, no duel escrow, no ticket claim. */
  const bustOpen = useCallback(() => {
    if (busyRef.current || inFsRef.current || fsSessionRef.current.left > 0) return false;
    if (duelRef.current || duelLinkRef.current || jpShowRef.current || ticketLockRef.current) return false;
    return balanceRef.current < BETS[0];
  }, []);

  const askBust = useCallback(() => {
    if (chaseCardRef.current) {
      chaseCardRef.current = null;
      setChaseCard(null);
    }
    if (!bustOpen()) return;
    setBustAsk(true);
    sfx.playClick();
  }, [bustOpen]);

  const cancelBust = useCallback(() => {
    setBustAsk(false);
    sfx.playClick();
  }, []);

  const confirmBust = useCallback(() => {
    if (!bustOpen()) {
      setBustAsk(false);
      return;
    }
    setBustAsk(false);
    autoHoldRef.current = false;
    autoHoldLeftRef.current = 0;
    autoRef.current = false;
    autoLeftRef.current = 0;
    setAutoOn(false);
    setAutoLeft(0);
    if (chaseRef.current) {
      // A chase holds no money. It is voided with the rank, no RP or klienti for it.
      chaseRef.current = null;
      setChase(null);
      setHackWindows([]);
      setActiveWindow(-1);
      sfx.stopHeartbeat();
      sfx.stopChaseBed();
    }
    chaseCardRef.current = null;
    setChaseCard(null);
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
    fsSessionRef.current = { ...fsSessionRef.current, modMul: 1, taxDelta: 0 };
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
    noteStat({ t: "bust", rpLost: before.rp });
    sfx.playThunder();
  }, [bustOpen, noteStat]);

  useEffect(() => {
    if (!exekucia) return;
    const t = window.setTimeout(() => setExekucia(null), 3400);
    return () => window.clearTimeout(t);
  }, [exekucia]);

  /**
   * src "spin": positive deltas are scaled by the ticket rule (rp-tickets.ts spinGainMult).
   * "ticket" / "sucho" / "daily" go in as they are. SUCHO shows no flash unless the division changes.
   */
  const pushRank = useCallback((rawDelta: number, rawParts?: RankBreakdown | null, src: "spin" | "ticket" | "sucho" | "daily" = "spin") => {
    let delta = rawDelta;
    let parts = rawParts ?? null;
    if (src === "spin" && rawDelta > 0) {
      const active = Boolean(jobRef.current) && !ticketPauseRef.current;
      delta = scaleSpinGain(rawDelta, standing(rankRef.current.rp).id, active);
      parts = scaledParts(rawParts, rawDelta, delta);
    }
    if (!delta) return;
    const res = applyRankDelta(rankRef.current, delta);
    rankRef.current = res.save;
    setRp(res.save.rp);
    setRankPeak(res.save.peak);
    setRankShield(res.save.shield);
    setRankDelta(res.applied);
    setRankTick((n) => n + 1);
    setRankParts(parts ?? null);
    let dripAmt = 0;
    if (res.event === "up") {
      const perk = perkOf(res.after.id);
      if (perk.dripX > 0) {
        const drip = +(BETS[betIndexRef.current] * perk.dripX).toFixed(2);
        if (drip > 0 && !busyRef.current) {
          dripAmt = drip;
          setBalance((b) => +(b + drip).toFixed(2));
          setSpinTape((t) => [{ label: "RANK DROP", amount: formatMoney(drip) }, ...t].slice(0, 8));
        }
      }
    }
    noteStat({
      t: "rank",
      applied: res.applied,
      event: res.event,
      after: res.after.id,
      parts: parts ?? null,
      drip: dripAmt || undefined,
      src: src === "spin" ? undefined : src,
    });
    if (src === "sucho" && res.event !== "up" && res.event !== "down") return;
    const event = src === "daily" ? "day" : (res.event ?? (res.applied > 0 ? "gain" : res.applied < 0 ? "loss" : null));
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
  }, [noteStat]);

  /** New local day: the closed day costs 1 % above 2 700 RP if it was played without a cleared ticket. */
  const rollRpDayNow = useCallback(() => {
    const r = rollRpDay(rankRef.current.rp, rpDayRef.current, deskToday());
    if (!r.rolled) return;
    rpDayRef.current = r.rec;
    if (r.loss < 0) {
      pushRank(r.loss, rpParts(r.loss, "fromDaily"), "daily");
      setRpNotice({ text: `DENNÝ POKLES · bez tiketu · −${Math.abs(r.loss)} RP`, id: Date.now() });
    }
  }, [pushRank]);

  /** Paid spin (base, ZÁSAH or buy): marks the day played and runs the SUCHO counter. */
  const noteRpSpin = useCallback((chasing: boolean) => {
    rollRpDayNow();
    if (!rpDayRef.current.played) rpDayRef.current = { ...rpDayRef.current, played: true };
    // Duel rounds, ZÁSAH spins and an active (not paused) ticket do not move SUCHO.
    if (chasing || duelRef.current || duelLinkRef.current || roundEscrowRef.current) return;
    if (jobRef.current && !ticketPauseRef.current) return;
    const rankId = standing(rankRef.current.rp).id;
    const st = suchoStep(rpIdleRef.current, rankRef.current.rp, rankId);
    rpIdleRef.current = st.idle;
    setRpIdle(st.idle);
    if (st.tax) pushRank(st.tax, rpParts(st.tax, "fromSucho"), "sucho");
    if (st.warn === "soon") setJobToast("SUCHO o 10 spinov · zober tiket");
    else if (st.warn === "last") setJobToast("SUCHO od ďalšieho spinu · −1 RP/spin");
    else if (st.warn === "start") setJobToast("SUCHO · −1 RP za spin bez tiketu");
  }, [pushRank, rollRpDayNow]);
  useEffect(() => {
    if (!rpNotice || !started) return;
    const t = window.setTimeout(() => setRpNotice(null), 4200);
    return () => window.clearTimeout(t);
  }, [rpNotice, started]);

  const noteRpSpinRef = useRef(noteRpSpin);
  noteRpSpinRef.current = noteRpSpin;
  rollRpDayRef.current = rollRpDayNow;

  const noteResult = useCallback((paid: boolean) => {
    const perk = perkOf(standing(rankRef.current.rp).id);
    if (paid) {
      streakRef.current += 1;
      holdUsedRef.current = false;
    } else if (perk.streakHold && streakRef.current >= 2 && !holdUsedRef.current) {
      holdUsedRef.current = true;
      // hold counted on dead spin via spin.holdKeep when wired; streak hold itself is a save perk use
      statsRef.current = applyStat(statsRef.current, {
        t: "spin",
        cost: 0,
        bet: BETS[betIndexRef.current] || 0,
        ante: false,
        chase: false,
        buy: false,
        free: false,
        cash: 0,
        cash0: 0,
        x: 0,
        tumbles: 0,
        clusters: 0,
        orbs: [],
        orbSum: 0,
        applied: 0,
        pays: [],
        scatters: 0,
        nearMiss: false,
        taxDelta: 0,
        hitMax: false,
        turbo: false,
        quick: false,
        auto: false,
        holdKeep: true,
      });
      statsDirtyRef.current = true;
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
      // park_jackpot_spin hands out (and deletes) this player's share of someone else's 4-FTTB hit.
      // Pay it once, here; the board snapshot must not carry it into a later payPoolHit.
      const credit = res.credit > 0 ? +res.credit.toFixed(2) : 0;
      if (credit > 0) {
        boardRef.current = { ...boardRef.current, credit: 0 };
        setBalance((b) => +(b + credit).toFixed(2));
        bumpToday(0, credit, "LÍSTOK podiel", BETS[betIndexRef.current] ?? 0, null);
        setSpinTape((t) => [{ label: "PODIEL", amount: formatMoney(credit) }, ...t].slice(0, 8));
      }
      return { ...res, credit: 0 };
    } catch {
      return { ...boardRef.current, ticket: null, force: false };
    }
  }, [applyBoard, bumpToday]);

  const killAuto = useCallback((reason: string | null) => {
    autoHoldRef.current = false;
    autoHoldLeftRef.current = 0;
    autoRef.current = false;
    autoLeftRef.current = 0;
    setAutoOn(false);
    setAutoLeft(0);
    setAutoReason(reason);
  }, []);

  /** Win / jackpot screen. Does not clear the queue. ZÁSAH and a duel are not paused, they stay manual. */
  const pauseAutoForCeremony = useCallback(() => {
    if (chaseRef.current || duelRef.current) return;
    if (!autoRef.current) return;
    autoHoldRef.current = true;
    autoHoldLeftRef.current = Math.max(0, autoLeftRef.current);
  }, []);

  /** VIDENÉ. Puts the remaining spins back and lets the queue continue. */
  const resumeAutoAfterCeremony = useCallback(() => {
    if (!autoHoldRef.current) return;
    const left = Math.max(autoLeftRef.current, autoHoldLeftRef.current);
    autoHoldRef.current = false;
    autoHoldLeftRef.current = 0;
    if (chaseRef.current || left <= 0) return;
    autoLeftRef.current = left;
    autoRef.current = true;
    setAutoLeft(left);
    setAutoOn(true);
    setAutoReason(null);
  }, []);

  const closeBanner = useCallback(() => {
    if (!bannerOpen.current && !bannerWait.current) return;
    bannerOpen.current = false;
    ceremonyUntil.current = Date.now() + 1200;
    setBanner(null);
    const done = bannerWait.current;
    bannerWait.current = null;
    noteStat({ t: "ui", what: "skipBanner" });
    sfx.playClick();
    resumeAutoAfterCeremony();
    done?.();
  }, [noteStat, resumeAutoAfterCeremony]);

  /** Jackpot ceremony: the player taps VIDENÉ. Auto is only paused, the remaining spins stay. */
  const dismissJp = useCallback(() => {
    const done = jpWait.current;
    if (!done) return;
    jpWait.current = null;
    ceremonyUntil.current = Date.now() + 1200;
    sfx.playClick();
    resumeAutoAfterCeremony();
    done();
  }, [resumeAutoAfterCeremony]);

  const armChase = useCallback((stake: number): boolean => {
    if (chaseRef.current || heatRef.current < HEAT_MAX) return false;
    if (duelRef.current || duelLinkRef.current || inFsRef.current) return false;
    if (balanceRef.current < stake * ZASAH.COST_X) {
      setMessage("ZÁSAH ČAKÁ · málo kreditu");
      return false;
    }
    heatRef.current = 0;
    setHeat(0);
    const next: ChaseState = { spin: 0, target: null, hits: 0, strikes: 0, fsSym: rollFsSymbol(Math.random) };
    chaseRef.current = next;
    setChase(next);
    setHackWindows([]);
    killAuto("AUTO STOP · ZÁSAH");
    setTopLine("ZÁSAH · 10 SPINOV");
    setMessage("ZÁSAH");
    chaseArmedAtRef.current = Date.now();
    noteStat({ t: "chaseStart", fsSym: next.fsSym ?? "rj45" });
    noteStat({ t: "ui", what: "autoStop", why: "zasah" });
    sfx.playSiren();
    return true;
  }, [noteStat, killAuto]);

  const closeFsReveal = useCallback(() => {
    const done = fsRevealWait.current;
    fsRevealWait.current = null;
    setFsReveal(null);
    done?.();
  }, []);

  /** Holds the first chase spin while the notice plays. Tap / Space closes it early. */
  const showFsReveal = useCallback((sym: FsSymId, hold: number) => {
    return new Promise<void>((resolve) => {
      fsRevealWait.current?.();
      fsRevealWait.current = resolve;
      setFsReveal({ sym, key: Date.now() });
      window.setTimeout(() => {
        if (fsRevealWait.current !== resolve) return;
        fsRevealWait.current = null;
        setFsReveal(null);
        resolve();
      }, hold);
    });
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
    const lived = chaseRef.current;
    const spinsDone = lived ? lived.spin + 1 : 10;
    const strikesDone = lived?.strikes ?? 0;
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
    // Card shows what the rank gets: gains are scaled by the ticket rule like any spin RP.
    const shownRp = rp > 0 ? scaleSpinGain(rp, standing(rankRef.current.rp).id, Boolean(jobRef.current) && !ticketPauseRef.current) : rp;
    pushRank(rp);
    const card = { outcome, line, rp: shownRp };
    chaseCardRef.current = card;
    setChaseCard(card);
    setTopLine(line);
    setMessage(line);
    noteStat({
      t: "chaseEnd",
      outcome,
      spins: spinsDone,
      strikes: strikesDone,
      ms: Math.max(0, Date.now() - (chaseArmedAtRef.current || Date.now())),
    });
    if (outcome === "escape" || outcome === "neutral") {
      noteStat({ t: "klienti", n: Math.max(1, Math.round(betNow * (outcome === "escape" ? 4 : 1))) });
    }
    persistNow();
  }, [persistNow, pushRank, noteStat]);

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
      pauseAutoForCeremony();
      setJpHit(shown);
      setDisplayWin((w) => +(w + payout).toFixed(2));
      setSpinWin((w) => +(w + payout).toFixed(2));
      setBalance((b) => +(b + payout).toFixed(2));
      setBestWin((w) => Math.max(w, payout));
      bumpToday(0, payout, how, BETS[betIndexRef.current] ?? 0, recipe);
      noteHeat(payout, BETS[betIndexRef.current] ?? 0);
      for (const h of jackpots) {
        noteStat({ t: "jackpot", tier: h.id, payout: h.payout, poolBefore: h.poolBefore || poolBefore, credit: 0 });
      }
      if (credit > 0) noteStat({ t: "jackpot", tier: main.id, payout: credit, poolBefore, credit });
      setSpinTape((t) => [{ label: shown.name, amount: formatMoney(payout) }, ...t].slice(0, 8));
      setPhase("max");
      setTopLine(
        `${shown.name} ${formatMoney(poolBefore)} · ${Math.round(share * 100)} % = ${formatMoney(shown.payout)}`,
      );
      sfx.playMaxWin();
      const duelJp = Boolean(duelRef.current);
      try {
        await new Promise<void>((resolve) => {
          jpWait.current = resolve;
          // A duel must not wait on a tap. Outside a duel the player dismisses VIDENÉ and auto continues.
          if (duelJp) {
            window.setTimeout(() => {
              if (jpWait.current !== resolve) return;
              jpWait.current = null;
              resolve();
            }, 2400);
          }
        });
      } finally {
        jpWait.current = null;
        setJpHit(null);
        jpShowRef.current = false;
        setPots(board.pots);
      }
    },
    [bumpToday, noteHeat, noteStat, pauseAutoForCeremony],
  );

  const runTicket = useCallback(
    async (tier: TierId) => {
      ticketLockRef.current = true;
      setTicketLock(true);
      try {
        setPhase("max");
        sfx.playCollect();
        await wait(400);
        const claimed = await withRetry(() => postParkClaim(tier, playerIdRef.current));
        applyBoard(claimed);
        await payPoolHit(claimed, `LÍSTOK ${TICKETS[tier].name}`, { v: 1, mode: "ticket", pays: [], ticket: tier });
      } catch {
        /* keep lock off */
      } finally {
        ticketLockRef.current = false;
        setTicketLock(false);
      }
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
    const cur = jobRef.current;
    if (!cur) return;
    // Paused ticket: nothing from a duel (its lobby, its rounds, a round that started in it) counts,
    // so no progress, no spin off the clock, no payout and no fail.
    const gate = {
      duel: Boolean(duelRef.current),
      lobby: Boolean(duelLinkRef.current),
      roundInDuel: roundEscrowRef.current,
      paused: Boolean(ticketPauseRef.current),
    };
    if (!ticketCounts(gate)) return;
    const next = tickUnlessPaused(cur, ev, gate);
    const st = jobStatus(next);
    if (st === "ok") {
      jobRef.current = null;
      setJob(null);
      setBalance((b) => +(b + next.payout).toFixed(2));
      noteHeat(next.payout, next.stake || BETS[betIndexRef.current] || 0);
      const profit = ticketProfit(next.payout, next.stake);
      noteTicket(profit.won, profit.lost);
      const tr = ticketRp(next, standing(rankRef.current.rp).id);
      rollRpDayNow();
      rpDayRef.current = { ...rpDayRef.current, ok: true };
      rpIdleRef.current = 0;
      setRpIdle(0);
      if (tr.ok) pushRank(tr.ok, rpParts(tr.ok, "fromTicket"), "ticket");
      setSpinTape((t) => [{ label: "TIKET", amount: `+${formatMoney(next.payout)} · +${tr.ok} RP` }, ...t].slice(0, 8));
      setLcdFlash({ job: next, verdict: "ok" });
      setTicketSeal({ job: next, verdict: "ok" });
      setTicketFx({ id: Date.now(), kind: "payout", job: next });
      stampDailyJob(next, "ok");
      noteStat({
        t: "job",
        phase: "ok",
        card: {
          floor: next.floor,
          kind: next.kind,
          stake: next.stake,
          payout: next.payout,
          spun: next.spun,
          limit: next.limit,
          mystery: next.mystery,
          kindB: next.kindB,
          tries: next.tries,
          triesUsed: next.triesUsed,
        },
      });
      sfx.playTicketOk();
    } else if (st === "fail") {
      jobRef.current = null;
      setJob(null);
      noteTicket(0, next.stake);
      const tr = ticketRp(next, standing(rankRef.current.rp).id);
      if (tr.fail) pushRank(tr.fail, rpParts(tr.fail, "fromTicket"), "ticket");
      setSpinTape((t) => [{ label: "TIKET", amount: `−${formatMoney(next.stake)} · −${Math.abs(tr.fail)} RP` }, ...t].slice(0, 8));
      killAuto(null);
      setLcdFlash({ job: next, verdict: "fail" });
      setTicketSeal({ job: next, verdict: "fail" });
      stampDailyJob(next, "fail");
      noteStat({
        t: "job",
        phase: "fail",
        card: {
          floor: next.floor,
          kind: next.kind,
          stake: next.stake,
          payout: next.payout,
          spun: next.spun,
          limit: next.limit,
          mystery: next.mystery,
          kindB: next.kindB,
          tries: next.tries,
          triesUsed: next.triesUsed,
        },
        reason: "clock",
      });
      sfx.playThunder();
    } else {
      jobRef.current = next;
      setJob(next);
    }
  }, [pushRank, rollRpDayNow, stampDailyJob, noteTicket, noteHeat, noteStat, killAuto]);

  const failParknetJob = useCallback((cur: JobCard, line = "NEÚSPEŠNÝ TIKET · MÁLO KREDITU NA 4KA TV") => {
    const burned = { ...cur, seal: false, spun: cur.limit };
    jobRef.current = null;
    setJob(null);
    noteTicket(0, burned.stake);
    const tr = ticketRp(burned, standing(rankRef.current.rp).id);
    if (tr.fail) pushRank(tr.fail, rpParts(tr.fail, "fromTicket"), "ticket");
    setSpinTape((t) => [{ label: "TIKET", amount: `−${formatMoney(burned.stake)} · −${Math.abs(tr.fail)} RP` }, ...t].slice(0, 8));
    killAuto(null);
    setLcdFlash({ job: burned, verdict: "fail" });
    setTicketSeal({ job: burned, verdict: "fail" });
    stampDailyJob(burned, "fail");
    setTopLine(line);
    noteStat({
      t: "job",
      phase: "fail",
      card: {
        floor: burned.floor,
        kind: burned.kind,
        stake: burned.stake,
        payout: burned.payout,
        spun: burned.spun,
        limit: burned.limit,
        mystery: burned.mystery,
        kindB: burned.kindB,
        tries: burned.tries,
        triesUsed: burned.triesUsed,
      },
      reason: "parknet",
    });
    sfx.playThunder();
  }, [pushRank, stampDailyJob, noteTicket, noteStat, killAuto]);

  /** ZÁSAH that can no longer be paid ends quietly: no outcome, no RP, no klienti. */
  const voidChase = useCallback(() => {
    if (!chaseRef.current) return;
    chaseRef.current = null;
    setChase(null);
    setHackWindows([]);
    setActiveWindow(-1);
    sfx.stopHeartbeat();
    sfx.stopChaseBed();
    setTopLine("ZÁSAH UKONČENÝ · MÁLO KREDITU");
    setMessage("ZÁSAH ukončený bez trestu");
    setJobToast("ZÁSAH UKONČENÝ · MÁLO KREDITU");
    noteStat({ t: "chaseEnd", outcome: "void", spins: 0, strikes: 0, ms: Math.max(0, Date.now() - (chaseArmedAtRef.current || Date.now())) });
    persistNow();
  }, [persistNow, noteStat]);

  /**
   * Way out between spins. Never touches pays or odds: it only turns ante off, lowers the bet to what the
   * wallet covers, ends a ticket whose locked bet is unaffordable, and voids a ZÁSAH nobody can pay.
   * Free spins, a duel (VZDAŤ + blank timer) and a running spin are left alone.
   */
  useEffect(() => {
    if (!hydrated || !started || busy || inFs || fsSessionRef.current.left > 0) return;
    // A paused ticket is never failed by the money guard: it waits for the resume (locked bet back) first.
    if (duel || duelLink || ticketPause) return;
    const rankId = standing(rankRef.current.rp).id;
    const perkNow = perkOf(rankId);
    const anteOf = (b: number) => +(b * perkNow.anteMul).toFixed(2);
    const wallet = +balance.toFixed(2);
    const betNow = BETS[betIndex];
    const anteOff = (why: string) => {
      anteRef.current = false;
      setAnte(false);
      setJobToast(why);
    };
    const haltAuto = () => {
      if (!autoRef.current && !autoOn && autoLeftRef.current <= 0) return;
      killAuto("AUTO STOP · MÁLO KREDITU");
    };
    const cur = jobRef.current;
    if (cur && !cur.seal) {
      // The ticket keeps its locked bet. Ante can go, the bet cannot.
      if (ante && wallet < anteOf(betNow) && wallet >= betNow) {
        haltAuto();
        anteOff("ANTE VYPNUTÉ · MÁLO KREDITU");
        return;
      }
      const buyCost = +(betNow * buyXOf(rankId)).toFixed(2);
      if (jobParknetBroke(cur, wallet, betNow, buyCost)) {
        haltAuto();
        failParknetJob(cur);
      } else if (wallet < betNow) {
        haltAuto();
        failParknetJob(cur, "NEÚSPEŠNÝ TIKET · MÁLO KREDITU NA ZAMKNUTÚ STÁVKU");
      }
      return;
    }
    const stakeNow = ante ? anteOf(betNow) : betNow;
    if (wallet >= stakeNow) return;
    haltAuto();
    if (ante) {
      anteOff("ANTE VYPNUTÉ · MÁLO KREDITU");
      if (wallet >= betNow) return;
    }
    let idx = -1;
    for (let i = Math.min(betIndex, BETS.length - 1); i >= 0; i -= 1) {
      if (BETS[i] <= wallet) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) {
      betIndexRef.current = idx;
      setBetIndex(idx);
      setJobToast(`STÁVKA ZNÍŽENÁ · ${formatMoney(BETS[idx])}`);
      return;
    }
    // Not even the smallest bet: a chase cannot go on, EXEKÚCIA opens.
    if (chaseRef.current) voidChase();
  }, [hydrated, started, busy, inFs, duel, duelLink, ticketPause, balance, betIndex, ante, job, rp, chase, autoOn, failParknetJob, voidChase, killAuto]);

  /**
   * Duel over (any end: result closed, VZDAŤ, lobby left, room failure, or a reload during the duel):
   * the home slot goes back to the ticket's locked bet + ante and the ticket goes on where it stopped.
   */
  useEffect(() => {
    if (!hydrated || !started || busy || inFs || fsSessionRef.current.left > 0) return;
    if (duel || duelLink || !ticketPause) return;
    const plan = resumePlan(ticketPauseRef.current, jobRef.current);
    setTicketPause(null);
    if (!plan || "clear" in plan) return;
    betIndexRef.current = plan.betIndex;
    setBetIndex(plan.betIndex);
    anteRef.current = plan.ante;
    setAnte(plan.ante);
    setJobToast(plan.toast);
  }, [hydrated, started, busy, inFs, duel, duelLink, ticketPause, setTicketPause]);

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
    const pickMod = pickModRef.current;
    pickModRef.current = null;
    const cash0 = +(pickTotalXRef.current * betNow).toFixed(2);
    const escrow = roundEscrowRef.current;
    const { net: cash, delta: pickDelta } = applyMod(cash0, pickMod, escrow ? "duel" : "pick");
    if (cash > 0) {
      if (Math.abs(pickDelta) >= 0.01) {
        // Gross first, then the modifier chip, then the meter glides to what is credited.
        setDisplayWin(cash0);
        setSpinWin(cash0);
        await wait(520);
        setTaxKey((k) => k + 1);
        setTaxFly({ kind: pickDelta < 0 ? "danUrad" : "bezDane", gross: cash0, net: cash, delta: pickDelta });
        sfx.playMult();
        await wait(260);
      }
      if (!escrow) setBalance((b) => +(b + cash).toFixed(2));
      // Board / desk: KONTROLA is real credit, count it as paid (no stake of its own).
      if (!escrow) bumpToday(0, cash, "KONTROLA", betNow, null);
      if (!escrow) noteHeat(cash, betNow);
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
      if (!escrow) pushRank(parts.total, parts);
    } else {
      noteResult(false);
      const dead = rpFromDead(betNow, standing(rankRef.current.rp).entry);
      if (dead.total && !escrow) pushRank(dead.total, dead);
    }
    pickOpenRef.current = false;
    setPickOpen(false);
    setPhase("idle");
    setTopLine("SYMBOLY PLATIA KDEKOĽVEK NA OBRAZOVKE");
    setMessage(
      pickClearRef.current ? `Zaplatil si všetko parkovné · ${formatMoney(cash)}` : cash > 0 ? `KONTROLA ${formatMoney(cash)}` : "Odťah bez pokuty",
    );
    const safes = pickTilesRef.current.filter((tile, i) => pickRevealedRef.current[i] && tile.kind !== "odtah").length;
    const fines = pickTilesRef.current.filter((tile, i) => pickRevealedRef.current[i] && tile.kind === "pokuta").length;
    noteStat({
      t: "pick",
      cash,
      safes,
      clear: pickClearRef.current,
      fines,
      odtah: cash <= 0 && !pickClearRef.current,
    });
    // Feature tickets (KONTROLA / bonus bar): one event per finished bar bonus; it spends no spin.
    settleJob({
      win: cash > 0,
      dead: false,
      tumbles: 0,
      live: false,
      ticket: null,
      pdf: false,
      signal: 0,
      clusters: 0,
      orbs: false,
      spun: false,
      bonus: { mode: "kontrola", x: pickTotalXRef.current, safes, cleared: pickClearRef.current, canSum: 0, rounds: 0 },
    });
  }, [waitForPick, pushRank, noteResult, noteHeat, noteStat, settleJob, bumpToday]);

  /** Mode strip done (auto after ~2 s, or tapped). */
  const finishModeStrip = useCallback(() => {
    const done = stripWait.current;
    stripWait.current = null;
    done?.();
  }, []);

  /** Ž-BOX payout seen, tap to return. */
  const finishZbox = useCallback(() => {
    const done = zboxWait.current;
    zboxWait.current = null;
    sfx.playClick();
    done?.();
  }, []);

  /**
   * Ž-BOX: decided up front by playZbox(createRng(seed)) — the seed is the one saved with the pending bar, so
   * a reload mid-run replays the very same run (no reroll). Pays like KONTROLA: applyMod(…, "pick"), HLÁSENIE,
   * RP kind "pick", stats (zbox.*), spin tape.
   */
  const runZbox = useCallback(
    async (pend: PendingBonus, seed: number) => {
      const betNow = pend.bet > 0 ? pend.bet : BETS[betIndexRef.current];
      const rankId = standing(rankRef.current.rp).id;
      const play = playZbox(createRng(seed), { vip: zboxVipOf(rankId) });
      const pickMod = pickModRef.current;
      pickModRef.current = null;
      const cash0 = +(play.totalX * betNow).toFixed(2);
      const { net: cash } = applyMod(cash0, pickMod, "pick");
      const taxKind = Math.abs(cash - cash0) >= 0.01 ? (pickMod?.kind ?? null) : null;
      setPhase("pick");
      setTopLine("Ž-BOX · PAKEŤÁK");
      setMessage("Hľadáme vašu zásielku…");
      sfx.playZboxBeep();
      sfx.duckMusic(0.4);
      setZbox({ play, bet: betNow, gross: cash0, net: cash, tax: taxKind, key: Date.now() });
      noteStat({ t: "zboxStart" });
      await new Promise<void>((resolve) => {
        zboxWait.current = resolve;
      });
      bonusPendingRef.current = null;
      if (cash > 0) {
        setBalance((b) => +(b + cash).toFixed(2));
        // Board / desk: Ž-BOX is real credit like KONTROLA; counted once here (the spin that filled the bar counted only its own win).
        bumpToday(0, cash, "Ž-BOX", betNow, null);
        noteHeat(cash, betNow);
        setDisplayWin(cash);
        setSpinWin(cash);
        setBestWin((w) => Math.max(w, cash));
        setSpinTape((t) => [{ label: "Ž-BOX", amount: formatMoney(cash) }, ...t].slice(0, 8));
        roundCashRef.current = +(roundCashRef.current + cash).toFixed(2);
        sfx.playPayout();
        const streak = noteResult(true);
        const found = play.rounds.reduce((n, r) => n + r.parcels.length, 0);
        const parts = rpFromSpin({
          cash,
          bet: betNow,
          mult: 1,
          tumbles: 0,
          streak,
          banner: bannerFromX(cash / betNow),
          kind: "pick",
          picks: found,
          rankId: standing(rankRef.current.rp).id,
        });
        pushRank(parts.total, parts);
      }
      persistNow();
      setZbox(null);
      sfx.duckMusic(1);
      setPhase("idle");
      setTopLine("SYMBOLY PLATIA KDEKOĽVEK NA OBRAZOVKE");
      setMessage(play.full ? `VŠETKO DORUČENÉ · ${formatMoney(cash)}` : `Ž-BOX ${formatMoney(cash)}`);
      const parcels = play.start.length + play.rounds.reduce((n, r) => n + r.parcels.length, 0);
      noteStat({
        t: "zbox",
        cash,
        parcels,
        found: play.rounds.reduce((n, r) => n + r.parcels.length, 0),
        full: play.full,
        cans: play.canSum,
        rounds: play.rounds.length,
        capped: play.capped,
      });
      // Feature tickets (Ž-BOX / bonus bar): one event per finished bar bonus; it spends no spin.
      settleJob({
        win: cash > 0,
        dead: false,
        tumbles: 0,
        live: false,
        ticket: null,
        pdf: false,
        signal: 0,
        clusters: 0,
        orbs: false,
        spun: false,
        bonus: { mode: "zbox", x: play.totalX, safes: parcels, cleared: play.full, canSum: play.canSum, rounds: play.rounds.length },
      });
    },
    [pushRank, noteResult, noteHeat, noteStat, persistNow, settleJob, bumpToday],
  );

  /** KOLESO payout seen, tap to return. */
  const finishKoleso = useCallback(() => {
    const done = kolesoWait.current;
    kolesoWait.current = null;
    sfx.playClick();
    done?.();
  }, []);

  /**
   * KOLESO NEŠŤASTIA: decided up front by playKoleso(createRng(seed)) with the seed saved with the pending bar, so a
   * reload mid-run replays the same run. Pays like KONTROLA / Ž-BOX: applyMod(…, "pick"), board (bumpToday),
   * HLÁSENIE, RP kind "pick", stats (koleso.*), spin tape, feature tickets.
   */
  const runKoleso = useCallback(
    async (pend: PendingBonus, seed: number) => {
      const betNow = pend.bet > 0 ? pend.bet : BETS[betIndexRef.current];
      const rankId = standing(rankRef.current.rp).id;
      const play = playKoleso(createRng(seed), { vip: kolesoVipOf(rankId) });
      const pickMod = pickModRef.current;
      pickModRef.current = null;
      const cash0 = +(play.totalX * betNow).toFixed(2);
      const { net: cash } = applyMod(cash0, pickMod, "pick");
      const taxKind = Math.abs(cash - cash0) >= 0.01 ? (pickMod?.kind ?? null) : null;
      setPhase("pick");
      setTopLine("KOLESO NEŠŤASTIA");
      setMessage("Točíme!");
      sfx.duckMusic(0.35);
      setKoleso({ play, bet: betNow, gross: cash0, net: cash, tax: taxKind, key: Date.now() });
      noteStat({ t: "kolesoStart" });
      await new Promise<void>((resolve) => {
        kolesoWait.current = resolve;
      });
      bonusPendingRef.current = null;
      if (cash > 0) {
        setBalance((b) => +(b + cash).toFixed(2));
        // Board / desk: KOLESO is real credit like KONTROLA / Ž-BOX; counted once here.
        bumpToday(0, cash, "KOLESO", betNow, null);
        noteHeat(cash, betNow);
        setDisplayWin(cash);
        setSpinWin(cash);
        setBestWin((w) => Math.max(w, cash));
        setSpinTape((t) => [{ label: "KOLESO", amount: formatMoney(cash) }, ...t].slice(0, 8));
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
          picks: play.steps.filter((st) => st.hits > 0).length,
          rankId: standing(rankRef.current.rp).id,
        });
        pushRank(parts.total, parts);
      } else {
        noteResult(false);
      }
      persistNow();
      setKoleso(null);
      sfx.duckMusic(1);
      setPhase("idle");
      setTopLine("SYMBOLY PLATIA KDEKOĽVEK NA OBRAZOVKE");
      setMessage(play.solved ? `TAJNIČKA VYLÚŠTENÁ · ${formatMoney(cash)}` : `KOLESO ${formatMoney(cash)}`);
      const letters = play.steps.reduce((n, st) => n + st.hits, 0);
      noteStat({
        t: "koleso",
        cash,
        solved: play.solved,
        spins: play.steps.length,
        letters,
        bankrot: play.steps.filter((st) => st.kind === "bankrot").length,
        capped: play.capped,
      });
      // Feature tickets (bonus bar): one event per finished bar bonus; it spends no spin.
      settleJob({
        win: cash > 0,
        dead: false,
        tumbles: 0,
        live: false,
        ticket: null,
        pdf: false,
        signal: 0,
        clusters: 0,
        orbs: false,
        spun: false,
        bonus: { mode: "koleso", x: play.totalX, safes: letters, cleared: play.solved, canSum: 0, rounds: play.steps.length },
      });
    },
    [pushRank, noteResult, noteHeat, noteStat, persistNow, settleJob, bumpToday],
  );

  /**
   * The filled bar: show the drawn mode on the strip, then play it. KONTROLA clears the pending mode when it
   * starts (as before: a reload mid-KONTROLA would deal a new map, so it is spent). Ž-BOX and KOLESO keep it
   * until they pay, together with the seed, so a reload replays the same run.
   */
  const runBonus = useCallback(async () => {
    const pend = bonusPendingRef.current ?? {
      mode: "kontrola" as BonusModeId,
      bet: BETS[betIndexRef.current],
      mod: null,
      modLeft: 0,
      at: Date.now(),
    };
    if (!pickModRef.current && pend.mod && pend.modLeft > 0) pickModRef.current = { kind: pend.mod, left: pend.modLeft };
    sfx.stopSpin();
    setModeStrip({ mode: pend.mode, key: Date.now() });
    await new Promise<void>((resolve) => {
      stripWait.current = resolve;
    });
    setModeStrip(null);
    noteStat({ t: "barMode", mode: pend.mode });
    if (pend.mode === "zbox" || pend.mode === "koleso") {
      const seed = pend.seed ?? Math.floor(Math.random() * 0x100000000);
      bonusPendingRef.current = { ...pend, seed };
      persistNow();
      if (pend.mode === "koleso") await runKoleso(bonusPendingRef.current, seed);
      else await runZbox(bonusPendingRef.current, seed);
    } else {
      bonusPendingRef.current = null;
      persistNow();
      await runPick();
    }
  }, [runPick, runZbox, runKoleso, noteStat, persistNow]);

  const runSequence = useCallback(
    async (opts?: { buy?: boolean; free?: boolean }): Promise<"fs" | "ok" | "max" | "pick" | "skip"> => {
      const currentBet = BETS[betIndexRef.current];
      const perk = perkOf(standing(rankRef.current.rp).id);
      const currentStake = anteRef.current ? +(currentBet * perk.anteMul).toFixed(2) : currentBet;
      const isFree = !!opts?.free;
      const chasing =
        !isFree && !opts?.buy && !duelRef.current && (chaseRef.current != null || armChase(currentStake));
      if (!isFree) lastChasingRef.current = Boolean(chasing);
      let cost = opts?.buy ? +(currentBet * buyXOf(perk.id)).toFixed(2) : isFree ? 0 : currentStake;
      if (chasing) cost = +(currentStake * ZASAH.COST_X).toFixed(2);

      if (!isFree && balanceRef.current < cost) {
        skipDuelTick.current = true;
        setMessage("Nedostatok kreditu — doplň demo zostatok");
        noteStat({ t: "ui", what: "skipCredit" });
        return "skip";
      }
      skipDuelTick.current = false;
      if (chasing) sfx.startChaseBed();
      if (chasing && chaseRef.current && (!chaseRef.current.fsSym || (chaseRef.current.spin === 0 && !chaseRef.current.target))) {
        // FS takes its symbol once per chase. A save from before this rule draws one on the next spin.
        const live = chaseRef.current;
        const fsSym = live.fsSym ?? rollFsSymbol(Math.random);
        const drawn: ChaseState = { ...live, fsSym, target: live.target === fsSym ? null : live.target };
        chaseRef.current = drawn;
        setChase(drawn);
        sfx.playStrike();
        setTopLine(fsSym === "scatter" ? "FINANČNÁ SPRÁVA · BONUS ZABLOKOVANÝ" : `FINANČNÁ SPRÁVA SLEDUJE · ${fsSymName(fsSym)}`);
        await showFsReveal(fsSym, abort.current.skip ? 900 : dur(6800));
      }
      const scatterBlocked = chasing && chaseRef.current?.fsSym === "scatter";
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
        noteRpSpinRef.current(Boolean(chasing));
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
      reelSfxRef.current?.done();
      reelSfxRef.current = null;
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
      const STOPS = [520, 620, 730, 850, 990, 1180];
      // The shared jackpot RPC must not hold the reels: wait for it only until the first reel would stop anyway.
      // A ticket that arrives later is not lost; the server keeps it pending and returns it on the next spin.
      const pot = await settleWithin(poolP, Math.max(POOL_WAIT_MIN_MS, dur(STOPS[0]) - (performance.now() - spunAt)));
      const spunTicket = pot?.ticket ?? null;

      const rng = createRng();
      let next = opts?.buy
        ? generateBuyGrid(rng)
        : generateGrid(rng, opts?.free ? false : anteRef.current, !!opts?.free);
      if (spunTicket) next = plantTicket(next, spunTicket, rng);

      const already = performance.now() - spunAt;
      await wait(dur(Math.max(0, STOPS[0] - already)), abort.current);
      if (chasing && chaseRef.current && !chaseRef.current.target) {
        const aimed = { ...chaseRef.current, target: rollTarget(Math.random, chaseRef.current.fsSym) };
        chaseRef.current = aimed;
        setChase(aimed);
      }
      {
        // Scatter land sounds follow the reels as the grid shows them stopping (onReelSettled), not this loop.
        let done = () => {};
        const settled = new Promise<void>((resolve) => {
          done = resolve;
        });
        reelSfxRef.current = { id: ++reelSfxSeq.current, tracker: new ReelScatterTracker(next), settled, done };
      }
      setGrid(next);
      setPhase("landing");
      setStoppedCols(1);
      setMessage("");
      sfx.setSpinEnergy(5 / 6);
      sfx.playLand(0);

      let landedScatters = next.reduce((n, row) => n + (row[0].kind === "scatter" ? 1 : 0), 0);

      let pendingFs = false;
      let pendingPick = false;
      /** Sound slot of this spin's anticipation (one per spin, base only); null = no tease sound. */
      let antiPlayed: AntiCue | null = null;
      let pityAdd = 0;
      let tMark = STOPS[0];
      for (let c = 1; c < 6; c++) {
        const inBonus = isFree || inFsRef.current;
        if (landedScatters >= 2 && !scatterBlocked) {
          setAnticipate(true);
          setReelFast(true);
          if (!inBonus) {
            sfx.setSpinEnergy(0.08);
            if (!antiPlayed) {
              antiPlayed = antiCue(antiStreakRef.current);
              sfx.startAnticipate(antiPlayed);
            }
          }
        }
        const tease = scatterBlocked ? 0 : landedScatters >= 3 ? 900 : landedScatters >= 2 ? 720 : 0;
        await wait(dur(STOPS[c] - tMark) + tease, abort.current);
        tMark = STOPS[c];
        setStoppedCols(c + 1);
        sfx.setSpinEnergy(landedScatters >= 2 && !scatterBlocked && !(isFree || inFsRef.current) ? 0.08 : 1 - (c + 1) / 6);
        sfx.playLand(c);
        const colN = next.reduce((n, row) => n + (row[c].kind === "scatter" ? 1 : 0), 0);
        if (colN > 0) landedScatters += colN;
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
      // Every pay symbol on the reel stop: a NEVÝHERNÝ goal can be either OTRS goal (payId or payIdB).
      const shownBy = shownOnGrid(next);
      const wantId = jobRef.current?.payId;
      const shownCount = wantId ? (shownBy[wantId] ?? 0) : 0;
      const canSpin = ++canSpinSeq;
      const landDrop = zeusDropCount(rng, isFree || inFsRef.current, false);
      const inDuel = Boolean(duelRef.current && duelRef.current.phase !== "done");
      const bonusCan = !inDuel && perk.orbBonus > 0 && rng() < 0.2 ? perk.orbBonus : 0;
      const landN = landDrop > 0 ? landDrop + bonusCan : 0;
      if (landN > 0) {
        setPhase("mult");
        setThrowBolt(true);
        playCanCue("land");
        setTopLine("RAMPA PÚŠŤA NÁSOBIČE");
        const dropped = zeusDrop(board, rng, landN, isFree || inFsRef.current);
        board = dropped.grid;
        setGrid(cloneGrid(board));
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
      if (!fsNow && !scatterBlocked && scatterPeak >= FS_TRIGGER_SCATTERS) pendingFs = true;
      const DEAD = ["RAMPA STOJÍ", "VALCE SPALI", "NIČ. ZNOVA.", "POKUTA BEZ LÍSTKA", "ZÓNA TICHÁ"];

      for (;;) {
        setPhase("eval");
        const ev = scatterBlocked ? withoutScatterPay(evaluate(board)) : evaluate(board);
        scatterPeak = Math.max(scatterPeak, ev.scatterCount);
        const cl = ev.wins.filter((w) => w.payId !== "scatter").length;
        clusterCount += cl;
        for (const w of ev.wins) {
          if (w.payId !== "scatter") payHits.add(w.payId);
        }
        notePays(tally, ev.wins);
        if (ev.wins.some((w) => w.payId === "pdf" && w.count >= 8)) pdfHit = true;

        if (ev.scatterCount > landedScatters) {
          // Sound already played when the drop landed (cascadeCue below); here only the shake.
          landedScatters = ev.scatterCount;
          if (ev.scatterCount >= 3) {
            setShake(true);
            window.setTimeout(() => setShake(false), 320);
          }
        }

        if (!fsNow && !scatterBlocked && scatterPeak >= FS_TRIGGER_SCATTERS) {
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

        const sPay = scatterBlocked ? 0 : scatterPay(ev.scatterCount);
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
              chasing && w.payId === chaseRef.current?.fsSym
                ? FS_SYMBOL.src
                : w.payId === "scatter"
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
        const scattersBefore = countScatters(board);
        board = tumble(board, tumbleMask, rng, fillAnte, fsNow);
        const more = zeusDropCount(rng, isFree || inFsRef.current, true);
        const inDuel = Boolean(duelRef.current && duelRef.current.phase !== "done");
        const bonusCan = !inDuel && perk.orbBonus > 0 && rng() < 0.2 ? perk.orbBonus : 0;
        const moreN = more > 0 ? more + bonusCan : 0;
        if (moreN > 0) {
          setThrowBolt(true);
          playCanCue("tumble");
          const dropped = zeusDrop(board, rng, moreN, isFree || inFsRef.current);
          board = dropped.grid;
        }
        setPhase("tumble");
        sfx.playTumble(tumbleN);
        setGrid(cloneGrid(board));
        tumbleN += 1;
        await wait(280);
        // Refill drop (cell-drop, 280 ms) just landed: scatters that dropped in sound now.
        playLandCue(cascadeCue(scattersBefore, countScatters(board)));
        setThrowBolt(false);
        setGrid((g) =>
          g.map((row) => row.map((c) => (c.fall || c.gone ? { ...c, fall: 0, gone: false } : c))),
        );
        await wait(dur(80), abort.current);
      }

      if (!fsNow && !scatterBlocked && scatterPeak >= FS_TRIGGER_SCATTERS) pendingFs = true;
      if (pendingFs) triggerScatterRef.current = scatterPeak;
      // Third scatter: the board has settled (all reels stopped, no more tumbles) with exactly 3 scatters.
      // Waits for the last reel to stop on screen, so it never runs ahead of the 3rd scatter's land sound.
      if (thirdScatterCue(countScatters(board))) {
        const live = reelSfxRef.current;
        const id = live?.id;
        const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, SETTLE_TIMEOUT_MS));
        void Promise.race([live?.settled ?? Promise.resolve(), timeout]).then(() => {
          if (reelSfxRef.current?.id === id) sfx.playThirdScatter();
        });
      }
      // Anticipation 2/3 streak: every base spin that teased and gave no 4KA TV counts, any trigger resets.
      if (!fsNow) antiStreakRef.current = antiAfterSpin(antiStreakRef.current, { anticipated: antiPlayed != null, bonus: pendingFs });
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

      // KONTROLA is off in a duel (both modes): no pity gain, no trigger; the saved meter stays as it was.
      if (!fsNow && !roundEscrowRef.current) {
        const dead = sequenceX <= 0;
        const add = pityGain(scatterPeak, dead);
        if (add > 0) {
          const nextMap = bumpPity(pityByBetRef.current, currentBet, add);
          const stored = readPity(nextMap, currentBet);
          if (stored >= PITY_GOAL) {
            pityByBetRef.current = spendPity(nextMap, currentBet);
            kontrolaArmedRef.current = true;
            // KONTROLA pays with the tax period of the spin that earned it (that spin already counted it down).
            pickModRef.current = chasing ? null : modRef.current;
            pendingPick = true;
            // The mode (KONTROLA / Ž-BOX) is drawn now and saved, so a reload cannot redraw it (lib/slot/bonus-mode).
            const armMod = pickModRef.current && pickModRef.current.left > 0 ? pickModRef.current : null;
            bonusPendingRef.current = {
              mode: drawBonusMode(createRng()),
              bet: currentBet,
              mod: armMod?.kind ?? null,
              modLeft: armMod?.left ?? 0,
              at: Date.now(),
            };
            persistNow();
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
        playCanCue("activate");
        await wait(dur(200), abort.current);
        for (const orb of orbs) {
          setStrike({ r: orb.r, c: orb.c });
          setStruckUids((ids) => [...ids, orb.uid]);
          // Blesk do plechovky once for this spin, on the first bolt. Later cans stay silent.
          if (orb === orbs[0]) sfx.playCanLightning(canBoltKey(canSpin));
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
      // 4KA TV triggered in ZÁSAH: ×2 on every free-spin win, before the MAX WIN cap and before the tax period.
      const zasahFs = isFree && fsSessionRef.current.zasah && !roundEscrowRef.current;
      const capped = fsSpinX(paidX, zasahFs, MAX_WIN_X - featureXRef.current);
      paidX = capped.paidX;
      const hitMax = capped.hitMax;
      featureXRef.current += paidX;
      const cash0 = +(paidX * currentBet).toFixed(2);
      // Tax period (BEZ DANE +23 % / DAŇOVÝ ÚNIK −23 %): every paid, bought and free spin pays with it and
      // counts it down; ZÁSAH and duel spins do not. A bonus resumed from an old save (modMul ≠ 1) keeps the
      // old rule: its free spins neither pay with nor count the period, the end multiplier does.
      const legacyFs = isFree && fsSessionRef.current.modMul !== 1;
      const modScope: ModScope = roundModScope({ chasing, duel: roundEscrowRef.current, free: isFree, buy: Boolean(opts?.buy) });
      const { net: cash, delta: taxDelta } = legacyFs ? { net: cash0, delta: 0 } : applyMod(cash0, modRef.current, modScope);
      const mul = legacyFs ? 1 : stepMod(modRef.current, modScope).mul;
      if (isFree) lastTaxDeltaRef.current = taxDelta;
      setTaxFly(null);
      let chaseEnded = false;
      // Feature tickets read the running ZÁSAH: start, HACK count and win (× bet, ZÁSAH spins only).
      const chaseStartSpin = Boolean(chasing && chaseRef.current && chaseRef.current.spin === 0);
      if (chasing) chaseXRef.current = (chaseStartSpin ? 0 : chaseXRef.current) + paidX;
      let chaseHitsNow = 0;
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
            noteStat({ t: "chaseWindow", result: w.result, lock: Boolean(w.lock) });
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
          noteStat({ t: "chaseWindow", result: w.result, lock: Boolean(w.lock) });
          // Land holds long enough for the corner snap and the FS seal stamp.
          await wait(dur(260 * slow), abort.current);
          setWindowPhase("reveal");
          await wait(dur(200 * slow), abort.current);
          await wait(dur(160 * slow), abort.current);
        }
        setActiveWindow(-1);
        chaseHitsNow = rolled.next.hits;
        const played = live.spin + 1;
        if (rolled.outcome || played >= ZASAH.SPINS) {
          chaseEnded = true;
          endChase(rolled.outcome ?? "neutral", currentBet);
        } else {
          const nextChase: ChaseState = { ...rolled.next, spin: played, target: rollTarget(Math.random, rolled.next.fsSym) };
          chaseRef.current = nextChase;
          setChase(nextChase);
          persistNow();
        }
      }
      if (modRef.current && !legacyFs) {
        const nextMod = stepMod(modRef.current, modScope).next;
        if (nextMod !== modRef.current) {
          modRef.current = nextMod;
          setChaseMod(nextMod);
        }
      }
      if (cash > 0 && !chaseEnded && !roundEscrowRef.current) noteHeat(cash, currentBet, Boolean(isFree || opts?.buy || pendingFs || inFsRef.current));
      if (!isFree && cash0 > 0 && Math.abs(taxDelta) >= 0.01) {
        // Gross first, then the modifier chip, then the meter glides to the net amount.
        setSpinWin(cash0);
        setDisplayWin(cash0);
        await wait(dur(520), abort.current);
        setTaxKey((k) => k + 1);
        setTaxFly({ kind: taxDelta < 0 ? "danUrad" : "bezDane", gross: cash0, net: cash, delta: taxDelta });
        sfx.playMult();
        await wait(dur(260), abort.current);
      } else if (isFree && cash0 > 0 && Math.abs(taxDelta) >= 0.01) {
        // Inside 4KA TV: a quicker gross → chip → net step on the spin ticker (the bonus meter adds the net).
        setSpinWin(cash0);
        await wait(dur(240), abort.current);
        setTaxKey((k) => k + 1);
        setTaxFly({ kind: taxDelta < 0 ? "danUrad" : "bezDane", gross: cash0, net: cash, delta: taxDelta });
        sfx.playMult();
      }
      setSpinWin(cash);
      if (!isFree) setDisplayWin(cash);
      if (Math.abs(taxDelta) >= 0.01 && cash0 > 0) await wait(dur(isFree ? 480 : 900), abort.current);

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
      const escrow = roundEscrowRef.current;
      if (cash > 0 && !isFree && !inFsRef.current && !escrow) {
        // Sync the ref and save before any celebration wait: leaving mid-banner must not lose the win.
        balanceRef.current = +(balanceRef.current + cash).toFixed(2);
        setBalance(balanceRef.current);
        persistNow();
        sfx.playPayout();
      }
      const x = lastPaidXRef.current;
      let kind: WinBanner = null;
      if (hitMax) kind = "max";
      else if (x >= WIN_POP_X.massive) kind = "massive";
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
          // Held-back duel wins build no rank: the loser never gets them.
          if (!escrow) pushRank(parts.total, parts);
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
          if (dead.total && !escrow) pushRank(dead.total, dead);
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
        noteStat({ t: "jackpot", tier: landed.ticket, payout: 0, poolBefore: 0, credit: 0, stash: true });
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
          shownBy,
          cash,
          chasing: Boolean(chasing),
          chaseStart: chaseStartSpin,
          chaseHits: chasing ? chaseHitsNow : undefined,
          chaseX: chasing ? +chaseXRef.current.toFixed(2) : undefined,
          chaseOver: chaseEnded,
          pityAdd: pityAdd || undefined,
          bonusArmed: pendingPick,
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
        // A held-back duel win is not paid yet: count the stake now, the payout only when the duel settles.
        // A 4KA TV trigger spin's win is part of the bonus total (sess.triggerCash) that closeFs counts once at the end.
        const countNow = !(opts?.buy || escrow || pendingFs);
        bumpToday(cost, countNow ? cash : 0, countNow ? how : "", currentBet, countNow ? recipe : null);
      }

      {
        const payList = topPays(tally).map((pay) => ({ id: pay.id, count: pay.n }));
        const baseCash = +(sequenceX * currentBet).toFixed(2);
        const boosted = willThrow ? +(sequenceX * applied * currentBet).toFixed(2) : baseCash;
        noteStat({
          t: "spin",
          cost,
          bet: currentBet,
          anti: antiPlayed ? antiLevel(antiPlayed) : undefined,
          antiFs: antiPlayed ? pendingFs : undefined,
          ante: anteRef.current && !opts?.buy,
          chase: Boolean(chasing),
          buy: Boolean(opts?.buy),
          free: Boolean(isFree),
          cash: opts?.buy ? 0 : cash,
          cash0,
          x,
          tumbles: tumbleN,
          clusters: clusterCount,
          orbs: orbs.map((o) => o.mult),
          orbSum,
          applied,
          pays: payList.length ? payList : [...payHits].map((id) => ({ id, count: 8 })),
          scatters: scatterPeak,
          nearMiss: cash0 <= 0 && Boolean(evaluate(board).nearMiss),
          taxDelta,
          hitMax,
          turbo: turboRef.current,
          quick: quickRef.current,
          auto: Boolean(autoRef.current),
          pdfHit,
          willThrow,
          orbBoostExtra: willThrow ? Math.max(0, boosted - baseCash) : 0,
          ticketLand: Boolean(landed),
          chain: tumbleN >= 2,
          escrow,
          holdKeep: false,
          danUrad: modRef.current?.kind === "danUrad",
          bezDane: modRef.current?.kind === "bezDane",
          rankId: standing(rankRef.current.rp).id,
          recipe:
            cash > 0 && !opts?.buy
              ? {
                  v: 1 as const,
                  mode: chasing ? ("zasah" as const) : isFree ? ("fs" as const) : ("base" as const),
                  pays: topPays(tally),
                  cans: willThrow ? topCans(tally.cans) : undefined,
                  mult: willThrow && applied > 1 ? applied : undefined,
                  scatters: scatterPeak >= 3 ? scatterPeak : undefined,
                  tumbles: tumbleN > 0 ? tumbleN : undefined,
                  ante: anteRef.current || undefined,
                }
              : null,
        });
        noteStat({ t: "balance", value: balanceRef.current });
      }

      if (!jpShowRef.current) setPots(boardRef.current.pots);
      setPityByBet({ ...pityByBetRef.current });
      if (pityAdd > 0) {
        setPityDelta(pityAdd);
        window.setTimeout(() => setPityDelta(0), 900);
      }

      if (kind && !isFree && !inFsRef.current) {
        if (!escrow) postLiveHit(playerIdRef.current, x, cash);
        bannerOpen.current = true;
        setBanner(kind);
        setBannerAmount(cash);
        setBannerTax(!isFree && cash0 > 0 && Math.abs(taxDelta) >= 0.01 ? { kind: taxDelta < 0 ? "danUrad" : "bezDane", gross: cash0, net: cash, delta: taxDelta } : null);
        setBannerX(x);
        if (kind === "max") sfx.playMaxWin();
        else if (kind === "massive") sfx.playMassiveWin();
        else sfx.playBigWin();
        setPhase(kind === "max" ? "max" : "big");
        const halt =
          autoRef.current &&
          autoHaltRef.current &&
          (kind === "big" || kind === "mega" || kind === "epic" || kind === "massive" || kind === "max");
        const clickWait = !escrow && (halt || kind === "massive");
        if (clickWait) pauseAutoForCeremony();
        // MASÍVNA VÝHRA never auto-closes (also in autoplay): it waits for the taps (finish count, close).
        // In a duel nothing waits for a tap: the round must not stall the opponent or the duel clocks.
        await waitForBanner(escrow ? duelBannerMs(kind) : clickWait ? "click" : 2800);
      }

      setWinMask(null);
      setClusterPay(null);
      setPayHint(null);
      setWinTier(0);
      setPhase("idle");
      if (chaseRef.current) {
        const c = chaseRef.current;
        setTopLine(`ZÁSAH · SPIN ${c.spin + 1}/10 · HACK ${c.hits}/4 · FS ${c.strikes}/3${c.fsSym ? ` · FS = ${fsSymName(c.fsSym)}` : ""}`);
        setMessage(`ZÁSAH · ${c.target ? payName(c.target) : "CIEĽ"}`);
      } else {
        setTopLine(
          isFree || inFsRef.current
            ? "3× 4KA TV PRIDÁ TOČENIA"
            : "SYMBOLY PLATIA KDEKOĽVEK NA OBRAZOVKE",
        );
        setMessage(cash > 0 ? "" : pendingPick ? "BONUS" : isFree ? "" : DEAD[Math.floor(Math.random() * DEAD.length)]);
      }
      sfx.duckMusic(1);

      if (hitMax) return "max";
      if (pendingFs) return "fs";
      if (pendingPick) return "pick";
      return "ok";
    },
    [dur, waitForBanner, pushRank, noteResult, feedPool, runTicket, settleJob, armChase, endChase, noteHeat, persistNow, showFsReveal, pauseAutoForCeremony],
  );

  /** Credit a finished duel once per duel and seat, show the result and record it. */
  const payDuel = useCallback((d: Duel) => {
    const key = duelSettleKey(d, duelStartedAtRef.current);
    if (settledKeysRef.current.has(key)) return;
    settledKeysRef.current.add(key);
    // "Paid" only after the credit had time to render and be saved (persist effect), never mid-update.
    const startedAt = duelStartedAtRef.current;
    window.setTimeout(() => {
      if (duelStartedAtRef.current === startedAt) duelPaidRef.current = true;
    }, 1500);
    // A new build waited for this duel: reload once the credit is saved and the result was on screen.
    if (reloadDeferredRef.current) window.setTimeout(() => checkReleaseRef.current(), 4000);
    const out = duelOutcome(d);
    if (out.credit > 0) setBalance((b) => +(b + out.credit).toFixed(2));
    const pot = out.pot;
    const w = d.aborted ? null : duelWinner(d);
    const meOut = d.kind === "online" && Boolean(d.seats[d.you]?.out);
    if (meOut) {
      setTopLine(d.seats.length > 2 ? "VZDAL SI SA · tvoj stack ostáva v banku" : "VZDAL SI SA · stack berie súper");
      setJobToast("VZDAŤ");
    } else if (d.forfeit != null && d.seats.length <= 2) {
      setTopLine(`SÚPER SA VZDAL · BANK ${formatMoney(pot)}`);
      setJobToast(`BANK ${formatMoney(pot)}`);
    } else if (w === null) {
      setTopLine(d.seats.length > 2 && !d.aborted ? "REMÍZA NA ČELE · bank sa delí" : "DUEL REMÍZA · každý si necháva svoju výhru");
      setJobToast("REMÍZA");
    } else {
      const take = `${d.seats[w].name} BERIE BANK ${formatMoney(pot)}`;
      setTopLine(take);
      setJobToast(`BANK ${formatMoney(pot)}`);
      setSpinTape((t) => [{ label: `${versusMode(d.seats.length).short} BANK`, amount: formatMoney(pot) }, ...t].slice(0, 8));
    }
    // Desk / board: duel spins only counted their stakes; the payout is counted once, here.
    if (out.credit > 0) {
      const mine = Math.round(d.seats[d.you]!.score);
      // 3-4 seats: the board recipe keeps its "mine vs best other" pair.
      const other = Math.max(0, ...d.seats.filter((_, i) => i !== d.you).map((s) => Math.round(s.score)));
      bumpToday(0, out.credit, winHow({ mode: "DUEL", duel: `${mine} vs ${other}` }), BETS[betIndexRef.current] ?? 0, {
        v: 1,
        mode: "duel",
        pays: [],
        vs: [mine, other],
      });
    }
    noteStat({
      t: "duel",
      result: out.result,
      pot,
      forfeit: out.forfeit,
      kind: d.kind,
      blanks: duelBlankTotal.current || undefined,
    });
    // Kaucia: the game ending normally or failing returns it, my own leaving burns it.
    if (d.aborted) settleDeposit(abortReasonRef.current, { toast: false });
    else if (d.forfeit == null) settleDeposit("finish", { toast: false });
    else if (d.kind === "hotseat") {
      const outs = d.seats.map((s, i) => (s.out ? i : -1)).filter((i) => i >= 0);
      settleDeposit(forfeitCauseRef.current === "idle" ? "idle" : "forfeit", { burnSeats: outs.length ? outs : [d.forfeit], toast: false });
    } else {
      settleDeposit(
        forfeitReason({
          mine: Boolean(d.seats[d.you]?.out),
          cause: forfeitCauseRef.current ?? "timeout",
          netFault: depositRef.current?.netFault,
        }),
        { toast: false },
      );
    }
    rematchFlushRef.current();
  }, [bumpToday, noteStat, settleDeposit]);

  const settleDuel = useCallback((d: Duel) => {
    if (d.phase !== "done" || duelSettled.current) return;
    duelSettled.current = true;
    killAuto(null);
    const link = duelLinkRef.current;
    if (d.kind === "online" && link) {
      const gen = settleGen.current;
      settlingRef.current = true;
      // A reload while the final write is in flight must not burn the deposit of a finished duel.
      if (d.forfeit == null) patchDeposit({ finished: true });
      // Final write first. The row it returns decides: a forfeit already recorded there wins over this
      // local finish, so a finish and a forfeit can never both be paid.
      // Never wait forever for the row: after 8 s the local result is paid (as before this check existed).
      const timeout = new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("timeout")), 8000));
      void Promise.race([
        duelTick(link.room, link.seat ?? (link.role === "host" ? 0 : 1), d.seats[d.you]!.have, d.seats[d.you]!.score, {
          name: link.name,
          ante: Boolean(link.ante),
          net: false,
        }, d.round ?? link.round ?? 1),
        timeout,
      ])
        .then((snap) => reconcileDuel(d, snap))
        .catch(() => d)
        .then((synced) => {
          const final = synced.phase === "done" ? synced : d;
          if (gen === settleGen.current && duelRef.current?.room === d.room) {
            duelRef.current = final;
            setDuel(final);
          }
          settlingRef.current = false;
          payDuel(final);
        });
      return;
    }
    payDuel(d);
  }, [payDuel, patchDeposit]);

  /** A round, 4KA TV, KONTROLA or a banner is still running: VZDAŤ waits (a forfeit must not keep a running win). */
  const roundRunning = () =>
    busyRef.current || inFsRef.current || fsSessionRef.current.left > 0 || pickOpenRef.current || bannerOpen.current;

  /**
   * Forfeit my seat. Online the room row moves to `<me>_out` only while nobody has finished; if that
   * conditional write does not land, the row (finish or the opponent's forfeit) decides instead.
   */
  const forfeitSelf = useCallback((cur: Duel, cause: "fold" | "idle" = "fold") => {
    if (cur.phase !== "play" || duelSettled.current || foldingRef.current) return;
    forfeitCauseRef.current = cause;
    const who = cur.kind === "online" ? cur.you : cur.turn;
    const link = duelLinkRef.current;
    const local = () => {
      const live = duelRef.current;
      if (!live || live.phase !== "play" || duelSettled.current) return;
      const next = forfeitDuel(live, who);
      duelRef.current = next;
      setDuel(next);
      settleDuel(next);
    };
    if (cur.kind !== "online" || !link) {
      local();
      return;
    }
    foldingRef.current = true;
    const follow = async () => {
      const snap: DuelSnap = await duelPoll(link.room);
      const live = duelRef.current;
      if (!live || live.room !== cur.room || duelSettled.current) return;
      const next = reconcileDuel(live, snap);
      duelRef.current = next;
      setDuel(next);
      if (next.phase === "done") settleDuel(next);
    };
    void duelForfeitIf(
      link.room,
      link.seat ?? (link.role === "host" ? 0 : 1),
      cur.need,
      "self",
      { have: cur.seats[who]!.have, score: cur.seats[who]!.score },
      link.players ?? cur.seats.length,
    )
      .then(
        (ok) => (ok ? local() : follow().catch(() => {})),
        // Offline: forfeit locally; the opponent's client ends the duel on its own (silent seat).
        () => local(),
      )
      .finally(() => {
        foldingRef.current = false;
      });
  }, [settleDuel]);

  const playRound = useCallback(
    async (opts?: { buy?: boolean; resumeFs?: boolean; resumeBonus?: boolean }) => {
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
      // Full hlásenie: the buy button plays an ordinary spin and that spin starts ZÁSAH.
      if (opts?.buy && heatRef.current >= HEAT_MAX && !chaseRef.current && !inFsRef.current) opts = undefined;
      busyRef.current = true;
      setBusy(true);
      abort.current.aborted = false;
      roundCashRef.current = 0;
      // Decided once: a round started outside a live duel never counts for it, one started inside stays
      // held back even if the duel ends while it runs (see the end of the round).
      const roundDuel = duelRef.current && duelRef.current.phase === "play" ? duelRef.current : null;
      roundEscrowRef.current = Boolean(roundDuel);
      if (!opts?.buy && !opts?.resumeFs && !inFsRef.current) setDisplayWin(0);
      setTaxFly(null);

      try {

      const playFsSpins = async () => {
        const sess = fsSessionRef.current;
        let hitCap = false;
        const duelCap = roundEscrowRef.current ? Date.now() + 90_000 : 0;
        persistNow();
        while (sess.left > 0) {
          if (duelCap && Date.now() >= duelCap) {
            duelFastRef.current = true;
            abort.current.skip = true;
          }
          setFsLeft(sess.left);
          persistNow();
          lastTaxDeltaRef.current = 0;
          const inner = await runSequence({ free: true });
          sess.taxDelta = +(sess.taxDelta + lastTaxDeltaRef.current).toFixed(2);
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
            // +5 announcement: thunder + Zber (no harp: harp is the exact-3 settle cue, already played if it was 3).
            sfx.playRetrigger();
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
        // sess.cash already holds the free spins net of the tax period; only a bonus resumed from an old save
        // still carries an end multiplier.
        const mul = sess.bought ? 1 : sess.modMul || 1;
        const fsPaid = +(sess.cash * mul).toFixed(2);
        const fsCash = fsPaid;
        const featureTotal = +(fsPaid + sess.triggerCash).toFixed(2);
        // Display only: the BEZ DANE / DAŇOVÝ ÚNIK step on the bonus part (the trigger spin was shown on its own).
        const fsDelta = +(fsPaid - sess.cash + sess.taxDelta).toFixed(2);
        const fsTax: TaxFly | null =
          fsPaid > 0 && Math.abs(fsDelta) >= 0.01
            ? { kind: fsDelta < 0 ? "danUrad" : "bezDane", gross: +(featureTotal - fsDelta).toFixed(2), net: featureTotal, delta: fsDelta }
            : null;
        await wait(400);
        setInFs(false);
        inFsRef.current = false;
        setFsLeft(0);
        setGlobalMult(0);
        globalMultRef.current = 0;
        if (fsTax) {
          // Gross first, then the modifier chip, then the meter glides to what is credited.
          setDisplayWin(fsTax.gross);
          setSpinWin(fsTax.gross);
          await wait(dur(520), abort.current);
          setTaxKey((k) => k + 1);
          setTaxFly(fsTax);
          sfx.playMult();
          await wait(dur(260), abort.current);
        }
        setDisplayWin(featureTotal);
        setSpinWin(featureTotal);
        if (fsTax) await wait(dur(900), abort.current);
        const featureX = betNow > 0 ? featureTotal / betNow : 0;
        // 4KA TV pops no per-spin banners, so a massive bonus is announced once, at the end, before the summary.
        const massive = featureX >= WIN_POP_X.massive;
        const escrow = roundEscrowRef.current;
        const bought = sess.bought;
        const peak = sess.peak;
        const extra = sess.extra;
        const played = sess.played;
        const triggerCash = sess.triggerCash;
        const wasZasah = sess.zasah || undefined;
        // Credit + board + clear session + persist BEFORE any celebration wait.
        // Leaving mid-MASÍVNA / mid-fsTotal previously dropped fsPaid (KREDIT never moved; board best never updated).
        if (fsPaid > 0 && !escrow) {
          balanceRef.current = +(balanceRef.current + fsPaid).toFixed(2);
          setBalance(balanceRef.current);
        }
        if (featureTotal > 0 && !escrow) {
          bumpToday(
            0,
            featureTotal,
            winHow({
              mode: "PARKNET",
              spins: played,
              mult: peak,
            }),
            betNow,
            {
              v: 1,
              mode: bought ? "buy" : "fs",
              pays: topPays(fsTallyRef.current),
              cans: topCans(fsTallyRef.current.cans),
              mult: peak > 1 ? peak : undefined,
              scatters: fsTallyRef.current.scatters >= 3 ? fsTallyRef.current.scatters : undefined,
              tumbles: recipeTumbles(fsTallyRef.current.tumbles),
              spins: played || undefined,
              extra: extra || undefined,
              ante: (!bought && fsAnteRef.current) || undefined,
              mod: mul !== 1 ? mul : undefined,
            },
          );
        }
        roundCashRef.current = featureTotal;
        noteStat({
          t: "fsEnd",
          total: fsPaid,
          trigger: triggerCash,
          played,
          extra,
          peak,
          bought,
          buyCost: bought ? +(betNow * buyXOf(standing(rankRef.current.rp).id)).toFixed(2) : 0,
          modMul: mul,
          gross: sess.cash,
          ms: Math.max(0, Date.now() - (fsStartedAtRef.current || Date.now())),
          empty: featureTotal <= 0,
          zasah: wasZasah,
          recipe: {
            v: 1,
            mode: bought ? "buy" : "fs",
            pays: topPays(fsTallyRef.current),
            cans: topCans(fsTallyRef.current.cans),
            mult: peak > 1 ? peak : undefined,
            scatters: fsTallyRef.current.scatters >= 3 ? fsTallyRef.current.scatters : undefined,
            tumbles: recipeTumbles(fsTallyRef.current.tumbles),
            spins: played || undefined,
            extra: extra || undefined,
            ante: (!bought && fsAnteRef.current) || undefined,
            mod: mul !== 1 ? mul : undefined,
          },
        });
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
          taxDelta: 0,
          zasah: false,
        };
        setFsZasah(false);
        persistNow();
        if (!roundEscrowRef.current) postLiveHit(playerIdRef.current, featureX, featureTotal);
        if (massive) {
          bannerOpen.current = true;
          setBanner("massive");
          setBannerAmount(featureTotal);
          setBannerTax(fsTax);
          setBannerX(featureX);
          setPhase("big");
          setTopLine("MASÍVNA VÝHRA");
          sfx.playMassiveWin();
          if (!roundEscrowRef.current) pauseAutoForCeremony();
          // Never auto-closes: autoplay waits here (paused) until the player taps it away. In a duel it does.
          // Win is already in the save — dismiss / navigate / reload cannot lose it.
          await waitForBanner(roundEscrowRef.current ? duelBannerMs("massive") : "click");
        }
        setBannerMeta({
          spins: played,
          extra,
          peakMult: peak,
          terminated: hitCap,
          zasah: wasZasah,
        });
        bannerOpen.current = true;
        setBanner("fsTotal");
        setBannerAmount(featureTotal);
        setBannerTax(fsTax);
        setPhase(hitCap ? "max" : "big");
        setTopLine("4KA TV SKONČILA");
        setMessage(featureTotal > 0 ? `VÝHRA ${formatMoney(featureTotal)}` : "4KA TV SKONČILA");
        if (massive) sfx.playPayout();
        else if (featureTotal > 0 || hitCap) sfx.playBigWin();
        else sfx.playPayout();
        sfx.stopLiveBed();
        if (!escrow) pauseAutoForCeremony();
        await waitForBanner(escrow ? duelBannerMs("fsTotal") : "click");

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
        } else if (escrow) {
          // Held-back duel bonus: no rank from it.
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

      if (opts?.resumeBonus) {
        // A filled bar saved before a reload: play the mode that was drawn then (never a new draw).
        if (bonusPendingRef.current && !inFsRef.current && !roundEscrowRef.current) await runBonus();
        busyRef.current = false;
        setBusy(false);
        return;
      }

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
        fsStartedAtRef.current = Date.now();
        noteStat({ t: "fsStart", bought: sess.bought, ante: false, scatters: 4, spins: sess.left });
        // mark resume on next fsEnd via empty flag unused — bump resume counter
        noteStat({
          t: "fsEnd",
          total: 0,
          trigger: 0,
          played: 0,
          extra: 0,
          peak: 0,
          bought: false,
          buyCost: 0,
          modMul: 1,
          gross: 0,
          ms: 0,
          resumed: true,
        });
        persistNow();
        sfx.startLiveBed();
        const hitCap = await playFsSpins();
        await closeFs(hitCap, makeApplyBought(betNow, buyCost, buyXNow, rankIdNow));
        // The same round filled the bar too: its bonus waits for the 4KA TV (as without a reload).
        if (bonusPendingRef.current && !roundEscrowRef.current) await runBonus();
        // A 4KA TV resumed inside a duel still counts as that round's duel spin.
        const resumedIn = duelRef.current;
        if (roundEscrowRef.current && resumedIn?.phase === "play") {
          const next = tickDuel(resumedIn, roundCashRef.current);
          duelRef.current = next;
          setDuel(next);
          duelBlanks.current = 0;
          if (next.phase === "done") settleDuel(next);
        }
        busyRef.current = false;
        setBusy(false);
        return;
      }

      const r = await runSequence(opts);
      if (r === "skip") {
        // Nothing was charged or played: no rank, no buy settle, no duel tick. Auto must not burn its count.
        if (autoRef.current) killAuto("AUTO STOP · MÁLO KREDITU");
        return;
      }
      const betNow = BETS[betIndexRef.current];
      const triggerCash = +(lastPaidXRef.current * betNow).toFixed(2);
      const rankIdNow = standing(rankRef.current.rp).id;
      const buyXNow = buyXOf(rankIdNow);
      const buyCost = +(betNow * buyXNow).toFixed(2);
      const mathRank = roundEscrowRef.current ? "kredit" : rankIdNow;
      const fsCount = fsTriggerSpins(triggerScatterRef.current, fsSpinsOf(mathRank));
      const applyBoughtRank = makeApplyBought(betNow, buyCost, buyXNow, rankIdNow);

      if (r === "fs") {
        await wait(300);
        fsTallyRef.current = { ...emptyTally(), scatters: triggerScatterRef.current };
        mergeTally(fsTallyRef.current, lastTallyRef.current);
        // tumbles = cascades during the free spins only, not the trigger spin
        fsTallyRef.current.tumbles = 0;
        fsAnteRef.current = Boolean(anteRef.current && !opts?.buy);
        const zasahFs = fsZasahArmed({
          triggerChasing: lastChasingRef.current,
          bought: Boolean(opts?.buy),
          duel: Boolean(roundEscrowRef.current || duelRef.current),
        });
        fsSessionRef.current = {
          left: fsCount,
          total: fsCount,
          cash: 0,
          played: 0,
          extra: 0,
          peak: 0,
          bought: Boolean(opts?.buy),
          triggerCash,
          // The tax period now pays per free spin (see runSequence), never as one end multiplier.
          modMul: 1,
          taxDelta: 0,
          zasah: zasahFs,
        };
        setFsZasah(zasahFs);
        setInFs(true);
        inFsRef.current = true;
        setPhase("fs");
        setDisplayWin(triggerCash);
        setGlobalMult(0);
        globalMultRef.current = 0;
        setFsLeft(fsCount);
        setFsTotal(fsCount);
        setMessage(freeSpinsLabel(fsCount));
        fsStartedAtRef.current = Date.now();
        noteStat({
          t: "fsStart",
          bought: Boolean(opts?.buy),
          ante: Boolean(fsAnteRef.current),
          scatters: triggerScatterRef.current,
          spins: fsCount,
          zasah: zasahFs || undefined,
        });
        persistNow();
        sfx.playFsStart();
        sfx.startLiveBed();
        bannerOpen.current = true;
        setBanner("fs");
        setBannerAmount(fsCount);
        setBannerTax(null);
        setTopLine(`GRATULUJEME · 4KA TV · ${fsCount}`);
        await waitForBanner();
        await wait(200);

        const hitCap = await playFsSpins();
        await closeFs(hitCap, applyBoughtRank);
      } else if (opts?.buy) {
        applyBoughtRank(triggerCash, { mult: 1, bannerHit: r === "max" });
      }

      if (r === "max" || roundEscrowRef.current) {
        kontrolaArmedRef.current = false;
        if (bonusPendingRef.current) {
          bonusPendingRef.current = null;
          persistNow();
        }
      } else if (r === "pick" || kontrolaArmedRef.current) {
        kontrolaArmedRef.current = false;
        await runBonus();
      }

      if (autoRef.current && autoHaltRef.current && !duelRef.current && !chaseRef.current && balanceRef.current <= autoFloorRef.current) {
        killAuto("AUTO STOP · 50% KREDIT");
        noteStat({ t: "ui", what: "autoStop", why: "credit" });
      }

      const live = duelRef.current;
      if (roundEscrowRef.current && live && live.phase === "done" && !skipDuelTick.current) {
        // The duel ended while this round ran (the opponent forfeited or timed out): the held-back
        // win of this round belongs to this player. A self-forfeit cannot happen mid-round (VZDAŤ is locked).
        const won = roundCashRef.current;
        const mineOut = live.kind === "online" && live.forfeit === live.you;
        if (won > 0 && !mineOut) {
          setBalance((b) => +(b + won).toFixed(2));
          bumpToday(0, won);
        }
      }
      if (roundEscrowRef.current && live?.phase === "play" && !skipDuelTick.current) {
        const next = tickDuel(live, roundCashRef.current);
        duelRef.current = next;
        setDuel(next);
        duelBlanks.current = 0;
        if (next.phase === "swap" || next.phase === "done") killAuto(null);
        if (next.phase === "done") settleDuel(next);
      }
    } catch {
      // The app failed inside a duel round: the player is not to blame, the deposit comes back.
      if (roundEscrowRef.current && depositRef.current?.started) {
        settleDeposit("appError", { toast: false });
        setJobToast("CHYBA HRY · KAUCIA SPÄŤ");
      }
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
      roundEscrowRef.current = false;
      abort.current.skip = false;
      abort.current.aborted = false;
    }
  },
    [dur, runSequence, waitForBanner, runBonus, pushRank, noteResult, persistNow, runTicket, settleJob, settleDuel, bumpToday, settleDeposit],
  );

  useEffect(() => {
    if (!started || !hydrated || resumeOnce.current) return;
    if (!inFsRef.current || fsSessionRef.current.left <= 0) return;
    resumeOnce.current = true;
    void playRound({ resumeFs: true });
  }, [started, hydrated, playRound]);

  useEffect(() => {
    if (!started || !hydrated || bonusResumeOnce.current) return;
    if (!bonusPendingRef.current || inFsRef.current || fsSessionRef.current.left > 0 || duelRef.current) return;
    bonusResumeOnce.current = true;
    const t = window.setTimeout(() => void playRound({ resumeBonus: true }), 600);
    return () => window.clearTimeout(t);
  }, [started, hydrated, playRound]);

  const stopReels = useCallback(() => {
    noteStat({ t: "ui", what: "stopReels" });
    abort.current.skip = true;
    setReelFast(true);
    sfx.stopAnticipate();
  }, [noteStat]);

  /** A duel lobby is open (code shown / waiting for start): no spins until the duel starts or the lobby closes. */
  const inDuelLobby = () => Boolean(duelLinkRef.current && !duelRef.current);

  const spin = useCallback(async () => {
    if (!started || staleRef.current) return;
    if (busyRef.current) return;
    if (inDuelLobby()) return;
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
    if (heatRef.current >= HEAT_MAX) {
      setBuyAsk(false);
      void playRound();
      return;
    }
    setBuyAsk(true);
  }, [started, playRound]);

  const cancelBuy = useCallback(() => setBuyAsk(false), []);

  const confirmBuy = useCallback(async () => {
    if (chaseRef.current) {
      setJobToast("Počas ZÁSAHU zamknuté");
      return;
    }
    if (!started || busyRef.current || inFsRef.current || duelRef.current) return;
    if (heatRef.current >= HEAT_MAX) {
      setBuyAsk(false);
      await playRound();
      return;
    }
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
    noteStat({
      t: "job",
      phase: "take",
      card: {
        floor: taken.floor,
        kind: taken.kind,
        stake: taken.stake,
        payout: taken.payout,
        spun: taken.spun,
        limit: taken.limit,
        mystery: taken.mystery,
        kindB: taken.kindB,
        tries: taken.tries,
        triesUsed: taken.triesUsed,
      },
    });
    {
      // After paying the ticket there must be credit for at least one spin at the locked bet
      // (a buy ticket: for the buy). Otherwise it would be dead on arrival.
      const rankIdNow = standing(rankRef.current.rp).id;
      const left = +(balanceRef.current - taken.stake).toFixed(2);
      const spinCost = BETS[betIndexRef.current];
      const buyCost = +(spinCost * buyXOf(rankIdNow)).toFixed(2);
      if (left < spinCost || jobParknetBroke(taken, left, spinCost, buyCost)) {
        setJobToast("Málo kreditu na tiket aj točenie");
        return;
      }
    }
    setBalance((b) => +(b - taken.stake).toFixed(2));
    jobRef.current = taken;
    setJob(taken);
    setTicketSeal(null);
    setSpendOpen(Boolean(taken.mystery));
    setTicketFx({ id: Date.now(), kind: "pay", job: taken });
    setTopLine(`${jobShownGoal(taken)} · stávka ${formatMoney(taken.lockBet)} zamknutá`);
    if (taken.mystery) {
      setJobToast(`OTRS OTVORENÝ · ${jobShownGoal(taken)}`);
    }
    sfx.playClick();
  }, []);

  const startAuto = useCallback((n: number) => {
    if (busyRef.current) {
      setJobToast("Počkaj, kým dotočí");
      return;
    }
    if (inFsRef.current) {
      setJobToast("Počas 4KA TV zamknuté");
      return;
    }
    if (chaseRef.current) {
      setJobToast("Počas ZÁSAHU zamknuté");
      return;
    }
    if (inDuelLobby()) {
      setJobToast("Najprv spusti VERSUS");
      return;
    }
    const d = duelRef.current;
    if (d && (d.phase !== "play" || !canDuelSpin(d))) {
      setJobToast("Teraz nie si na ťahu");
      return;
    }
    const capped = d ? Math.min(n, duelLeft(d)) : n;
    if (capped <= 0) {
      setJobToast("VERSUS je dohraný");
      return;
    }
    autoFloorRef.current = balanceRef.current * 0.5;
    autoHoldRef.current = false;
    autoHoldLeftRef.current = 0;
    autoRef.current = true;
    autoLeftRef.current = capped;
    setAutoReason(null);
    setAutoOn(true);
    setAutoLeft(capped);
  }, []);

  const stopAuto = useCallback(() => {
    // A win or jackpot screen owns the tap (VIDENÉ). That click must not also hit STOP.
    if (bannerOpen.current || jpShowRef.current || autoHoldRef.current || Date.now() < ceremonyUntil.current) return;
    killAuto(null);
  }, [killAuto]);

  useEffect(() => {
    playRoundRef.current = () => playRound();
  }, [playRound]);

  useEffect(() => {
    if (!autoOn || busy || inFs || !started) return;
    if (bannerOpen.current || jpShowRef.current || autoHoldRef.current) return;
    if (autoLeft <= 0) {
      setAutoOn(false);
      autoRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      if (!autoRef.current || busyRef.current || bannerOpen.current || jpShowRef.current || autoHoldRef.current) return;
      if (inDuelLobby()) return;
      const live = duelRef.current;
      if (live && !canDuelSpin(live)) return;
      const next = Math.max(0, autoLeftRef.current - 1);
      autoLeftRef.current = next;
      setAutoLeft(next);
      void playRoundRef.current();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [autoOn, autoLeft, busy, inFs, started, duel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.code !== "Enter" && e.code !== "Escape") return;
      e.preventDefault();
      if (!started) return;
      if (statsOpenRef.current) {
        if (e.code === "Escape") setStatsOpen(false);
        return;
      }
      if (pickOpenRef.current) {
        if (pickEndedRef.current && (e.code === "Space" || e.code === "Enter")) finishPick();
        return;
      }
      if (stripWait.current) {
        finishModeStrip();
        return;
      }
      if (zboxWait.current || kolesoWait.current) return;
      if (jpWait.current) {
        dismissJp();
        return;
      }
      if (bannerOpen.current) {
        closeBanner();
        return;
      }
      if (fsRevealWait.current && (e.code === "Space" || e.code === "Enter" || e.code === "Escape")) {
        e.preventDefault();
        closeFsReveal();
        return;
      }
      if (chaseCardRef.current && (e.code === "Space" || e.code === "Enter" || e.code === "Escape")) {
        chaseCardRef.current = null;
        setChaseCard(null);
        return;
      }
      if (busyRef.current || staleRef.current) return;
      if (inFsRef.current) {
        // Free spins left paused (error / reload) resume from the keyboard too.
        if (fsSessionRef.current.left > 0) void playRound({ resumeFs: true });
        return;
      }
      if (inDuelLobby()) return;
      const live = duelRef.current;
      if (live && !canDuelSpin(live)) return;
      void playRound();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, playRound, stopReels, closeBanner, dismissJp, finishPick, finishModeStrip, closeFsReveal]);

  /** A deposit left pending with no duel or lobby around it (should not happen): refund it before a new one. */
  const clearStaleDeposit = () => {
    const d = depositRef.current;
    if (d) settleDeposit(d.started ? "roomFailure" : "notStarted", { toast: false });
  };

  // Crash marker: an uncaught error during a running duel makes the next (user) reload count as the
  // app's fault (refund) for APP_RELOAD_FRESH_MS.
  useEffect(() => {
    const onError = () => {
      if (depositRef.current?.started) writeAppReloadMarker("crash");
    };
    window.addEventListener("error", onError);
    return () => window.removeEventListener("error", onError);
  }, []);

  const duelSpinOpen = Boolean(
    duel && duel.kind === "online" && duel.phase === "play" && !busy && !inFs && canDuelSpin(duel),
  );
  const duelMyHave = duel ? duel.seats[duel.you].have : -1;
  useEffect(() => {
    if (!duelSpinOpen) return;
    // Re-armed after every blank too (duelMyHave changes), so an idle seat reaches the forfeit.
    const t = window.setTimeout(() => {
      const cur = duelRef.current;
      if (!cur || cur.phase !== "play" || busyRef.current || inFsRef.current || !canDuelSpin(cur)) return;
      const step = blankStep(duelBlanks.current);
      duelBlanks.current = step.blanks;
      duelBlankTotal.current += 1;
      if (step.forfeit) {
        forfeitSelf(cur, "idle");
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
  }, [duelSpinOpen, duelMyHave, settleDuel, forfeitSelf]);

  const flushRematch = useCallback(() => {
    const cur = duelRef.current;
    const pending = pendingRematchRef.current;
    const want = wantRematchRef.current;
    if (!want && !pending) return;
    if (cur && cur.phase === "play" && pending && (cur.round ?? 1) >= (pending.round ?? 1)) {
      pendingRematchRef.current = null;
      wantRematchRef.current = false;
      return;
    }
    if (!cur || cur.phase !== "done" || cur.aborted) return;
    if (rematchLockRef.current || settlingRef.current || depositRef.current || roundRunning()) return;
    const seatsN = cur.kind === "hotseat" ? cur.seats.length : 1;
    const tj = jobRef.current;
    const reserve = tj ? ticketReserve(tj, buyXOf(standing(rankRef.current.rp).id)) : 0;
    if (!canAffordDuel(+(balanceRef.current - reserve).toFixed(2), { bet: cur.bet, need: cur.need, seats: seatsN })) {
      wantRematchRef.current = false;
      pendingRematchRef.current = null;
      setJobToast(tj ? `Málo kreditu na odvetu + rezervu tiketu ${formatMoney(reserve)}.` : "Málo kreditu na odvetu.");
      return;
    }
    const startLocal = (round: number, ante: boolean) => {
      rematchLockRef.current = false;
      wantRematchRef.current = false;
      pendingRematchRef.current = null;
      settleGen.current += 1;
      duelSettled.current = false;
      duelBlanks.current = 0;
      duelBlankTotal.current = 0;
      duelStartedAtRef.current = Date.now();
      duelPaidRef.current = false;
      forfeitCauseRef.current = null;
      abortReasonRef.current = "roomFailure";
      setAnte(ante);
      anteRef.current = ante;
      const i = BETS.reduce((best, v, idx) => (Math.abs(v - cur.bet) < Math.abs(BETS[best] - cur.bet) ? idx : best), 0);
      setBetIndex(i);
      betIndexRef.current = i;
      const link = duelLinkRef.current;
      if (cur.kind === "online" && link) {
        const nextLink: DuelLink = { ...link, round };
        duelLinkRef.current = nextLink;
        setDuelLink(nextLink);
        payDeposit(newDeposit({ kind: "online", room: link.room, bet: cur.bet, now: Date.now(), started: true }));
      } else {
        payDeposit(newDeposit({ kind: "hotseat", bet: cur.bet, now: Date.now(), seats: cur.seats.length, started: true }));
      }
      const next = startDuel({
        mode: cur.mode === "live" ? "spins" : cur.mode,
        names: cur.seats.map((s) => s.name),
        bet: cur.bet,
        kind: cur.kind,
        you: cur.you,
        room: cur.room,
        need: cur.need,
        round: cur.kind === "online" ? round : undefined,
      });
      duelRef.current = next;
      setDuel(next);
      setDuelVotes([]);
      rematchVoteFired.current = false;
      dissolveFired.current = false;
      setDuelOpen(false);
      setTopLine(`${versusMode(next.seats.length).label} · ODVETA`);
      sfx.playClick();
    };
    if (cur.kind !== "online") {
      rematchLockRef.current = true;
      startLocal(1, anteRef.current);
      return;
    }
    const link = duelLinkRef.current;
    if (!link) return;
    const ante = pending?.ante ?? link.ante;
    if (pending && !want) {
      if (pending.names.some((n) => !n)) {
        pendingRematchRef.current = null;
        setJobToast("Niekto odišiel z miestnosti.");
        return;
      }
      rematchLockRef.current = true;
      startLocal(pending.round ?? (cur.round ?? 1) + 1, ante);
      return;
    }
    rematchLockRef.current = true;
    wantRematchRef.current = false;
    const fromRound = cur.round ?? link.round ?? 1;
    void duelRematch(link.room, fromRound, cur.seats.length)
      .then(async (snap) => {
        const live = snap ?? (await duelPoll(link.room).catch(() => null));
        if (!live || live.round <= fromRound) {
          rematchLockRef.current = false;
          rematchVoteFired.current = false;
          pendingRematchRef.current = null;
          return;
        }
        if (!live.seats.every((s) => s.name)) {
          rematchLockRef.current = false;
          setJobToast("Niekto odišiel z miestnosti.");
          return;
        }
        if (duelRef.current?.phase === "play" && (duelRef.current.round ?? 1) === live.round) {
          rematchLockRef.current = false;
          pendingRematchRef.current = null;
          return;
        }
        startLocal(live.round, live.ante);
      })
      .catch(() => {
        rematchLockRef.current = false;
        setJobToast("Odveta sa nepodarila.");
      });
  }, [payDeposit]);
  rematchFlushRef.current = flushRematch;

  const closeFinishedDuel = () => {
    const cur = duelRef.current;
    const link = duelLinkRef.current;
    if (cur && cur.phase === "play") return;
    if (link && !cur) void duelLeave(link.room, link.seat ?? link.role, link.players ?? 2).catch(() => {});
    if (!cur) settleDeposit(depositRef.current?.started ? "roomFailure" : "notStarted");
    else if (cur.phase === "done" && !settlingRef.current) settleDeposit(cur.aborted ? "roomFailure" : "finish");
    settleGen.current += 1;
    duelSettled.current = false;
    wantRematchRef.current = false;
    pendingRematchRef.current = null;
    rematchLockRef.current = false;
    rematchVoteFired.current = false;
    dissolveFired.current = false;
    setDuelVotes([]);
    duelBlanks.current = 0;
    duelFastRef.current = false;
    duelRef.current = null;
    setDuel(null);
    setDuelAlone(false);
    setDuelLink(null);
    setDuelPeer("");
    setDuelOpen(false);
    setAutoReason(null);
    setTopLine("SYMBOLY PLATIA KDEKOĽVEK NA OBRAZOVKE");
    if (reloadDeferredRef.current) window.setTimeout(() => checkReleaseRef.current(), 800);
  };
  endDuelRef.current = closeFinishedDuel;

  resolveVotesRef.current = (votes) => {
    const cur = duelRef.current;
    if (!cur || cur.kind !== "online" || cur.phase !== "done" || cur.aborted) return;
    const outcome = voteOutcome(votes);
    if (outcome === "wait") return;
    if (outcome === "go") {
      if (rematchVoteFired.current || rematchLockRef.current) return;
      rematchVoteFired.current = true;
      wantRematchRef.current = true;
      flushRematch();
      return;
    }
    if (dissolveFired.current) return;
    dissolveFired.current = true;
    setJobToast("Odveta neprešla");
    closeFinishedDuel();
  };

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
      if (busyRef.current || inFsRef.current || fsSessionRef.current.left > 0) return;
      // Turning ante OFF is always allowed between spins (also in ZÁSAH). Turning it on stays locked there.
      if (duelRef.current || duelLinkRef.current || (chaseRef.current && v)) {
        if (chaseRef.current && v) setJobToast("Počas ZÁSAHU zamknuté");
        return;
      }
      anteRef.current = v;
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
    fsZasah,
    fsTotal,
    inFs,
    globalMult,
    seqMult,
    banner,
    bannerAmount,
    bannerX,
    bannerMeta,
    bannerTax,
    closeBanner,
    dismissJp,
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
    modeStrip,
    finishModeStrip,
    zbox,
    finishZbox,
    koleso,
    finishKoleso,
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
    fsReveal,
    dismissFsReveal: closeFsReveal,
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
    statsOpen,
    stats: statsSnap,
    openStats,
    closeStats,
    setStats: (s: PlayerStats) => {
      statsRef.current = s;
      writeStats(s);
      setStatsSnap(s);
    },
    message,
    stoppedCols,
    reelFast,
    spinPace,
    cam,
    spinStrips,
    winTier,
    anticipate,
    onReelSettled,
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
    canBust:
      balance < BETS[0] &&
      !busy &&
      !inFs &&
      fsLeft <= 0 &&
      !duel &&
      !duelLink &&
      !ticketLock &&
      !jpHit,
    canLowerBet: !busy && !inFs && fsLeft <= 0 && !job && !duel && !duelLink && betIndex > 0,
    canAnteOff: !busy && !inFs && fsLeft <= 0 && !duel && !duelLink,
    bestWin,
    canSpin:
      started &&
      !stale &&
      !busy &&
      !buyAsk &&
      !chaseCard &&
      // Free spins left over after an error or a reload resume from the spin button (no stake).
      (inFs
        ? fsLeft > 0
        : balance >= stake && (!duel || (duel.phase === "play" && canDuelSpin(duel)))),
    canBuy:
      started &&
      !stale &&
      !busy &&
      !inFs &&
      !buyAsk &&
      !duel &&
      !duelLink &&
      !chase &&
      balance >= (heat >= HEAT_MAX ? stake : +(bet * buyX).toFixed(2)),
    surplus: canSpend(balance),
    spendOpen,
    setSpendOpen,
    openSpend,
    takeJob,
    job,
    ticketSeal,
    ticketFx,
    clearTicketFx,
    jobOffer,
    daily,
    jobToast,
    rpNotice: started ? (rpNotice?.text ?? null) : null,
    rpIdle,
    suchoLeague: suchoLeague(standing(rp).id),
    ticketActive: Boolean(job) && !(ticketPause && job && ticketPause.jobId === job.id),
    lcdFlash,
    surplusX: JOB_BANK,
    duel,
    ticketPaused: Boolean(ticketPause && job && ticketPause.jobId === job.id),
    ticketReserve: job && !job.seal ? ticketReserve(job, buyX) : 0,
    duelOpen,
    setDuelOpen,
    duelLink,
    duelPeer,
    setDuelPeer,
    duelDeposit,
    depositNote,
    depositMult: DUEL_DEPOSIT_MULT,
    hostDuel: (mode: DuelMode, name: string, betAmt?: number, need = 10, anteOn = false, players = 2) => {
      if (chaseRef.current || chaseCardRef.current) return "Počas ZÁSAHU zamknuté";
      if (busyRef.current) return "Počkaj, kým dotočí.";
      if (autoRef.current) return "Najprv vypni AUTO.";
      if (jobRef.current?.seal) return "Najprv dokonči tiket (čaká na bonus).";
      if (duelRef.current) return "Už beží VERSUS.";
      if (inFsRef.current) {
        setTopLine("DOTOČ 4KA TV, POTOM VERSUS");
        return "Dotoč 4KA TV, potom VERSUS.";
      }
      const stake = betAmt && betAmt > 0 ? betAmt : BETS[betIndexRef.current];
      const spins = need > 0 ? Math.round(need) : 10;
      const i = BETS.reduce((best, v, idx) => (Math.abs(v - stake) < Math.abs(BETS[best] - stake) ? idx : best), 0);
      // Stakes reserve + kaucia (DUEL_DEPOSIT_MULT x bet).
      // A running ticket keeps a reserve for its locked bet on top of the duel: a lost duel cannot kill it.
      const tj = jobRef.current;
      const reserve = tj ? ticketReserve(tj, buyXOf(standing(rankRef.current.rp).id)) : 0;
      if (!canAffordDuel(+(balanceRef.current - reserve).toFixed(2), { bet: BETS[i], need: spins }))
        return tj ? `Málo kreditu na VERSUS + rezervu tiketu ${formatMoney(reserve)}.` : "Málo kreditu na stávky + kauciu.";
      setBetIndex(i);
      betIndexRef.current = i;
      if (tj && !ticketPauseRef.current) setTicketPause(pauseTicket(tj, anteRef.current, Date.now()));
      setAnte(anteOn);
      anteRef.current = anteOn;
      const room = makeRoomCode();
      clearStaleDeposit();
      payDeposit(newDeposit({ kind: "online", room, bet: BETS[i], now: Date.now() }));
      setDuelLink({
        room,
        role: "host",
        seat: 0,
        players: clampPlayers(players),
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
      if (chaseRef.current || chaseCardRef.current) return "Počas ZÁSAHU zamknuté";
      if (busyRef.current) return "Počkaj, kým dotočí.";
      if (autoRef.current) return "Najprv vypni AUTO.";
      if (jobRef.current?.seal) return "Najprv dokonči tiket (čaká na bonus).";
      if (duelRef.current) return "Už beží VERSUS.";
      if (inFsRef.current) {
        setTopLine("DOTOČ 4KA TV, POTOM VERSUS");
        return "Dotoč 4KA TV, potom VERSUS.";
      }
      const room = code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 4);
      if (room.length < 4) return "Kód má 4 znaky.";
      const stake = betAmt && betAmt > 0 ? betAmt : BETS[betIndexRef.current];
      const spins = need > 0 ? Math.round(need) : 10;
      const i = BETS.reduce((best, v, idx) => (Math.abs(v - stake) < Math.abs(BETS[best] - stake) ? idx : best), 0);
      // A running ticket keeps a reserve for its locked bet on top of the duel: a lost duel cannot kill it.
      const tj = jobRef.current;
      const reserve = tj ? ticketReserve(tj, buyXOf(standing(rankRef.current.rp).id)) : 0;
      if (!canAffordDuel(+(balanceRef.current - reserve).toFixed(2), { bet: BETS[i], need: spins }))
        return tj ? `Málo kreditu na VERSUS + rezervu tiketu ${formatMoney(reserve)}.` : "Málo kreditu na stávky + kauciu.";
      clearStaleDeposit();
      payDeposit(newDeposit({ kind: "online", room, bet: BETS[i], now: Date.now() }));
      setBetIndex(i);
      betIndexRef.current = i;
      if (tj && !ticketPauseRef.current) setTicketPause(pauseTicket(tj, anteRef.current, Date.now()));
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
    beginOnline: (info: { names: string[]; you: number; bet: number; mode: DuelMode; need?: number; ante?: boolean; round?: number }) => {
      if (chaseRef.current) return "Počas ZÁSAHU zamknuté";
      const link = duelLinkRef.current;
      if (!link) return;
      if (duelRef.current?.room === link.room && duelRef.current.phase === "play") return;
      const you = Math.max(0, Math.min(info.names.length - 1, info.you));
      const names = info.names.map((n, k) => (k === you ? link.name : n || (k === 0 ? "HOSŤ" : `HRÁČ ${k + 1}`)));
      const need = info.need ?? 10;
      const spins = need > 0 ? Math.round(need) : link.need || 10;
      const matchRound = info.round ?? link.round ?? 1;
      const i = BETS.reduce((best, v, idx) => (Math.abs(v - info.bet) < Math.abs(BETS[best] - info.bet) ? idx : best), 0);
      setBetIndex(i);
      betIndexRef.current = i;
      const anteMatch = Boolean(info.ante) || link.ante;
      setAnte(anteMatch);
      anteRef.current = anteMatch;
      const nextLink: DuelLink = { ...link, seat: you, players: names.length, round: matchRound };
      duelLinkRef.current = nextLink;
      setDuelLink(nextLink);
      const next = startDuel({
        mode: info.mode === "live" ? "spins" : info.mode,
        names,
        bet: BETS[i],
        kind: "online",
        you,
        room: link.room,
        need: spins,
        round: matchRound,
      });
      duelSettled.current = false;
      duelBlanks.current = 0;
      duelBlankTotal.current = 0;
      duelStartedAtRef.current = Date.now();
      duelPaidRef.current = false;
      forfeitCauseRef.current = null;
      abortReasonRef.current = "roomFailure";
      if (depositRef.current && depositRef.current.room === link.room) patchDeposit({ started: true });
      duelRef.current = next;
      setDuel(next);
      setDuelOpen(false);
      setTopLine("SYMBOLY PLATIA KDEKOĽVEK NA OBRAZOVKE");
      const pending = pendingPeerTick.current;
      if (pending) {
        pendingPeerTick.current = null;
        let synced = next;
        pending.forEach((p, seatN) => {
          synced = applyPeerTick(synced, p.have, p.score, seatN < 0 ? undefined : seatN);
        });
        duelRef.current = synced;
        setDuel(synced);
        if (synced.phase === "done") settleDuel(synced);
      }
    },
    /** A peer seat's progress (2 seats: `seatN` omitted = the other seat). */
    applyRemoteTick: (have: number, score: number, seatN?: number) => {
      const cur = duelRef.current;
      if (!cur || cur.kind !== "online") {
        const map = pendingPeerTick.current ?? new Map<number, { have: number; score: number }>();
        map.set(seatN ?? -1, { have, score });
        pendingPeerTick.current = map;
        return;
      }
      const next = applyPeerTick(cur, have, score, seatN);
      if (next === cur) return;
      duelRef.current = next;
      setDuel(next);
      if (next.phase === "done") settleDuel(next);
    },
    notePeerNet: (net: boolean, seatN?: number) => {
      const cur = duelRef.current;
      if (!cur) return;
      if (seatN === undefined) {
        if (Boolean(cur.peerNet) === net) return;
        const next = { ...cur, peerNet: net };
        duelRef.current = next;
        setDuel(next);
        return;
      }
      const nets = cur.nets ? [...cur.nets] : cur.seats.map(() => false);
      if (Boolean(nets[seatN]) === net) return;
      nets[seatN] = net;
      const next = { ...cur, nets, peerNet: nets.some((v, k) => v && k !== cur.you) };
      duelRef.current = next;
      setDuel(next);
    },
    noteForfeit: (who: number) => {
      const cur = duelRef.current;
      if (!cur || cur.phase === "done" || duelSettled.current) return;
      if (cur.seats[who]?.out) return;
      const next = forfeitDuel(cur, who);
      duelRef.current = next;
      setDuel(next);
      if (next.phase === "done") settleDuel(next);
    },
    /**
     * DuelLink: the room vanished mid-duel ("gone"), polls/writes kept failing ("net"), or this client
     * came back from a long absence to a peer that is silent too ("both").
     */
    noteRoomFail: (kind: "gone" | "net" | "both") => {
      const cur = duelRef.current;
      if (kind === "net") {
        if (depositRef.current?.started && !depositRef.current.netFault) patchDeposit({ netFault: true });
        return;
      }
      if (!cur || cur.kind !== "online" || cur.phase !== "play" || duelSettled.current) return;
      if (kind === "gone" && roundRunning()) return;
      abortReasonRef.current = kind === "both" ? "bothDropped" : "roomFailure";
      // The game failed, not a player: each seat keeps its own stack, the deposit comes back.
      duelSettled.current = true;
      killAuto(null);
      const next = abortDuel(cur);
      duelRef.current = next;
      setDuel(next);
      setTopLine(kind === "both" ? (cur.seats.length > 2 ? "VŠETCI VYPADLI" : "OBAJA VYPADLI") + " · VERSUS ZRUŠENÝ · KAUCIA SPÄŤ" : "MIESTNOSŤ ZMIZLA · VERSUS ZRUŠENÝ · KAUCIA SPÄŤ");
      payDuel(next);
    },
    foldDuel: () => {
      const cur = duelRef.current;
      if (!cur || cur.phase !== "play") return;
      if (roundRunning()) {
        setJobToast("VZDAŤ až po dotočení");
        return;
      }
      forfeitSelf(cur);
    },
    /**
     * The other seats stopped answering. Leaving here is not a forfeit: the kaucia comes back and
     * nobody takes the bank. The room is removed so a peer that wakes up gets the same refund.
     */
    leaveAlone: () => {
      const cur = duelRef.current;
      if (!cur || cur.kind !== "online" || cur.phase !== "play" || duelSettled.current) return;
      if (roundRunning()) {
        setJobToast("ODÍSŤ až po dotočení");
        return;
      }
      abortReasonRef.current = "roomFailure";
      duelSettled.current = true;
      killAuto(null);
      const next = abortDuel(cur);
      duelRef.current = next;
      setDuel(next);
      setDuelAlone(false);
      setTopLine("SÚPER ODIŠIEL · KAÚCIA SPÄŤ");
      payDuel(next);
      const link = duelLinkRef.current;
      if (link) void duelLeave(link.room, "host").catch(() => {});
    },
    noteAlone: (alone: boolean) => setDuelAlone(alone),
    duelAlone,
    canFold: Boolean(duel && duel.phase === "play" && !busy && !inFs && !pickOpen && !banner),
    /** Hot-seat VERSUS: 2-4 names, all seats play from this phone, one after another. */
    beginDuel: (mode: DuelMode, names: string[], betAmt?: number, need = 10, anteOn = false) => {
      const seatsN = clampPlayers(names.length);
      if (chaseRef.current || chaseCardRef.current) return "Počas ZÁSAHU zamknuté";
      if (busyRef.current) return "Počkaj, kým dotočí.";
      if (autoRef.current) return "Najprv vypni AUTO.";
      if (jobRef.current?.seal) return "Najprv dokonči tiket (čaká na bonus).";
      if (inFsRef.current) return "Dotoč 4KA TV, potom VERSUS.";
      if (duelRef.current) return "Už beží VERSUS.";
      const stake = betAmt && betAmt > 0 ? betAmt : BETS[betIndexRef.current];
      const spins = need > 0 ? Math.round(need) : 10;
      const i = BETS.reduce((best, v, idx) => (Math.abs(v - stake) < Math.abs(BETS[best] - stake) ? idx : best), 0);
      // Hot-seat: both seats spin from this one wallet while the winnings sit in the duel bank;
      // both seats also pay their kaucia from it.
      // A running ticket keeps a reserve for its locked bet on top of the duel: a lost duel cannot kill it.
      const tj = jobRef.current;
      const reserve = tj ? ticketReserve(tj, buyXOf(standing(rankRef.current.rp).id)) : 0;
      if (!canAffordDuel(+(balanceRef.current - reserve).toFixed(2), { bet: BETS[i], need: spins, seats: seatsN }))
        return tj ? `Málo kreditu na VERSUS + rezervu tiketu ${formatMoney(reserve)}.` : "Málo kreditu na stávky + kauciu.";
      setBetIndex(i);
      betIndexRef.current = i;
      if (tj && !ticketPauseRef.current) setTicketPause(pauseTicket(tj, anteRef.current, Date.now()));
      setAnte(anteOn);
      anteRef.current = anteOn;
      const next = startDuel({ mode, names: names.slice(0, seatsN), bet: BETS[i], need: spins });
      clearStaleDeposit();
      payDeposit(newDeposit({ kind: "hotseat", bet: BETS[i], now: Date.now(), seats: seatsN }));
      forfeitCauseRef.current = null;
      abortReasonRef.current = "roomFailure";
      duelSettled.current = false;
      duelBlanks.current = 0;
      duelBlankTotal.current = 0;
      duelStartedAtRef.current = Date.now();
      duelPaidRef.current = false;
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
      setTopLine(`${versusMode(next.seats.length).label} · ${next.seats[next.turn]!.name}`);
      sfx.playClick();
    },
    endDuel: () => {
      const cur = duelRef.current;
      if (cur && cur.phase === "play") {
        if (roundRunning()) {
          setJobToast("VZDAŤ až po dotočení");
          return;
        }
        forfeitSelf(cur);
        return;
      }
      closeFinishedDuel();
    },
    duelVotes,
    voteDuel: (vote: "rematch" | "port") => {
      const cur = duelRef.current;
      const link = duelLinkRef.current;
      if (!cur || cur.kind !== "online" || cur.phase !== "done" || cur.aborted || !link) return;
      const me = cur.you;
      setDuelVotes((prev) => {
        const next = Array.from({ length: cur.seats.length }, (_, i) => prev[i] ?? null);
        if (next[me]) return prev;
        next[me] = vote;
        return next;
      });
      void duelVote(link.room, me, cur.round ?? link.round ?? 1, vote).catch(() => {
        setDuelVotes((prev) => {
          const next = [...prev];
          if (next[me] === vote) next[me] = null;
          return next;
        });
        setJobToast("Hlas sa nepodarilo odoslať.");
      });
    },
    noteVotes: (votes: SeatVote[]) => {
      const me = duelRef.current?.you ?? -1;
      setDuelVotes((prev) => {
        const next = votes.map((v, i) => v ?? (i === me ? prev[i] ?? null : null));
        if (next.length === prev.length && next.every((v, i) => v === prev[i])) return prev;
        return next;
      });
      resolveVotesRef.current(votes);
    },
    rematchDuel: () => {
      const cur = duelRef.current;
      if (!cur || cur.phase !== "done" || cur.aborted) return;
      wantRematchRef.current = true;
      flushRematch();
    },
    followRematch: (info: { names: string[]; you: number; bet: number; mode: DuelMode; need: number; ante: boolean; round?: number }) => {
      pendingRematchRef.current = { names: info.names, round: info.round, ante: info.ante };
      flushRematch();
    },
  };
}
