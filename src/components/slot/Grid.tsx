import type { CSSProperties } from "react";
import { COLS, symbolName, symbolSrc, type Cell } from "@/lib/slot/symbols";

interface Props {
  grid: Cell[][];
  winMask: boolean[][] | null;
  spinning: boolean;
  landing: boolean;
  popping: boolean;
  reduced: boolean;
}

export function SlotGrid({ grid, winMask, spinning, landing, popping, reduced }: Props) {
  return (
    <div className="reel-frame" aria-label="Herné pole 6×5">
      <span className="frame-corner tl" />
      <span className="frame-corner tr" />
      <span className="frame-corner bl" />
      <span className="frame-corner br" />
      <div className="reel-inner">
        <div
          className={`reel-grid ${spinning ? "is-spinning" : ""} ${landing ? "is-landing" : ""}`}
          style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}
        >
          {grid.map((row, r) =>
            row.map((cell, c) => {
              const win = !!winMask?.[r]?.[c];
              const fall = cell.fall ?? 0;
              const shape = cell.kind === "pay" ? cell.payId : cell.kind;
              return (
                <div
                  key={cell.uid}
                  className={[
                    "cell",
                    shape ? `shape-${shape}` : "",
                    win ? "is-win" : "",
                    cell.kind === "scatter" ? "is-scatter" : "",
                    cell.kind === "mult" ? "is-mult" : "",
                    spinning ? "is-spinning" : "",
                    landing ? "is-landing" : "",
                    popping && win ? "is-pop" : "",
                  ].join(" ")}
                  style={
                    {
                      ["--c" as string]: String(c),
                      ["--fall" as string]: String(fall || 1),
                      ...(fall && !reduced && !spinning
                        ? {
                            animation: `cell-drop ${280 + fall * 70}ms cubic-bezier(0.22, 1.35, 0.36, 1) both`,
                          }
                        : undefined),
                    } as CSSProperties
                  }
                >
                  <div className="sym">
                    <span className="plate gold" aria-hidden="true" />
                    <span className="plate fill" aria-hidden="true" />
                    <img
                      src={symbolSrc(cell)}
                      alt={symbolName(cell)}
                      draggable={false}
                      className="cell-img"
                    />
                    {cell.kind === "scatter" && <span className="scatter-label">SCATTER</span>}
                    {cell.kind === "mult" && <span className="mult-tag">{cell.mult}X</span>}
                  </div>
                  {win && <span className="win-fx" aria-hidden="true" />}
                  {win && <span className="sparks" aria-hidden="true" />}
                </div>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}
