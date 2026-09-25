import { jobLcd, type JobCard } from "@/lib/slot/spend";

function mark(dir: "down" | "up") {
  const arrow = dir === "down" ? "M12 7v8M8.5 12.5 12 16l3.5-3.5" : "M12 17V9M8.5 11.5 12 8l3.5 3.5";
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d={arrow} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function lead(value: string | undefined): string {
  if (!value || value === "----") return "----";
  return value.split("/")[0]?.trim() || value;
}

export function TicketLcd({ job, verdict }: { job: JobCard; verdict: "run" | "ok" | "fail" }) {
  const lcd = jobLcd(job, verdict);
  const at = (pin: number) => lcd.rows.find((row) => row.pin === pin)?.value ?? "----";
  const title = lcd.header === "PASS" ? "ÚSPEŠNÝ" : lcd.header === "FAIL" ? "NEÚSPEŠNÝ" : "TIKET";
  return (
    <div className={`ticket-lcd is-${verdict}`} aria-live={verdict === "run" ? "off" : "polite"}>
      <div className="res-panel">
        <p className="res-title">{title}</p>
        <p className="res-goal">{at(1)}</p>
        <p className="res-section">PRIEBEH</p>
        <div className="res-pair">
          <article className="res-box is-cyan">
            <header>
              {mark("down")} HOTOVÉ
            </header>
            <strong>{at(3)}</strong>
            <small>treba {at(4)}</small>
          </article>
          <article className="res-box is-violet">
            <header>
              {mark("up")} SPINY
            </header>
            <strong>{lead(at(2))}</strong>
            <small>{at(2)}</small>
          </article>
        </div>
        <p className="res-section">ZOSTÁVA</p>
        <div className="res-cols">
          <div className="is-gold">
            <span>TREBA</span>
            <b>{at(4)}</b>
          </div>
          <div className="is-cyan">
            <span>MAX</span>
            <b>{at(5)}</b>
          </div>
          <div className="is-violet">
            <span>STAV</span>
            <b>{at(6)}</b>
          </div>
        </div>
        <p className="res-loss">BANK</p>
        <p className="res-loss-n">{at(7)}</p>
      </div>
    </div>
  );
}
