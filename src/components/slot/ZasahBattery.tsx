import { useEffect, useRef, useState } from "react";

/** Charge band by spins left: green → yellow → orange → red → dying (1 left). Visual only. */
function batteryLevel(left: number, total: number): "full" | "mid" | "low" | "crit" | "dying" | "dead" {
  if (left <= 0) return "dead";
  if (left === 1) return "dying";
  const r = left / Math.max(1, total);
  if (r > 0.65) return "full";
  if (r > 0.45) return "mid";
  if (r > 0.25) return "low";
  return "crit";
}

/**
 * ZÁSAH spin meter as a draining hacker battery: one segment per remaining spin.
 * `spin` is the chase's spins already played; nothing here feeds back into the game.
 */
export function ZasahBattery({ spin, total, className = "" }: { spin: number; total: number; className?: string }) {
  const left = Math.max(0, Math.min(total, total - spin));
  const lvl = batteryLevel(left, total);
  const prev = useRef(left);
  const [drain, setDrain] = useState<{ at: number; n: number } | null>(null);
  useEffect(() => {
    const was = prev.current;
    prev.current = left;
    if (left >= was) return;
    setDrain((d) => ({ at: left, n: (d?.n ?? 0) + 1 }));
    const t = window.setTimeout(() => setDrain(null), 900);
    return () => window.clearTimeout(t);
  }, [left]);
  return (
    <div
      className={`zbat lvl-${lvl} ${drain ? "is-draining" : ""} ${className}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={left}
      aria-label={`ZÁSAH: zostáva ${left} z ${total} spinov`}
      style={{ ["--n" as string]: total }}
    >
      <span className="zbat-kicker" aria-hidden="true">
        ZÁSAH
      </span>
      <div className="zbat-cell" aria-hidden="true">
        <div className="zbat-body">
          {Array.from({ length: total }, (_, i) => (
            <i key={i === drain?.at ? `d${drain.n}` : `s${i}`} className={`zbat-seg ${i < left ? "is-on" : ""} ${i === drain?.at ? "is-drain" : ""}`} />
          ))}
          {drain ? <span key={`k${drain.n}`} className="zbat-spark" style={{ ["--at" as string]: drain.at }} /> : null}
          {lvl === "dying" ? (
            <svg className="zbat-bolt" viewBox="0 0 16 24" aria-hidden="true" style={{ left: `${((left + total) / (2 * total)) * 100}%` }}>
              <path d="M10 1 2 14h5l-2 9 9-14H9l1-8z" />
            </svg>
          ) : null}
        </div>
        <span className="zbat-cap" />
      </div>
      <b className="zbat-num" aria-hidden="true">
        <em>{left}</em>/{total}
      </b>
    </div>
  );
}
