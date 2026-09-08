import { useCallback, useEffect, useRef, useState } from "react";
import {
  ANTE_COST,
  BETS,
  BUY_COST_X,
  FS_RETRIGGER,
  FS_SPINS,
  MAX_WIN_X,
  PAY_SYMBOLS,
  SCATTER,
  START_BALANCE,
  type Cell,
} from "@/lib/slot/symbols";
import {
  cloneGrid,
  createRng,
  emptyGrid,
  evaluate,
  generateBuyGrid,
  generateGrid,
  listOrbs,
  tumble,
  wait,
} from "@/lib/slot/engine";
import * as sfx from "@/lib/slot/audio";
import { formatMoney } from "@/lib/slot/format";

const SAVE_KEY = "olympus4k-v1";

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
  | "big"
  | "max";

export type WinBanner = "win" | "big" | "mega" | "epic" | "max" | "fs" | null;

interface Save {
  balance: number;
  betIndex: number;
  muted: boolean;
  turbo: boolean;
  ante: boolean;
  bestWin: number;
}

function loadSave(): Partial<Save> {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Save;
  } catch {
    return {};
  }
}

function persist(s: Save): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota */
  }
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
  const [ante, setAnte] = useState(false);
  const [bestWin, setBestWin] = useState(0);
  const [grid, setGrid] = useState<Cell[][]>(() => emptyGrid());
  const [phase, setPhase] = useState<Phase>("boot");
  const [busy, setBusy] = useState(false);
  const [winMask, setWinMask] = useState<boolean[][] | null>(null);
  const [spinWin, setSpinWin] = useState(0);
  const [displayWin, setDisplayWin] = useState(0);
  const [fsLeft, setFsLeft] = useState(0);
  const [fsTotal, setFsTotal] = useState(0);
  const [inFs, setInFs] = useState(false);
  const [globalMult, setGlobalMult] = useState(0);
  const [seqMult, setSeqMult] = useState(0);
  const [banner, setBanner] = useState<WinBanner>(null);
  const [bannerAmount, setBannerAmount] = useState(0);
  const [autoLeft, setAutoLeft] = useState(0);
  const [autoOn, setAutoOn] = useState(false);
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
  const [clusterPay, setClusterPay] = useState<{ x: number; y: number; amount: string } | null>(null);
  const [payHint, setPayHint] = useState<{ count: number; src: string; amount: string } | null>(null);
  const [winLog, setWinLog] = useState<{ count: number; src: string; amount: string }[]>([]);
  const [topLine, setTopLine] = useState("SYMBOLY PLATIA KDEKOĽVEK NA OBRAZOVKE");

  const abort = useRef({ aborted: false, skip: false });
  const turboRef = useRef(turbo);
  const anteRef = useRef(ante);
  const inFsRef = useRef(false);
  const globalMultRef = useRef(0);
  const balanceRef = useRef(balance);
  const betIndexRef = useRef(betIndex);
  const autoRef = useRef(false);
  const busyRef = useRef(false);
  const extraFsRef = useRef(0);
  const flyKey = useRef(1);

  turboRef.current = turbo;
  anteRef.current = ante;
  inFsRef.current = inFs;
  globalMultRef.current = globalMult;
  balanceRef.current = balance;
  betIndexRef.current = betIndex;
  autoRef.current = autoOn;
  busyRef.current = busy;

  const bet = BETS[betIndex];
  const stake = ante ? +(bet * ANTE_COST).toFixed(2) : bet;

  const readySave = useRef(false);

  useEffect(() => {
    const s = loadSave();
    if (typeof s.balance === "number") setBalance(s.balance);
    if (typeof s.betIndex === "number") {
      setBetIndex(Math.min(BETS.length - 1, Math.max(0, s.betIndex)));
    }
    if (typeof s.muted === "boolean") setMuted(s.muted);
    if (typeof s.turbo === "boolean") setTurbo(s.turbo);
    if (typeof s.ante === "boolean") setAnte(s.ante);
    if (typeof s.bestWin === "number") setBestWin(s.bestWin);
    readySave.current = true;
  }, []);

  useEffect(() => {
    if (!readySave.current) return;
    persist({ balance, betIndex, muted, turbo, ante, bestWin });
  }, [balance, betIndex, muted, turbo, ante, bestWin]);

  const dur = useCallback((base: number) => (turboRef.current ? Math.round(base * 0.38) : base), []);

  const start = useCallback(() => {
    sfx.unlockAudio();
    sfx.setMuted(muted);
    sfx.startAmbience();
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
    setBalance((b) => b + START_BALANCE);
    sfx.playWin();
  }, []);

  const closeBanner = useCallback(() => setBanner(null), []);

  const runSequence = useCallback(
    async (opts?: { buy?: boolean; free?: boolean }): Promise<"fs" | "ok" | "max"> => {
      const currentBet = BETS[betIndexRef.current];
      const currentStake = anteRef.current ? +(currentBet * ANTE_COST).toFixed(2) : currentBet;
      const isFree = !!opts?.free;
      const cost = opts?.buy ? +(currentBet * BUY_COST_X).toFixed(2) : isFree ? 0 : currentStake;

      if (!isFree && balanceRef.current < cost) {
        setMessage("Nedostatok kreditu — doplň demo zostatok");
        return "ok";
      }

      setWinMask(null);
      setSpinWin(0);
      setSeqMult(0);
      setClusterPay(null);
      setPayHint(null);
      setWinLog([]);
      setActivatingMult(false);
      setStruckUids([]);
      setStrike(null);
      setFlies([]);
      extraFsRef.current = 0;
      abort.current.skip = false;
      sfx.unlockAudio();
      sfx.startSpin();
      sfx.duckMusic(0.42);

      if (cost > 0) setBalance((b) => +(b - cost).toFixed(2));

      setStoppedCols(0);
      setAnticipate(false);
      setPhase("spinning");
      setTopLine("ŤUKNI A ZASTAV VALCE!");
      setMessage(isFree ? "Voľné točenia" : "Točí sa…");

      const rng = createRng();
      const next = opts?.buy ? generateBuyGrid(rng, anteRef.current) : generateGrid(rng, anteRef.current);

      await wait(dur(opts?.buy ? 720 : 620), abort.current);
      setGrid(next);
      await wait(dur(140), abort.current);

      setPhase("landing");
      let landedScatters = 0;
      for (let c = 0; c < 6; c++) {
        const colScatter = next.some((row) => row[c].kind === "scatter");
        if (landedScatters >= 2 && c < 6 && !abort.current.skip) {
          setAnticipate(true);
          setTopLine(landedScatters >= 3 ? "EŠTE JEDEN SCATTER…" : "SCATTER…");
          sfx.startAnticipate();
          await wait(dur(c >= 4 ? 780 : 520), abort.current);
        }
        setStoppedCols(c + 1);
        sfx.setSpinEnergy(1 - (c + 1) / 6);
        sfx.playLand(c);
        if (colScatter) {
          landedScatters += 1;
          sfx.playScatter(landedScatters);
          if (landedScatters >= 3) {
            setShake(true);
            window.setTimeout(() => setShake(false), 320);
          }
        }
        await wait(dur(92), abort.current);
      }
      sfx.stopSpin();
      sfx.stopAnticipate();
      sfx.duckMusic(1);
      setAnticipate(false);
      setStoppedCols(6);
      abort.current.skip = false;
      await wait(dur(140), abort.current);

      let board = next;
      let sequenceX = 0;
      let pendingFs = false;
      let tumbleN = 0;

      for (;;) {
        setPhase("eval");
        const ev = evaluate(board);
        if (ev.winX <= 0) break;

        setWinMask(ev.winMask);
        sequenceX += ev.winX;
        const cashNow = +(sequenceX * currentBet).toFixed(2);
        setSpinWin(cashNow);
        setDisplayWin(cashNow);

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
          setTopLine("VÝHRA Z FUNKCIE TUMBLE");
          setMessage(`${main.count}× vypláca ${top.amount}`);
        }

        if (ev.scatterCount >= 4) {
          sfx.playThunder();
          setShake(true);
          window.setTimeout(() => setShake(false), 520);
          if (!isFree && !inFsRef.current) pendingFs = true;
          else extraFsRef.current += FS_RETRIGGER;
        } else {
          sfx.playWin("spark");
        }
        setPhase("win");
        await wait(dur(80), abort.current);
        await wait(dur(780), abort.current);

        setPhase("pop");
        setClusterPay(null);
        sfx.playPop();
        await wait(dur(240), abort.current);
        board = tumble(board, ev.winMask, rng, anteRef.current);
        setWinMask(null);
        setPayHint(null);
        setPhase("tumble");
        sfx.playTumble();
        setGrid(cloneGrid(board));
        tumbleN += 1;
        if (hasOrb(board)) setTopLine("NÁSOBIČE ČAKAJÚ NA ZEUSA");
        await wait(dur(500 + Math.min(180, tumbleN * 20)), abort.current);
        setGrid((g) => g.map((row) => row.map((c) => ({ ...c, fall: 0 }))));
        await wait(dur(40), abort.current);
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
        setTopLine("ZEUS AKTIVUJE NÁSOBIČE");
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
      if (paidX > MAX_WIN_X) {
        paidX = MAX_WIN_X;
        hitMax = true;
      }
      const cash = +(paidX * currentBet).toFixed(2);
      if (cash > 0 && cash !== +(sequenceX * currentBet).toFixed(2)) {
        setSpinWin(cash);
        setDisplayWin(cash);
      }

      if (cash > 0) {
        setBalance((b) => +(b + cash).toFixed(2));
        setBestWin((w) => Math.max(w, cash));
        sfx.playPayout();
        await wait(dur(280), abort.current);
      }

      const x = currentBet > 0 ? cash / currentBet : 0;
      let kind: WinBanner = null;
      if (hitMax) kind = "max";
      else if (x >= 100) kind = "epic";
      else if (x >= 40) kind = "mega";
      else if (x >= 15) kind = "big";

      if (kind) {
        setBanner(kind);
        setBannerAmount(cash);
        if (kind === "max") sfx.playMaxWin();
        else sfx.playBigWin();
        setPhase(kind === "max" ? "max" : "big");
        await wait(dur(kind === "max" ? 2600 : 1600), abort.current);
        setBanner(null);
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
      setMessage(cash > 0 ? "" : "GOOD LUCK!");
      sfx.duckMusic(1);

      if (pendingFs) return "fs";
      if (hitMax) return "max";
      return "ok";
    },
    [dur],
  );

  const playRound = useCallback(
    async (opts?: { buy?: boolean }) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      abort.current.aborted = false;
      if (!opts?.buy && !inFsRef.current) setDisplayWin(0);

      const r = await runSequence(opts);

      if (r === "fs") {
        setInFs(true);
        inFsRef.current = true;
        setPhase("fs");
        setDisplayWin(0);
        setGlobalMult(0);
        globalMultRef.current = 0;
        let left = FS_SPINS;
        setFsLeft(left);
        setFsTotal(left);
        setMessage("15 voľných točení");
        sfx.playFsStart();
        setBanner("fs");
        setBannerAmount(0);
        setTopLine("GRATULUJEME!");
        await wait(dur(1400), abort.current);
        setBanner(null);

        while (left > 0) {
          left -= 1;
          setFsLeft(left);
          const inner = await runSequence({ free: true });
          if (extraFsRef.current > 0) {
            const add = extraFsRef.current;
            extraFsRef.current = 0;
            left += add;
            setFsLeft(left);
            setFsTotal((t) => t + add);
            setMessage(`+${add} voľných točení`);
            sfx.playScatter(4);
            await wait(dur(720), abort.current);
          }
          if (inner === "max") break;
          await wait(dur(160), abort.current);
        }

        setInFs(false);
        inFsRef.current = false;
        setFsLeft(0);
        setGlobalMult(0);
        globalMultRef.current = 0;
        setMessage("Koniec voľných točení");
        setPhase("idle");
        setTopLine("SYMBOLY PLATIA KDEKOĽVEK NA OBRAZOVKE");
      }

      busyRef.current = false;
      setBusy(false);
    },
    [dur, runSequence],
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
      if (e.code !== "Space") return;
      e.preventDefault();
      if (!started) return;
      if (busyRef.current) {
        stopReels();
        return;
      }
      if (!inFsRef.current) void playRound();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, playRound, stopReels]);

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
    ante,
    setAnte: (v: boolean) => {
      if (!busyRef.current) {
        setAnte(v);
        sfx.playClick();
      }
    },
    grid,
    phase,
    busy,
    winMask,
    spinWin,
    displayWin,
    fsLeft,
    fsTotal,
    inFs,
    globalMult,
    seqMult,
    banner,
    bannerAmount,
    closeBanner,
    autoOn,
    autoLeft,
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
    topLine,
    spin,
    stopReels,
    buyBonus,
    refill,
    bestWin,
    canSpin: started && !busy && !inFs && balance >= stake,
    canBuy: started && !busy && !inFs && balance >= +(bet * BUY_COST_X).toFixed(2),
  };
}
