import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import * as sfx from "@/lib/slot/audio";
import { formatMoney } from "@/lib/slot/format";
import { jobShownGoal, sayCluster, type JobCard } from "@/lib/slot/spend";
import { ticketBonus } from "@/lib/slot/ticket-bonus";
import { BonusIcon } from "./TicketBonus";
import "./ticket-fx.css";
import { frameNow, onFrame } from "@/lib/slot/frame-loop";

/**
 * One-shot ticket animations, display only (the hook already moved the money):
 * - "pay": the stake flies as coins from KREDIT into a printed ticket, "PRIJATÝ" stamp; an OTRS
 *   ticket with two goals lights up both parts (ZÁKLAD / 4KA TV) one after the other; then the
 *   ticket shrinks into the ticket strip under the reels.
 * - "payout": the ticket glows, "VYPLATENÉ" stamp, the amount counts up and flies with coins into KREDIT.
 * transform/opacity only, ≤ 1.4 s, any tap skips, reduced motion shows nothing (state is instant).
 */
export type TicketFxEvent = { id: number; kind: "pay" | "payout"; job: JobCard };

const DUR = { pay: 1350, payout: 1400 } as const;
const COINS = 9;

type Pt = { x: number; y: number };
const centre = (sel: string, fb: Pt): Pt => {
  const el = document.querySelector(sel);
  if (!el) return fb;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return fb;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

export function TicketFx({
  fx: real,
  reduced,
  onDone,
  current = null,
}: {
  fx: TicketFxEvent | null;
  reduced: boolean;
  onDone: () => void;
  /** Dev builds only: the running ticket, for the window.__ticketFxDemo("payout") preview hook. */
  current?: JobCard | null;
}) {
  const [demo, setDemo] = useState<TicketFxEvent | null>(null);
  const fx = demo ?? real;
  const curRef = useRef(current);
  curRef.current = current;
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __ticketFxDemo?: (kind: "pay" | "payout") => boolean };
    w.__ticketFxDemo = (kind) => {
      const j = curRef.current;
      if (!j) return false;
      setDemo({ id: Date.now(), kind, job: { ...j, have: j.need, haveB: j.needB } });
      return true;
    };
    return () => {
      delete w.__ticketFxDemo;
    };
  }, []);
  const [geo, setGeo] = useState<{ card: Pt; credit: Pt; strip: Pt; stripW: number } | null>(null);
  const [shown, setShown] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = () => {
    setDemo(null);
    onDone();
  };

  useLayoutEffect(() => {
    if (!fx || reduced) {
      setGeo(null);
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const card = { x: vw / 2, y: vh * 0.42 };
    const strip = document.querySelector(".board-job")?.getBoundingClientRect();
    setGeo({
      card,
      credit: centre(".credit-stack b", { x: vw * 0.2, y: vh * 0.9 }),
      strip: strip && strip.width ? { x: strip.left + strip.width / 2, y: strip.top + strip.height / 2 } : card,
      stripW: strip?.width ?? 0,
    });
  }, [fx, reduced]);

  useEffect(() => {
    if (!fx) return;
    if (reduced) {
      doneRef.current();
      return;
    }
    const timers = [window.setTimeout(() => doneRef.current(), DUR[fx.kind])];
    // Optional sound hooks: existing cues only (no new sfx keys).
    if (fx.kind === "pay") timers.push(window.setTimeout(() => sfx.playCoin(), 520));
    else timers.push(window.setTimeout(() => sfx.playCoin(), 1050), window.setTimeout(() => sfx.playCoin(), 1180));
    // Payout amount counts up over 0.15–0.75 s (text only).
    if (fx.kind === "payout") {
      const t0 = frameNow();
      const stop = onFrame((now) => {
        const k = Math.min(1, Math.max(0, (now - t0 - 150) / 600));
        setShown(+(fx.job.payout * (1 - Math.pow(1 - k, 3))).toFixed(2));
        return k < 1;
      });
      return () => {
        stop();
        timers.forEach(clearTimeout);
      };
    }
    return () => timers.forEach(clearTimeout);
  }, [fx, reduced]);

  if (!fx || reduced || !geo) return null;
  const { job, kind } = fx;
  const info = ticketBonus(job);
  const parts = info.legs.length > 1 ? info.legs : [];
  const pay = kind === "pay";
  const from = pay ? geo.credit : geo.card;
  const to = pay ? geo.card : geo.credit;
  const k = geo.stripW ? Math.min(1, geo.stripW / 300) : 0.3;
  const vars = {
    "--cx": `${geo.card.x}px`,
    "--cy": `${geo.card.y}px`,
    "--sx": `${geo.strip.x - geo.card.x}px`,
    "--sy": `${geo.strip.y - geo.card.y}px`,
    "--sk": `${k}`,
    "--gx": `${geo.credit.x - geo.card.x}px`,
    "--gy": `${geo.credit.y - geo.card.y}px`,
  } as CSSProperties;
  const title = sayCluster(job.title);
  const kicker = job.mystery && !/OTRS/i.test(title) ? "OTRS" : "TIKET";
  const stamp = pay ? (job.mystery ? "OTRS PRIJATÝ" : "PRIJATÝ") : "VYPLATENÉ";
  return (
    <div
      key={fx.id}
      className={`ticket-fx is-${kind} ${parts.length ? "has-parts" : ""} ${job.mystery ? "is-otrs" : ""}`}
      style={vars}
      role="presentation"
      onPointerDown={() => doneRef.current()}
      aria-hidden="true"
    >
      <div className="tf-card">
        <i className="tf-glow" />
        <div className="tf-paper">
          <span className="tf-kicker">{kicker}</span>
          <em className="tf-title">{title}</em>
          {parts.length ? (
            <span className="tf-parts">
              {parts.map((leg, i) => (
                <span key={i} className={`tf-part is-${leg.where}`} style={{ "--i": i } as CSSProperties}>
                  <BonusIcon need={leg.where === "bonus" && leg.need ? leg.need : "base"} size={11} />
                  <em>{leg.where === "bonus" ? leg.label : "ZÁKLAD"}</em>
                  <span>{leg.goal}</span>
                  <b>{pay ? "AKTÍVNE" : "✓"}</b>
                </span>
              ))}
            </span>
          ) : (
            <span className="tf-goal">{jobShownGoal(job)}</span>
          )}
          <strong className="tf-amount">
            {pay ? `−${formatMoney(job.stake)}` : `+${formatMoney(shown)}`}
          </strong>
          <span className="tf-sub">{pay ? `zaplatené · zisk ${formatMoney(job.payout)}` : `do kreditu · cena bola ${formatMoney(job.stake)}`}</span>
        </div>
        <i className="tf-stamp">{stamp}</i>
      </div>
      {pay ? null : <strong className="tf-fly">+{formatMoney(job.payout)}</strong>}
      {Array.from({ length: COINS }, (_, i) => {
        const lift = 40 + ((i * 37) % 50);
        const spread = (i - (COINS - 1) / 2) * 7;
        return (
          <i
            key={i}
            className="tf-coin"
            style={
              {
                left: `${from.x + spread}px`,
                top: `${from.y}px`,
                "--dx": `${to.x - from.x - spread}px`,
                "--dy": `${to.y - from.y}px`,
                "--lift": `${-lift}px`,
                "--d": `${(pay ? 140 : 900) + i * 40}ms`,
              } as CSSProperties
            }
          >
            <i />
          </i>
        );
      })}
    </div>
  );
}
