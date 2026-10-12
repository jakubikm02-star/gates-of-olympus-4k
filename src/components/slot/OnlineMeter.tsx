import { useEffect, useRef, useState } from "react";
import type { DeskDay } from "@/lib/slot/desk-api";
import { formatMoney } from "@/lib/slot/format";
import { ONLINE_BEAT_MS, onlineBlink, parkOnlineBeat } from "@/lib/slot/online";
import "./online-meter.css";

function BankLine({ label, all, mine }: { label: string; all: number; mine: number }) {
  return (
    <p className="park-line">
      <span>{label}</span>
      <b>{formatMoney(all)}</b>
      <em>ty {formatMoney(mine)}</em>
    </p>
  );
}

/**
 * Quiet player count in the empty space above AUTO. Click opens today's Park Bank.
 * The green dot blinks once when the number changes.
 */
export function OnlineMeter({ playerId, desk, mine }: { playerId: string; desk: DeskDay; mine: DeskDay }) {
  const [count, setCount] = useState<number | null>(null);
  const [blink, setBlink] = useState(false);
  const [open, setOpen] = useState(false);
  const prev = useRef<number | null>(null);

  useEffect(() => {
    if (playerId.trim().length < 8) return;
    let stop = false;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void parkOnlineBeat(playerId).then((n) => {
        if (!stop && n != null) setCount(n);
      });
    };
    tick();
    const id = setInterval(tick, ONLINE_BEAT_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [playerId]);

  useEffect(() => {
    if (!onlineBlink(prev.current, count)) {
      prev.current = count;
      return;
    }
    prev.current = count;
    setBlink(true);
    const t = window.setTimeout(() => setBlink(false), 720);
    return () => window.clearTimeout(t);
  }, [count]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const label = count == null ? "Online hráči sa načítavajú. Klik otvorí Park Bank." : `Online hráči: ${count}. Klik otvorí Park Bank.`;

  return (
    <div className={`online-hold${open ? " is-bank" : ""}`}>
      <button type="button" className="online-meter" aria-expanded={open} aria-label={label} onClick={() => setOpen((v) => !v)}>
        <i className={`online-dot${blink ? " is-blink" : ""}`} />
        <b>{count == null ? "–" : count}</b>
        <span>online</span>
      </button>
      {open ? (
        <>
          <button type="button" className="park-bank-back" aria-label="Zavrieť Park Bank" onClick={() => setOpen(false)} />
          <div className="park-bank" role="dialog" aria-label="Park Bank, dnešné pretočené">
            <header>
              <span>park bank</span>
              <b>dnes</b>
            </header>
            <BankLine label="pretočené" all={desk.wagered} mine={mine.wagered} />
            <BankLine label="výhry" all={desk.paid} mine={mine.paid} />
            <BankLine label="max" all={desk.best} mine={mine.best} />
            <p className="park-line">
              <span>tikety</span>
              <b>+{formatMoney(mine.ticketWon)}</b>
              <em>−{formatMoney(mine.ticketLost)}</em>
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
