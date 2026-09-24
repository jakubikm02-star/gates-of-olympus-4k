import { jobLcd, type JobCard } from "@/lib/slot/spend";

export function TicketLcd({ job, verdict }: { job: JobCard; verdict: "run" | "ok" | "fail" }) {
  const lcd = jobLcd(job, verdict);
  return (
    <div className={`ticket-lcd is-${verdict}`} aria-live={verdict === "run" ? "off" : "polite"}>
      <div className="nf-bezel">
        <div className="nf-screen">
          <header>
            <span className="nf-brand">NOYAFA</span>
            <strong>{lcd.header}</strong>
            <i className="nf-bat" aria-hidden="true">
              <b />
              <b />
              <b />
            </i>
          </header>
          <ol>
            {lcd.rows.map((row) => (
              <li key={row.pin}>
                <b>{row.pin}</b>
                <em>{row.label}</em>
                <span>{row.value}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
