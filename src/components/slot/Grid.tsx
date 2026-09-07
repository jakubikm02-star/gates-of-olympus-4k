import { COLS, symbolName, symbolSrc, type Cell } from "@/lib/slot/symbols";

interface Props {
  grid: Cell[][];
  winMask: boolean[][] | null;
  spinning: boolean;
  reduced: boolean;
}

export function SlotGrid({ grid, winMask, spinning, reduced }: Props) {
  return (
    <div className="reel-frame" aria-label="Herné pole 6×5">
      <div className="reel-inner">
        <div
          className={`reel-grid ${spinning ? "is-spinning" : ""}`}
          style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}
        >
          {grid.map((row, r) =>
            row.map((cell, c) => {
              const win = !!winMask?.[r]?.[c];
              const fall = cell.fall ?? 0;
              return (
                <div
                  key={cell.uid}
                  className={[
                    "cell",
                    win ? "is-win" : "",
                    cell.kind === "scatter" ? "is-scatter" : "",
                    cell.kind === "mult" ? "is-mult" : "",
                    spinning ? "is-spinning" : "",
                  ].join(" ")}
                  style={
                    fall && !reduced
                      ? {
                          transform: `translateY(${-fall * 100}%)`,
                          animation: `cell-drop 420ms cubic-bezier(0.22,1,0.36,1) forwards`,
                        }
                      : undefined
                  }
                >
                  <img
                    src={symbolSrc(cell)}
                    alt={symbolName(cell)}
                    draggable={false}
                    className="cell-img"
                  />
                  {cell.kind === "mult" && (
                    <span className="mult-tag">×{cell.mult}</span>
                  )}
                </div>
              );
            }),
          )}
        </div>
      </div>
      <div className="reel-shine" aria-hidden="true" />
    </div>
  );
}

