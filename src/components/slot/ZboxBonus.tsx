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
import { formatMoney } from "@/lib/slot/format";
import { CountUp } from "./CountUp";

/** Backdrop photo (public/zbox/bg.webp, 1280×860, no locker in it); y of the ground line under the locker. */
const BG_W = 1280;
const BG_H = 860;
const BG_GROUND = { x: 642, y: 648 };

/**
 * The locker is composed in its own pixel space: 6 door columns (like the real unit) between a grey top cap and
 * a plinth. Columns 1–2 = left bank, 3–4 = right bank of the engine layout (ZBOX_LAYOUT, unit rows); columns 0 and
 * 5 are fixed decor doors. One print (red field + white graphic, public/zbox/print-*.webp) spans every door, so it
 * splits naturally when a door swings open. Portrait uses taller unit rows (and its own print) to fit a phone.
 */
const COL_W = 136;
const GAP = 4;
const COLS = 6;
const SIDE = 10;
const CAP = 40;
const PLINTH = 40;
const INSET = 6;
const FIELD_W = COLS * COL_W + (COLS - 1) * GAP;
const LOCK_W = FIELD_W + 2 * SIDE;
/** Decor columns: door heights as fractions of the field (after the gaps), top → bottom. */
const DECOR: Record<0 | 5, number[]> = {
  0: [0.2, 0.105, 0.11, 0.1, 0.05, 0.055, 0.055, 0.105, 0.105, 0.115],
  5: [0.2, 0.105, 0.11, 0.05, 0.055, 0.055, 0.05, 0.105, 0.11, 0.16],
};

interface Geo {
  uh: number;
  fieldH: number;
  lockH: number;
  print: string;
}
function geo(portrait: boolean): Geo {
  const uh = portrait ? 140 : 78;
  const fieldH = ZBOX_ROWS * uh + (ZBOX_ROWS - 1) * GAP;
  return { uh, fieldH, lockH: CAP + INSET + fieldH + INSET + PLINTH, print: portrait ? "/zbox/print-p.webp" : "/zbox/print-w.webp" };
}
type Rect = { left: number; top: number; width: number; height: number };
const colX = (c: number) => c * (COL_W + GAP);
function cellRect(c: ZCell, g: Geo): Rect {
  const vc = (c.side === "l" ? 1 : 3) + c.col;
  return { left: colX(vc), top: c.row * (g.uh + GAP), width: c.w * COL_W + (c.w - 1) * GAP, height: c.h * g.uh + (c.h - 1) * GAP };
}
function decorRects(g: Geo): Rect[] {
  const out: Rect[] = [];
  for (const col of [0, 5] as const) {
    const fr = DECOR[col];
    const free = g.fieldH - (fr.length - 1) * GAP;
    let acc = 0;
    let y = 0;
    fr.forEach((f, i) => {
      acc += f;
      const y1 = i === fr.length - 1 ? g.fieldH : Math.round(acc * free + i * GAP);
      out.push({ left: colX(col), top: y, width: COL_W, height: y1 - y });
      y = y1 + GAP;
    });
  }
  return out;
}
/** Door face: the shared print + lighting, offset so all doors read as one continuous surface. */
function faceStyle(r: Rect, g: Geo): React.CSSProperties {
  const pos = `${-r.left}px ${-r.top}px`;
  return { backgroundPosition: `${pos}, ${pos}, ${pos}`, backgroundSize: `${FIELD_W}px ${g.fieldH}px`, ["--print" as string]: `url(${g.print})` };
}

/** Parody brand mark: isometric parcel with a háček tape and a dented corner (no real logo). */
function ZboxCube({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <polygon points="50,4 92,26 50,48 8,26" fill="#fff" />
      <polygon points="8,30 48,52 48,98 8,76" fill="#fff" opacity="0.93" />
      <polygon points="52,52 92,30 92,70 84,80 86,72 52,98" fill="#fff" opacity="0.78" />
      <polyline points="30,16 50,30 70,16" fill="none" stroke="#d81e26" strokeWidth="8.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function eur(n: number): string {
  return `${n.toFixed(2).replace(".", ",")} €`;
}

type Banner = { kind: "miss" | "full" | "close" | "can" | "round" | "reset" | "info"; title: string; sub?: string } | null;
type Fly = { id: number; kind: "val" | "can"; text: string; img?: string; x0: number; y0: number; x1: number; y1: number };
const FLY_MS = 700;

/** Value that counts up from 0 when it appears (a freshly opened compartment). */
function RiseUp({ value }: { value: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), 120);
    return () => window.clearTimeout(t);
  }, [value]);
  return <CountUp value={v} ms={520} />;
}

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
 * Ž-BOX overlay. Animates a run that is already decided (lib/slot/zbox playZbox): arrival push-in, rules card,
 * start parcels, delivery rounds (KOLO banner → search shake → door-by-door reveal: scan, swing, value counts up
 * and flies into V SCHRÁNKACH → windows reset callout, or NEDORUČENÉ with the window counter dropping), roof cans
 * flying into the príplatok box, doors slamming one by one, the multiplier equation, payout. Timers only step a
 * script; motion is CSS transform/opacity (count-ups on the shared frame loop). Tap = end the current step,
 * PRESKOČIŤ = jump to the end, turbo ≈ 2× faster, reduced motion = fades only (no flying chips).
 */
export function ZboxBonus({ play, bet, gross, net, tax, turbo, reduced, onDone }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const totalRef = useRef<HTMLDivElement>(null);
  const multRef = useRef<HTMLDivElement>(null);
  const roofRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [view, setView] = useState({ s: 0.45, x: 0, y: 0, portrait: true, bs: 1, bx: 0, by: 0 });
  const [phase, setPhase] = useState<"arrive" | "intro" | "start" | "rounds" | "close" | "multi" | "pay">("arrive");
  const [lit, setLit] = useState(false);
  const [open, setOpen] = useState<Record<number, ZParcel>>({});
  const [fresh, setFresh] = useState<number[]>([]);
  const [scan, setScan] = useState<number | null>(null);
  const [shaking, setShaking] = useState(false);
  const [windows, setWindows] = useState(ZBOX_WINDOWS);
  const [winFx, setWinFx] = useState<{ kind: "drop" | "reset"; n: number } | null>(null);
  const [round, setRound] = useState<{ n: number; w: number } | null>(null);
  const [cans, setCans] = useState<number[]>([]);
  const [canDrop, setCanDrop] = useState(0);
  /** Príplatok that already flew into the box (the roof keeps its cans). */
  const [canBank, setCanBank] = useState(0);
  const [stamp, setStamp] = useState(0);
  const [banner, setBanner] = useState<Banner>(null);
  const [lcd, setLcd] = useState<{ t: string; s?: string; tone?: "ok" | "bad" | "info" }>({ t: "Hľadám Ž-BOX…", s: "Zapnite Bluetooth, polohu, dáta, priblížte sa na 2 m a vypnite hodinky aj auto.", tone: "info" });
  const [mini, setMini] = useState<"…" | "✓" | "✕">("…");
  const [shut, setShut] = useState<Record<number, true>>({});
  /** € already counted into V SCHRÁNKACH (a value lands when its flying chip arrives). */
  const [banked, setBanked] = useState(0);
  const [bump, setBump] = useState(0);
  const [flies, setFlies] = useState<Fly[]>([]);
  const [multStep, setMultStep] = useState(0);
  const [payStep, setPayStep] = useState(0);
  const [canAsk, setCanAsk] = useState(false);
  const [flash, setFlash] = useState(0);
  /** NEDORUČENÉ gag: one empty compartment pops open for a moment — nothing inside (visual only). */
  const [peek, setPeek] = useState<number | null>(null);
  const fastRef = useRef(false);
  const nudgeRef = useRef<(() => void) | null>(null);
  const aliveRef = useRef(true);
  const flyId = useRef(0);
  const k = turbo ? 0.5 : 1;
  const parcelNo = useMemo(() => zboxParcelNo(Math.random), []);

  // Fit the locker: landscape = between the side columns (≤ 47 % of the width, ≤ 78 % of the height), portrait =
  // the locker fits the width between the top and bottom HUD. The backdrop is scaled to cover and shifted so its
  // ground line sits under the plinth; the blurred backdrop fills anything it does not cover.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const portrait = w / h < 1.15;
      const g = geo(portrait);
      const roof = 46;
      let s: number;
      let cy: number;
      if (portrait) {
        const top = Math.min(190, h * 0.2);
        const bottom = Math.min(214, h * 0.235);
        s = Math.min((w * 0.98) / LOCK_W, (h - top - bottom) / (g.lockH + roof));
        cy = top + (h - top - bottom) / 2 + (roof * s) / 2;
      } else {
        s = Math.min((h * 0.78) / (g.lockH + roof), (w * 0.47) / LOCK_W);
        cy = h * 0.5 + (roof * s) / 2;
      }
      const x = w / 2 - (LOCK_W / 2) * s;
      const y = cy - (g.lockH / 2) * s;
      const by = y + g.lockH * s;
      const bs = Math.max(w / BG_W, h / BG_H, (h - by) / (BG_H - BG_GROUND.y), s * 1.05);
      setView({ s, x, y, portrait, bs, bx: w / 2 - BG_GROUND.x * bs, by: by - BG_GROUND.y * bs });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /**
   * Script wait: scaled by turbo, 0 once skipped (PRESKOČIŤ). A tap anywhere ends the current step early;
   * `ask` = the step also lights DORUČIŤ (the pause between rounds).
   */
  const wait = useCallback(
    (ms: number, ask = false) =>
      new Promise<void>((resolve) => {
        if (fastRef.current || !aliveRef.current) return resolve();
        const t = window.setTimeout(done, ms * k);
        function done() {
          window.clearTimeout(t);
          if (nudgeRef.current === done) nudgeRef.current = null;
          setCanAsk(false);
          resolve();
        }
        nudgeRef.current = done;
        if (ask) setCanAsk(true);
      }),
    [k],
  );

  useEffect(() => {
    aliveRef.current = true;
    const loud = () => !fastRef.current;
    const opened = new Set<number>();
    let bank = 0;
    /** A chip flies from one element to another (screen space, root-relative); skipped in reduced motion. */
    const fly = async (kind: Fly["kind"], from: Element | null | undefined, to: Element | null | undefined, text: string, img?: string) => {
      const root = rootRef.current;
      if (!root || !from || !to || reduced || fastRef.current) return;
      const rb = root.getBoundingClientRect();
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const id = ++flyId.current;
      const f: Fly = { id, kind, text, img, x0: a.left + a.width / 2 - rb.left, y0: a.top + a.height / 2 - rb.top, x1: b.left + b.width / 2 - rb.left, y1: b.top + b.height / 2 - rb.top };
      setFlies((l) => [...l, f]);
      await wait(FLY_MS);
      setFlies((l) => l.filter((x) => x.id !== id));
    };
    const land = (eurV: number) => {
      bank = +(bank + eurV).toFixed(2);
      setBanked(bank);
      setBump((n) => n + 1);
    };
    /** Door by door: scan light + beep → pause → door swings, value counts up → chip flies into the total. */
    const reveal = async (parcels: ZParcel[]) => {
      for (const p of parcels) {
        opened.add(p.id);
        setScan(p.id);
        if (loud()) sfx.playZboxBeep(1.15);
        await wait(520);
        setScan(null);
        setOpen((o) => ({ ...o, [p.id]: p }));
        setFresh((f) => [...f, p.id]);
        if (loud()) sfx.playZboxOpen();
        await wait(760);
        await fly("val", cellRefs.current[p.id]?.querySelector(".zb-val"), totalRef.current, `${formatMoney(p.x * bet)} €`);
        land(p.x * bet);
        await wait(160);
      }
    };
    const run = async () => {
      // 1. arrival: push-in, power-on sheen
      await wait(300);
      setLit(true);
      if (loud()) sfx.playZboxBeep();
      await wait(1200);
      // 2. rules (tap to continue; continues by itself after a while)
      setPhase("intro");
      await wait(9000);
      // 3. start parcels
      setPhase("start");
      setLcd({ t: "Zásielky pripravené", s: `Č. zásielky ${parcelNo}`, tone: "ok" });
      setMini("✓");
      setBanner({ kind: "info", title: "ŠTARTOVÉ ZÁSIELKY", sub: `${play.start.length} schránky už niečo majú` });
      await wait(1300);
      setBanner(null);
      await reveal(play.start);
      await wait(500);
      // 4. rounds
      setPhase("rounds");
      let gag = Math.floor(Math.random() * ZBOX_GAGS.length);
      let before = ZBOX_WINDOWS;
      for (let i = 0; i < play.rounds.length; i++) {
        const r = play.rounds[i];
        setFresh([]);
        setWinFx(null);
        setRound({ n: i + 1, w: before });
        setBanner({ kind: "round", title: `KOLO ${i + 1}`, sub: `Doručovacie okná: ${before}` });
        await wait(1000);
        setBanner(null);
        setLcd({ t: "Hľadáme vašu zásielku…", s: "Na ceste · Triediace centrum · Na ceste", tone: "info" });
        setMini("…");
        if (loud()) sfx.playZboxBeep(0.9);
        setShaking(true);
        await wait(1100);
        setShaking(false);
        if (r.parcels.length) {
          setMini("✓");
          setLcd({
            t: "VYZDVIHNUTÉ ✓",
            s: `+${eur(r.parcels.reduce((s2, p) => s2 + p.x, 0) * bet)} · ${r.parcels.length === 1 ? "1 zásielka" : `${r.parcels.length} zásielky`}`,
            tone: "ok",
          });
          await reveal(r.parcels);
          setWindows(r.windows);
          setWinFx({ kind: "reset", n: i });
          setRound({ n: i + 1, w: r.windows });
          if (loud()) sfx.playZboxBeep(1.3);
          setBanner({ kind: "reset", title: `OKNÁ ${ZBOX_WINDOWS}/${ZBOX_WINDOWS}`, sub: "Nová zásielka → doručovacie okná späť na 3" });
          await wait(1400);
          setBanner(null);
        } else {
          setMini("✕");
          setWindows(r.windows);
          setWinFx({ kind: "drop", n: i });
          setRound({ n: i + 1, w: r.windows });
          if (loud()) sfx.playZboxMiss();
          setBanner({ kind: "miss", title: "NEDORUČENÉ", sub: r.windows ? `Doručovacie okná: ${before} → ${r.windows}` : "Posledné okno zavreté. Koniec doručovania." });
          if (loud()) {
            const empty = ZBOX_LAYOUT.filter((c) => !opened.has(c.id));
            if (empty.length) setPeek(empty[Math.floor(Math.random() * empty.length)].id);
          }
          setLcd({ t: "NEDORUČENÉ", s: ZBOX_GAGS[gag % ZBOX_GAGS.length], tone: "bad" });
          gag += 1;
          await wait(1800);
          setPeek(null);
          setBanner(null);
        }
        before = r.windows;
        if (r.can) {
          setCans((c) => [...c, r.can]);
          setCanDrop((n) => n + 1);
          setFlash((n) => n + 1);
          if (loud()) sfx.playZboxCan();
          setBanner({ kind: "can", title: `Kuriérsky príplatok ×${r.can}`, sub: "Plechovka na streche. Násobí všetko na konci." });
          await wait(1300);
          setBanner(null);
          const can = roofRef.current?.lastElementChild;
          await fly("can", can, multRef.current, `×${r.can}`, canSrc(r.can));
          setCanBank((v) => v + r.can);
          setStamp((n) => n + 1);
          if (loud()) sfx.playMult();
          await wait(900);
        }
        if (r.windows > 0) await wait(1300, true);
      }
      setRound(null);
      setWinFx(null);
      // 5. full wall
      if (play.full) {
        setLcd({ t: "VŠETKO DORUČENÉ", s: "Toto sa ešte nestalo.", tone: "ok" });
        if (loud()) sfx.playZboxFull();
        setBanner({ kind: "full", title: "VŠETKO DORUČENÉ ×2", sub: "Toto sa ešte nestalo." });
        await wait(2600);
        setBanner(null);
      }
      // 6. closing: the open doors slam one by one
      setPhase("close");
      setFresh([]);
      setBanner({ kind: "close", title: "Ž-BOX SA ZATVÁRA" });
      setLcd({ t: "Ž-BOX SA ZATVÁRA", s: "Úložná doba končí dnes o 23:59. Predĺžiť? (Nie.)", tone: "info" });
      await wait(1000);
      setBanner(null);
      const order = ZBOX_LAYOUT.filter((c) => opened.has(c.id)).sort((a, b) => a.row - b.row || (a.side === b.side ? a.col - b.col : a.side === "l" ? -1 : 1));
      for (const c of order) {
        setShut((s2) => ({ ...s2, [c.id]: true }));
        if (loud()) sfx.playZboxSlam();
        await wait(300);
      }
      bank = +(play.sumX * bet).toFixed(2);
      setBanked(bank);
      await wait(500);
      // 7. multiplier: total × príplatok (× 2) = výplata
      setCanBank(play.canSum);
      setPhase("multi");
      setMultStep(1);
      await wait(800);
      if (play.canSum) {
        setMultStep(2);
        if (loud()) sfx.playMult();
        await wait(900);
      }
      if (play.full) {
        setMultStep(3);
        if (loud()) sfx.playMult();
        await wait(900);
      }
      setMultStep(4);
      await wait(1700);
      // 8. payout card: cap, tax, count-up
      setPhase("pay");
      setPayStep(1);
      await wait(play.canSum ? 700 : 300);
      setPayStep(2);
      await wait(play.full || play.capped ? 700 : 250);
      setPayStep(3);
      await wait(tax ? 900 : 200);
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
    setFlies([]);
    nudgeRef.current?.();
  };
  const deliver = (e: React.MouseEvent) => {
    e.stopPropagation();
    sfx.playClick();
    nudgeRef.current?.();
  };

  const g = geo(view.portrait);
  const allParcels = Object.values(open);
  const done = phase === "pay" && payStep >= 4;
  const tap = () => (done ? onDone() : nudgeRef.current?.());
  const capped = play.capped;
  const taxPct = tax === "danUrad" ? "−23 %" : tax === "bezDane" ? "+23 %" : "";

  const full = play.full && (phase === "close" || phase === "multi" || phase === "pay" || banner?.kind === "full");
  const multTotal = +(play.sumX * bet).toFixed(2);
  return (
    <div
      ref={rootRef}
      className={`zb-root ph-${phase} ${view.portrait ? "is-portrait" : "is-wide"} ${turbo ? "is-turbo" : ""} ${reduced ? "is-reduced" : ""} ${full ? "is-full" : ""}`}
      role="dialog"
      aria-label="Ž-BOX"
      onClick={tap}
    >
      <div className="zb-blur" aria-hidden="true" />
      <img
        className="zb-bg"
        src="/zbox/bg.webp"
        alt=""
        draggable={false}
        style={{ transform: `translate3d(${view.bx}px, ${view.by}px, 0) scale(${view.bs})` }}
      />
      <div className="zb-scene" style={{ width: LOCK_W, height: g.lockH, transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.s})` }}>
        <div className="zb-push">
          <div className="zb-glow" aria-hidden="true" />
          <div className="zb-floor" aria-hidden="true" />
          <div className="zb-roof" ref={roofRef} aria-hidden="true">
            {cans.map((c, i) => (
              <span key={i} className={`zb-can ${i === cans.length - 1 && canDrop ? "is-new" : ""}`} style={{ ["--i" as string]: String(i) }}>
                <img src={canSrc(c)} alt="" />
                <b>×{c}</b>
              </span>
            ))}
          </div>
          <div className="zb-locker">
            <div className="zb-cap" aria-hidden="true">
              {Array.from({ length: COLS }, (_, i) => (
                <i key={i} style={{ left: SIDE + colX(i) - (i ? GAP / 2 : SIDE), width: COL_W + (i ? GAP / 2 : SIDE) + (i < COLS - 1 ? GAP / 2 : SIDE) }} />
              ))}
              <em className="zb-badge">PAKEŤÁK</em>
            </div>
            <div className="zb-plinth" aria-hidden="true">
              {Array.from({ length: COLS }, (_, i) => (
                <i key={i} style={{ left: SIDE + colX(i) - (i ? GAP / 2 : SIDE), width: COL_W + (i ? GAP / 2 : SIDE) + (i < COLS - 1 ? GAP / 2 : SIDE) }} />
              ))}
            </div>
            <div className={`zb-wall ${lit ? "is-lit" : ""} ${shaking ? "is-shake" : ""}`} style={{ left: SIDE, top: CAP + INSET, width: FIELD_W, height: g.fieldH }}>
              {decorRects(g).map((r, i) => (
                <div key={`d${i}`} className="zb-fix" style={{ ...r, ...faceStyle(r, g) }} />
              ))}
              {ZBOX_LAYOUT.map((c) => {
                const r = cellRect(c, g);
                const p = open[c.id];
                const isShut = !!shut[c.id];
                const peeking = peek === c.id && !p;
                const state = (p && !isShut) || peeking ? "is-open" : "is-closed";
                return (
                  <div
                    key={c.id}
                    ref={(el) => {
                      cellRefs.current[c.id] = el;
                    }}
                    className={`zb-cell side-${c.side} size-${c.size} ${state} ${p ? "has-parcel" : ""} ${peeking ? "is-peek" : ""} ${scan === c.id ? "is-scan" : ""} ${p?.vip ? "is-vip" : ""} ${fresh.includes(c.id) ? "is-fresh" : ""}`}
                    style={{ ...r, ["--d" as string]: `${(c.row * 90 + c.col * 30 + (c.side === "r" ? 15 : 0)) * k}ms` }}
                  >
                    <div className="zb-in">
                      {p ? (
                        <>
                          <img className="zb-parcel" src="/zbox/parcel.webp" alt="" draggable={false} />
                          <span className="zb-val">
                            {p.vip ? <i>PRIORITNÁ</i> : null}
                            <b>
                              {fresh.includes(c.id) && !reduced ? <RiseUp value={p.x * bet} /> : formatMoney(p.x * bet)}
                              &nbsp;€
                            </b>
                          </span>
                        </>
                      ) : peeking ? (
                        <span className="zb-slip">PRÁZDNE</span>
                      ) : null}
                    </div>
                    <div className="zb-door">
                      <span className="zb-face" style={faceStyle(r, g)} />
                      <span className="zb-back" />
                      <span className="zb-edge" />
                    </div>
                    {scan === c.id ? <span className="zb-scanline" aria-hidden="true" /> : null}
                  </div>
                );
              })}
              <div className={`zb-mini is-${mini === "✓" ? "ok" : mini === "✕" ? "bad" : "wait"} ${lit ? "is-lit" : ""}`} style={{ left: colX(5) + (COL_W - 58) / 2, top: Math.round(g.fieldH * 0.05) }} aria-hidden="true">
                <em>Ž-BOX</em>
                <b>{mini}</b>
                <span>{allParcels.length}/12</span>
              </div>
            </div>
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

      {round ? (
        <div className="zb-round" aria-live="polite">
          <b key={round.n}>KOLO {round.n}</b>
          <span>
            Doručovacie okná: <em key={`${round.n}-${round.w}`}>{round.w}</em>
          </span>
        </div>
      ) : null}

      <aside className="zb-left">
        <div className="zb-brand">
          <span className="zb-mark">
            <ZboxCube />
          </span>
          <div>
            <b>PAKEŤÁK</b>
            <span>Ž-BOX · zamknuté schránky</span>
          </div>
        </div>
        <div className={`zb-lcd is-${lcd.tone ?? "info"}`} aria-live="polite">
          <b>{lcd.t}</b>
          {lcd.s ? <span>{lcd.s}</span> : null}
        </div>
        <div key={winFx ? `${winFx.kind}${winFx.n}` : "w"} className={`zb-windows ${winFx ? `is-${winFx.kind}` : ""}`} aria-label={`Doručovacie okná: ${windows}`}>
          <span>Doručovacie okná: {windows}</span>
          <div>
            {Array.from({ length: ZBOX_WINDOWS }, (_, i) => (
              <i key={i} className={`${i < windows ? "is-on" : "is-off"} ${winFx?.kind === "drop" && i === windows ? "is-lost" : ""}`} style={{ ["--i" as string]: String(i) }}>
                <Truck size={18} strokeWidth={2.2} />
              </i>
            ))}
          </div>
        </div>
      </aside>

      <aside className="zb-right">
        <div ref={totalRef} className="zb-total">
          {bump ? <i key={bump} className="zb-total-flash" aria-hidden="true" /> : null}
          <span>V schránkach</span>
          <b>
            <CountUp value={banked} ms={420} />
            &nbsp;€
          </b>
        </div>
        <div ref={multRef} className={`zb-mult ${canBank ? "is-on" : ""}`}>
          <span>Kuriérsky príplatok</span>
          <b>×{canBank || 1}</b>
          {stamp ? (
            <em key={stamp} className="zb-stamp">
              ×{canBank}
            </em>
          ) : null}
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

      {flies.map((f) => (
        <span
          key={f.id}
          className={`zb-fly is-${f.kind}`}
          aria-hidden="true"
          style={{ left: f.x0, top: f.y0, ["--dx" as string]: `${f.x1 - f.x0}px`, ["--dy" as string]: `${f.y1 - f.y0}px`, ["--ms" as string]: `${FLY_MS * k}ms` }}
        >
          {f.img ? <img src={f.img} alt="" /> : null}
          <b>{f.text}</b>
        </span>
      ))}

      {banner ? (
        <div key={banner.title + windows + (round?.n ?? 0)} className={`zb-banner is-${banner.kind}`} aria-live="assertive">
          <b>{banner.title}</b>
          {banner.sub ? <span>{banner.sub}</span> : null}
        </div>
      ) : null}

      {phase === "intro" ? (
        <div className="zb-intro" role="status">
          <p className="zb-intro-head">
            <span className="zb-mark">
              <ZboxCube />
            </span>
            Ž-BOX · PAKEŤÁK
          </p>
          <ol>
            <li>
              <b>Každé kolo</b> môžu do prázdnych schránok doraziť zásielky s výhrou.
            </li>
            <li>
              <b>Nová zásielka</b> → doručovacie okná späť na 3. Kolo bez zásielky = −1 okno. Pri 0 koniec.
            </li>
            <li>
              <b>Plechovka</b> na streche násobí súčet na konci. Plná stena (12/12) = <b>×2</b>.
            </li>
          </ol>
          <p className="zb-intro-tap">Ťukni pre pokračovanie</p>
        </div>
      ) : null}

      {play.full && (banner?.kind === "full" || phase === "pay") && !reduced ? (
        <div className="zb-confetti" aria-hidden="true">
          {Array.from({ length: 28 }, (_, i) => (
            <i key={i} style={{ ["--x" as string]: `${(i * 37) % 100}%`, ["--t" as string]: `${(i % 7) * 0.13}s`, ["--h" as string]: String((i * 53) % 360) }} />
          ))}
        </div>
      ) : null}

      {phase === "multi" ? (
        <div className="zb-eq" role="status">
          <p className="zb-eq-head">VÝPOČET VÝPLATY</p>
          <div className="zb-eq-row">
            <span className="zb-eq-t">
              <i>V schránkach</i>
              <b>{eur(multTotal)}</b>
            </span>
            <span className={`zb-eq-m ${multStep >= 2 && play.canSum ? "is-on" : play.canSum ? "is-wait" : "is-one"}`}>
              <i>Príplatok</i>
              <b>×{play.canSum || 1}</b>
            </span>
            {play.full ? (
              <span className={`zb-eq-m is-full ${multStep >= 3 ? "is-on" : "is-wait"}`}>
                <i>Plná stena</i>
                <b>×2</b>
              </span>
            ) : null}
          </div>
          <div className={`zb-eq-res ${multStep >= 4 ? "is-on" : ""}`}>
            <i>= výplata</i>
            <b>
              <CountUp value={multStep >= 4 ? gross : 0} ms={1100 * k} />
              &nbsp;€
            </b>
            {capped && multStep >= 4 ? <em>Strop Ž-BOXu: 30× stávky</em> : null}
          </div>
          <p className="zb-pay-tap">{"\u00a0"}</p>
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
              <CountUp value={payStep >= 4 ? net : gross} ms={payStep >= 4 ? 1100 * k : 420} glide />
              &nbsp;€
            </b>
          </div>
          <p className="zb-pay-tap">{done ? "Ťukni pre návrat" : "\u00a0"}</p>
        </div>
      ) : null}
    </div>
  );
}
