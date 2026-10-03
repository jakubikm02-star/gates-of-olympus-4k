import { createContext, memo, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { reportSpinFrames } from "@/lib/slot/perf-guard";
import { emptySettle, settleReports, type SettleState } from "@/lib/slot/scatter-sfx";
import { COLS, ROWS, symbolSrc, ticketArt, canTier, FS_SYMBOL, PAY_SYMBOLS, TICKETS, type Cell, type PayId } from "@/lib/slot/symbols";
import { isFsCell, type FsSymId, type HackWindow } from "@/lib/slot/zasah";
import { subscribeTicketNames, ticketLabel } from "@/lib/slot/ticket-names";
import { CanFx, CanValue } from "./Can";

export interface ClusterPay {
  x: number;
  y: number;
  amount: string;
}

interface Props {
  grid: Cell[][];
  holdGrid: Cell[][] | null;
  winMask: boolean[][] | null;
  spinning: boolean;
  landing: boolean;
  popping: boolean;
  stoppedCols: number;
  anticipate: boolean;
  activatingMult: boolean;
  struckUids: number[];
  expiredUids: number[];
  clusterPay: ClusterPay | null;
  reduced: boolean;
  fast?: boolean;
  turbo?: boolean;
  quick?: boolean;
  onTap?: () => void;
  spinPace?: "up" | "full";
  spinStrips?: Cell[][] | null;
  ticketLock?: boolean;
  hackWindows?: HackWindow[];
  activeWindow?: number;
  windowPhase?: "travel" | "hover" | "land" | "reveal";
  chaseTarget?: PayId | null;
  /** ZÁSAH result on screen: cells with chaseTarget get a soft green tint, the rest dim slightly. */
  aimOn?: boolean;
  /** Symbol Finančná správa holds this ZÁSAH. Those cells wear the FS seal. */
  fsSym?: FsSymId | null;
  /** Rank cabinet layer (MachineFrame), painted in the bezel only. */
  frame?: import("react").ReactNode;
  /**
   * A reel visually stopped during a spin: its travel/brake animation ended (or, without travel, the hook
   * stopped it). Once per reel per spin, in stop order. Drives the scatter land sound.
   */
  onReelSettled?: (c: number) => void;
}

/** Reel strips and the board read the swapped symbol from here, so every CellView agrees. */
const FsSymContext = createContext<FsSymId | null>(null);

/**
 * Memoized: the board re-renders on every hook state change (column stops, pots, toasts), often while
 * the reels run. Unchanged cells (most of the ~300 in the travel strips) must not re-render then.
 */
const CellView = memo(function CellView({
  cell,
  r,
  c,
  win,
  popping,
  reduced,
  dumping,
  hot,
  dormant,
  tease,
  slam,
  expired,
  tumbleFall,
  ticketLock,
  aim = null,
}: {
  cell: Cell;
  r: number;
  c: number;
  win: boolean;
  popping: boolean;
  reduced: boolean;
  dumping: boolean;
  hot: boolean;
  dormant: boolean;
  tease: boolean;
  slam: boolean;
  expired: boolean;
  tumbleFall: number;
  ticketLock?: boolean;
  aim?: "on" | "dim" | null;
}) {
  const fsSym = useContext(FsSymContext);
  const fsCell = isFsCell(cell, fsSym);
  const ticketId = cell.ticket ?? "stat";
  const ticketCustom = cell.kind === "park" && ticketLabel(ticketId) !== TICKETS[ticketId].name;
  const style = {
    ["--r"]: String(r),
    ["--c"]: String(c),
    ...(tumbleFall ? { ["--fall"]: String(tumbleFall) } : {}),
  } as CSSProperties;
  return (
    <div
      className={[
        "cell",
        cell.gone ? "is-hole" : "",
        win ? "is-win" : "",
        cell.kind === "scatter" ? "is-scatter" : "",
        fsCell ? "is-fs-sym" : "",
        cell.kind === "park" ? `is-park is-ticket-${cell.ticket ?? "stat"}` : "",
        cell.kind === "mult" ? `is-mult can-t${canTier(cell.mult ?? 2)}` : "",
        ticketLock && cell.kind !== "park" ? "is-dim" : "",
        ticketLock && cell.kind === "park" ? "is-lock" : "",
        hot ? "is-struck" : "",
        dormant ? "is-dormant" : "",
        popping && win ? "is-pop" : "",
        tease ? "is-tease" : "",
        slam ? "is-slam" : "",
        expired ? "is-expired" : "",
        dumping && !reduced ? "is-dump" : "",
        tumbleFall && !reduced ? "is-drop" : "",
        aim === "on" && !cell.gone ? "is-aim" : "",
        aim === "dim" && !cell.gone && !fsCell && !win ? "is-aim-dim" : "",
      ].join(" ")}
      style={style}
      data-rc={`${r}-${c}`}
    >
      {!cell.gone && (
        <img
          src={fsCell ? FS_SYMBOL.src : cell.kind === "park" ? ticketArt(ticketId, ticketCustom) : symbolSrc(cell)}
          alt=""
          draggable={false}
          className="cell-img"
        />
      )}
      {!cell.gone && cell.kind === "scatter" && !fsCell && <span className="scatter-label">SCATTER</span>}
      {!cell.gone && cell.kind === "park" && ticketCustom && (
        <span className="scatter-label">{ticketLabel(ticketId)}</span>
      )}
      {!cell.gone && cell.kind === "mult" && <CanFx mult={cell.mult ?? 2} />}
      {!cell.gone && cell.kind === "mult" && <CanValue mult={cell.mult ?? 2} />}
      {!cell.gone && win && <span className="win-fx" aria-hidden="true" />}
      {hot && <span className="orb-strike" aria-hidden="true" />}
      {aim === "on" && !cell.gone && (
        <span className="aim-lock" aria-hidden="true" />
      )}
      {popping && win && (
        <span className="pop-burst" aria-hidden="true">
          {Array.from({ length: 16 }, (_, i) => (
            <i key={i} style={{ ["--i" as string]: String(i) } as CSSProperties} />
          ))}
          <b className="pop-spiral" />
        </span>
      )}
    </div>
  );
});

function symbolAt(filler: Cell[], oldCol: Cell[], index: number): Cell {
  const n = filler.length;
  const oldStart = n * 3;
  if (index >= oldStart && index < oldStart + oldCol.length) return oldCol[index - oldStart];
  return filler[((index % n) + n) % n];
}

/** Longest frame step the landing ease may take (ms ≈ 20 fps); longer gaps stall the clock. */
const LAND_STEP_MAX = 50;

type DriverCol = {
  el: HTMLDivElement | null;
  n: number;
  mode: "spin" | "arm" | "land" | "done";
  y: number;
  stop: boolean;
  finals: Cell[] | null;
  ms: number;
  land: { t0: number; prev: number; from: number; linearPx: number; v: number; easeMs: number } | null;
  onDone: () => void;
  setCells: (cells: Cell[]) => void;
  filler: Cell[];
  old: Cell[];
};

function TravelColumn({
  filler,
  oldCol,
  finalCol,
  stop,
  msPerCell,
  onDone,
  bind,
}: {
  filler: Cell[];
  oldCol: Cell[];
  finalCol: Cell[] | null;
  stop: boolean;
  msPerCell: number;
  onDone: () => void;
  bind: (col: DriverCol | null) => void;
}) {
  const n = filler.length;
  const stripRef = useRef<HTMLDivElement>(null);
  const api = useRef<DriverCol | null>(null);
  const [cells, setCells] = useState<Cell[]>(() => [...filler, ...filler, ...filler, ...oldCol]);

  if (!api.current) {
    api.current = {
      el: null,
      n,
      mode: "spin",
      y: 0,
      stop,
      finals: finalCol,
      ms: msPerCell,
      land: null,
      onDone,
      setCells,
      filler,
      old: oldCol,
    };
  }
  const col = api.current;
  col.stop = stop;
  col.finals = finalCol;
  col.ms = msPerCell;
  col.onDone = onDone;
  col.el = stripRef.current;

  useLayoutEffect(() => {
    col.el = stripRef.current;
    bind(col);
    return () => bind(null);
  }, [bind, col]);

  useLayoutEffect(() => {
    const node = stripRef.current;
    if (!node || col.mode !== "arm" || !col.land) return;
    col.land.t0 = performance.now();
    col.land.prev = col.land.t0;
    col.mode = "land";
    col.y = col.land.from;
    node.style.transform = `translate3d(0,${col.y}px,0)`;
  });

  return (
    <div ref={stripRef} className="strip strip-travel" style={{ ["--reel-n" as string]: String(n) }}>
      {cells.map((cell, i) => (
        <CellView
          key={`t-${i}-${cell.uid}`}
          cell={cell}
          r={i % ROWS}
          c={0}
          win={false}
          popping={false}
          reduced
          dumping={false}
          hot={false}
          dormant={false}
          tease={false}
          slam={false}
          expired={false}
          tumbleFall={0}
        />
      ))}
    </div>
  );
}

export function SlotGrid({
  grid,
  holdGrid,
  winMask,
  spinning,
  landing,
  popping,
  stoppedCols,
  anticipate,
  activatingMult,
  struckUids,
  expiredUids,
  clusterPay,
  reduced,
  fast,
  turbo,
  quick,
  onTap,
  spinPace,
  spinStrips,
  ticketLock,
  hackWindows,
  activeWindow = -1,
  windowPhase = "reveal",
  chaseTarget,
  aimOn = false,
  fsSym = null,
  frame = null,
  onReelSettled,
}: Props) {
  const [, names] = useState(0);
  useEffect(() => subscribeTicketNames(() => names((n) => n + 1)), []);
  const cascading = spinning || landing;
  const [landed, setLanded] = useState<boolean[]>(() => Array(COLS).fill(true));
  const [token, setToken] = useState(0);
  const cache = useRef<{ token: number; hold: Cell[][]; strips: Cell[][] } | null>(null);
  const spinToken = holdGrid?.[0]?.[0]?.uid ?? 0;
  if (holdGrid && spinStrips && spinStrips.length === COLS) {
    cache.current = { token: spinToken, hold: holdGrid, strips: spinStrips };
  }
  if (cache.current && cache.current.token !== token) {
    setToken(cache.current.token);
    setLanded(Array(COLS).fill(false));
  }
  const frozen = cache.current && cache.current.token === token ? cache.current : null;
  // Reel settle report (scatter land sound): a column must be seen spinning in this spin, then settled.
  const settledCols = Array.from({ length: COLS }, (_, c) => {
    const pending = cascading && c >= stoppedCols;
    const travel = !reduced && Boolean(frozen && frozen.strips[c]?.length >= ROWS && !landed[c]);
    return !pending && !travel;
  });
  const settleRef = useRef<SettleState>(emptySettle());
  const onSettledRef = useRef(onReelSettled);
  onSettledRef.current = onReelSettled;
  const settledKey = settledCols.map((v) => (v ? 1 : 0)).join("");
  useLayoutEffect(() => {
    const done = settleReports(settleRef.current, token, settledKey.split("").map((v) => v === "1"));
    for (const c of done) onSettledRef.current?.(c);
  }, [token, settledKey]);
  const windowRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<(DriverCol | null)[]>(Array(COLS).fill(null));
  const binds = useRef(
    Array.from({ length: COLS }, (_, i) => (col: DriverCol | null) => {
      colsRef.current[i] = col;
    }),
  );

  useLayoutEffect(() => {
    if (!token || reduced) return;
    let raf = 0;
    let last = performance.now();
    let h = 0;
    let scroll = 0;
    let primed = false;

    const place = (col: DriverCol, y: number) => {
      col.y = y;
      col.el!.style.transform = `translate3d(0,${y}px,0)`;
    };

    const sharedY = (col: DriverCol) => {
      const span = col.n * h;
      const limit = -span;
      let y = -3 * span + scroll;
      const shift = y - limit;
      if (shift > 0) y -= Math.ceil(shift / span) * span;
      return y;
    };

    // Frame-interval sample for the perf guard (raw, uncapped), reported once per spin.
    let frameSum = 0;
    let frameN = 0;
    const report = () => {
      if (frameN > 0) reportSpinFrames(frameSum / frameN, frameN);
      frameSum = 0;
      frameN = 0;
    };

    const tick = (now: number) => {
      const raw = now - last;
      const dt = Math.min(32, raw);
      last = now;
      if (primed && raw > 0 && raw < 1000) {
        frameSum += raw;
        frameN++;
      }
      const cols = colsRef.current;
      if (!primed) {
        const sample = cols.find((c) => c?.el)?.el?.firstElementChild as HTMLElement | undefined;
        const raw = sample?.getBoundingClientRect().height ?? 0;
        if (raw <= 0) {
          raf = requestAnimationFrame(tick);
          return;
        }
        const dpr = window.devicePixelRatio || 1;
        h = Math.round(raw * dpr) / dpr;
        windowRef.current?.style.setProperty("--cell-h", `${h}px`);
        for (const col of cols) {
          if (!col?.el) continue;
          place(col, -3 * col.n * h);
        }
        primed = true;
        last = now;
        raf = requestAnimationFrame(tick);
        return;
      }

      let ms = 84;
      for (const col of cols) {
        if (col?.mode === "spin") {
          ms = col.ms;
          break;
        }
      }
      scroll += (h / Math.max(16, ms)) * dt;

      let alive = false;
      for (const col of cols) {
        if (!col?.el || col.mode === "done") continue;
        alive = true;
        if (col.mode === "arm") continue;
        if (col.mode === "spin") {
          const y = sharedY(col);
          if (col.stop && col.finals) {
            const top = -y / h;
            const base = Math.floor(top);
            const frac = top - base;
            const lead = 2;
            const leadCells: Cell[] = [];
            for (let i = lead; i >= 1; i--) leadCells.push(symbolAt(col.filler, col.old, base - i));
            const visible: Cell[] = [];
            for (let i = 0; i < ROWS + 1; i++) visible.push(symbolAt(col.filler, col.old, base + i));
            const v = h / Math.max(16, col.ms);
            const brakePx = 1.5 * h;
            const from = -((ROWS + lead) * h + frac * h);
            col.land = {
              t0: now,
              prev: now,
              from,
              linearPx: Math.max(0, -from - brakePx),
              v,
              easeMs: Math.max(1, Math.round((2 * brakePx) / v)),
            };
            col.y = y;
            col.mode = "arm";
            col.setCells([...col.finals, ...leadCells, ...visible]);
            continue;
          }
          place(col, y);
        } else if (col.mode === "land" && col.land) {
          const plan = col.land;
          // A long frame (GC, React commit, thermal throttling) must not teleport the strip: past
          // LAND_STEP_MAX the landing clock stalls instead, so the reel slows for a frame, never skips.
          const gap = now - plan.prev;
          if (gap > LAND_STEP_MAX) plan.t0 += gap - LAND_STEP_MAX;
          plan.prev = now;
          const elapsed = now - plan.t0;
          const linearMs = plan.v > 0 ? plan.linearPx / plan.v : 0;
          let ny: number;
          if (elapsed <= linearMs) ny = plan.from + plan.v * elapsed;
          else {
            const u = Math.min(1, (elapsed - linearMs) / plan.easeMs);
            const eased = 1 - (1 - u) * (1 - u);
            const easeFrom = plan.from + plan.linearPx;
            ny = easeFrom + (0 - easeFrom) * eased;
          }
          place(col, ny);
          if (elapsed >= linearMs + plan.easeMs) {
            place(col, 0);
            col.mode = "done";
            col.onDone();
          }
        }
      }
      if (alive) raf = requestAnimationFrame(tick);
      else report();
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      report();
    };
  }, [token, reduced]);

  return (
    <FsSymContext.Provider value={fsSym}>
    <div
      className={`reel-frame${fsSym ? " has-fs-sym" : ""}${aimOn && chaseTarget ? " is-aiming" : ""}`}
      aria-label="Herné pole 6×5"
      onClick={onTap}
    >
      <div className="frame-skin" aria-hidden="true" />
      {frame}
      <i className="frame-bolt nw" aria-hidden="true" />
      <i className="frame-bolt ne" aria-hidden="true" />
      <i className="frame-bolt sw" aria-hidden="true" />
      <i className="frame-bolt se" aria-hidden="true" />
      <div className="frame-chip" aria-hidden="true" />
      <div className="frame-chip is-back" aria-hidden="true" />
      <div
        ref={windowRef}
        className={`reel-window ${spinning ? "is-spinning" : ""} ${landing ? "is-landing" : ""} ${anticipate ? "is-anticipate" : ""} ${activatingMult ? "is-zeus-strike" : ""} ${fast ? "is-fast" : ""} ${spinPace === "up" ? "is-spin-up" : ""} ${spinPace === "full" ? "is-spin-full" : ""}`}
      >
        {Array.from({ length: COLS }, (_, c) => {
          const pending = cascading && c >= stoppedCols;
          const justLand = landing && c === stoppedCols - 1;
          const colAnti = anticipate && pending;
          const filler = frozen?.strips[c];
          const oldCol = frozen ? Array.from({ length: ROWS }, (_, r) => frozen.hold[r][c]) : null;
          const finalCol = Array.from({ length: ROWS }, (_, r) => grid[r][c]);
          const showTravel = !reduced && Boolean(filler && filler.length >= ROWS && oldCol && !landed[c]);
          const showHold = !showTravel && pending && Boolean(oldCol);
          const showNew = !showTravel && !pending;
          const msPerCell = colAnti ? 22 : fast ? 44 : turbo ? 30 : quick ? 52 : spinPace === "up" ? 156 : 84;
          return (
            <div
              key={c}
              className={[
                "reel-col",
                showTravel ? "is-charging" : "",
                justLand ? "is-landing" : "",
                colAnti ? "is-anticipate" : "",
              ].join(" ")}
              style={{ ["--c" as string]: String(c) } as CSSProperties}
            >
              {showTravel && filler && oldCol ? (
                <TravelColumn
                  key={`${token}-${c}`}
                  filler={filler}
                  oldCol={oldCol}
                  finalCol={landing || !pending ? finalCol : null}
                  stop={!pending && (landing || !cascading)}
                  msPerCell={msPerCell}
                  bind={binds.current[c]}
                  onDone={() =>
                    setLanded((prev) => {
                      if (prev[c]) return prev;
                      const next = prev.slice();
                      next[c] = true;
                      return next;
                    })
                  }
                />
              ) : null}
              {showHold && oldCol ? (
                <div className="strip">
                  {oldCol.map((cell, r) => (
                    <CellView
                      key={cell.uid}
                      cell={cell}
                      r={r}
                      c={c}
                      win={false}
                      popping={false}
                      reduced={reduced}
                      dumping={false}
                      hot={false}
                      dormant={false}
                      tease={false}
                      slam={false}
                      expired={false}
                      tumbleFall={0}
                    />
                  ))}
                </div>
              ) : null}
              {showNew ? (
                <div className="strip">
                  {Array.from({ length: ROWS }, (_, r) => {
                    const cell = grid[r][c];
                    return (
                      <CellView
                        key={cell.uid}
                        cell={cell}
                        r={r}
                        c={c}
                        win={!cascading && !!winMask?.[r]?.[c]}
                        popping={popping}
                        reduced={reduced}
                        dumping={false}
                        hot={struckUids.includes(cell.uid)}
                        dormant={cell.kind === "mult" && !struckUids.includes(cell.uid) && !cascading}
                        tease={anticipate && !pending && cell.kind === "scatter"}
                        slam={justLand && cell.kind === "scatter"}
                        expired={expiredUids.includes(cell.uid)}
                        tumbleFall={cell.fall ?? 0}
                        ticketLock={ticketLock}
                        aim={
                          aimOn && chaseTarget && !ticketLock
                            ? cell.kind === "pay" && cell.payId === chaseTarget
                              ? "on"
                              : "dim"
                            : null
                        }
                      />
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
        {clusterPay && (
          <div className="cluster-pay" style={{ left: `${clusterPay.x}%`, top: `${clusterPay.y}%` }}>
            {clusterPay.amount}
          </div>
        )}
        {hackWindows && hackWindows.length > 0 ? (
          <div className="hack-layer">
            {hackWindows.map((w, i) => {
              const target = PAY_SYMBOLS.find((p) => p.id === chaseTarget);
              return (
                <HackFrame
                  key={`${w.cell}-${i}`}
                  w={w}
                  state={hackState(i, activeWindow, windowPhase)}
                  target={target ? { src: target.src, name: target.name } : null}
                />
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
    </FsSymContext.Provider>
  );
}

type HackState = "pending" | "travel" | "hover" | "land" | "reveal";

/** Earlier windows are settled, the live one follows the hook phase, later ones stay hidden. */
function hackState(i: number, active: number, phase: "travel" | "hover" | "land" | "reveal"): HackState {
  if (active < 0 || i < active) return "reveal";
  if (i > active) return "pending";
  return phase;
}

/** Travel origin: top centre of the board, slightly enlarged. */
const HACK_ORIGIN = { x: 2.5, y: 0, s: 1.3 };

function HackFrame({
  w,
  state,
  target,
}: {
  w: HackWindow;
  state: HackState;
  target: { src: string; name: string } | null;
}) {
  // One painted frame at the origin so the transform transition actually runs.
  const [launched, setLaunched] = useState(state !== "travel");
  useLayoutEffect(() => {
    if (state !== "travel" || launched) return;
    let b = 0;
    const a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => setLaunched(true));
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, [state, launched]);
  if (state === "pending") return null;
  const atOrigin = state === "travel" && !launched;
  const place = state === "travel" || state === "hover" ? w.hover : w.cell;
  const pos = atOrigin ? HACK_ORIGIN : { x: place % COLS, y: Math.floor(place / COLS), s: 1 };
  const showResult = state === "land" || state === "reveal";
  const result = showResult ? w.result : "scan";
  const style = {
    ["--x" as string]: String(pos.x),
    ["--y" as string]: String(pos.y),
    ["--s" as string]: String(pos.s),
    ["--fall" as string]: String(Math.floor(w.cell / COLS) + 1),
  } as CSSProperties;
  return (
    <i
      className={`hack-window is-${state} is-${result}${showResult && w.lock ? " is-lock" : ""}`}
      style={style}
      aria-hidden="true"
    >
      <span className="hw-rain" />
      <span className="hw-glow" />
      <svg className="hw-frame" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path className="hw-outer" d="M14 2 H58 L62 6 H86 L98 18 V70 L94 74 V86 L86 98 H40 L36 94 H14 L2 82 V30 L6 26 V14 Z" />
        <path className="hw-inner" d="M17 7 H56 L60 11 H84 L93 20 V68 L89 72 V84 L84 93 H42 L38 89 H16 L7 80 V32 L11 28 V17 Z" />
        <path className="hw-tick" d="M66 6 H80 M20 94 H32 M98 30 V44 M2 56 V70" />
      </svg>
      <span className="hw-dots"><i /><i /><i /></span>
      <span className="hw-chev">▾▾▾</span>
      <b className="hw-c hw-tl" />
      <b className="hw-c hw-tr" />
      <b className="hw-c hw-bl" />
      <b className="hw-c hw-br" />
      <span className="hw-sweep" />
      {showResult && w.result === "hit" && w.lock && target ? <img className="hw-sym" src={target.src} alt={target.name} /> : null}
      {/* The cell already wears the FS seal: the strike is a red lock and a shock ring, nothing drops in. */}
      {showResult && w.result === "fs" ? <span className="hw-fs-ring" /> : null}
      {showResult ? <b className="hw-tag">{w.result === "hit" ? "HACK" : w.result === "fs" ? "FS" : "MIMO"}</b> : null}
    </i>
  );
}
