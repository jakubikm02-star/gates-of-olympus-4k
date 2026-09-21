import { formatMoney } from "@/lib/slot/format";
import { jobClock, jobLeft, type JobCard } from "@/lib/slot/spend";

interface Props {
  open: boolean;
  onClose: () => void;
  credit: number;
  job: JobCard | null;
  offer: JobCard[] | null;
  rerollCost: number;
  onJob: (card: JobCard) => void;
  onReroll: () => void;
}

export function SpendSheet({ open, onClose, credit, job, offer, rerollCost, onJob, onReroll }: Props) {
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
          <h2 id="spend-title">ZÁKAZKY</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Zavrieť">
            ×
          </button>
        </header>
        <p className="modal-lead">
          Od 100 €. Cena aj výhra podľa kreditu a aktuálnej stávky. Po kúpe ostane stávka zamknutá, kým zákazka
          neskončí — zmeniť ju počas hry nejde.
        </p>

        {job ? (
          <p className={`spend-active ${jobLeft(job) <= 5 ? "is-late" : ""}`}>
            {job.title} · {job.have}/{job.need}
            <span>
              {jobClock(job)} · stávka {formatMoney(job.lockBet || 0)} zamknutá
            </span>
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
                  <strong className="spend-dead">do {card.limit} točení · lock {formatMoney(card.lockBet)}</strong>
                  <b>
                    {formatMoney(card.stake)} → {formatMoney(card.payout)}
                  </b>
                </button>
              ))}
            </div>
            <button type="button" className="chip-btn" disabled={credit < rerollCost} onClick={onReroll}>
              REROLL {formatMoney(rerollCost)}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
