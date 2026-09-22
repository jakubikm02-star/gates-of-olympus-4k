import { useState, useEffect } from "react";
import { formatMoney } from "@/lib/slot/format";
import { jobClock, jobLeft, jobMeter, jobScopeLabel, spinWord, type JobCard } from "@/lib/slot/spend";

interface Props {
  open: boolean;
  onClose: () => void;
  credit: number;
  job: JobCard | null;
  offer: JobCard[] | null;
  onJob: (card: JobCard) => void;
}

export function SpendSheet({ open, onClose, credit, job, offer, onJob }: Props) {
  const [otrsFail, setOtrsFail] = useState(false);
  const [otrsAck, setOtrsAck] = useState(false);
  useEffect(() => {
    if (!open) setOtrsFail(false);
  }, [open]);
  useEffect(() => {
    setOtrsAck(false);
  }, [job?.id]);
  if (!open) return null;
  const picks = (offer ?? []).filter((c) => !c.mystery);
  const mystery = (offer ?? []).find((c) => c.mystery);
  const reveal = Boolean(job?.mystery && !otrsAck);
  return (
    <div
      className="modal-back"
      onClick={() => {
        if (reveal) return;
        onClose();
      }}
      role="presentation"
    >
      <div
        className="modal-card spend-card"
        role="dialog"
        aria-labelledby="spend-title"
        onClick={(e) => e.stopPropagation()}
      >
        {reveal && job ? (
          <>
            <header className="modal-head">
              <h2 id="spend-title">OTRS OTVORENÝ</h2>
            </header>
            <p className="modal-lead">Úloha, podmienky, cena a zisk sú teraz známe.</p>
            <div className="otrs-note">
              <em>{job.title}</em>
              <span>{job.detail}</span>
              <strong>
                {jobClock(job)} · stávka {formatMoney(job.lockBet || 0)} zamknutá
              </strong>
              <b>
                cena {formatMoney(job.stake)} · zisk {formatMoney(job.payout)}
              </b>
            </div>
            <button
              type="button"
              className="chip-btn gold"
              onClick={() => {
                setOtrsAck(true);
                onClose();
              }}
            >
              POTVRDIŤ
            </button>
          </>
        ) : (
          <>
            <header className="modal-head">
              <h2 id="spend-title">ZÁKAZKY</h2>
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Zavrieť">
                ×
              </button>
            </header>
            <p className="modal-lead">
              Od 100 €. Cena aj výhra podľa kreditu a aktuálnej stávky. BASE ide len v základnej hre,
              LIVE len v PARKNET. Kúpa PARKNET BASE neplní. POHOTOVOSŤ a TACHYKARDIA platia v LIVE.
              Tri na výber, alebo skontrolovať OTRS.
            </p>

            {job ? (
              <p className={`spend-active ${jobLeft(job) <= 5 ? "is-late" : ""}`}>
                {job.title} · {jobMeter(job)}
                <span>
                  {jobScopeLabel(job)} · {jobClock(job)} · stávka {formatMoney(job.lockBet || 0)} zamknutá
                </span>
              </p>
            ) : (
              <>
                <div className="spend-jobs">
                  {picks.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      className={`spend-job ${card.floor} ${card.scope === "live" ? "is-live" : ""} ${card.scope === "any" ? "is-any" : ""}`}
                      disabled={credit < card.stake}
                      onClick={() => onJob(card)}
                    >
                      <em>{card.title}</em>
                      <span>{jobScopeLabel(card)} · {card.detail}</span>
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
                    className="spend-job mystery"
                    onClick={() => {
                      if (credit < mystery.stake) {
                        setOtrsFail(true);
                        return;
                      }
                      setOtrsFail(false);
                      onJob(mystery);
                    }}
                  >
                    <em>SKONTROLOVAŤ OTRS</em>
                    <span>Neznáma úloha. Cena aj zisk až po prijatí.</span>
                  </button>
                ) : null}
                {otrsFail ? <p className="spend-active is-late">OTRS zamietnutý · málo kreditu</p> : null}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
