import { jobLcd, type JobCard } from "@/lib/slot/spend";

function mark(dir: "down" | "up") {
  const arrow = dir === "down" ? "M12 7.5v8M8.6 12.6 12 16l3.4-3.4" : "M12 16.5v-8M8.6 11.4 12 8l3.4 3.4";
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d={arrow} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function cup() {
  return (
    <svg className="res-cup" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 3h8v6.2a4 4 0 0 1-8 0V3zm8 1.2h2.3a2.7 2.7 0 0 1 0 5.4h-2.2a5 5 0 0 0-.1-1.8V4.2zM8 4.2v3.6c0 .6 0 1.2-.1 1.8H5.7a2.7 2.7 0 0 1 0-5.4H8zM10 16h4v1.6h-4V16zm-2 3h8V21H8v-1.8z"
      />
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
        <article className="res-box is-cyan">
          <div className="res-side">
            <header>
              {mark("down")} HOTOVÉ
            </header>
            {cup()}
          </div>
          <strong>{at(3)}</strong>
        </article>
        <p className="res-used">treba {at(4)}</p>
        <article className="res-box is-violet">
          <div className="res-side">
            <header>
              {mark("up")} SPINY
            </header>
            {cup()}
          </div>
          <strong>{lead(at(2))}</strong>
        </article>
        <p className="res-used">{at(2)}</p>
        <p className="res-section">ZOSTÁVA</p>
        <div className="res-cols">
          <div className="is-gold">
            <span>TREBA</span>
            <b>{at(4)}</b>
            <small>hotové {at(3)}</small>
          </div>
          <div className="is-cyan">
            <span>MAX</span>
            <b>{at(5)}</b>
            <small>spiny {lead(at(2))}</small>
          </div>
          <div className="is-violet">
            <span>STAV</span>
            <b>{at(6)}</b>
            <small>{verdict === "ok" ? "výhra" : verdict === "fail" ? "nič" : "beží"}</small>
          </div>
        </div>
        <p className="res-loss">BANK</p>
        <p className="res-loss-n">{at(7)}</p>
      </div>
    </div>
  );
}
