import { formatMoney } from "@/lib/slot/format";
import { jobClock, jobLeft, spinWord, type JobCard } from "@/lib/slot/spend";

interface Props {
  open: boolean;
  onClose: () => void;
  credit: number;
  job: JobCard | null;
  offer: JobCard[] | null;
  onJob: (card: JobCard) => void;
}

export function SpendSheet({ open, onClose, credit, job, offer, onJob }: Props) {
  if (!open) return null;
  const picks = (offer ?? []).filter((c) => !c.mystery);
  const mystery = (offer ?? []).find((c) => c.mystery);
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
          Od 100 €. Cena aj výhra podľa kreditu a aktuálnej stávky. Po prijatí ostane stávka zamknutá, kým
          zákazka neskončí. Kúpa PARKNET zákazku neplní — počíta sa iba základná hra. Tri na výber, alebo
          namiešaná náhoda s bonusovou výhrou.
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
              {picks.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  className={`spend-job ${card.floor}`}
                  disabled={credit < card.stake}
                  onClick={() => onJob(card)}
                >
                  <em>{card.title}</em>
                  <span>{card.detail}</span>
                  <strong className="spend-dead">
                    do {card.limit} {spinWord(card.limit)} · stávka {formatMoney(card.lockBet)}
                  </strong>
                  <b>
                    {formatMoney(card.stake)} → {formatMoney(card.payout)}
                  </b>
                </button>
              ))}
            </div>
            {mystery ? (
              <button
                type="button"
                className={`spend-job mystery ${mystery.floor}`}
                disabled={credit < mystery.stake}
                onClick={() => onJob(mystery)}
              >
                <em>NÁHODA</em>
                <span>
                  {mystery.title} · {mystery.detail} · +15 % výhra
                </span>
                <strong className="spend-dead">
                  do {mystery.limit} {spinWord(mystery.limit)} · stávka {formatMoney(mystery.lockBet)}
                </strong>
                <b>
                  {formatMoney(mystery.stake)} → {formatMoney(mystery.payout)}
                </b>
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}