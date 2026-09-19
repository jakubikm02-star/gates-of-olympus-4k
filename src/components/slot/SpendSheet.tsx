import { formatMoney } from "@/lib/slot/format";
import { TIER_BY_ID, type TierId } from "@/lib/slot/jackpot";
import {
  type JobCard,
  type ShiftDef,
  type ShiftId,
} from "@/lib/slot/spend";

interface Props {
  open: boolean;
  onClose: () => void;
  credit: number;
  bet: number;
  shift: { id: ShiftId; left: number; name: string } | null;
  job: JobCard | null;
  offer: JobCard[] | null;
  topupAmt: Partial<Record<TierId, number>>;
  shifts: readonly ShiftDef[];
  topupTiers: TierId[];
  topupAmounts: readonly number[];
  rerollCost: number;
  onShift: (id: ShiftId) => void;
  onTopup: (id: TierId, amount: number) => void;
  onJob: (card: JobCard) => void;
  onReroll: () => void;
}

export function SpendSheet({
  open,
  onClose,
  credit,
  bet,
  shift,
  job,
  offer,
  topupAmt,
  shifts,
  topupTiers,
  topupAmounts,
  rerollCost,
  onShift,
  onTopup,
  onJob,
  onReroll,
}: Props) {
  if (!open) return null;
  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <div
        className="modal-card spend-card"
        role="dialog"
        aria-labelledby="spend-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2 id="spend-title">MÍŇAŤ</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Zavrieť">
            ×
          </button>
        </header>
        <p className="modal-lead">Prebytok. Jedna smena, jeden pot, jedna zákazka.</p>

        <h3 className="spend-h">Smena</h3>
        {shift ? (
          <p className="spend-active">
            {shift.name} · {shift.left} spinov
          </p>
        ) : (
          <div className="spend-grid">
            {shifts.map((s) => {
              const cost = +(s.costX * bet).toFixed(2);
              const ok = credit >= cost;
              return (
                <button
                  key={s.id}
                  type="button"
                  className="spend-tile"
                  disabled={!ok}
                  onClick={() => onShift(s.id)}
                >
                  <em>{s.name}</em>
                  <span>{s.note}</span>
                  <b>{formatMoney(cost)}</b>
                </button>
              );
            })}
          </div>
        )}

        <h3 className="spend-h">Dobiť pot</h3>
        <div className="spend-grid">
          {topupTiers.map((id) => {
            const used = Boolean(topupAmt[id]);
            return (
              <div key={id} className={`spend-tile is-static ${used ? "is-used" : ""}`}>
                <em>{TIER_BY_ID[id].name}</em>
                <span>{used ? `+${formatMoney(topupAmt[id] ?? 0)}` : "1:1, raz za reláciu"}</span>
                <div className="spend-amts">
                  {topupAmounts.map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={used || credit < n}
                      onClick={() => onTopup(id, n)}
                    >
                      {formatMoney(n)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <h3 className="spend-h">Zákazka</h3>
        {job ? (
          <p className="spend-active">
            {job.title} · {job.have}/{job.need} · {job.spun}/{job.limit}
          </p>
        ) : (
          <>
            <div className="spend-jobs">
              {(offer ?? []).map((card) => (
                <button
                  key={card.id}
                  type="button"
                  className={`spend-job ${card.floor}`}
                  disabled={credit < card.stake}
                  onClick={() => onJob(card)}
                >
                  <em>{card.title}</em>
                  <span>{card.detail}</span>
                  <b>
                    {formatMoney(card.stake)} → {formatMoney(card.payout)}
                  </b>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="chip-btn"
              disabled={credit < rerollCost}
              onClick={onReroll}
            >
              REROLL {formatMoney(rerollCost)}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
