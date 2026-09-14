import { useEffect } from "react";
import { RankMark } from "./RankBadge";
import { BANDS, NEKONECNO_FLOOR, RANKS, type Standing } from "@/lib/slot/ranks";

const ROMAN = ["", "I", "II", "III", "IV"];

interface Props {
  open: boolean;
  onClose: () => void;
  stand: Standing;
  peak: number;
  shield: boolean;
}

export function RankPanel({ open, onClose, stand, peak, shield }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const pct = stand.need > 0 ? Math.min(100, (stand.into / stand.need) * 100) : 100;

  return (
    <div className="modal-back rank-back" onClick={onClose} role="presentation">
      <div
        className="modal-card rank-card"
        role="dialog"
        aria-labelledby="rank-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2 id="rank-title">RANKED · 4KA LIGA</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Zavrieť">
            ×
          </button>
        </header>
        <p className="modal-lead">
          Body za výhru: násobič + suma. Mŕtvy spin berie entry. Štít drží rank raz.
        </p>

        <div
          className={`rank-hero rk-${stand.id}`}
          style={{ ["--rk" as string]: stand.color, ["--rk-ink" as string]: stand.ink }}
        >
          <span className="rank-shield lg" aria-hidden="true">
            <RankMark id={stand.id} size={28} />
          </span>
          <div>
            <em>
              {stand.name}
              {stand.roman ? ` ${stand.roman}` : ""}
            </em>
            <span>{stand.product}</span>
            <i className="rank-mini fat">
              <b style={{ width: `${pct}%` }} />
            </i>
            <small>
              {stand.id === "nekonecno"
                ? `${stand.rp - NEKONECNO_FLOOR} RP`
                : `${stand.into} / ${stand.need} RP`}
              {shield ? " · štít" : ""}
            </small>
          </div>
        </div>

        <ol className="rank-ladder">
          {RANKS.map((r, i) => {
            const reached = peak >= (BANDS.find((b) => b.rankIndex === i)?.floor ?? 0);
            const current = stand.rankIndex === i;
            return (
              <li
                key={r.id}
                className={`rk-${r.id} ${current ? "is-now" : ""} ${reached ? "is-hit" : ""}`}
                style={{ ["--rk" as string]: r.color, ["--rk-ink" as string]: r.ink }}
              >
                <span className="rank-shield sm" aria-hidden="true">
                  <RankMark id={r.id} size={14} />
                </span>
                <div className="rank-lad-meta">
                  <strong>{r.name}</strong>
                  <em>{r.product}</em>
                </div>
                {r.divisions > 1 ? (
                  <span className="rank-pips" aria-hidden="true">
                    {[4, 3, 2, 1].map((d) => {
                      const floor = BANDS.find((b) => b.rankIndex === i && b.division === d)?.floor ?? Infinity;
                      const on = peak >= floor;
                      const lit = current && stand.division > 0 && stand.division <= d;
                      return (
                        <i key={d} className={lit ? "on" : on ? "on dim" : ""}>
                          {ROMAN[d]}
                        </i>
                      );
                    })}
                  </span>
                ) : (
                  <span className="rank-pips lone">{r.id === "nekonecno" ? "PREDATOR" : "MASTER"}</span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
