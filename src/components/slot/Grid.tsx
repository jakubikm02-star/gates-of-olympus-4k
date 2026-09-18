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
  holdGrid: Cell[][] | null;
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
  fast?: boolean;
  onTap?: () => void;
}

function jag(x0: number, y0: number, x1: number, y1: number): string {
  const n = 6;
  let d = `M ${x0} ${y0}`;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const j = i < n ? (i % 2 === 0 ? 5 : -5) : 0;
    d += ` L ${x0 + (x1 - x0) * t + j} ${y0 + (y1 - y0) * t}`;
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
    ...(tumbleFall && !reduced && !dumping && !dropping
      ? {
          ["--fall"]: String(tumbleFall),
          animation: `cell-drop ${280 + tumbleFall * 55}ms cubic-bezier(0.16, 0.84, 0.28, 1) both`,
        }
      : {}),
  } as CSSProperties;
  return (
    <div
      className={[
        "cell",
        cell.gone ? "is-hole" : "",
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
        dropping && !reduced ? "is-drop" : "",
      ].join(" ")}
      style={style}
    >
      {!cell.gone && (
        <img src={symbolSrc(cell)} alt="" draggable={false} className="cell-img" />
      )}
      {!cell.gone && cell.kind === "scatter" && <span className="scatter-label">SCATTER</span>}
      {!cell.gone && cell.kind === "mult" && <span className="mult-tag">{cell.mult}X</span>}
      {!cell.gone && win && <span className="win-fx" aria-hidden="true" />}
      {hot && <span className="orb-strike" aria-hidden="true" />}
      {popping && win && (
        <span className="pop-burst" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <i key={i} style={{ ["--i" as string]: String(i) } as CSSProperties} />
          ))}
        </span>
      )}
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
  strike,
  expiredUids,
  clusterPay,
  reduced,
  fast,
  onTap,
}: Props) {
  const cascading = spinning || landing;
  const bolt = strike
    ? jag((strike.c + 0.5) * 100, -8, (strike.c + 0.5) * 100, (strike.r + 0.5) * 100)
    : "";
  return (
    <div className="reel-frame" aria-label="Herné pole 6×5" onClick={onTap}>
      <div
        className={`reel-window ${spinning ? "is-spinning" : ""} ${landing ? "is-landing" : ""} ${anticipate ? "is-anticipate" : ""} ${activatingMult ? "is-zeus-strike" : ""} ${fast ? "is-fast" : ""}`}
      >
        {Array.from({ length: COLS }, (_, c) => {
          const pending = cascading && c >= stoppedCols;
          const landed = landing && c < stoppedCols;
          const justLand = landing && c === stoppedCols - 1;
          const showHold = Boolean(holdGrid) && (spinning || pending || landed);
          const dumpHold = landed;
          const showNew = !spinning && (!landing || landed);
          const dropNew = landed;
          const colAnti = anticipate && pending;
          const hold = holdGrid ?? grid;
          return (
            <div
              key={c}
              className={[
                "reel-col",
                spinning && pending ? "is-charging" : "",
                dumpHold && showHold ? "is-dumping" : "",
                dropNew ? "is-filling" : "",
                justLand ? "is-landing" : "",
                colAnti ? "is-anticipate" : "",
              ].join(" ")}
              style={{ ["--c" as string]: String(c) } as CSSProperties}
            >
              {showHold ? (
                <div className={`strip strip-hold ${dumpHold ? "is-dumping" : ""}`}>
                  {Array.from({ length: ROWS }, (_, r) => (
                    <CellView
                      key={`h-${hold[r][c].uid}`}
                      cell={hold[r][c]}
                      r={r}
                      c={c}
                      win={false}
                      popping={false}
                      reduced={reduced}
                      dumping={dumpHold}
                      dropping={false}
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
                <div className={`strip ${dropNew ? "is-filling" : ""}`}>
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
                        dropping={dropNew}
                        hot={struckUids.includes(cell.uid)}
                        dormant={cell.kind === "mult" && !struckUids.includes(cell.uid) && !cascading}
                        tease={anticipate && landed && cell.kind === "scatter"}
                        slam={justLand && (cell.kind === "scatter" || cell.kind === "mult")}
                        expired={expiredUids.includes(cell.uid)}
                        tumbleFall={cell.fall ?? 0}
                      />
                    );
                  })}
                </div>
              ) : null}
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
            <path d={bolt} fill="none" stroke="#7ae7ff" strokeWidth="7" opacity="0.32" />
            <path d={bolt} fill="none" stroke="#fff4b0" strokeWidth="2.2" />
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
