import type { CSSProperties } from "react";
import { COLS, ROWS, symbolSrc, type Cell } from "@/lib/slot/symbols";

export interface ClusterPay {
  x: number;
  y: number;
  amount: string;
}

export interface Strike {
  r: number;
  c: number;
}

interface Props {
  grid: Cell[][];
  winMask: boolean[][] | null;
  spinning: boolean;
  landing: boolean;
  popping: boolean;
  stoppedCols: number;
  anticipate: boolean;
  activatingMult: boolean;
  struckUids: number[];
  strike: Strike | null;
  expiredUids: number[];
  clusterPay: ClusterPay | null;
  reduced: boolean;
  onTap?: () => void;
}

function jaggedPath(x0: number, y0: number, x1: number, y1: number): string {
  const n = 8;
  let d = `M ${x0} ${y0}`;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const j = i < n ? (i % 2 === 0 ? 1 : -1) : 0;
    d += ` L ${x0 + (x1 - x0) * t + j * 16} ${y0 + (y1 - y0) * t + j * -9}`;
  }
  return d;
}

function CellView({
  cell,
  r,
  c,
  win,
  popping,
  reduced,
  dumping,
  waiting,
  dropping,
  hot,
  dormant,
  tease,
  slam,
  expired,
  tumbleFall,
}: {
  cell: Cell;
  r: number;
  c: number;
  win: boolean;
  popping: boolean;
  reduced: boolean;
  dumping: boolean;
  waiting: boolean;
  dropping: boolean;
  hot: boolean;
  dormant: boolean;
  tease: boolean;
  slam: boolean;
  expired: boolean;
  tumbleFall: number;
}) {
  const style = {
    ["--r"]: String(r),
    ["--c"]: String(c),
    ...(tumbleFall && !reduced && !dumping && !waiting && !dropping
      ? {
          ["--fall"]: String(tumbleFall),
          animation: `cell-drop ${240 + tumbleFall * 70}ms cubic-bezier(0.2, 0.9, 0.32, 1) both`,
        }
      : {}),
  } as CSSProperties;
  return (
    <div
      className={[
        "cell",
        win ? "is-win" : "",
        cell.kind === "scatter" ? "is-scatter" : "",
        cell.kind === "mult" ? "is-mult" : "",
        hot ? "is-struck" : "",
        dormant ? "is-dormant" : "",
        popping && win ? "is-pop" : "",
        tease ? "is-tease" : "",
        slam ? "is-slam" : "",
        expired ? "is-expired" : "",
        dumping && !reduced ? "is-dump" : "",
        waiting && !reduced ? "is-wait" : "",
        dropping && !reduced ? "is-drop" : "",
      ].join(" ")}
      style={style}
    >
      <img src={symbolSrc(cell)} alt="" draggable={false} className="cell-img" />
      {cell.kind === "scatter" && <span className="scatter-label">SCATTER</span>}
      {cell.kind === "mult" && <span className="mult-tag">{cell.mult}X</span>}
      {win && <span className="win-fx" aria-hidden="true" />}
      {hot && <span className="orb-strike" aria-hidden="true" />}
    </div>
  );
}

export function SlotGrid({
  grid,
  winMask,
  spinning,
  landing,
  popping,
  stoppedCols,
  anticipate,
  activatingMult,
  struckUids,
  strike,
  expiredUids,
  clusterPay,
  reduced,
  onTap,
}: Props) {
  const bolt = strike
    ? jaggedPath(640, 155, (strike.c + 0.5) * 100, (strike.r + 0.5) * 100)
    : "";
  return (
    <div className="reel-frame" aria-label="Herné pole 6×5" onClick={onTap}>
      <div
        className={`reel-window ${spinning ? "is-spinning" : ""} ${landing ? "is-landing" : ""} ${anticipate ? "is-anticipate" : ""} ${activatingMult ? "is-zeus-strike" : ""}`}
      >
        {Array.from({ length: COLS }, (_, c) => {
          const waiting = landing && c >= stoppedCols;
          const dropping = landing && c < stoppedCols;
          const colLand = landing && c === stoppedCols - 1;
          const colAnti = anticipate && waiting;
          return (
            <div
              key={c}
              className={[
                "reel-col",
                spinning ? "is-dumping" : "",
                waiting ? "is-waiting" : "",
                dropping ? "is-filling" : "",
                colLand ? "is-landing" : "",
                colAnti ? "is-anticipate" : "",
              ].join(" ")}
              style={{ ["--c" as string]: String(c) } as CSSProperties}
            >
              <div className="strip">
                {Array.from({ length: ROWS }, (_, r) => {
                  const cell = grid[r][c];
                  return (
                    <CellView
                      key={cell.uid}
                      cell={cell}
                      r={r}
                      c={c}
                      win={!spinning && !waiting && !!winMask?.[r]?.[c]}
                      popping={popping}
                      reduced={reduced}
                      dumping={spinning}
                      waiting={waiting}
                      dropping={dropping}
                      hot={struckUids.includes(cell.uid)}
                      dormant={cell.kind === "mult" && !struckUids.includes(cell.uid) && !spinning && !waiting}
                      tease={anticipate && !waiting && !spinning && cell.kind === "scatter"}
                      slam={colLand && (cell.kind === "scatter" || cell.kind === "mult")}
                      expired={expiredUids.includes(cell.uid)}
                      tumbleFall={cell.fall ?? 0}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
        {winMask && (
          <div className="spark-layer" aria-hidden="true">
            {Array.from({ length: 18 }, (_, i) => (
              <i key={i} style={{ ["--i" as string]: String(i) } as CSSProperties} />
            ))}
          </div>
        )}
        {strike && (
          <svg className="reel-bolt" viewBox="0 0 600 500" preserveAspectRatio="none" aria-hidden="true">
            <path d={bolt} fill="none" stroke="#3ec6e0" strokeWidth="11" opacity="0.45" />
            <path d={bolt} fill="none" stroke="#f0c419" strokeWidth="4.5" />
          </svg>
        )}
        {clusterPay && (
          <div className="cluster-pay" style={{ left: `${clusterPay.x}%`, top: `${clusterPay.y}%` }}>
            {clusterPay.amount}
          </div>
        )}
      </div>
    </div>
  );
}
