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
  listOrbs,
  tumble,
  wait,
  zeusDrop,
  zeusDropCount,
} from "@/lib/slot/engine";
import { bumpPity, dealPickBoard, pityGain, PITY_GOAL, readPity, spendPity, type PickTile, type PityMap } from "@/lib/slot/pick-bonus";
import { applyRankDelta, applyWeeklyDecay, bannerFromX, buyXOf, dropOneGroup, fsSpinsOf, perkOf, reloadPunish, rpFromSpin, settleBuyRank, standing, RELOAD_STABILIZE, WEEK_MS, type RankBreakdown, type RankFlash } from "@/lib/slot/ranks";
import * as sfx from "@/lib/slot/audio";
import { formatMoney } from "@/lib/slot/format";
import { emptyPlayerSave, readLocalSave, writeLocalSave, type PlayerSave } from "@/lib/slot/player-save";
import { applyDrop, contribution, emptySnap, POOL_SEED, shouldDrop, type PoolSnap } from "@/lib/slot/jackpot";
import { getParkPool, spinParkPool } from "@/lib/slot/jackpot-fn";

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
  const [rankOpen, setRankOpen] = useState(false);
  const [winStreak, setWinStreak] = useState(0);
  const [rankParts, setRankParts] = useState<RankBreakdown | null>(null);
  const [pool, setPool] = useState(POOL_SEED);
  const [poolHits, setPoolHits] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const [autoOn, setAutoOn] = useState(false);
  const [autoReason, setAutoReason] = useState<string | null>(null);
  const [throwBolt, setThrowBolt] = useState(false);
  const [shake, setShake] = useState(false);
  const [paytableOpen, setPaytableOpen] = useState(false);
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
  const [payHint, setPayHint] = useState<{ count: number; src: string; amount: string } | null>(null);
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
  const poolLocalRef = useRef(POOL_SEED);
  const reloadStreakRef = useRef(0);
  const spinsSinceReloadRef = useRef(0);
  const lastDecayAtRef = useRef(0);
  const [reloadStreak, setReloadStreak] = useState(0);
  const [weekDue, setWeekDue] = useState(0);

  turboRef.current = turbo;
  quickRef.current = quick;
  anteRef.current = ante;
  inFsRef.current = inFs;
  globalMultRef.current = globalMult;
  balanceRef.current = balance;
  betIndexRef.current = betIndex;
  autoRef.current = autoOn;
  busyRef.current = busy;
  gridRef.current = grid;
  pityByBetRef.current = pityByBet;

  const bet = BETS[betIndex];
  const rankId = standing(rp).id;
  const perk = perkOf(rankId);
  const stake = ante ? +(bet * perk.anteMul).toFixed(2) : bet;
  const buyX = buyXOf(rankId);
  const pity = readPity(pityByBet, bet);

  const saveSnapRef = useRef<PlayerSave>(emptyPlayerSave());
  const readySave = useRef(false);

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
    poolLocalRef.current = s.poolLocal || POOL_SEED;
    setPool(poolLocalRef.current);
    reloadStreakRef.current = s.reloadStreak ?? 0;
    spinsSinceReloadRef.current = s.spinsSinceReload ?? 0;
    setReloadStreak(reloadStreakRef.current);
    lastDecayAtRef.current = s.lastDecayAt ?? 0;
    setWeekDue(lastDecayAtRef.current > 0 ? lastDecayAtRef.current + WEEK_MS : 0);
    saveSnapRef.current = s;
  }, []);

  const flushSave = useCallback((payload?: PlayerSave) => {
    if (!readySave.current) return;
    const next = payload ?? { ...saveSnapRef.current, updatedAt: Date.now() };
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
      pityByBet,
      rp,
      rankPeak,
      rankShield,
      winStreak,
      poolLocal: poolLocalRef.current,
      reloadStreak: reloadStreakRef.current,
      spinsSinceReload: spinsSinceReloadRef.current,
      lastDecayAt: lastDecayAtRef.current,
      updatedAt: Date.now(),
    };
    saveSnapRef.current = payload;
    writeLocal(payload);
  }, [hydrated, balance, betIndex, muted, turbo, quick, ante, bestWin, pityByBet, rp, rankPeak, rankShield, winStreak, pool, reloadStreak, weekDue]);

  useEffect(() => {
    if (!hydrated) return;
    void getParkPool()
      .then((s) => {
        setPool(s.pool);
        setPoolHits(s.hits);
        poolLocalRef.current = s.pool;
      })
      .catch(() => {
        setPool(poolLocalRef.current);
      });
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !started) return;
    const tick = () => {
      if (busyRef.current) return;
      void getParkPool()
        .then((s) => {
          setPool(s.pool);
          setPoolHits(s.hits);
          poolLocalRef.current = s.pool;
        })
        .catch(() => {});
    };
    const id = window.setInterval(tick, 9000);
    return () => window.clearInterval(id);
  }, [hydrated, started]);

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
    if (!rankFlash) return;
    const t = window.setTimeout(() => setRankFlash(null), 2600);
    return () => window.clearTimeout(t);
  }, [rankFlash]);

  useEffect(() => {
    if (!rankDelta) return;
    const t = window.setTimeout(() => {
      setRankDelta(0);
      setRankParts(null);
    }, 2200);
    return () => window.clearTimeout(t);
  }, [rankDelta]);

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
    setPhase("idle");
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
    if (busyRef.current) return;
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
    sfx.playThunder();
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
        if (drip > 0) {
          setBalance((b) => +(b + drip).toFixed(2));
          setSpinTape((t) => [{ label: "RANK DROP", amount: formatMoney(drip) }, ...t].slice(0, 8));
        }
      }
    }
    if (res.event) {
      setRankFlash({
        event: res.event,
        before: res.before,
        after: res.after,
        applied: res.applied,
        parts: parts ?? undefined,
      });
      if (res.event === "up") sfx.playFsStart();
      else if (res.event === "down") sfx.playThunder();
      else sfx.playCollect();
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

  const feedPool = useCallback(async (stake: number): Promise<PoolSnap> => {
    const perk = perkOf(standing(rankRef.current.rp).id);
    try {
      const res = await spinParkPool({ data: { stake, tickets: perk.jackTicket } });
      setPool(res.pool);
      setPoolHits(res.hits);
      poolLocalRef.current = res.pool;
      return res;
    } catch {
      const add = contribution(stake);
      poolLocalRef.current = +(poolLocalRef.current + add).toFixed(2);
      if (shouldDrop(poolLocalRef.current, perk.jackTicket, stake, Math.random)) {
        const { payout, next } = applyDrop(poolLocalRef.current);
        if (payout > 0) {
          poolLocalRef.current = next;
          setPool(next);
          setPoolHits((h) => h + 1);
          return { pool: next, hits: 0, lastHit: payout, hit: true, payout };
        }
      }
      setPool(poolLocalRef.current);
      return { ...emptySnap(), pool: poolLocalRef.current };
    }
  }, []);

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
    });
  }, []);

  const payPoolHit = useCallback(
    async (pot: PoolSnap) => {
      if (!pot.hit || pot.payout <= 0) return;
      setBalance((b) => +(b + pot.payout).toFixed(2));
      setBestWin((w) => Math.max(w, pot.payout));
      setSpinTape((t) => [{ label: "PARK POOL", amount: formatMoney(pot.payout) }, ...t].slice(0, 8));
      if (autoRef.current) {
        autoRef.current = false;
        setAutoOn(false);
        setAutoLeft(0);
        setAutoReason("AUTO STOP · PARK POOL");
      }
      bannerOpen.current = true;
      setBanner("pool");
      setBannerAmount(pot.payout);
      setPhase("big");
      sfx.playMaxWin();
      await waitForBanner();
    },
    [waitForBanner],
  );

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
    sfx.playFsStart();
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
      pushRank(-standing(rankRef.current.rp).entry);
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
      extraFsRef.current = 0;
      abort.current.skip = false;
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

      setStoppedCols(0);
      setAnticipate(false);
      setHoldGrid(cloneGrid(gridRef.current));
      setPhase("spinning");
      setTopLine("ŤUKNI A ZASTAV VALCE!");
      setMessage(isFree ? "Voľné točenia" : "Točí sa…");

      const rng = createRng();
      const next = opts?.buy
        ? generateBuyGrid(rng)
        : generateGrid(rng, opts?.free ? false : anteRef.current);

      await wait(dur(200), abort.current);
      setPhase("landing");
      setGrid(next);
      setStoppedCols(0);
      await wait(dur(40), abort.current);

      let landedScatters = 0;
      let pendingFs = false;
      let pendingPick = false;
      for (let c = 0; c < 6; c++) {
        const colN = next.reduce((n, row) => n + (row[c].kind === "scatter" ? 1 : 0), 0);
        if (landedScatters >= 2 && !abort.current.skip) {
          setAnticipate(true);
          setTopLine(landedScatters >= 3 ? "EŠTE JEDEN SCATTER…" : "SCATTER…");
          sfx.startAnticipate();
          await wait(dur(c >= 4 ? 780 : 520), abort.current);
        }
        setStoppedCols(c + 1);
        sfx.setSpinEnergy(1 - (c + 1) / 6);
        sfx.playLand(c);
        if (colN > 0) {
          landedScatters += colN;
          sfx.playScatter(landedScatters);
          if (landedScatters >= 3) {
            setShake(true);
            window.setTimeout(() => setShake(false), 320);
          }
        }
        await wait(dur(c >= 4 && landedScatters >= 2 ? 220 : 268), abort.current);
      }
      sfx.stopSpin();
      sfx.stopAnticipate();
      sfx.duckMusic(1);
      setAnticipate(false);
      setStoppedCols(6);
      setHoldGrid(null);
      abort.current.skip = false;
      await wait(dur(90), abort.current);

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
      const fsNow = isFree || inFsRef.current;
      if (!fsNow && scatterPeak >= FS_TRIGGER_SCATTERS) pendingFs = true;
      const DEAD = ["RAMPA STOJÍ", "VALCE SPALI", "NIČ. ZNOVA.", "POKUTA BEZ LÍSTKA", "ZÓNA TICHÁ"];

      for (;;) {
        setPhase("eval");
        const ev = evaluate(board);
        scatterPeak = Math.max(scatterPeak, ev.scatterCount);

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
          row.map((v, c) => (board[r][c].kind === "scatter" ? false : v)),
        );
        const willPop = tumbleMask.some((row) => row.some(Boolean));

        setWinMask(ev.winMask);
        sequenceX += winX;
        const cashNow = +(sequenceX * currentBet).toFixed(2);
        setSpinWin(cashNow);
        setDisplayWin(cashNow);
        setBaseWin(cashNow);

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
          setPayHint({ count: top.count, src: top.src, amount: top.amount });
          setWinLog((log) => [...log, ...rows.map(({ count, src, amount }) => ({ count, src, amount }))]);
          const avgR = main.cells.reduce((s, p) => s + p.r, 0) / main.cells.length;
          const avgC = main.cells.reduce((s, p) => s + p.c, 0) / main.cells.length;
          setClusterPay({
            x: ((avgC + 0.5) / 6) * 100,
            y: ((avgR + 0.5) / 5) * 100,
            amount: top.amount,
          });
          if (pendingFs) setTopLine(`${scatterPeak}× SCATTER — FREE SPINS`);
          else setTopLine("VÝHRA Z FUNKCIE TUMBLE");
          setMessage(`${main.count}× ${payName(main.payId)} vypláca ${top.amount}`);
        }

        if (pendingFs && !fsNow && !fsAnnounced) {
          fsAnnounced = true;
          sfx.playThunder();
          setShake(true);
          window.setTimeout(() => setShake(false), 520);
        } else {
          sfx.playWin("spark");
        }
        setPhase("win");
        await wait(dur(80), abort.current);
        await wait(dur(780), abort.current);

        if (!willPop) {
          setClusterPay(null);
          break;
        }

        setPhase("pop");
        setWinMask(tumbleMask);
        setClusterPay(null);
        sfx.playPop();
        await wait(dur(280), abort.current);
        board = tumble(board, tumbleMask, rng, fillAnte);
        const more = zeusDropCount(rng, isFree || inFsRef.current, true);
        const moreN = more > 0 ? more + perk.orbBonus : 0;
        if (moreN > 0) {
          setThrowBolt(true);
          sfx.playZap();
          const dropped = zeusDrop(board, rng, moreN, isFree || inFsRef.current);
          board = dropped.grid;
          setTopLine("RAMPA PÚŠŤA NÁSOBIČE");
        }
        setWinMask(null);
        setPayHint(null);
        setPhase("tumble");
        sfx.playTumble();
        setGrid(cloneGrid(board));
        tumbleN += 1;
        if (hasOrb(board)) setTopLine("NÁSOBIČE ČAKAJÚ NA RAMPÚ");
        await wait(dur(420 + Math.min(120, tumbleN * 16)), abort.current);
        setThrowBolt(false);
        setGrid((g) => g.map((row) => row.map((c) => ({ ...c, fall: 0 }))));
        await wait(dur(40), abort.current);
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
        const add = pityGain(scatterPeak, dead) + (dead ? perkOf(standing(rankRef.current.rp).id).pityBonus : 0);
        if (add > 0) {
          const nextMap = bumpPity(pityByBetRef.current, currentBet, add);
          const stored = readPity(nextMap, currentBet);
          setPityDelta(add);
          window.setTimeout(() => setPityDelta(0), 720);
          if (stored >= PITY_GOAL) {
            pityByBetRef.current = spendPity(nextMap, currentBet);
            kontrolaArmedRef.current = true;
            pendingPick = true;
            setTopLine("PITY PLNÝ — KONTROLA");
            setShake(true);
            window.setTimeout(() => setShake(false), 400);
            sfx.playThunder();
            setPityByBet(pityByBetRef.current);
            if (!pendingFs) await wait(dur(420), abort.current);
          } else {
            pityByBetRef.current = nextMap;
            setPityByBet(nextMap);
            if (scatterPeak >= 3) {
              setTopLine(`PITY +${add}`);
              await wait(dur(280), abort.current);
            }
          }
        }
      }

      if ((isFree || inFsRef.current) && sequenceX <= 0 && hasOrb(board)) {
        if (perk.stickyOrbs) {
          const leftover = listOrbs(board);
          const add = leftover.reduce((s, o) => s + o.mult, 0);
          setTopLine("PREDATOR · PLECHOVKY DRŽIA");
          setPhase("mult");
          for (const orb of leftover) {
            const key = flyKey.current++;
            setFlies((f) => [...f, { key, r: orb.r, c: orb.c, mult: orb.mult }]);
            window.setTimeout(() => setFlies((f) => f.filter((x) => x.key !== key)), 820);
            await wait(dur(180), abort.current);
          }
          const gm = globalMultRef.current + add;
          globalMultRef.current = gm;
          setGlobalMult(gm);
          const gone = expireOrbs(board, rng);
          board = gone.grid;
          setGrid(cloneGrid(board));
        } else {
          setTopLine("BEZ VÝHRY PLECHOVKY PREPADNÚ");
          const gone = expireOrbs(board, rng);
          setExpiredUids(gone.expired);
          board = gone.grid;
          setGrid(cloneGrid(board));
          sfx.playPop();
          await wait(dur(360), abort.current);
          setExpiredUids([]);
        }
      }

      const orbs = listOrbs(board);
      const orbSum = orbs.reduce((s, o) => s + o.mult, 0);
      const willThrow = sequenceX > 0 && orbSum > 0;
      let applied = 1;

      if (willThrow) {
        setPhase("mult");
        setActivatingMult(true);
        setThrowBolt(true);
        setShake(true);
        window.setTimeout(() => setShake(false), 420);
        sfx.playThunder();
        setTopLine("ZÁVORA AKTIVUJE NÁSOBIČE");
        await wait(dur(160), abort.current);
        for (const orb of orbs) {
          setStrike({ r: orb.r, c: orb.c });
          setStruckUids((ids) => [...ids, orb.uid]);
          sfx.playZap();
          if (isFree || inFsRef.current) {
            const key = flyKey.current++;
            setFlies((f) => [...f, { key, r: orb.r, c: orb.c, mult: orb.mult }]);
            window.setTimeout(() => setFlies((f) => f.filter((x) => x.key !== key)), 820);
          }
          await wait(dur(260), abort.current);
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
        const boosted = +(sequenceX * applied * currentBet).toFixed(2);
        setSpinWin(boosted);
        setDisplayWin(boosted);
        setBaseWin(+(sequenceX * currentBet).toFixed(2));
        setTopLine(`VÝHRA Z FUNKCIE TUMBLE  ×${applied}`);
        setMessage(`Násobič ${applied}×`);
        sfx.playMult();
        sfx.playWin("full");
        await wait(dur(420), abort.current);
        setThrowBolt(false);
        setActivatingMult(false);
      } else if ((isFree || inFsRef.current) && sequenceX > 0 && globalMultRef.current > 1) {
        applied = globalMultRef.current;
        setSeqMult(applied);
        setTopLine(`VÝHRA Z FUNKCIE TUMBLE  ×${applied}`);
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
        setBalance((b) => +(b + cash).toFixed(2));
        setBestWin((w) => Math.max(w, cash));
        sfx.playPayout();
        await wait(dur(280), abort.current);
      }
      const x = lastPaidXRef.current;
      let kind: WinBanner = null;
      if (hitMax) kind = "max";
      else if (x >= WIN_POP_X.epic) kind = "epic";
      else if (x >= WIN_POP_X.mega) kind = "mega";
      else if (x >= WIN_POP_X.big) kind = "big";

      if (!isFree && !opts?.buy) {
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
          pushRank(-standing(rankRef.current.rp).entry);
          if (perk.deadRebate > 0) {
            const back = +(currentBet * perk.deadRebate).toFixed(2);
            if (back > 0) {
              setBalance((b) => +(b + back).toFixed(2));
              setSpinTape((t) => [{ label: "LIGA VRACIA", amount: formatMoney(back) }, ...t].slice(0, 8));
              setTopLine(`LIGA VRACIA ${formatMoney(back)}`);
            }
          }
        }
      }

      if (kind) {
        bannerOpen.current = true;
        setBanner(kind);
        setBannerAmount(cash);
        if (kind === "max") sfx.playMaxWin();
        else sfx.playBigWin();
        setPhase(kind === "max" ? "max" : "big");
        await waitForBanner();
      }

      if (!isFree && cost > 0) {
        const pot = await feedPool(cost);
        await payPoolHit(pot);
      }

      setWinMask(null);
      setClusterPay(null);
      setPayHint(null);
      setPhase("idle");
      setTopLine(
        isFree || inFsRef.current
          ? "3× SCATTER ZNOVU SPUSTÍ FUNKCIU"
          : "SYMBOLY PLATIA KDEKOĽVEK NA OBRAZOVKE",
      );
      setMessage(cash > 0 ? "" : pendingPick ? "KONTROLA" : DEAD[Math.floor(Math.random() * DEAD.length)]);
      sfx.duckMusic(1);

      if (hitMax) return "max";
      if (pendingFs) return "fs";
      if (pendingPick) return "pick";
      return "ok";
    },
    [dur, waitForBanner, pushRank, noteResult, feedPool, payPoolHit],
  );

  const playRound = useCallback(
    async (opts?: { buy?: boolean }) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      abort.current.aborted = false;
      if (!opts?.buy && !inFsRef.current) setDisplayWin(0);

      const r = await runSequence(opts);
      const betNow = BETS[betIndexRef.current];
      const triggerCash = +(lastPaidXRef.current * betNow).toFixed(2);
      const rankIdNow = standing(rankRef.current.rp).id;
      const buyXNow = buyXOf(rankIdNow);
      const buyCost = +(betNow * buyXNow).toFixed(2);
      const fsCount = fsSpinsOf(rankIdNow);

      const applyBoughtRank = (
        returned: number,
        extra: { mult: number; bannerHit: boolean; retriggers?: number },
      ) => {
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
        setInFs(true);
        inFsRef.current = true;
        setPhase("fs");
        setDisplayWin(0);
        setGlobalMult(0);
        globalMultRef.current = 0;
        let left = fsCount;
        setFsLeft(left);
        setFsTotal(left);
        setMessage(`${fsCount} voľných točení`);
        sfx.playFsStart();
        bannerOpen.current = true;
        setBanner("fs");
        setBannerAmount(0);
        setTopLine("GRATULUJEME!");
        await waitForBanner();

        let fsCash = 0;
        let played = 0;
        let extraSpins = 0;
        let peakMult = 0;
        let hitCap = false;

        while (left > 0) {
          left -= 1;
          setFsLeft(left);
          played += 1;
          const inner = await runSequence({ free: true });
          fsCash = +(fsCash + lastPaidXRef.current * betNow).toFixed(2);
          peakMult = Math.max(peakMult, globalMultRef.current);
          if (extraFsRef.current > 0) {
            const add = extraFsRef.current;
            extraFsRef.current = 0;
            extraSpins += add;
            left += add;
            setFsLeft(left);
            setFsTotal((t) => t + add);
            setMessage(`+${add} voľných točení`);
            sfx.playScatter(4);
            await wait(dur(720), abort.current);
          }
          if (inner === "max") {
            hitCap = true;
            break;
          }
          await wait(dur(160), abort.current);
        }

        setInFs(false);
        inFsRef.current = false;
        setFsLeft(0);
        setGlobalMult(0);
        globalMultRef.current = 0;
        setDisplayWin(fsCash);
        setSpinWin(fsCash);
        setBannerMeta({
          spins: played,
          extra: extraSpins,
          peakMult,
          terminated: hitCap,
        });
        bannerOpen.current = true;
        setBanner("fsTotal");
        setBannerAmount(fsCash);
        setPhase(hitCap ? "max" : "big");
        setTopLine("KONIEC VOĽNÝCH TOČENÍ");
        setMessage(fsCash > 0 ? `TOTAL WIN ${formatMoney(fsCash)}` : "Koniec voľných točení");
        if (fsCash > 0 || hitCap) sfx.playBigWin();
        else sfx.playPayout();
        if (opts?.buy) {
          applyBoughtRank(+(fsCash + triggerCash).toFixed(2), {
            mult: Math.max(1, peakMult),
            bannerHit: hitCap,
            retriggers: extraSpins > 0 ? Math.round(extraSpins / FS_RETRIGGER) : 0,
          });
        } else if (fsCash > 0) {
          const streak = noteResult(true);
          const fx = betNow > 0 ? fsCash / betNow : 0;
          const parts = rpFromSpin({
            cash: fsCash,
            bet: betNow,
            mult: Math.max(1, peakMult),
            tumbles: 0,
            streak,
            banner: bannerFromX(fx, hitCap),
            kind: "fs",
            retriggers: extraSpins > 0 ? Math.round(extraSpins / FS_RETRIGGER) : 0,
            rankId: standing(rankRef.current.rp).id,
          });
          pushRank(parts.total, parts);
        } else {
          noteResult(false);
          pushRank(-standing(rankRef.current.rp).entry);
        }
        await waitForBanner();
        setBannerMeta(null);
        setPhase("idle");
        setTopLine("SYMBOLY PLATIA KDEKOĽVEK NA OBRAZOVKE");
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

      busyRef.current = false;
      setBusy(false);
    },
    [dur, runSequence, waitForBanner, runPick, pushRank, noteResult],
  );

  const stopReels = useCallback(() => {
    abort.current.skip = true;
    sfx.stopAnticipate();
  }, []);

  const spin = useCallback(async () => {
    if (!started || inFsRef.current) return;
    if (busyRef.current) {
      if (!abort.current.skip) stopReels();
      return;
    }
    await playRound();
  }, [started, playRound, stopReels]);

  const buyBonus = useCallback(async () => {
    if (!started || busyRef.current || inFsRef.current) return;
    await playRound({ buy: true });
  }, [started, playRound]);

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
      if (busyRef.current) {
        stopReels();
        return;
      }
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
    pool,
    poolHits,
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
    refill,
    reloadHit: reloadPunish({
      bet,
      rp,
      streak: reloadStreak + 1,
      maxBet: BETS[BETS.length - 1],
    }).delta,
    bestWin,
    canSpin: started && !busy && !inFs && balance >= stake,
    canBuy: started && !busy && !inFs && balance >= +(bet * buyX).toFixed(2),
  };
}
