/**
 * ZLATÝ BONUS UI (lib/slot/zlaty): bar badge + countdown, daily teaser, ZLATÁ SIM reveal (the chip pops out of
 * Martin's gold SIM card, flips and turns into the themed card), golden HUD pill during the bonus, golden result
 * card, and the sheet (DNES · PRAVIDLÁ · ŠTATISTIKY).
 * Art: public/zlaty/*.webp (alpha, listed in preload-plan LITERAL_ART; /workspace/zlaty/ASSETS.md). Every <img>
 * falls back to an SVG when the file is missing.
 */
import { useEffect, useRef, useState } from "react";
import type { BonusModeId } from "@/lib/slot/bonus-mode";
import { formatMoney } from "@/lib/slot/format";
import { msToReset, resetCountdown, serverNow } from "@/lib/slot/server-day";
import {
  STAKE_MIN_SAMPLES,
  STAKE_WINDOW,
  ZLATY_CAP_X,
  ZLATY_CARDS,
  ZLATY_TARGET_UP,
  ZLATE_VYSEKY_G,
  zlataPokutaOf,
  zlatyKurierOf,
  type ZlatyState,
} from "@/lib/slot/zlaty";
import * as sfx from "@/lib/slot/audio";
import { CountUp } from "./CountUp";
import "./zlaty.css";

/** Every ZLATÝ BONUS image, literal URLs (preload-plan.test greps them; all are in LITERAL_ART). */
export const ZLATY_ART = {
  closed: "/zlaty/sim-closed.webp",
  carrier: "/zlaty/sim-carrier.webp",
  chip: "/zlaty/sim-chip.webp",
  chipBack: "/zlaty/sim-chip-back.webp",
  teaser: "/zlaty/teaser-sim.webp",
  frame: "/zlaty/result-frame.webp",
  card: {
    kontrola: "/zlaty/card-kontrola.webp",
    zbox: "/zlaty/card-zbox.webp",
    koleso: "/zlaty/card-koleso.webp",
  } as Record<BonusModeId, string>,
} as const;

/** Chip box inside the SIM card art (fractions of sim-closed.webp, from /workspace/zlaty/art/out/chip.json). */
const CHIP = { x: 7.46, y: 28.17, w: 25.83, h: 29.34 };
/** Crack lines around the chip (viewBox = sim art 1024×619). */
const CRACKS = [
  "M81 179 L337 179 L337 321 L306 352 L81 352 Z",
  "M81 232 l-9 6 l-5 -4 l-8 8",
  "M196 179 l4 -9 l-5 -5 l6 -10",
  "M337 256 l9 3 l4 -7 l10 2",
  "M150 352 l-3 10 l6 4 l-2 10",
  "M306 352 l7 8 l-3 7",
  "M262 179 l-3 -7 l5 -6",
];

const fx = (x: number) => `${(Math.round(x * 100) / 100).toString().replace(".", ",")}×`;

/** Live countdown to the next daily reset (Europe/Bratislava midnight on the server clock). */
function useResetCountdown(): { left: number; label: string } {
  const [left, setLeft] = useState(() => msToReset(serverNow()));
  useEffect(() => {
    const id = window.setInterval(() => setLeft(msToReset(serverNow())), 1000);
    return () => window.clearInterval(id);
  }, []);
  return { left, label: resetCountdown(left) };
}

/* ───────── art: AI image with SVG fallback ───────── */

function Art({ src, alt, className, children }: { src: string; alt: string; className?: string; children: React.ReactNode }) {
  const [bad, setBad] = useState(false);
  if (bad) return <>{children}</>;
  return <img className={className} src={src} alt={alt} draggable={false} onError={() => setBad(true)} />;
}

export function ModeGlyph({ mode }: { mode: BonusModeId }) {
  if (mode === "kontrola")
    return (
      <svg viewBox="0 0 120 120" className="zl-glyph" aria-hidden="true">
        <defs>
          <linearGradient id="zlg-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff3b0" />
            <stop offset="0.5" stopColor="#f0c419" />
            <stop offset="1" stopColor="#a8700c" />
          </linearGradient>
        </defs>
        <rect x="26" y="14" width="68" height="92" rx="6" fill="url(#zlg-a)" stroke="#5a3a04" strokeWidth="3" />
        <rect x="34" y="26" width="52" height="10" rx="2" fill="#5a3a04" opacity="0.85" />
        <rect x="34" y="44" width="40" height="5" rx="2" fill="#5a3a04" opacity="0.5" />
        <rect x="34" y="54" width="46" height="5" rx="2" fill="#5a3a04" opacity="0.5" />
        <circle cx="60" cy="82" r="13" fill="none" stroke="#5a3a04" strokeWidth="3" />
        <text x="60" y="88" textAnchor="middle" fontSize="16" fontWeight="900" fill="#5a3a04">
          €
        </text>
      </svg>
    );
  if (mode === "zbox")
    return (
      <svg viewBox="0 0 120 120" className="zl-glyph" aria-hidden="true">
        <defs>
          <linearGradient id="zlg-b" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff3b0" />
            <stop offset="0.5" stopColor="#f0c419" />
            <stop offset="1" stopColor="#a8700c" />
          </linearGradient>
        </defs>
        <rect x="12" y="46" width="66" height="40" rx="5" fill="url(#zlg-b)" stroke="#5a3a04" strokeWidth="3" />
        <path d="M78 56h18l12 14v16H78z" fill="url(#zlg-b)" stroke="#5a3a04" strokeWidth="3" strokeLinejoin="round" />
        <circle cx="32" cy="90" r="9" fill="#2a1a02" stroke="#f0c419" strokeWidth="3" />
        <circle cx="90" cy="90" r="9" fill="#2a1a02" stroke="#f0c419" strokeWidth="3" />
        <rect x="36" y="20" width="18" height="26" rx="4" fill="#ffe56a" stroke="#5a3a04" strokeWidth="3" />
        <path d="M45 8l-4 9h6l-4 9" stroke="#fff" strokeWidth="2.5" fill="none" />
      </svg>
    );
  return (
    <svg viewBox="0 0 120 120" className="zl-glyph" aria-hidden="true">
      <defs>
        <linearGradient id="zlg-c" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff3b0" />
          <stop offset="0.5" stopColor="#f0c419" />
          <stop offset="1" stopColor="#a8700c" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="62" r="46" fill="url(#zlg-c)" stroke="#5a3a04" strokeWidth="3" />
      {Array.from({ length: 12 }, (_, i) => (
        <line
          key={i}
          x1="60"
          y1="62"
          x2={60 + 46 * Math.cos((i * Math.PI) / 6)}
          y2={62 + 46 * Math.sin((i * Math.PI) / 6)}
          stroke="#5a3a04"
          strokeWidth="2"
          opacity="0.6"
        />
      ))}
      <circle cx="60" cy="62" r="12" fill="#5a3a04" />
      <path d="M60 4l8 14H52z" fill="#fff" stroke="#5a3a04" strokeWidth="2" />
    </svg>
  );
}

function cardParams(rankId: string) {
  return { v: zlataPokutaOf(rankId), k: zlatyKurierOf(rankId), g: ZLATE_VYSEKY_G };
}

/* ───────── bar badge (inside the bonus bar) ───────── */

export function ZlatyBarBadge({ waiting, onOpen }: { waiting: boolean; onOpen: () => void }) {
  const { label } = useResetCountdown();
  return (
    <button
      type="button"
      className={`zl-bar-badge ${waiting ? "is-waiting" : "is-used"}`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      aria-label={waiting ? "Zlatý bonus dnes čaká, pravidlá" : `Ďalší zlatý bonus o ${label}`}
      title={waiting ? "Prvý bonus z baru dnes je ZLATÝ: strop 100× a zlatá karta" : `Ďalší ZLATÝ BONUS o ${label}`}
    >
      <i aria-hidden="true">★</i>
      {waiting ? <span className="zl-bb-t">ZLATÝ</span> : <span className="zl-bb-t zl-cd">{label}</span>}
    </button>
  );
}

/* ───────── daily teaser ───────── */

export function ZlatyTeaser({ onRules, onClose }: { onRules: () => void; onClose: () => void }) {
  const { label } = useResetCountdown();
  useEffect(() => {
    const id = window.setTimeout(onClose, 9000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="zl-teaser" role="status" aria-live="polite">
      <div className="zl-teaser-shine" aria-hidden="true" />
      <Art src={ZLATY_ART.teaser} alt="" className="zl-teaser-img">
        <SimSvg small />
      </Art>
      <div className="zl-teaser-txt">
        <em>DNES ČAKÁ</em>
        <b>ZLATÝ BONUS</b>
        <span>
          Prvý bonus z baru: strop {ZLATY_CAP_X}× a zlatá karta · ešte {label}
        </span>
      </div>
      <div className="zl-teaser-btns">
        <button type="button" onClick={onRules}>
          PRAVIDLÁ
        </button>
        <button type="button" className="is-go" onClick={onClose}>
          HRAŤ
        </button>
      </div>
    </div>
  );
}

/* ───────── ZLATÁ SIM ───────── */

/** Fallback when the SIM art is missing: a flat gold card with a chip. */
function SimSvg({ small }: { small?: boolean }) {
  return (
    <svg viewBox="0 0 1024 619" className={`zl-sim-svg ${small ? "is-small" : ""}`} aria-hidden="true">
      <defs>
        <linearGradient id="zls-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe9a0" />
          <stop offset="0.45" stopColor="#e7b322" />
          <stop offset="1" stopColor="#9c6508" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="1008" height="603" rx="44" fill="url(#zls-body)" stroke="#6a4304" strokeWidth="6" />
      <path d={CRACKS[0]} fill="#d9a520" stroke="#6a4304" strokeWidth="5" />
      <text x="720" y="330" textAnchor="middle" fontSize="150" fontWeight="900" fill="#8a5a06">
        5G
      </text>
    </svg>
  );
}

type SimStage = 0 | 1 | 2 | 3 | 4;

/**
 * The bar landed on a mode and today's gold is on it: ZLATÁ SIM. The card flies in, crack lines run around the
 * chip, the chip snaps out (golden light from the hole), lifts, flips (back side: 100×) and turns into the
 * themed card. Tap = skip to the card / continue. reduced-motion: the open SIM + card at once, no movement.
 */
export function ZlatyReveal({
  mode,
  rankId,
  turbo,
  reduced,
  onDone,
}: {
  mode: BonusModeId;
  rankId: string;
  turbo: boolean;
  reduced: boolean;
  onDone: () => void;
}) {
  const card = ZLATY_CARDS[mode];
  const [stage, setStage] = useState<SimStage>(reduced ? 4 : 0);
  const doneRef = useRef(false);
  const timers = useRef<number[]>([]);
  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };
  /** ms of each stage start: crack, snap, flip, card. */
  const at = turbo ? [240, 420, 600, 980] : [520, 900, 1250, 1900];
  const dwell = reduced ? 2300 : turbo ? 1300 : 2300;
  const arm = (from: SimStage) => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    if (from < 4) {
      const t0 = from === 0 ? 0 : at[from - 1];
      ([1, 2, 3, 4] as const).forEach((st, i) => {
        if (st <= from) return;
        timers.current.push(
          window.setTimeout(() => {
            setStage(st);
            if (st === 1) sfx.playGoldCrack();
            if (st === 2) sfx.playGoldEnvelope();
          }, at[i] - t0),
        );
      });
      timers.current.push(window.setTimeout(finish, at[3] - t0 + dwell));
    } else timers.current.push(window.setTimeout(finish, dwell));
  };
  useEffect(() => {
    if (reduced) sfx.playGoldEnvelope();
    arm(reduced ? 4 : 0);
    return () => timers.current.forEach((id) => window.clearTimeout(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const tap = () => {
    if (stage === 4) return finish();
    if (stage < 2) sfx.playGoldEnvelope();
    setStage(4);
    arm(4);
  };
  const p = cardParams(rankId);
  const chipBox = { left: `${CHIP.x}%`, top: `${CHIP.y}%`, width: `${CHIP.w}%`, height: `${CHIP.h}%` };
  return (
    <div
      className={`zl-reveal is-${mode} st-${stage} ${reduced ? "is-reduced" : ""}`}
      role="dialog"
      aria-label={`Zlatý bonus: ZLATÁ SIM, ${card.title}`}
      onClick={tap}
    >
      <div className="zl-rays" aria-hidden="true" />
      <div className="zl-sparks" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => (
          <i key={i} style={{ ["--i" as string]: String(i) }} />
        ))}
      </div>
      <p className="zl-reveal-kicker">ZLATÁ SIM</p>
      <p className="zl-reveal-sub">ZLATÝ BONUS DŇA · STROP {ZLATY_CAP_X}×</p>
      <div className="zl-stage">
        <div className="zl-sim" aria-hidden="true">
          <div className="zl-sim-tilt">
            <Art src={ZLATY_ART.carrier} alt="" className="zl-sim-img is-carrier">
              <SimSvg />
            </Art>
            <div className="zl-hole-glow" style={chipBox} />
            <Art src={ZLATY_ART.closed} alt="" className="zl-sim-img is-closed">
              <SimSvg />
            </Art>
            <svg className="zl-cracks" viewBox="0 0 1024 619" preserveAspectRatio="none">
              {CRACKS.map((d, i) => (
                <path key={i} d={d} style={{ ["--i" as string]: String(i) }} />
              ))}
            </svg>
            <div className="zl-beam" style={{ left: chipBox.left, width: chipBox.width, top: chipBox.top }} />
            <div className="zl-chip" style={chipBox}>
              <div className="zl-chip-flip">
                <img className="zl-chip-face" src={ZLATY_ART.chip} alt="" draggable={false} />
                <img className="zl-chip-face is-back" src={ZLATY_ART.chipBack} alt="" draggable={false} />
              </div>
            </div>
          </div>
        </div>
        <div className="zl-card" aria-live="assertive">
          <div className="zl-card-frame">
            <Art src={ZLATY_ART.card[mode]} alt="" className="zl-card-art">
              <ModeGlyph mode={mode} />
            </Art>
            <em>{card.kicker}</em>
            <b>{card.title}</b>
            <span>{card.rule(p)}</span>
            <strong>STROP {ZLATY_CAP_X}×</strong>
          </div>
        </div>
      </div>
      <p className="zl-reveal-hint">{stage === 4 ? "Ťukni a hraj" : "Ťukni = preskočiť"}</p>
    </div>
  );
}

/* ───────── golden HUD pill (over the running bonus) ───────── */

export function ZlatyHud({ mode, rankId, limited, stake }: { mode: BonusModeId; rankId: string; limited: boolean; stake: number }) {
  const card = ZLATY_CARDS[mode];
  const p = cardParams(rankId);
  const extra = mode === "kontrola" ? `ZLATÁ POKUTA ${fx(p.v)}` : mode === "zbox" ? `príplatok ${fx(p.k)} častejšie` : `výseky ${fx(p.g)}`;
  return (
    <div className="zl-hud" role="status" aria-label={`Zlatý bonus, ${card.title}`}>
      <i aria-hidden="true">★</i>
      <b>ZLATÝ BONUS</b>
      <span>
        {extra} · strop {ZLATY_CAP_X}×{limited ? ` · zlato zo stávky ${formatMoney(stake)}` : ""}
      </span>
    </div>
  );
}

/* ───────── result ───────── */

export interface ZlatyResultInfo {
  mode: BonusModeId;
  x: number;
  cash: number;
  /** What the same run pays without gold (€, before taxes). */
  regular: number;
  bet: number;
  stake: number;
  streak: number;
  /** No golden win (0, or ZLATÁ POKUTA missed): the golden SIM recharged, the next bar bonus is golden again. */
  recharged?: boolean;
  key: number;
}

export function ZlatyResult({ r, turbo, auto, onDone }: { r: ZlatyResultInfo; turbo: boolean; auto: boolean; onDone: () => void }) {
  const { label } = useResetCountdown();
  const card = ZLATY_CARDS[r.mode];
  const extra = +(r.cash - r.regular).toFixed(2);
  const doneRef = useRef(false);
  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };
  useEffect(() => {
    sfx.playGoldWin();
    const id = auto ? window.setTimeout(finish, turbo ? 2200 : 4200) : 0;
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const limited = r.stake < r.bet;
  return (
    <div className="zl-result" role="dialog" aria-label="Výsledok zlatého bonusu" onClick={finish}>
      <div className="zl-rays" aria-hidden="true" />
      <div className="zl-res-card" onClick={(e) => e.stopPropagation()}>
        <Art src={ZLATY_ART.frame} alt="" className="zl-res-frame-img">
          <span className="zl-res-frame" aria-hidden="true" />
        </Art>
        <p className="zl-res-kicker">
          ZLATÝ BONUS · {card.kicker} · {card.title}
        </p>
        <b className="zl-res-win">
          <CountUp value={r.cash} ms={turbo ? 500 : 1100} />
        </b>
        <span className="zl-res-x">{fx(r.x)} stávky</span>
        <ul>
          <li>
            <span>Bez zlata by to bolo</span>
            <b>{formatMoney(r.regular)}</b>
          </li>
          <li className={extra >= 0 ? "is-plus" : ""}>
            <span>Zlatý prírastok</span>
            <b>
              {extra >= 0 ? "+" : "−"}
              {formatMoney(Math.abs(extra))}
            </b>
          </li>
          {limited ? (
            <li className="is-note">
              <span>Zlato zo stávky</span>
              <b>{formatMoney(r.stake)} (tvoja bežná)</b>
            </li>
          ) : null}
          <li>
            <span>Séria zlatých dní</span>
            <b>{r.streak}</b>
          </li>
        </ul>
        <p className="zl-res-next">
          {r.recharged ? "Zlatá SIM sa znova nabila: ďalší bonus je opäť ZLATÝ" : `Ďalší ZLATÝ BONUS o ${label}`}
        </p>
        <button type="button" className="zl-btn" onClick={finish}>
          POKRAČOVAŤ
        </button>
      </div>
    </div>
  );
}

/* ───────── sheet: DNES · PRAVIDLÁ · ŠTATISTIKY ───────── */

export function ZlatySheet({
  z,
  waiting,
  rankId,
  bet,
  usual,
  onClose,
}: {
  z: ZlatyState;
  waiting: boolean;
  rankId: string;
  bet: number;
  usual: number;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"dnes" | "pravidla" | "stat">("dnes");
  const { label } = useResetCountdown();
  const p = cardParams(rankId);
  const modes: BonusModeId[] = ["kontrola", "zbox", "koleso"];
  const avg = z.played ? z.cash / z.played : 0;
  return (
    <div className="zl-sheet-back" role="dialog" aria-label="Zlatý bonus" onClick={onClose}>
      <div className="zl-sheet" onClick={(e) => e.stopPropagation()}>
        <header>
          <i aria-hidden="true">★</i>
          <b>ZLATÝ BONUS</b>
          <button type="button" className="zl-x" onClick={onClose} aria-label="Zavrieť">
            ✕
          </button>
        </header>
        <nav className="zl-tabs">
          {(
            [
              ["dnes", "DNES"],
              ["pravidla", "PRAVIDLÁ"],
              ["stat", "ŠTATISTIKY"],
            ] as const
          ).map(([id, t]) => (
            <button key={id} type="button" className={tab === id ? "is-on" : ""} onClick={() => setTab(id)}>
              {t}
            </button>
          ))}
        </nav>
        {tab === "dnes" ? (
          <div className="zl-sheet-body">
            <div className={`zl-today ${waiting ? "is-waiting" : "is-used"}`}>
              {waiting ? (
                <>
                  <b>Dnešný ZLATÝ BONUS čaká</b>
                  <span>Naplň bar. Prvý bonus dňa bude zlatý. Ešte {label} do polnoci.</span>
                </>
              ) : (
                <>
                  <b>Dnes už odohraný</b>
                  <span>Ďalší ZLATÝ BONUS o {label} (polnoc, Bratislava).</span>
                </>
              )}
            </div>
            <div className="zl-cards">
              {modes.map((m) => (
                <div key={m} className={`zl-mini is-${m}`}>
                  <Art src={ZLATY_ART.card[m]} alt="" className="zl-mini-art">
                    <ModeGlyph mode={m} />
                  </Art>
                  <em>{ZLATY_CARDS[m].kicker}</em>
                  <b>{ZLATY_CARDS[m].title}</b>
                  <span>{ZLATY_CARDS[m].rule(p)}</span>
                </div>
              ))}
            </div>
            <p className="zl-fine">
              Každá karta pridá v priemere rovnako: ~{fx(ZLATY_TARGET_UP)} stávky k bonusu. Pri stávke {formatMoney(bet)} je to ~
              {formatMoney(ZLATY_TARGET_UP * Math.min(bet, usual))}.
            </p>
          </div>
        ) : tab === "pravidla" ? (
          <div className="zl-sheet-body zl-rules">
            <ol>
              <li>
                <b>Raz za deň.</b> Prvý bonus z baru (KONTROLA, Ž-BOX alebo KOLESO) po polnoci je ZLATÝ. Deň sa ráta podľa času servera v Bratislave
                (aj pri zmene letného času), nie podľa hodín v telefóne.
              </li>
              <li>
                <b>Strop {ZLATY_CAP_X}× namiesto 30×.</b> Platí pre celé zlaté odohranie.
              </li>
              <li>
                <b>Zlatá SIM.</b> Pred bonusom sa z veľkej zlatej SIM karty vylúpne čip a otočí sa na kartu podľa režimu:
                <ul>
                  <li>KONTROLA · ZLATÁ POKUTA: najlacnejší lístok, ktorý ti rank neukáže, je zlatý ({fx(p.v)} stávky).</li>
                  <li>Ž-BOX · ZLATÝ KURIÉR: kuriérsky príplatok chodí {fx(p.k)} častejšie.</li>
                  <li>KOLESO · ZLATÉ VÝSEKY: hodnotové výseky a KURIÉR platia {fx(p.g)}.</li>
                </ul>
              </li>
              <li>
                <b>Všetky tri sú rovnako cenné.</b> V priemere pridajú ~{fx(ZLATY_TARGET_UP)} stávky (overené simuláciou, každý rank).
              </li>
              <li>
                <b>Bežná stávka.</b> Zlatá časť výhry sa ráta najviac z tvojej bežnej stávky (medián posledných {STAKE_WINDOW} točení). Zvyšok bonusu platí
                normálne zo stávky baru. Nižšia stávka sa nemení. Kým nemáš {STAKE_MIN_SAMPLES} točení, platí stávka baru.
              </li>
              <li>
                <b>Spoločný deň.</b> Jeden zlatý bonus denne pre celú hru (base, neskôr aj FIREMNÉ OVOCKO). V dueli (VERSUS) zlatý bonus nie je.
              </li>
              <li>
                <b>Dane, tikety, RP.</b> Dane platia ako pri bežnom bonuse (BEZ DANE / daňové obdobie), feature tikety rátajú výsledok. RP (liga, SMRŤ
                EGA) sa rátajú ako z rovnakého bonusu bez zlata: zlato pridáva kredit, nie RP.
              </li>
              <li>
                <b>Nevyužitý deň prepadá.</b> Zlato sa neprenáša na ďalší deň.
              </li>
            </ol>
          </div>
        ) : (
          <div className="zl-sheet-body zl-stats">
            <div className="zl-stat-grid">
              <div>
                <span>Zlatých bonusov</span>
                <b>{z.played}</b>
              </div>
              <div>
                <span>Vyplatené spolu</span>
                <b>{formatMoney(z.cash)}</b>
              </div>
              <div>
                <span>Zlatý prírastok spolu</span>
                <b>
                  {z.extra >= 0 ? "+" : "−"}
                  {formatMoney(Math.abs(z.extra))}
                </b>
              </div>
              <div>
                <span>Priemer</span>
                <b>{formatMoney(avg)}</b>
              </div>
              <div>
                <span>Najlepší</span>
                <b>
                  {formatMoney(z.bestCash)} · {fx(z.bestX)}
                </b>
              </div>
              <div>
                <span>Séria (najdlhšia)</span>
                <b>
                  {z.streak} ({z.bestStreak})
                </b>
              </div>
            </div>
            <table className="zl-stat-modes">
              <thead>
                <tr>
                  <th>Karta</th>
                  <th>Počet</th>
                  <th>Priemer × stávky</th>
                </tr>
              </thead>
              <tbody>
                {modes.map((m) => (
                  <tr key={m}>
                    <td>{ZLATY_CARDS[m].title}</td>
                    <td>{z.byMode[m].n}</td>
                    <td>{z.byMode[m].n ? fx(z.byMode[m].x / z.byMode[m].n) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="zl-fine">Bežná stávka teraz: {formatMoney(usual)} (z {z.stakes.length} točení).</p>
          </div>
        )}
      </div>
    </div>
  );
}
