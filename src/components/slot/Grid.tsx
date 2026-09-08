import type { CSSProperties } from "react";
import { COLS, ROWS, symbolName, symbolSrc, type Cell } from "@/lib/slot/symbols";

export interface ClusterPay {
  x: number;
  y: number;
  amount: string;
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
  clusterPay: ClusterPay | null;
  reduced: boolean;
  onTap?: () => void;
}

function CellView({
  cell,
  win,
  popping,
  reduced,
  spinning,
  hot,
  dormant,
  tease,
  slam,
}: {
  cell: Cell;
  win: boolean;
  popping: boolean;
  reduced: boolean;
  spinning: boolean;
  hot: boolean;
  dormant: boolean;
  tease: boolean;
  slam: boolean;
}) {
  const fall = cell.fall ?? 0;
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
      ].join(" ")}
      style={
        fall && !reduced && !spinning
          ? ({
              ["--fall" as string]: String(fall),
              animation: `cell-drop ${280 + fall * 90}ms cubic-bezier(0.22, 1.22, 0.36, 1) both`,
            } as CSSProperties)
          : undefined
      }
    >
      <img src={symbolSrc(cell)} alt={symbolName(cell)} draggable={false} className="cell-img" />
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
  clusterPay,
  reduced,
  onTap,
}: Props) {
  return (
    <div className="reel-frame" aria-label="Herné pole 6×5" onClick={onTap}>
      <div
        className={`reel-window ${spinning ? "is-spinning" : ""} ${landing ? "is-landing" : ""} ${anticipate ? "is-anticipate" : ""} ${activatingMult ? "is-zeus-strike" : ""}`}
      >
        {Array.from({ length: COLS }, (_, c) => {
          const visible = Array.from({ length: ROWS }, (_, r) => grid[r][c]);
          const colSpin = spinning || (landing && c >= stoppedCols);
          const colLand = landing && c === stoppedCols - 1;
          const colAnti = anticipate && colSpin;
          const strip = colSpin ? [...visible, ...visible, ...visible] : visible;
          return (
            <div
              key={c}
              className={[
                "reel-col",
                colSpin ? "is-spinning" : "",
                colLand ? "is-landing" : "",
                colAnti ? "is-anticipate" : "",
              ].join(" ")}
              style={{ ["--c" as string]: String(c) } as CSSProperties}
            >
              <div className="strip">
                {strip.map((cell, i) => (
                  <CellView
                    key={colSpin ? `${c}-${i}-${cell.uid}` : cell.uid}
                    cell={cell}
                    win={!colSpin && i < ROWS && !!winMask?.[i]?.[c]}
                    popping={popping}
                    reduced={reduced}
                    spinning={colSpin}
                    hot={struckUids.includes(cell.uid)}
                    dormant={cell.kind === "mult" && !struckUids.includes(cell.uid) && !colSpin}
                    tease={anticipate && !colSpin && cell.kind === "scatter"}
                    slam={colLand && (cell.kind === "scatter" || cell.kind === "mult")}
                  />
                ))}
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
        {clusterPay && (
          <div className="cluster-pay" style={{ left: `${clusterPay.x}%`, top: `${clusterPay.y}%` }}>
            {clusterPay.amount}
          </div>
        )}
      </div>
    </div>
  );
}
