import type { ReactNode } from "react";
import { RotateCw, ShoppingCart, Tv, Zap } from "lucide-react";
import { formatMoney } from "@/lib/slot/format";
import type { BonusNeed, TicketBonus, TicketLeg } from "@/lib/slot/ticket-bonus";

/** Display only. Every action goes through the existing hook calls (buyBonus opens the usual confirmation). */
export function BonusIcon({ need, size = 12 }: { need: BonusNeed | "base" | "ante" | null; size?: number }) {
  if (need === "buy") return <ShoppingCart size={size} strokeWidth={2.6} aria-hidden="true" />;
  if (need === "fs" || need === "trigger") return <Tv size={size} strokeWidth={2.6} aria-hidden="true" />;
  if (need === "ante") return <Zap size={size} strokeWidth={2.6} aria-hidden="true" />;
  return <RotateCw size={size} strokeWidth={2.6} aria-hidden="true" />;
}

function legIcon(leg: TicketLeg): BonusNeed | "base" {
  return leg.where === "bonus" && leg.need ? leg.need : "base";
}

/** Strip pill: fixed size, replaces the TIKET kicker. */
export function BonusPill({ info, live }: { info: TicketBonus; live: boolean }) {
  if (!info.need) return null;
  return (
    <span className={`tb-pill is-${info.need} ${live ? "is-now" : ""}`}>
      <BonusIcon need={info.need} size={11} />
      {info.dual ? "DUAL" : info.pill}
    </span>
  );
}

/** Two counters for a dual ticket. Base first, then 4KA TV. Split budget: each carries its own budget left. */
export function LegCounters({ info, compact = false }: { info: TicketBonus; compact?: boolean }) {
  return (
    <span className="tb-legs">
      {info.legs.map((leg, i) => (
        <span
          key={i}
          className={`tb-leg is-${leg.where} ${leg.need ? `is-${leg.need}` : ""} ${compact && info.split && (leg.meterShort ?? leg.meter).length > 6 ? "is-long" : ""}`}
        >
          <BonusIcon need={legIcon(leg)} size={10} />
          <em>{leg.where === "bonus" ? leg.label : "ZÁKLAD"}</em>
          <b>{compact && info.split ? (leg.meterShort ?? leg.meter) : leg.meter}</b>
          {leg.left ? <i className={`tb-left ${leg.late ? "is-late" : ""} ${leg.left === "✓" ? "is-done" : ""}`}>{leg.left}</i> : null}
        </span>
      ))}
    </span>
  );
}

/** Big notice for the offer card, the OTRS reveal and the bottom sheet. */
export function BonusNote({
  info,
  buyCost,
  compact = false,
  rows = true,
  children,
}: {
  info: TicketBonus;
  buyCost?: number;
  compact?: boolean;
  /** Goal rows for dual tickets. Off where TicketGoals already lists every goal. */
  rows?: boolean;
  children?: ReactNode;
}) {
  if (!info.need) return null;
  return (
    <span className={`tb-note is-${info.need} ${info.dual ? "is-dual" : ""} ${compact ? "is-compact" : ""}`}>
      <span className="tb-badge">
        <BonusIcon need={info.need} size={compact ? 12 : 14} />
        {info.badge}
      </span>
      {info.dual && rows ? (
        <span className="tb-split">
          {info.legs.map((leg, i) => (
            <span key={i} className={`tb-split-row is-${leg.where}`}>
              <BonusIcon need={legIcon(leg)} size={11} />
              <em>{leg.where === "bonus" ? leg.label : "ZÁKLAD"}</em>
              <span>{leg.goal}</span>
              {leg.budget ? <b className="tb-split-budget">{leg.budget}</b> : null}
            </span>
          ))}
        </span>
      ) : null}
      {compact ? null : <span className="tb-hint">{info.hint}</span>}
      {info.need === "buy" && buyCost ? (
        <span className="tb-cost">cena kúpy 4KA TV: {formatMoney(buyCost)}</span>
      ) : null}
      {children}
    </span>
  );
}

/**
 * Every goal of a two-goal ticket (OTRS, dual or not): own title, own x/y, own bar and,
 * for split dual tickets, its own budget left. Display only.
 */
export function TicketGoals({ info, say = (t) => t }: { info: TicketBonus; say?: (text: string) => string }) {
  return (
    <ol className="tg-list">
      {info.legs.map((leg, i) => (
        <li
          key={i}
          className={`tg-goal is-${leg.where} ${leg.need ? `is-${leg.need}` : ""} ${leg.done ? "is-done" : ""} ${leg.late ? "is-late" : ""}`}
        >
          <span className="tg-head">
            <i className="tg-no">{i + 1}</i>
            <BonusIcon need={legIcon(leg)} size={11} />
            <em>{leg.where === "bonus" ? leg.label : leg.need === "trigger" ? "ZÁKLAD · SPUSTI TV" : "ZÁKLAD"}</em>
            <b>{leg.done ? `✓ ${leg.meter}` : leg.meter}</b>
          </span>
          <strong className="tg-title">{say(leg.goal)}</strong>
          <span className="jc-bar tg-bar" aria-hidden="true">
            <i style={{ transform: `scaleX(${leg.pct})` }} />
          </span>
          {leg.budget ? <span className="tg-budget">{leg.budget}</span> : null}
        </li>
      ))}
    </ol>
  );
}
