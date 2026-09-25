import { useEffect } from "react";
import { RankMark } from "./RankBadge";
import { BANDS, NEKONECNO_FLOOR, RANK_PERKS, RANK_REWARDS, RANKS, perkOf, type Standing } from "@/lib/slot/ranks";

const ROMAN = ["", "I", "II", "III", "IV"];

interface Props {
  open: boolean;
  onClose: () => void;
  stand: Standing;
  peak: number;
  shield: boolean;
  streak?: number;
  weekDue?: number;
  weekTarget?: Standing;
}

export function RankPanel({ open, onClose, stand, peak, shield, streak = 0, weekDue = 0, weekTarget }: Props) {
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
  const perk = perkOf(stand.id);

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
          RP rastú zo sumy, výšky stávky, násobiča, série, tumble a bannerov. Vyššia stávka = viac RP.
          Aktívna liga dáva herný perk (ante, cashback, extra FS, zľava na buy, lístky) — nie extra RP.
          Každý týždeň klesáš o jednu skupinu na IV predchádzajúcej ligy (4KA TV II → SMART IV).
        </p>
        {weekDue > 0 && weekTarget && stand.rankIndex > 0 && (
          <p className="rank-now-streak">
            Ďalší drop o {Math.max(0, Math.ceil((weekDue - Date.now()) / 86_400_000))} d. → {weekTarget.name}
            {weekTarget.roman ? ` ${weekTarget.roman}` : ""}
          </p>
        )}
        {streak >= 2 && <p className="rank-now-streak">Séria {streak} výhier po sebe</p>}

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
            <small className="rank-perk-now">
              PERK · {perk.title} — {perk.detail}
            </small>
          </div>
        </div>

        <h3 className="rank-sec">Bonusy ligy</h3>
        <ul className="rank-perks">
          {RANK_PERKS.map((p) => {
            const rank = RANKS.find((r) => r.id === p.id);
            const current = p.id === stand.id;
            return (
              <li
                key={p.id}
                className={`rk-${p.id} ${current ? "is-now" : ""}`}
                style={{ ["--rk" as string]: rank?.color ?? "#8d939b", ["--rk-ink" as string]: rank?.ink ?? "#e8eaee" }}
              >
                <span className="rank-shield sm" aria-hidden="true">
                  <RankMark id={p.id} size={14} />
                </span>
                <div>
                  <strong>
                    {rank?.name} · {p.title}
                  </strong>
                  <span>{p.detail}</span>
                </div>
              </li>
            );
          })}
        </ul>

        <ul className="rank-rewards">
          {RANK_REWARDS.map((row) => (
            <li key={row.id}>
              <strong>{row.title}</strong>
              <span>{row.detail}</span>
            </li>
          ))}
        </ul>

        <ol className="rank-ladder">
          {RANKS.map((r, i) => {
            const reached = peak >= (BANDS.find((b) => b.rankIndex === i)?.floor ?? 0);
            const current = stand.rankIndex === i;
            const rowPerk = perkOf(r.id);
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
                  <em>
                    {r.product} · {rowPerk.title}
                  </em>
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
                  <span className="rank-pips lone">{r.id === "nekonecno" ? "VRCHOL" : "MASTER"}</span>
                )}
              </li>
            );
          })}
        </ol>
        <p className="rank-credits">Kenney.nl · game-icons.net · ambientCG · Wenrexa</p>
      </div>
    </div>
  );
}
