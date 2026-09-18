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
  cam?: "stop" | "scatter" | "tumble" | null;
  spinPace?: "up" | "full";
  spinStrips?: Cell[][] | null;
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
    ...(tumbleFall && !reduced
      ? {
          ["--fall"]: String(tumbleFall),
          animation: `cell-drop 200ms cubic-bezier(0.42, 0, 1, 1) both`,
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
        cell.kind === "park" ? "is-park" : "",
        cell.kind === "mult" ? "is-mult" : "",
        hot ? "is-struck" : "",
        dormant ? "is-dormant" : "",
        popping && win ? "is-pop" : "",
        tease ? "is-tease" : "",
        slam ? "is-slam" : "",
        expired ? "is-expired" : "",
        dumping && !reduced ? "is-dump" : "",
      ].join(" ")}
      style={style}
    >
      {!cell.gone && (
        <img src={symbolSrc(cell)} alt="" draggable={false} className="cell-img" />
      )}
      {!cell.gone && cell.kind === "scatter" && <span className="scatter-label">SCATTER</span>}
      {!cell.gone && cell.kind === "park" && <span className="scatter-label">JACKPOT</span>}
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
  cam,
  spinPace,
  spinStrips,
}: Props) {
  const cascading = spinning || landing;
  const bolt = strike
    ? jag((strike.c + 0.5) * 100, -8, (strike.c + 0.5) * 100, (strike.r + 0.5) * 100)
    : "";
  return (
    <div
      className={`reel-frame ${cam === "stop" ? "cam-stop" : ""} ${cam === "scatter" ? "cam-scatter" : ""} ${cam === "tumble" ? "cam-tumble" : ""}`}
      aria-label="Herné pole 6×5"
      onClick={onTap}
    >
      <div
        className={`reel-window ${spinning ? "is-spinning" : ""} ${landing ? "is-landing" : ""} ${anticipate ? "is-anticipate" : ""} ${activatingMult ? "is-zeus-strike" : ""} ${fast ? "is-fast" : ""} ${spinPace === "up" ? "is-spin-up" : ""} ${spinPace === "full" ? "is-spin-full" : ""}`}
      >
        {Array.from({ length: COLS }, (_, c) => {
          const pending = cascading && c >= stoppedCols;
          const landed = landing && c < stoppedCols;
          const justLand = landing && c === stoppedCols - 1;
          const reel = spinStrips?.[c] ?? [];
          const showSpin = Boolean(holdGrid) && (pending || landed) && reel.length > 0;
          const showNew = !spinning && (!landing || landed);
          const dropNew = landed;
          const colAnti = anticipate && pending;
          return (
            <div
              key={c}
              className={[
                "reel-col",
                showSpin && pending ? "is-charging" : "",
                landed && showSpin ? "is-dumping" : "",
                dropNew ? "is-filling" : "",
                justLand ? "is-landing" : "",
                colAnti ? "is-anticipate" : "",
              ].join(" ")}
              style={{ ["--c" as string]: String(c), ["--desync" as string]: `${c * 25}ms` } as CSSProperties}
            >
              {showSpin ? (
                <div className={`strip strip-spin ${landed ? "is-exiting" : ""}`}>
                  {reel.map((cell, i) => (
                    <CellView
                      key={`s-${c}-${i}-${cell.uid}`}
                      cell={cell}
                      r={i % ROWS}
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
                        hot={struckUids.includes(cell.uid)}
                        dormant={cell.kind === "mult" && !struckUids.includes(cell.uid) && !cascading}
                        tease={anticipate && landed && cell.kind === "scatter"}
                        slam={justLand && cell.kind === "scatter"}
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
