import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { COLS, ROWS, symbolSrc, type Cell } from "@/lib/slot/symbols";

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
}

function CellView({
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
}) {
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
        cell.kind === "park" ? `is-park is-ticket-${cell.ticket ?? "stat"}` : "",
        cell.kind === "mult" ? "is-mult" : "",
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
      ].join(" ")}
      style={style}
      data-rc={`${r}-${c}`}
    >
      {!cell.gone && (
        <img src={symbolSrc(cell)} alt="" draggable={false} className="cell-img" />
      )}
      {!cell.gone && cell.kind === "scatter" && <span className="scatter-label">SCATTER</span>}
      {!cell.gone && cell.kind === "park" && <span className="scatter-label">LÍSTOK</span>}
      {!cell.gone && cell.kind === "mult" && <span className="mult-tag">{cell.mult}X</span>}
      {!cell.gone && win && <span className="win-fx" aria-hidden="true" />}
      {hot && <span className="orb-strike" aria-hidden="true" />}
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
}

function symbolAt(filler: Cell[], oldCol: Cell[], index: number): Cell {
  const n = filler.length;
  const oldStart = n * 3;
  if (index >= oldStart && index < oldStart + oldCol.length) return oldCol[index - oldStart];
  return filler[((index % n) + n) % n];
}

type DriverCol = {
  el: HTMLDivElement | null;
  n: number;
  mode: "spin" | "arm" | "land" | "done";
  y: number;
  stop: boolean;
  finals: Cell[] | null;
  ms: number;
  land: { t0: number; from: number; linearPx: number; v: number; easeMs: number } | null;
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
}: Props) {
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

    const tick = (now: number) => {
      const dt = Math.min(32, now - last);
      last = now;
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
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [token, reduced]);

  return (
    <div
      className="reel-frame"
      aria-label="Herné pole 6×5"
      onClick={onTap}
    >
      <div className="frame-skin" aria-hidden="true" />
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
      </div>
    </div>
  );
}
