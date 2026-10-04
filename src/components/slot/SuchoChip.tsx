import { RP_PROTECT_FLOOR, SUCHO_GRACE, SUCHO_WARN, suchoLeft } from "@/lib/slot/rp-tickets";

interface Props {
  /** Paid spins without a ticket (SUCHO counter). */
  idle: number;
  /** League is 4KA TV or higher (SUCHO applies). */
  league: boolean;
  ticketActive: boolean;
  rp: number;
  onOpen?: () => void;
}

/**
 * SUCHO indicator under the rank chip: countdown to −1 RP/spin, a pulsing warning from 30 spins,
 * "running" past 40 and "paused" while a ticket runs. Hidden below 4KA TV league.
 */
export function SuchoChip({ idle, league, ticketActive, rp, onOpen }: Props) {
  if (!league) return null;
  const left = suchoLeft(idle);
  const floor = rp <= RP_PROTECT_FLOOR;
  let tone = "is-calm";
  let main: string;
  let sub: string;
  if (ticketActive) {
    tone = "is-paused";
    main = "TIKET BEŽÍ";
    sub = "SUCHO stojí";
  } else if (floor) {
    tone = "is-floor";
    main = "SUCHO";
    sub = `chránené ${RP_PROTECT_FLOOR.toLocaleString("sk-SK")} RP`;
  } else if (left === 0) {
    tone = "is-on";
    main = "SUCHO";
    sub = "−1 RP / spin";
  } else {
    tone = idle >= SUCHO_WARN[0] ? "is-warn" : "is-calm";
    main = `SUCHO o ${left}`;
    sub = left === 1 ? "spin" : left <= 4 ? "spiny" : "spinov";
  }
  const pct = ticketActive ? 0 : Math.min(100, (Math.min(idle, SUCHO_GRACE) / SUCHO_GRACE) * 100);
  return (
    <button
      type="button"
      className={`sucho-chip ${tone}`}
      onClick={onOpen}
      aria-label={`${main} · ${sub}`}
      title="SUCHO: od 4KA TV ligy každý platený spin bez tiketu po 40 spinoch −1 RP. Tiket SUCHO zastaví, splnený tiket ho vynuluje."
    >
      <b>{main}</b>
      <small>{sub}</small>
      <i style={{ width: `${pct}%` }} aria-hidden="true" />
    </button>
  );
}
