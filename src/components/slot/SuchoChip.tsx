import { RP_PROTECT_FLOOR, SUCHO_GRACE, SUCHO_WARN, suchoLeft } from "@/lib/slot/rp-tickets";
import type { TicketShield } from "@/lib/slot/sucho-guard";
import { suchoRtpLabel } from "@/lib/slot/sucho-rtp";

interface Props {
  /** Paid spins without a ticket holding SUCHO (SUCHO counter). */
  idle: number;
  /** League is 4KA TV or higher (SUCHO applies). */
  league: boolean;
  /** Open ticket vs SUCHO (lib/slot/sucho-guard): run holds it, buy (waits only for a 4KA TV buy) lets it run, none = no ticket. */
  shield: TicketShield;
  /** SUCHO penalty phase: −1 RP / spin and RTP 96 %. */
  on: boolean;
  /** Payout multiplier while SUCHO runs (display in the tooltip). */
  mul: number;
  rp: number;
  onOpen?: () => void;
}

const pct = (n: number) => `${Math.round(n * 100)} %`;
const spinsWord = (n: number) => (n === 1 ? "spin" : n >= 2 && n <= 4 ? "spiny" : "spinov");

/**
 * SUCHO indicator under the rank chip: countdown to SUCHO, a pulsing warning from 30 spins, the red
 * "SUCHO · RTP 96 %" phase, and the ticket state (holds SUCHO / waits for a buy). Hidden below 4KA TV.
 */
export function SuchoChip({ idle, league, shield, on, mul, rp, onOpen }: Props) {
  if (!league) return null;
  const left = suchoLeft(idle);
  const floor = rp <= RP_PROTECT_FLOOR;
  const rtp = suchoRtpLabel();
  const cut = mul < 1 ? ` Výhry idú ×${mul.toFixed(2).replace(".", ",")} (−${pct(1 - mul)}).` : "";
  const rule =
    `SUCHO: od 4KA TV ligy po ${SUCHO_GRACE} platených spinoch bez tiketu −1 RP za spin a hra vypláca na ${rtp}.` +
    ` Bežiaci tiket SUCHO zastaví na celý čas; nezastaví ho len tiket, ktorý čaká už iba na kúpu 4KA TV.`;
  let tone = "is-calm";
  let main: string;
  let sub: string;
  let tip = rule;
  if (shield === "run") {
    tone = "is-paused";
    main = "TIKET BEŽÍ";
    sub = "SUCHO stojí";
    tip = `Tiket beží, SUCHO stojí, kým ho hráš. ${rule}`;
  } else if (shield === "buy") {
    main = "ČAKÁ NA KÚPU";
    if (on) {
      tone = "is-on";
      sub = "SUCHO beží";
    } else {
      tone = idle >= SUCHO_WARN[0] ? "is-warn" : "is-calm";
      sub = `SUCHO o ${left}`;
    }
    tip = `Tiket čaká už iba na kúpu 4KA TV: SUCHO beží ďalej.${on ? ` −1 RP / spin, ${rtp}.${cut}` : ""} ${rule}`;
  } else if (on) {
    tone = floor ? "is-on is-floor-on" : "is-on";
    main = "SUCHO";
    sub = floor ? `chránené ${RP_PROTECT_FLOOR.toLocaleString("sk-SK")} RP` : "−1 RP / spin";
    tip = `SUCHO beží: ${floor ? "RP chránené" : "−1 RP za spin"} a hra vypláca na ${rtp}.${cut} Končí, keď zoberieš tiket (splnený ho vynuluje). Jackpoty a výplaty tiketov sa nekrátia.`;
  } else {
    tone = idle >= SUCHO_WARN[0] ? "is-warn" : "is-calm";
    main = `SUCHO o ${left}`;
    sub = spinsWord(left);
  }
  const width = shield === "run" ? 0 : Math.min(100, (Math.min(idle, SUCHO_GRACE) / SUCHO_GRACE) * 100);
  return (
    <span className={`sucho-wrap${on ? " is-on" : ""}`}>
      <button
        type="button"
        className={`sucho-chip ${tone}`}
        onClick={onOpen}
        aria-label={`${main} · ${sub}${on ? ` · ${rtp}` : ""}`}
        aria-describedby="sucho-tip"
      >
        <b>{main}</b>
        <small>{sub}</small>
        {on ? <em className="sucho-rtp">{rtp}</em> : null}
        <i style={{ width: `${width}%` }} aria-hidden="true" />
      </button>
      {/* Tooltip on hover / keyboard focus (desktop); a tap opens Pravidlá at SUCHO · RTP 96 %. */}
      <span id="sucho-tip" className="sucho-tip" role="tooltip">
        {on ? <b>{`SUCHO · ${rtp}`}</b> : null}
        {tip}
      </span>
    </span>
  );
}
