import { useState, useEffect } from "react";
import { formatMoney } from "@/lib/slot/format";
import { jobClock, jobLeft, jobMeter, jobScopeLabel, spinWord, type DailyBoard, type JobCard } from "@/lib/slot/spend";

interface Props {
  open: boolean;
  onClose: () => void;
  credit: number;
  job: JobCard | null;
  daily: DailyBoard | null;
  offer: JobCard[] | null;
  onJob: (card: JobCard) => void;
}

export function SpendSheet({ open, onClose, credit, job, daily, offer, onJob }: Props) {
  const [otrsFail, setOtrsFail] = useState(false);
  const [otrsAck, setOtrsAck] = useState(false);
  useEffect(() => {
    if (!open) setOtrsFail(false);
  }, [open]);
  useEffect(() => {
    setOtrsAck(false);
  }, [job?.id]);
  if (!open) return null;
  const cards = daily?.cards ?? [];
  const marks = daily?.marks ?? [];
  const mystery = (offer ?? []).find((c) => c.mystery) ?? null;
  const done = cards.length === 3 && marks.every(Boolean);
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
              <span>{job.goal || job.detail}</span>
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
              <h2 id="spend-title">TIKETY</h2>
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Zavrieť">
                ×
              </button>
            </header>
            <p className="modal-lead">
              {done
                ? "Denné výzvy sú hotové. Dnes ostáva už len OTRS."
                : "Denná výzva. Tri tikety sa losujú raz za deň a zostanú na výber. Po všetkých troch ostáva OTRS."}
            </p>

            {job && !job.mystery ? (
              <p className={`spend-active ${jobLeft(job) <= 5 ? "is-late" : ""}`}>
                {job.goal || job.detail} · {jobMeter(job)}
                <span>
                  {jobScopeLabel(job)} · {jobClock(job)} · stávka {formatMoney(job.lockBet || 0)} zamknutá
                </span>
              </p>
            ) : null}

            <div className="spend-jobs">
              {cards.map((card, i) => {
                const mark = marks[i];
                const running = job?.id === card.id;
                const locked = Boolean(mark) || Boolean(job) || credit < card.stake;
                return (
                  <button
                    key={card.id}
                    type="button"
                    className={`spend-job ${card.floor} ${card.scope === "live" ? "is-live" : ""} ${card.scope === "any" ? "is-any" : ""} ${mark ? `is-done is-${mark}` : ""} ${running ? "is-run" : ""}`}
                    disabled={locked && !running}
                    onClick={() => {
                      if (locked) return;
                      onJob(card);
                    }}
                  >
                    <span className="spend-body">
                      <em>{card.title}</em>
                      <span>{jobScopeLabel(card)} · {card.detail}</span>
                      <strong className="spend-dead">
                        do {card.limit} {spinWord(card.limit)} · stávka {formatMoney(card.lockBet)}
                      </strong>
                      <b>
                        {formatMoney(card.stake)} → {formatMoney(card.payout)}
                      </b>
                    </span>
                    {mark ? <i className="spend-stamp">{mark === "ok" ? "ÚSPEŠNÝ" : "NEÚSPEŠNÝ"}</i> : null}
                    {running ? <i className="spend-stamp is-run">BEŽÍ</i> : null}
                  </button>
                );
              })}
            </div>
            {!job && mystery ? (
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
            {!job && otrsFail ? <p className="spend-active is-late">OTRS zamietnutý · málo kreditu</p> : null}
          </>
        )}
      </div>
    </div>
  );
}
