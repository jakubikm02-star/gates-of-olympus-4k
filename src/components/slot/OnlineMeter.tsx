import { useEffect, useRef, useState } from "react";
import type { DeskDay } from "@/lib/slot/desk-api";
import { ONLINE_BEAT_MS, ONLINE_LABEL, moneySegs, onlineBlink, onlineDigits, parkOnlineBeat, segMask } from "@/lib/slot/online";
import "./online-meter.css";

/** One 7-segment glyph. Unlit segments stay faintly visible, like a real module. */
function Seg({ ch, big = false }: { ch: string; big?: boolean }) {
  const on = segMask(ch);
  const lit = (id: string) => (on.includes(id) ? " is-on" : "");
  return (
    <svg className={`seg${big ? " is-big" : ""}`} viewBox="0 0 24 40" aria-hidden="true">
      <polygon className={`seg-a${lit("a")}`} points="4,2 20,2 18,5 6,5" />
      <polygon className={`seg-b${lit("b")}`} points="21,3 23,5 23,17 21,19 18,16 18,6" />
      <polygon className={`seg-c${lit("c")}`} points="21,21 23,23 23,35 21,37 18,34 18,24" />
      <polygon className={`seg-d${lit("d")}`} points="4,38 20,38 18,35 6,35" />
      <polygon className={`seg-e${lit("e")}`} points="3,21 5,24 5,34 3,37 1,35 1,23" />
      <polygon className={`seg-f${lit("f")}`} points="3,3 5,6 5,16 3,19 1,17 1,5" />
      <polygon className={`seg-g${lit("g")}`} points="5,18.5 19,18.5 17.5,21 6.5,21" />
    </svg>
  );
}

/** Digits, a gap, or the decimal point (the eighth segment). */
function SegRead({ text, big = false }: { text: string; big?: boolean }) {
  return (
    <span className={`seg-read${big ? " is-big" : ""}`}>
      {text.split("").map((ch, i) =>
        ch === " " ? (
          <i key={i} className="seg-gap" />
        ) : ch === "." ? (
          <i key={i} className="seg-dp" />
        ) : (
          <Seg key={`${ch}${i}`} ch={ch} big={big} />
        ),
      )}
    </span>
  );
}

function BankRow({ label, all, mine, loss = false }: { label: string; all: number; mine: number; loss?: boolean }) {
  return (
    <div className={`park-row${loss ? " is-loss" : ""}`}>
      <span className="park-k">{label}</span>
      <SegRead text={moneySegs(all)} />
      <span className="park-k park-you">TY</span>
      <SegRead text={moneySegs(mine)} />
    </div>
  );
}

/**
 * Player count in the free band above the reels. Click opens today's Park Bank
 * on the same module. The green dot blinks once when the number changes.
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

  const digits = onlineDigits(count);
  const label = count == null ? "Online hráči sa načítavajú. Klik otvorí Park Bank." : `Online hráči: ${count}. Klik otvorí Park Bank.`;

  return (
    <div className={`online-hold${open ? " is-bank" : ""}`}>
      <button
        type="button"
        className="online-meter"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        <i className={`online-dot${blink ? " is-blink" : ""}`} />
        <span className="online-word">
          {ONLINE_LABEL.split("").map((ch, i) => (
            <Seg key={`${ch}${i}`} ch={ch} />
          ))}
        </span>
        <span className="online-num">
          {digits.split("").map((ch, i) => (
            <Seg key={`${ch}${i}`} ch={ch} big />
          ))}
        </span>
      </button>
      {open ? (
        <>
          <button type="button" className="park-bank-back" aria-label="Zavrieť Park Bank" onClick={() => setOpen(false)} />
          <div className="park-bank" role="dialog" aria-label="Park Bank, dnešné pretočené">
            <header>
              <span>PARK BANK</span>
              <b>DNES</b>
            </header>
            <p className="park-hero-k">PRETOČENÉ</p>
            <SegRead text={moneySegs(desk.wagered)} big />
            <p className="park-you-line">
              <span>TY</span>
              <SegRead text={moneySegs(mine.wagered)} />
            </p>
            <BankRow label="VÝHRY" all={desk.paid} mine={mine.paid} />
            <BankRow label="MAX" all={desk.best} mine={mine.best} />
            <div className="park-row">
              <span className="park-k">TIKETY</span>
              <span className="park-k park-plus">+</span>
              <SegRead text={moneySegs(mine.ticketWon)} />
              <span className="park-k park-minus">−</span>
              <SegRead text={moneySegs(mine.ticketLost)} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
