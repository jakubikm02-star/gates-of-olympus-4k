import type { CSSProperties } from "react";
import { COLS, ROWS, symbolName, symbolSrc, type Cell } from "@/lib/slot/symbols";

interface Props {
  grid: Cell[][];
  winMask: boolean[][] | null;
  spinning: boolean;
  landing: boolean;
  popping: boolean;
  reduced: boolean;
}

function CellView({
  cell,
  win,
  popping,
  reduced,
  spinning,
}: {
  cell: Cell;
  win: boolean;
  popping: boolean;
  reduced: boolean;
  spinning: boolean;
}) {
  const fall = cell.fall ?? 0;
  return (
    <div
      className={[
        "cell",
        win ? "is-win" : "",
        cell.kind === "scatter" ? "is-scatter" : "",
        cell.kind === "mult" ? "is-mult" : "",
        popping && win ? "is-pop" : "",
      ].join(" ")}
      style={
        fall && !reduced && !spinning
          ? ({
              ["--fall" as string]: String(fall),
              animation: `cell-drop ${260 + fall * 70}ms cubic-bezier(0.22, 1.25, 0.36, 1) both`,
            } as CSSProperties)
          : undefined
      }
    >
      <img src={symbolSrc(cell)} alt={symbolName(cell)} draggable={false} className="cell-img" />
      {cell.kind === "scatter" && <span className="scatter-label">SCATTER</span>}
      {cell.kind === "mult" && <span className="mult-tag">{cell.mult}X</span>}
      {win && <span className="win-fx" aria-hidden="true" />}
    </div>
  );
}

export function SlotGrid({ grid, winMask, spinning, landing, popping, reduced }: Props) {
  return (
    <div className="reel-frame" aria-label="Herné pole 6×5">
      <div className={`reel-window ${spinning ? "is-spinning" : ""} ${landing ? "is-landing" : ""}`}>
        {Array.from({ length: COLS }, (_, c) => {
          const visible = Array.from({ length: ROWS }, (_, r) => grid[r][c]);
          const strip = spinning ? [...visible, ...visible, ...visible] : visible;
          return (
            <div
              key={c}
              className={[
                "reel-col",
                spinning ? "is-spinning" : "",
                landing ? "is-landing" : "",
              ].join(" ")}
              style={{ ["--c" as string]: String(c) } as CSSProperties}
            >
              <div className="strip">
                {strip.map((cell, i) => (
                  <CellView
                    key={spinning ? `${c}-${i}-${cell.uid}` : cell.uid}
                    cell={cell}
                    win={!spinning && i < ROWS && !!winMask?.[i]?.[c]}
                    popping={popping}
                    reduced={reduced}
                    spinning={spinning}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
