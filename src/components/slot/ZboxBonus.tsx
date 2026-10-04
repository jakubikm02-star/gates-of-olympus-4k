import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Truck } from "lucide-react";
import {
  ZBOX_GAGS,
  ZBOX_LAYOUT,
  ZBOX_ROWS,
  ZBOX_TICKER,
  ZBOX_WINDOWS,
  zboxParcelNo,
  type ZCell,
  type ZParcel,
  type ZPlay,
} from "@/lib/slot/zbox";
import { canSrc } from "@/lib/slot/symbols";
import type { ChaseModKind } from "@/lib/slot/zasah";
import * as sfx from "@/lib/slot/audio";
import { CountUp } from "./CountUp";

/** Scene = the backdrop photo's own pixel space (public/zbox/bg.webp is 1280×720). */
const SCENE_W = 1280;
const SCENE_H = 720;
/** The painted locker (roof to plinth) inside the scene. */
const LOCK = { x: 385, y: 50, w: 520, h: 578 };
/** Door banks of the painted locker: 2 columns × 6 unit rows each. */
const BANK = { l: { x: 405, w: 200 }, r: { x: 680, w: 202 }, y: 118, h: 500 };

function eur(n: number): string {
  return `${n.toFixed(2).replace(".", ",")} €`;
}

function cellRect(c: ZCell) {
  const b = BANK[c.side];
  const uw = b.w / 2;
  const uh = BANK.h / ZBOX_ROWS;
  const g = 1.5;
  return { left: b.x + c.col * uw + g, top: BANK.y + c.row * uh + g, width: c.w * uw - 2 * g, height: c.h * uh - 2 * g };
}

type Banner = { kind: "miss" | "full" | "close" | "can"; title: string; sub?: string } | null;

interface Props {
  play: ZPlay;
  bet: number;
  gross: number;
  net: number;
  tax: ChaseModKind | null;
  turbo: boolean;
  reduced: boolean;
  onDone: () => void;
}

/**
 * Ž-BOX overlay. Animates a run that is already decided (lib/slot/zbox playZbox): arrival push-in, start
 * parcels, delivery rounds (shake → parcels or NEDORUČENÉ), roof cans, closing, payout. Timers only step a
 * script; motion is CSS transform/opacity (count-ups on the shared frame loop). Turbo ≈ 2× faster, tap
 * PRESKOČIŤ = jump to the end, reduced motion = fades only.
 */
export function ZboxBonus({ play, bet, gross, net, tax, turbo, reduced, onDone }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ s: 0.7, x: 0, y: 0, portrait: true });
  const [phase, setPhase] = useState<"arrive" | "start" | "rounds" | "close" | "pay">("arrive");
  const [lit, setLit] = useState(false);
  const [open, setOpen] = useState<Record<number, ZParcel>>({});
  const [fresh, setFresh] = useState<number[]>([]);
  const [shaking, setShaking] = useState(false);
  const [windows, setWindows] = useState(ZBOX_WINDOWS);
  const [cans, setCans] = useState<number[]>([]);
  const [canDrop, setCanDrop] = useState(0);
  const [banner, setBanner] = useState<Banner>(null);
  const [lcd, setLcd] = useState<{ t: string; s?: string; tone?: "ok" | "bad" | "info" }>({ t: "Hľadám Ž-BOX…", s: "Zapnite Bluetooth, polohu, dáta, priblížte sa na 2 m a vypnite hodinky aj auto.", tone: "info" });
  const [mini, setMini] = useState<"…" | "✓" | "✕">("…");
  const [slammed, setSlammed] = useState<number>(-1);
  const [poured, setPoured] = useState(0);
  const [payStep, setPayStep] = useState(0);
  const [canAsk, setCanAsk] = useState(false);
  const [flash, setFlash] = useState(0);
  const fastRef = useRef(false);
  const nudgeRef = useRef<(() => void) | null>(null);
  const aliveRef = useRef(true);
  const k = turbo ? 0.5 : 1;
  const parcelNo = useMemo(() => zboxParcelNo(Math.random), []);

  // Fit the scene: landscape = cover (locker ≤ 84 % of the height), portrait = locker fits the width,
  // between the top and bottom HUD. The blurred backdrop fills whatever the scene does not cover.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const portrait = w / h < 1.15;
      let s: number;
      let cy: number;
      if (portrait) {
        const top = Math.min(190, h * 0.2);
        const bottom = Math.min(230, h * 0.25);
        s = Math.min((w * 0.98) / LOCK.w, (h - top - bottom) / LOCK.h);
        cy = top + (h - top - bottom) / 2;
      } else {
        s = Math.min(Math.max(w / SCENE_W, h / SCENE_H), (h * 0.8) / LOCK.h, (w * 0.46) / LOCK.w);
        cy = h * 0.5;
      }
      const lx = LOCK.x + LOCK.w / 2;
      const ly = LOCK.y + LOCK.h / 2;
      setView({ s, x: w / 2 - lx * s, y: cy - ly * s, portrait });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Script wait: scaled by turbo, 0 once skipped; DORUČIŤ ends a nudgeable wait early. */
  const wait = useCallback(
    (ms: number, nudge = false) =>
      new Promise<void>((resolve) => {
        if (fastRef.current || !aliveRef.current) return resolve();
        const t = window.setTimeout(done, ms * k);
        function done() {
          window.clearTimeout(t);
          if (nudgeRef.current === done) nudgeRef.current = null;
          setCanAsk(false);
          resolve();
        }
        if (nudge) {
          nudgeRef.current = done;
          setCanAsk(true);
        }
      }),
    [k],
  );

  useEffect(() => {
    aliveRef.current = true;
    const loud = () => !fastRef.current;
    const reveal = async (parcels: ZParcel[], gap: number) => {
      for (const p of parcels) {
        setOpen((o) => ({ ...o, [p.id]: p }));
        setFresh((f) => [...f, p.id]);
        if (loud()) sfx.playZboxOpen();
        await wait(gap);
      }
    };
    const run = async () => {
      // 1. arrival: push-in, LEDs row by row, ticker
      await wait(250);
      setLit(true);
      if (loud()) sfx.playZboxBeep();
      await wait(1150);
      // 2. start parcels
      setPhase("start");
      setLcd({ t: "Zásielky pripravené", s: `Č. zásielky ${parcelNo}`, tone: "ok" });
      setMini("✓");
      await reveal(play.start, 420);
      await wait(500);
      // 3. rounds
      setPhase("rounds");
      let gag = Math.floor(Math.random() * ZBOX_GAGS.length);
      for (const r of play.rounds) {
        setFresh([]);
        setBanner(null);
        setLcd({ t: "Hľadáme vašu zásielku…", s: "Na ceste · Triediace centrum · Na ceste", tone: "info" });
        setMini("…");
        if (loud()) sfx.playZboxBeep(0.9);
        setShaking(true);
        await wait(800);
        setShaking(false);
        if (r.parcels.length) {
          setMini("✓");
          setLcd({
            t: "VYZDVIHNUTÉ ✓",
            s: `+${eur(r.parcels.reduce((s2, p) => s2 + p.x, 0) * bet)} · ${r.parcels.length === 1 ? "1 zásielka" : `${r.parcels.length} zásielky`}`,
            tone: "ok",
          });
          await reveal(r.parcels, 260);
          setWindows(r.windows);
        } else {
          setMini("✕");
          setWindows(r.windows);
          if (loud()) sfx.playZboxMiss();
          setBanner({ kind: "miss", title: "NEDORUČENÉ", sub: "Zásielka sa vracia odosielateľovi." });
          setLcd({ t: "NEDORUČENÉ", s: ZBOX_GAGS[gag % ZBOX_GAGS.length], tone: "bad" });
          gag += 1;
          await wait(1300);
          setBanner(null);
        }
        if (r.can) {
          setCans((c) => [...c, r.can]);
          setCanDrop((n) => n + 1);
          setFlash((n) => n + 1);
          if (loud()) sfx.playZboxCan();
          setBanner({ kind: "can", title: `Kuriérsky príplatok ×${r.can}`, sub: "Plechovka na streche. Násobí všetko na konci." });
          await wait(1200);
          setBanner(null);
        }
        await wait(r.windows > 0 ? 1100 : 300, r.windows > 0);
      }
      // 4. full wall
      if (play.full) {
        setLcd({ t: "VŠETKO DORUČENÉ", s: "Toto sa ešte nestalo.", tone: "ok" });
        if (loud()) sfx.playZboxFull();
        setBanner({ kind: "full", title: "VŠETKO DORUČENÉ ×2", sub: "Toto sa ešte nestalo." });
        await wait(2400);
        setBanner(null);
      }
      // 5. closing: doors slam row by row, values pour into the total
      setPhase("close");
      setFresh([]);
      setBanner({ kind: "close", title: "Ž-BOX SA ZATVÁRA" });
      setLcd({ t: "Ž-BOX SA ZATVÁRA", s: "Úložná doba končí dnes o 23:59. Predĺžiť? (Nie.)", tone: "info" });
      await wait(700);
      for (let row = 0; row < ZBOX_ROWS; row++) {
        setSlammed(row);
        const sum = play.start
          .concat(play.rounds.flatMap((r) => r.parcels))
          .filter((p) => {
            const c = ZBOX_LAYOUT[p.id];
            return c.row + c.h - 1 === row;
          })
          .reduce((s2, p) => s2 + p.x, 0);
        if (sum > 0) setPoured((v) => +(v + sum * bet).toFixed(2));
        if (loud()) sfx.playZboxSlam();
        await wait(220);
      }
      setPoured(+(play.sumX * bet).toFixed(2));
      await wait(500);
      // 6. payout: × príplatok, × 2, cap, tax, count-up
      setBanner(null);
      setPhase("pay");
      setPayStep(1);
      await wait(play.canSum ? 700 : 250);
      if (play.canSum && loud()) sfx.playMult();
      setPayStep(2);
      await wait(play.full ? 700 : 200);
      setPayStep(3);
      await wait(tax ? 700 : 150);
      if (tax && loud()) (tax === "danUrad" ? sfx.playTaxLoss : sfx.playMult)();
      setPayStep(4);
      if (loud() || fastRef.current) sfx.playBigWin();
    };
    void run();
    return () => {
      aliveRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skip = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (phase === "pay" && payStep >= 4) return;
    fastRef.current = true;
    nudgeRef.current?.();
  };
  const deliver = (e: React.MouseEvent) => {
    e.stopPropagation();
    sfx.playClick();
    nudgeRef.current?.();
  };

  const canSum = cans.reduce((s2, c) => s2 + c, 0);
  const allParcels = Object.values(open);
  const sumNow = allParcels.reduce((s2, p) => s2 + p.x, 0) * bet;
  const done = phase === "pay" && payStep >= 4;
  const capped = play.capped;
  const taxPct = tax === "danUrad" ? "−23 %" : tax === "bezDane" ? "+23 %" : "";

  return (
    <div
      ref={rootRef}
      className={`zb-root ph-${phase} ${view.portrait ? "is-portrait" : "is-wide"} ${turbo ? "is-turbo" : ""} ${reduced ? "is-reduced" : ""} ${play.full && (phase === "close" || phase === "pay" || banner?.kind === "full") ? "is-full" : ""}`}
      role="dialog"
      aria-label="Ž-BOX"
      onClick={done ? onDone : undefined}
    >
      <div className="zb-blur" aria-hidden="true" />
      <div className="zb-scene" style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.s})` }}>
        <div className="zb-push">
          <picture>
            <source media="(max-width: 760px)" srcSet="/zbox/bg-m.webp" />
            <img className="zb-bg" src="/zbox/bg.webp" alt="" draggable={false} />
          </picture>
          <div className="zb-glow" aria-hidden="true" />
          <div className="zb-roof" aria-hidden="true">
            {cans.map((c, i) => (
              <span key={i} className={`zb-can ${i === cans.length - 1 && canDrop ? "is-new" : ""}`} style={{ ["--i" as string]: String(i) }}>
                <img src={canSrc(c)} alt="" />
                <b>×{c}</b>
              </span>
            ))}
          </div>
          <div className={`zb-mini is-${mini === "✓" ? "ok" : mini === "✕" ? "bad" : "wait"} ${lit ? "is-lit" : ""}`} aria-hidden="true">
            <em>Ž-BOX</em>
            <b>{mini}</b>
            <span>{allParcels.length}/12</span>
          </div>
          <div className={`zb-wall ${lit ? "is-lit" : ""} ${shaking ? "is-shake" : ""}`}>
            {ZBOX_LAYOUT.map((c) => {
              const r = cellRect(c);
              const p = open[c.id];
              const shut = slammed >= c.row + c.h - 1;
              const state = p && !shut ? "is-open" : "is-closed";
              return (
                <div
                  key={c.id}
                  className={`zb-cell side-${c.side} size-${c.size} ${state} ${p ? "has-parcel" : ""} ${p?.vip ? "is-vip" : ""} ${fresh.includes(c.id) ? "is-fresh" : ""}`}
                  style={{ ...r, ["--row" as string]: String(c.row), ["--d" as string]: `${(c.row * 90 + c.col * 30 + (c.side === "r" ? 15 : 0)) * k}ms` }}
                >
                  <div className="zb-in">
                    {p ? (
                      <>
                        <img className="zb-parcel" src="/zbox/parcel.webp" alt="" draggable={false} />
                        <span className="zb-val">
                          {p.vip ? <i>PRIORITNÁ</i> : null}
                          <b>{eur(p.x * bet)}</b>
                        </span>
                      </>
                    ) : null}
                  </div>
                  <div className="zb-panel">
                    <span className="zb-door" />
                    <i className="zb-led" />
                  </div>
                  <div className="zb-frame" />
                  {p && shut && phase !== "pay" ? <span className="zb-pour">{eur(p.x * bet)}</span> : null}
                </div>
              );
            })}
          </div>
          {flash ? <div key={flash} className="zb-bolt" aria-hidden="true" /> : null}
        </div>
      </div>

      <header className="zb-top">
        <div className="zb-ticker" aria-hidden="true">
          <div className="zb-ticker-run">
            {[0, 1].map((n) => (
              <span key={n}>{ZBOX_TICKER.map((t) => `${t} · `).join("")}</span>
            ))}
          </div>
        </div>
      </header>

      <aside className="zb-left">
        <div className="zb-brand">
          <img src="/zbox/logo-m.webp" alt="" />
          <div>
            <b>PAKEŤÁK</b>
            <span>Ž-BOX · zamknuté schránky</span>
          </div>
        </div>
        <div className={`zb-lcd is-${lcd.tone ?? "info"}`} aria-live="polite">
          <b>{lcd.t}</b>
          {lcd.s ? <span>{lcd.s}</span> : null}
        </div>
        <div className="zb-windows" aria-label={`Doručovacie okná: ${windows}`}>
          <span>Doručovacie okná: {windows}</span>
          <div>
            {Array.from({ length: ZBOX_WINDOWS }, (_, i) => (
              <i key={i} className={i < windows ? "is-on" : "is-off"}>
                <Truck size={18} strokeWidth={2.2} />
              </i>
            ))}
          </div>
        </div>
      </aside>

      <aside className="zb-right">
        <div className="zb-total">
          <span>V schránkach</span>
          <b>
            <CountUp value={phase === "close" || phase === "pay" ? poured : +sumNow.toFixed(2)} ms={phase === "close" ? 200 : 360} />
            &nbsp;€
          </b>
        </div>
        <div className={`zb-mult ${canSum ? "is-on" : ""}`}>
          <span>Kuriérsky príplatok</span>
          <b>×{canSum || 1}</b>
        </div>
        <div className="zb-actions">
          <button type="button" className={`zb-go ${canAsk ? "is-ready" : ""}`} onClick={deliver} disabled={!canAsk}>
            DORUČIŤ
          </button>
          <button type="button" className="zb-skip" onClick={skip} disabled={phase === "pay"}>
            PRESKOČIŤ
          </button>
        </div>
      </aside>

      {banner ? (
        <div key={banner.title + windows} className={`zb-banner is-${banner.kind}`} aria-live="assertive">
          <b>{banner.title}</b>
          {banner.sub ? <span>{banner.sub}</span> : null}
        </div>
      ) : null}

      {play.full && (banner?.kind === "full" || phase === "pay") && !reduced ? (
        <div className="zb-confetti" aria-hidden="true">
          {Array.from({ length: 28 }, (_, i) => (
            <i key={i} style={{ ["--x" as string]: `${(i * 37) % 100}%`, ["--t" as string]: `${(i % 7) * 0.13}s`, ["--h" as string]: String((i * 53) % 360) }} />
          ))}
        </div>
      ) : null}

      {phase === "pay" ? (
        <div className="zb-pay" role="status">
          <p className="zb-pay-head">Ž-BOX SA ZATVÁRA</p>
          <ul>
            <li>
              <span>Zásielky ({allParcels.length}/12)</span>
              <b>{eur(play.sumX * bet)}</b>
            </li>
            <li className={payStep >= 1 && play.canSum ? "is-on" : "is-dim"}>
              <span>Kuriérsky príplatok</span>
              <b>×{play.canSum || 1}</b>
            </li>
            {play.full ? (
              <li className={payStep >= 2 ? "is-on is-full" : "is-dim"}>
                <span>VŠETKO DORUČENÉ</span>
                <b>×2</b>
              </li>
            ) : null}
            {capped ? (
              <li className={payStep >= 2 ? "is-on" : "is-dim"}>
                <span>Strop Ž-BOXu</span>
                <b>30× stávky</b>
              </li>
            ) : null}
            {tax ? (
              <li className={payStep >= 3 ? `is-on is-${tax}` : "is-dim"}>
                <span>{tax === "danUrad" ? "Daňové obdobie" : "Bez dane"}</span>
                <b>{taxPct}</b>
              </li>
            ) : null}
          </ul>
          <div className="zb-pay-win">
            <span>VÝHRA</span>
            <b>
              <CountUp value={payStep >= 4 ? net : payStep >= 3 ? gross : payStep >= 1 ? gross : +(play.sumX * bet).toFixed(2)} ms={payStep >= 4 ? 900 * k : 420} glide />
              &nbsp;€
            </b>
          </div>
          <p className="zb-pay-tap">{done ? "Ťukni pre návrat" : "\u00a0"}</p>
        </div>
      ) : null}
    </div>
  );
}
