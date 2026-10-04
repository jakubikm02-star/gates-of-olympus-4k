import { createContext, memo, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { noteReelSpin } from "@/lib/slot/debug-hud";
import { nextFrame, onFrame } from "@/lib/slot/frame-loop";
import { predecode } from "@/lib/slot/predecode";
import { reportSpinFrames } from "@/lib/slot/perf-guard";
import { emptySettle, settleReports, type SettleState } from "@/lib/slot/scatter-sfx";
import { COLS, ROWS, symbolSrc, ticketArt, canTier, CAN_ART, FS_SYMBOL, PAY_SYMBOLS, SCATTER, TICKETS, type Cell, type PayId } from "@/lib/slot/symbols";
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

/** Every bitmap a reel cell can show; kept decoded between spins (lib/slot/predecode). */
const REEL_ART: readonly string[] = [
  ...PAY_SYMBOLS.map((p) => p.src),
  SCATTER.src,
  FS_SYMBOL.src,
  ...Object.values(TICKETS).flatMap((t) => [t.src, t.blank]),
  ...CAN_ART,
];

/**
 * Longest frame step the reels may take (ms ≈ 10 fps); longer gaps stall the clock.
 * This must stay well above a throttled display's frame (30 Hz battery saver = 33 ms, uneven
 * 16/50 ms pacing on a power-capped WebAPK): a lower cap (it was 32 ms spin / 50 ms landing)
 * drops real time on every long frame, so the reel visibly slows and surges frame to frame.
 */
const STEP_MAX = 100;

/**
 * Reel speed changes (anticipation ×4, fast/turbo pace) ease in over ~this time constant instead of
 * jumping in one frame. Exponential, so it is the same at 60, 90, 120 or 144 Hz.
 */
const SPEED_TAU_MS = 45;

/** Cells the strip runs on after a stop before the final symbols arrive (plus the current fraction). */
const LEAD = 2;

type LandPlan = { t0: number; from: number; to: number; linearPx: number; v: number; easeMs: number; p: number };

type DriverCol = {
  el: HTMLDivElement | null;
  n: number;
  mode: "spin" | "land" | "done";
  y: number;
  stop: boolean;
  ms: number;
  land: LandPlan | null;
  hidden: HTMLElement[];
  onDone: () => void;
};

const xf = (y: number) => `translate3d(0,${y}px,0)`;

/** requestIdleCallback with a deadline (setTimeout where it is missing, e.g. older Safari). Returns a canceller. */
function whenIdle(fn: () => void, timeout: number, fallbackMs: number): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(fn, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(fn, fallbackMs);
  return () => window.clearTimeout(id);
}

/**
 * Travel strip: 3× the spin filler + the previous board, rendered ONCE per spin and moved only with a
 * compositor transform. The stop does not rebuild it (that was a React commit + a ~800-object layout per
 * reel stop, with the column frozen meanwhile): the final symbols are the column's normal board strip,
 * already mounted under it and carried in lockstep by the driver (see SlotGrid).
 */
const TravelColumn = memo(
  function TravelColumn({
    filler,
    oldCol,
    bind,
  }: {
    filler: Cell[];
    oldCol: Cell[];
    bind: (el: HTMLDivElement | null, n: number) => void;
  }) {
    const n = filler.length;
    const stripRef = useRef<HTMLDivElement>(null);
    const [cells] = useState<Cell[]>(() => [...filler, ...filler, ...filler, ...oldCol]);
    useLayoutEffect(() => {
      bind(stripRef.current, n);
      return () => bind(null, n);
    }, [bind, n]);
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
  },
  (a, b) => a.filler === b.filler && a.oldCol === b.oldCol && a.bind === b.bind,
);

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
  /** Token whose travel strips were unmounted after every reel landed (deferred to idle time). */
  const [swept, setSwept] = useState(0);
  const cache = useRef<{ token: number; hold: Cell[][]; strips: Cell[][]; olds: Cell[][] } | null>(null);
  const spinToken = holdGrid?.[0]?.[0]?.uid ?? 0;
  if (holdGrid && spinStrips && spinStrips.length === COLS && (cache.current?.token !== spinToken || cache.current.strips !== spinStrips)) {
    cache.current = {
      token: spinToken,
      hold: holdGrid,
      strips: spinStrips,
      // Built once per spin so the memoized travel strips keep stable props through every re-render.
      olds: Array.from({ length: COLS }, (_, c) => Array.from({ length: ROWS }, (_, r) => holdGrid[r][c])),
    };
  }
  if (cache.current && cache.current.token !== token) {
    setToken(cache.current.token);
    setLanded(Array(COLS).fill(false));
  }
  const frozen = cache.current && cache.current.token === token ? cache.current : null;
  const allLanded = landed.every(Boolean);
  /** Travel strips stay mounted (hidden once their reel landed) until every reel is down, then go in one idle commit. */
  const travelOn = !reduced && Boolean(frozen) && swept !== token;
  const colTravel = (c: number) => travelOn && Boolean(frozen && frozen.strips[c]?.length >= ROWS);
  // Reel settle report (scatter land sound): a column must be seen spinning in this spin, then settled.
  const settledCols = Array.from({ length: COLS }, (_, c) => {
    const pending = cascading && c >= stoppedCols;
    const travel = colTravel(c) && !landed[c];
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

  // Driver state per column. Render only writes plain values here (stop flag, pace); the frame job owns the DOM.
  const colsRef = useRef<DriverCol[]>(
    Array.from({ length: COLS }, () => ({ el: null, n: 0, mode: "done", y: 0, stop: false, ms: 84, land: null, hidden: [], onDone: () => {} })),
  );
  const finalRefs = useRef<(HTMLDivElement | null)[]>(Array(COLS).fill(null));
  const binds = useRef(
    Array.from({ length: COLS }, (_, i) => (el: HTMLDivElement | null, n: number) => {
      const col = colsRef.current[i];
      col.el = el;
      col.n = n;
    }),
  );
  const finalBinds = useRef(
    Array.from({ length: COLS }, (_, i) => (el: HTMLDivElement | null) => {
      finalRefs.current[i] = el;
    }),
  );
  const landedSetters = useRef(
    Array.from({ length: COLS }, (_, c) => () =>
      setLanded((prev) => {
        if (prev[c]) return prev;
        const next = prev.slice();
        next[c] = true;
        return next;
      }),
    ),
  );

  // Cell height from a ResizeObserver (no forced layout at spin start). Cells are 20% of the column.
  const cellH = useRef(0);
  useLayoutEffect(() => {
    const win = windowRef.current;
    const col = win?.querySelector<HTMLElement>(":scope > .reel-col");
    if (!win || !col || typeof ResizeObserver === "undefined") return;
    const apply = (colH: number) => {
      if (colH <= 0) return;
      // Exact 20% of the column (layout-unit precision), identical to the static 20cqh cells, so the landing
      // hand-off has no sub-pixel jump and rows fill the column exactly; motion itself is composited.
      const h = Math.round((colH / ROWS) * 64) / 64;
      if (h === cellH.current) return;
      cellH.current = h;
      win.style.setProperty("--cell-h", `${h}px`);
    };
    const ro = new ResizeObserver((entries) => {
      const e = entries[entries.length - 1];
      apply(e.contentBoxSize?.[0]?.blockSize ?? e.contentRect.height);
    });
    ro.observe(col);
    return () => ro.disconnect();
  }, []);

  // Board idle: keep every reel bitmap decoded and referenced for the next spin.
  useEffect(() => {
    if (cascading) return;
    return whenIdle(() => void predecode(REEL_ART), 1500, 300);
  }, [cascading]);

  // Every reel landed: drop the hidden travel strips (~300 cells) in one commit when the main thread is idle.
  useEffect(() => {
    if (!token || !allLanded || swept === token) return;
    return whenIdle(() => setSwept(token), 700, 250);
  }, [token, allLanded, swept]);

  useLayoutEffect(() => {
    if (!token || reduced) return;
    const strips = cache.current?.token === token ? cache.current.strips : null;
    if (strips) void predecode(strips.flatMap((st) => st.map(symbolSrc)));
    const cols = colsRef.current;
    for (const col of cols) {
      col.mode = col.el ? "spin" : "done";
      col.land = null;
      col.hidden = [];
    }
    let h = 0;
    let scroll = 0;
    let primed = false;
    let v = 0;

    const sharedY = (col: DriverCol) => {
      const span = col.n * h;
      const limit = -span;
      let y = -3 * span + scroll;
      const shift = y - limit;
      if (shift > 0) y -= Math.ceil(shift / span) * span;
      return y;
    };

    // Frame-interval sample for the perf guard (raw, uncapped), reported once per spin.
    const t0 = performance.now();
    let frameSum = 0;
    let frameN = 0;
    let frameMax = 0;
    let cellsRun = 0;
    let spinMs = 0;
    let reported = false;
    const report = () => {
      if (reported) return;
      reported = true;
      if (frameN > 0) {
        reportSpinFrames(frameSum / frameN, frameN);
        noteReelSpin({
          frames: frameN,
          meanFrameMs: frameSum / frameN,
          maxFrameMs: frameMax,
          cellsPerSec: spinMs > 0 ? (cellsRun * 1000) / spinMs : 0,
          reelMs: performance.now() - t0,
        });
      }
    };

    const finish = (c: number, col: DriverCol) => {
      col.mode = "done";
      const fin = finalRefs.current[c];
      if (fin) {
        fin.style.transform = "";
        fin.style.visibility = "visible";
      }
      if (col.el) {
        col.el.style.visibility = "hidden";
        for (const cell of col.hidden) cell.style.visibility = "";
      }
      col.hidden = [];
      col.onDone();
    };

    const job = (now: number, raw: number): boolean => {
      const dt = Math.min(STEP_MAX, raw);
      if (primed && raw > 0 && raw < 1000) {
        frameSum += raw;
        frameN++;
        if (raw > frameMax) frameMax = raw;
      }
      if (!primed) {
        h = cellH.current;
        if (h <= 0) return true;
        for (const col of cols) if (col.el && col.mode === "spin") col.el.style.transform = xf((col.y = -3 * col.n * h));
        primed = true;
        return true;
      }

      // Shared spin speed: the first still-spinning column's pace, eased toward (never a one-frame jump).
      let ms = 0;
      for (const col of cols) {
        if (col.el && col.mode === "spin") {
          ms = col.ms;
          break;
        }
      }
      if (ms > 0) {
        const target = h / Math.max(16, ms);
        v = v === 0 ? target : v + (target - v) * (1 - Math.exp(-dt / SPEED_TAU_MS));
        scroll += v * dt;
        cellsRun += (v * dt) / h;
        spinMs += dt;
      }

      let alive = false;
      for (let c = 0; c < cols.length; c++) {
        const col = cols[c];
        if (!col.el || col.mode === "done") continue;
        alive = true;
        if (col.mode === "spin") {
          const y = sharedY(col);
          const fin = col.stop ? finalRefs.current[c] : null;
          if (fin) {
            // Stop: the final board strip goes LEAD cells (+ the current fraction) above the window, at
            // strip index p, and rides with the strip from here. The travel cells it covers are hidden.
            const top = -y / h;
            const p = Math.floor(top) - LEAD - ROWS;
            if (p >= 0) {
              const to = -p * h;
              const dist = to - y;
              const brakePx = 1.5 * h;
              const vv = v > 0 ? v : h / Math.max(16, col.ms);
              col.land = {
                t0: now,
                from: y,
                to,
                linearPx: Math.max(0, dist - brakePx),
                v: vv,
                easeMs: Math.max(1, (2 * Math.min(brakePx, dist)) / vv),
                p,
              };
              const kids = col.el.children;
              for (let i = p; i < p + ROWS && i < kids.length; i++) {
                const k = kids[i] as HTMLElement;
                k.style.visibility = "hidden";
                col.hidden.push(k);
              }
              fin.style.visibility = "visible";
              col.mode = "land";
            }
          }
          if (col.mode === "spin") {
            col.y = y;
            col.el.style.transform = xf(y);
            continue;
          }
        }
        if (col.mode === "land" && col.land) {
          const plan = col.land;
          // A long frame (GC, React commit, thermal throttling) must not teleport the strip: past
          // STEP_MAX the landing clock stalls instead, so the reel slows for a frame, never skips.
          if (raw > STEP_MAX) plan.t0 += raw - STEP_MAX;
          const elapsed = Math.max(0, now - plan.t0);
          const linearMs = plan.v > 0 ? plan.linearPx / plan.v : 0;
          let ny: number;
          if (elapsed <= linearMs) ny = plan.from + plan.v * elapsed;
          else {
            // Quadratic ease-out from the spin speed to rest: velocity is continuous at the switch.
            const u = Math.min(1, (elapsed - linearMs) / plan.easeMs);
            const eased = 1 - (1 - u) * (1 - u);
            const easeFrom = plan.from + plan.linearPx;
            ny = easeFrom + (plan.to - easeFrom) * eased;
          }
          col.y = ny;
          col.el.style.transform = xf(ny);
          const fin = finalRefs.current[c];
          if (fin) fin.style.transform = xf(ny + plan.p * h);
          if (elapsed >= linearMs + plan.easeMs) finish(c, col);
        }
      }
      if (!alive) {
        report();
        return false;
      }
      return true;
    };

    const stop = onFrame(job);
    return () => {
      stop();
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
          const oldCol = frozen ? frozen.olds[c] : null;
          const travel = colTravel(c) && Boolean(filler && oldCol);
          const moving = travel && !landed[c];
          // Final symbols known (landing phase or later): the board strip is mounted, and while this reel
          // still travels it is "staged" (hidden, then carried by the driver into place).
          const finalsKnown = landing || !pending;
          const showHold = !travel && pending && Boolean(oldCol);
          const showNew = travel ? finalsKnown : !pending;
          const staged = moving && showNew;
          const shown = !moving;
          const msPerCell = colAnti ? 22 : fast ? 44 : turbo ? 30 : quick ? 52 : spinPace === "up" ? 156 : 84;
          const drv = colsRef.current[c];
          drv.stop = !pending && (landing || !cascading);
          drv.ms = msPerCell;
          drv.onDone = landedSetters.current[c];
          return (
            <div
              key={c}
              className={[
                "reel-col",
                moving ? "is-charging" : "",
                justLand ? "is-landing" : "",
                colAnti ? "is-anticipate" : "",
              ].join(" ")}
              style={{ ["--c" as string]: String(c) } as CSSProperties}
            >
              {travel && filler && oldCol ? (
                <TravelColumn key={`${token}-${c}`} filler={filler} oldCol={oldCol} bind={binds.current[c]} />
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
                <div ref={travel ? finalBinds.current[c] : undefined} className={`strip${staged ? " is-staged" : ""}`}>
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
                        tease={shown && anticipate && !pending && cell.kind === "scatter"}
                        slam={shown && justLand && cell.kind === "scatter"}
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
    let b = () => {};
    const a = nextFrame(() => {
      b = nextFrame(() => setLaunched(true));
    });
    return () => {
      a();
      b();
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
