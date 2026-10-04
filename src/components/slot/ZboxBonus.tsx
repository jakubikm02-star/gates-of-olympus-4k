import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Info, Truck } from "lucide-react";
import {
  CAN_TABLE,
  ZBOX_CAP_X,
  ZBOX_CELLS,
  ZBOX_FULL_MUL,
  ZBOX_GAGS,
  ZBOX_LAYOUT,
  ZBOX_MODS,
  ZBOX_ROWS,
  ZBOX_TICKER,
  ZBOX_WINDOWS,
  zboxParcelNo,
  type ZCell,
  type ZFx,
  type ZMod,
  type ZParcel,
  type ZPlay,
} from "@/lib/slot/zbox";
import { setZboxHelpOff, takeZboxCoach, zboxHelpOff } from "@/lib/slot/zbox-help";
import { canSrc } from "@/lib/slot/symbols";
import type { ChaseModKind } from "@/lib/slot/zasah";
import * as sfx from "@/lib/slot/audio";
import { formatMoney } from "@/lib/slot/format";
import { CountUp } from "./CountUp";
import { ModIcon, ZboxRules } from "./ZboxRules";

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
/** Slovak count word: 1 / 2–4 / 0 and 5+. */
function pl(n: number, one: string, few: string, many: string): string {
  return n === 1 ? one : n >= 2 && n <= 4 ? few : many;
}
const balik = (n: number) => `${n} ${pl(n, "balík", "balíky", "balíkov")}`;
const okno = (n: number) => `${n} ${pl(n, "okno", "okná", "okien")}`;
const MOD_BY = Object.fromEntries(ZBOX_MODS.map((m) => [m.mod, m])) as Record<ZMod, (typeof ZBOX_MODS)[number]>;

type Banner = { kind: "full" | "close" | "can" | "mod"; title: string; sub?: string; mod?: ZMod } | null;
type Fly = { id: number; kind: "val" | "can"; text: string; img?: string; x0: number; y0: number; x1: number; y1: number };
type Status = { t: string; s?: string; tone?: "ok" | "bad" | "info" | "mod" };
type Tag = { t: string; tone: "up" | "down" | "mod"; k: number };
type TipAnchor = "windows" | "wall" | "total" | "cell";
type Tip = { id: string; text: string; anchor: TipAnchor; cell?: number };
const FLY_MS = 700;

/** Compartment value: counts up from 0 when the door opens, then glides to every new value a special sets. */
function CellVal({ value, rise }: { value: number; rise: boolean }) {
  const [v, setV] = useState(rise ? 0 : value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), rise ? 120 : 0);
    return () => window.clearTimeout(t);
  }, [value, rise]);
  return <CountUp value={v} ms={520} glide />;
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
 * Ž-BOX overlay. Animates a run that is already decided (lib/slot/zbox playZbox): arrival, rules card (until the
 * player turns it off, lib/slot/zbox-help), start parcels, delivery rounds, roof cans, doors slamming, the
 * multiplier equation, payout. A round is a visible roll: the courier tests every closed compartment in id
 * order (the engine's draw order), a hit stops the sweep and opens that door, a miss flashes grey "prázdne".
 * Special parcels announce themselves and their effect lands on the target compartments. The status display
 * (LCD) says what happened ("+1 balík! Okná späť na 3", "Nič nedoručené → −1 okno"); the windows are labelled
 * as lives. First runs on a device show coach tips. Timers only step a script; motion is CSS transform/opacity.
 * Tap = end the current step (in a sweep: finish the sweep at once), PRESKOČIŤ = jump to the end, turbo ≈ 2×
 * faster, reduced motion = fades only. The (i) sheet and the "Už nezobrazovať" confirm pause the script.
 */
export function ZboxBonus({ play, bet, gross, net, tax, turbo, reduced, onDone }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const totalRef = useRef<HTMLDivElement>(null);
  const multRef = useRef<HTMLDivElement>(null);
  const roofRef = useRef<HTMLDivElement>(null);
  const winRef = useRef<HTMLDivElement>(null);
  const wallRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [view, setView] = useState({ s: 0.45, x: 0, y: 0, portrait: true, bs: 1, bx: 0, by: 0 });
  const [phase, setPhase] = useState<"arrive" | "intro" | "start" | "rounds" | "close" | "multi" | "pay">("arrive");
  const [lit, setLit] = useState(false);
  const [open, setOpen] = useState<Record<number, ZParcel>>({});
  /** Current value of every open compartment (× bet): parcel value, then whatever the specials set. */
  const [vals, setVals] = useState<Record<number, number>>({});
  const [fresh, setFresh] = useState<number[]>([]);
  /** Sweep: the compartment under test, the hit that stops it, the misses already flashed this round. */
  const [test, setTest] = useState<number | null>(null);
  const [hit, setHit] = useState<number | null>(null);
  const [nil, setNil] = useState<number[]>([]);
  const [tags, setTags] = useState<Record<number, Tag>>({});
  const [windows, setWindows] = useState(ZBOX_WINDOWS);
  const [winFx, setWinFx] = useState<{ kind: "drop" | "reset"; n: number } | null>(null);
  const [round, setRound] = useState<number | null>(null);
  const [cans, setCans] = useState<number[]>([]);
  const [canDrop, setCanDrop] = useState(0);
  /** Príplatok that already flew into the box (the roof keeps its cans). */
  const [canBank, setCanBank] = useState(0);
  const [stamp, setStamp] = useState(0);
  const [banner, setBanner] = useState<Banner>(null);
  const [status, setStatus] = useState<Status>({ t: "Hľadám Ž-BOX…", s: "Zapnite Bluetooth, polohu, dáta, priblížte sa na 2 m a vypnite hodinky aj auto.", tone: "info" });
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
  const [tip, setTip] = useState<(Tip & { x: number; y: number; w: number; below: boolean }) | null>(null);
  /** Modal on top of the run: the rules sheet (i) or the "Už nezobrazovať" confirm. Both pause the script. */
  const [sheet, setSheet] = useState<null | "info" | "off">(null);
  const fastRef = useRef(false);
  const nudgeRef = useRef<(() => void) | null>(null);
  const aliveRef = useRef(true);
  const pausedRef = useRef(false);
  const heldRef = useRef<(() => void)[]>([]);
  const sweepRef = useRef(false);
  const hurryRef = useRef(false);
  const valsRef = useRef<Record<number, number>>({});
  const tagK = useRef(0);
  const flyId = useRef(0);
  /** Explanation on (rules card); coach tips only for the first COACH_RUNS runs on this device. */
  const helpRef = useRef(!zboxHelpOff());
  const coachRef = useRef(false);
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
        const top = Math.min(206, h * 0.22);
        const bottom = Math.min(222, h * 0.24);
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
   * `ask` = the step also lights DORUČIŤ (the pause between rounds). While a sheet is open (pausedRef) a step
   * that ends is held and resumes when the sheet closes.
   */
  const wait = useCallback(
    (ms: number, ask = false) =>
      new Promise<void>((resolve) => {
        if (fastRef.current || !aliveRef.current) return resolve();
        const t = window.setTimeout(done, ms * k);
        function done() {
          window.clearTimeout(t);
          if (pausedRef.current && !fastRef.current && aliveRef.current) {
            if (!heldRef.current.includes(done)) heldRef.current.push(done);
            return;
          }
          if (nudgeRef.current === done) nudgeRef.current = null;
          setCanAsk(false);
          resolve();
        }
        nudgeRef.current = done;
        if (ask) setCanAsk(true);
      }),
    [k],
  );
  const pause = (why: "info" | "off") => {
    pausedRef.current = true;
    setSheet(why);
  };
  const resume = () => {
    pausedRef.current = false;
    setSheet(null);
    const held = heldRef.current;
    heldRef.current = [];
    held.forEach((f) => f());
  };

  /** Coach tip next to its anchor (root-relative), above it when the anchor sits in the lower half. */
  const showTip = useCallback((t: Tip) => {
    const root = rootRef.current;
    const el = t.anchor === "windows" ? winRef.current : t.anchor === "total" ? totalRef.current : t.anchor === "cell" && t.cell != null ? cellRefs.current[t.cell] : wallRef.current;
    if (!root || !el) return;
    const rb = root.getBoundingClientRect();
    const a = el.getBoundingClientRect();
    const w = Math.min(300, rb.width - 20);
    const cx = a.left + a.width / 2 - rb.left;
    const x = Math.max(10, Math.min(rb.width - w - 10, cx - w / 2));
    // the sweep tip sits above the wall so the doors under test stay visible
    const below = t.anchor === "wall" ? false : a.top + a.height / 2 - rb.top < rb.height / 2;
    const y = below ? a.bottom - rb.top + 10 : a.top - rb.top - 8;
    setTip({ ...t, x, y, w, below });
  }, []);
  useEffect(() => {
    if (!tip) return;
    const t = window.setTimeout(() => setTip(null), 7000 * k);
    return () => window.clearTimeout(t);
  }, [tip, k]);

  useEffect(() => {
    aliveRef.current = true;
    coachRef.current = helpRef.current && takeZboxCoach();
    const loud = () => !fastRef.current;
    const opened = new Set<number>();
    const tipsShown = new Set<string>();
    let bank = 0;
    const coach = async (t: Tip) => {
      if (!coachRef.current || fastRef.current || tipsShown.has(t.id)) return;
      tipsShown.add(t.id);
      showTip(t);
      await wait(1500);
    };
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
    const setVal = (id: number, x: number) => {
      valsRef.current = { ...valsRef.current, [id]: x };
      setVals(valsRef.current);
    };
    const valEl = (id: number) => cellRefs.current[id]?.querySelector(".zb-val");
    /** Door swings open, value counts up, chip flies into V SCHRÁNKACH. */
    const openParcel = async (p: ZParcel) => {
      opened.add(p.id);
      setVal(p.id, p.x);
      setOpen((o) => ({ ...o, [p.id]: p }));
      setFresh((f) => [...f, p.id]);
      if (loud()) sfx.playZboxOpen();
      await wait(760);
      await fly("val", valEl(p.id), totalRef.current, `${formatMoney(p.x * bet)} €`);
      land(p.x * bet);
      await coach({ id: "total", anchor: "total", text: "Hodnoty balíkov sa sčítavajú sem. Na konci ich vynásobí kuriérsky príplatok (plechovka na streche)." });
      await wait(160);
    };
    /** A special acts: announce (landing only), chips fly, the target values change, the total follows. */
    const applyFx = async (f: ZFx) => {
      const m = MOD_BY[f.mod];
      const own = valsRef.current[f.by] ?? 0;
      const targets = f.set.filter((x) => x.id !== f.by);
      let sub = m.line;
      if (f.mod === "kurier") sub = `×2 na ${balik(targets.length)}`;
      else if (f.mod === "dobierka") sub = `+${eur(own * bet)} každému z ${balik(targets.length)}`;
      else if (f.mod === "zberny") sub = `Pripočíta si ${eur(((f.set[0]?.x ?? own) - own) * bet)} zo všetkých ostatných balíkov`;
      else if (f.mod === "sklad") sub = `−10 % z ${balik(targets.length)}`;
      else if (f.mod === "presmer") sub = `Okná sa doplnia na ${f.windows ?? ZBOX_WINDOWS + 1} namiesto ${ZBOX_WINDOWS}`;
      else if (f.mod === "expres") sub = f.tick ? `+${eur(own * bet)} všetkým ostatným balíkom` : `Po každom ďalšom kole +${eur(own * bet)} všetkým ostatným`;
      if (!f.tick) {
        setBanner({ kind: "mod", mod: f.mod, title: m.name, sub });
        setStatus({ t: `${m.name}!`, s: sub, tone: "mod" });
        if (loud()) sfx.playMult();
        await wait(1500);
        setBanner(null);
        await coach({ id: "mod", anchor: "cell", cell: f.by, text: "Špeciálny balík! Mení hodnoty ostatných balíkov v stene. Prehľad nájdeš v (i)." });
      } else {
        setStatus({ t: `EXPRES · ${sub}`, s: "Expres pôsobí po každom ďalšom kole.", tone: "mod" });
        if (loud()) sfx.playZboxBeep(1.4);
      }
      if (!f.set.length) return;
      if (f.mod === "zberny") {
        const from = Object.keys(valsRef.current).map(Number).filter((id) => id !== f.by);
        await Promise.all(from.map((id) => fly("val", valEl(id), valEl(f.by), `+${formatMoney(valsRef.current[id] * bet)} €`)));
      } else if (f.mod === "dobierka" || f.mod === "expres") {
        await Promise.all(targets.map((t) => fly("val", valEl(f.by), valEl(t.id), `+${formatMoney(own * bet)} €`)));
      }
      let delta = 0;
      const nextTags: Record<number, Tag> = {};
      for (const x of f.set) {
        const before = valsRef.current[x.id] ?? 0;
        delta += x.x - before;
        setVal(x.id, x.x);
        const t = f.mod === "kurier" ? "×2" : f.mod === "sklad" ? "−10 %" : `+${formatMoney((x.x - before) * bet)} €`;
        nextTags[x.id] = { t, tone: f.mod === "sklad" ? "down" : "up", k: ++tagK.current };
      }
      setTags((o) => ({ ...o, ...nextTags }));
      if (loud()) (f.mod === "sklad" ? sfx.playZboxMiss : sfx.playMult)();
      await wait(450);
      land(+(delta * bet).toFixed(2));
      await wait(700);
      setTags({});
    };
    const run = async () => {
      // 1. arrival: push-in, power-on sheen
      await wait(300);
      setLit(true);
      if (loud()) sfx.playZboxBeep();
      await wait(1200);
      // 2. rules (until turned off; tap or Pokračovať to continue, continues by itself after a while)
      if (helpRef.current) {
        setPhase("intro");
        await wait(14000);
      }
      // 3. start parcels
      setPhase("start");
      setMini("✓");
      setStatus({ t: "Štartové balíky", s: `${balik(play.start.length)} už čaká v stene · č. zásielky ${parcelNo}`, tone: "ok" });
      for (const p of play.start) await openParcel(p);
      await wait(400);
      // 4. rounds: the sweep
      setPhase("rounds");
      let before = ZBOX_WINDOWS;
      let gag = Math.floor(Math.random() * ZBOX_GAGS.length);
      for (let i = 0; i < play.rounds.length; i++) {
        const r = play.rounds[i];
        const closed = ZBOX_LAYOUT.filter((c) => !opened.has(c.id)).map((c) => c.id);
        setFresh([]);
        setNil([]);
        setWinFx(null);
        setRound(i + 1);
        setMini("…");
        setStatus({ t: "Kuriér prichádza…", s: `Testuje ${closed.length} ${pl(closed.length, "zatvorenú schránku", "zatvorené schránky", "zatvorených schránok")} · ${pl(before, "ostáva", "ostávajú", "ostáva")} ${okno(before)}`, tone: "info" });
        if (loud()) sfx.playZboxBeep(0.9);
        await wait(800);
        if (i === 0) {
          await coach({ id: "windows", anchor: "windows", text: `Doručovacie okná = pokusy. Nový balík ich doplní na ${ZBOX_WINDOWS}. Kolo bez balíka zoberie 1 okno. Pri 0 Ž-BOX končí.` });
          await coach({ id: "wall", anchor: "wall", text: "Kuriér skúša zatvorené schránky jednu po druhej. Zlatá = balík, sivé „prázdne“ = nič. Ťuknutím kolo zrýchliš." });
        }
        const hits = new Map(r.parcels.map((p) => [p.id, p]));
        const fxBy = new Map(r.fx.filter((f) => !f.tick).map((f) => [f.by, f]));
        const step = Math.max(70, Math.min(150, 1200 / Math.max(1, closed.length)));
        hurryRef.current = false;
        sweepRef.current = true;
        let found = 0;
        for (const id of closed) {
          const p = hits.get(id);
          setTest(id);
          if (!p) {
            if (!hurryRef.current && !fastRef.current) {
              if (loud()) sfx.playZboxBeep(0.7);
              await wait(step);
            }
            setNil((n) => [...n, id]);
            continue;
          }
          setTest(null);
          setHit(id);
          if (loud()) sfx.playZboxBeep(1.2);
          sweepRef.current = false;
          await wait(420);
          setHit(null);
          found += 1;
          setMini("✓");
          setStatus({ t: `+${balik(found)}!`, s: `${p.mod ? `${MOD_BY[p.mod].name} · ` : ""}${eur(p.x * bet)} v schránke`, tone: p.mod ? "mod" : "ok" });
          await openParcel(p);
          const f = fxBy.get(id);
          if (f) await applyFx(f);
          sweepRef.current = true;
        }
        setTest(null);
        sweepRef.current = false;
        for (const f of r.fx) if (f.tick) await applyFx(f);
        setWindows(r.windows);
        if (r.parcels.length) {
          setWinFx({ kind: "reset", n: i });
          if (loud()) sfx.playZboxBeep(1.3);
          setStatus({
            t: `+${balik(r.parcels.length)}! Okná späť na ${r.windows}`,
            s: r.windows > ZBOX_WINDOWS ? "PRESMEROVANIE: o 1 okno viac." : `Nový balík vždy doplní okná na ${ZBOX_WINDOWS}.`,
            tone: "ok",
          });
          await wait(1400);
        } else {
          setMini("✕");
          setWinFx({ kind: "drop", n: i });
          if (loud()) sfx.playZboxMiss();
          setStatus({
            t: "Nič nedoručené → −1 okno",
            s: r.windows ? `${pl(r.windows, "Ostáva", "Ostávajú", "Ostáva")} ${okno(r.windows)}. ${ZBOX_GAGS[gag % ZBOX_GAGS.length]}` : "Posledné okno zhaslo. Ž-BOX končí.",
            tone: "bad",
          });
          gag += 1;
          await wait(1800);
        }
        before = r.windows;
        if (r.can) {
          setCans((c) => [...c, r.can]);
          setCanDrop((n) => n + 1);
          setFlash((n) => n + 1);
          if (loud()) sfx.playZboxCan();
          setBanner({ kind: "can", title: `Kuriérsky príplatok ×${r.can}`, sub: "Plechovka na streche. Na konci násobí súčet." });
          await wait(1300);
          setBanner(null);
          const can = roofRef.current?.lastElementChild;
          await fly("can", can, multRef.current, `×${r.can}`, canSrc(r.can));
          setCanBank((v) => v + r.can);
          setStamp((n) => n + 1);
          if (loud()) sfx.playMult();
          await wait(900);
        }
        if (r.windows > 0 && i < play.rounds.length - 1) await wait(1300, true);
      }
      setRound(null);
      setWinFx(null);
      setNil([]);
      // 5. full wall
      if (play.full) {
        setStatus({ t: "VŠETKO DORUČENÉ", s: "Toto sa ešte nestalo.", tone: "ok" });
        if (loud()) sfx.playZboxFull();
        setBanner({ kind: "full", title: `VŠETKO DORUČENÉ ×${ZBOX_FULL_MUL}`, sub: "Toto sa ešte nestalo." });
        await wait(2600);
        setBanner(null);
      }
      // 6. closing: the open doors slam one by one
      setPhase("close");
      setFresh([]);
      setBanner({ kind: "close", title: "Ž-BOX SA ZATVÁRA" });
      setStatus({ t: "Ž-BOX SA ZATVÁRA", s: "Úložná doba končí dnes o 23:59. Predĺžiť? (Nie.)", tone: "info" });
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
    setTip(null);
    nudgeRef.current?.();
  };
  const deliver = (e: React.MouseEvent) => {
    e.stopPropagation();
    sfx.playClick();
    nudgeRef.current?.();
  };
  const openInfo = (e: React.MouseEvent) => {
    e.stopPropagation();
    sfx.playClick();
    pause("info");
  };
  const askOff = (e: React.MouseEvent) => {
    e.stopPropagation();
    sfx.playClick();
    pause("off");
  };
  const confirmOff = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZboxHelpOff(true);
    helpRef.current = false;
    coachRef.current = false;
    setTip(null);
    const intro = phase === "intro";
    resume();
    if (intro) nudgeRef.current?.();
  };
  const closeSheet = (e: React.MouseEvent) => {
    e.stopPropagation();
    sfx.playClick();
    resume();
  };

  const g = geo(view.portrait);
  const allParcels = Object.values(open);
  const done = phase === "pay" && payStep >= 4;
  const tap = () => {
    if (sheet) return;
    if (done) return onDone();
    if (sweepRef.current) hurryRef.current = true;
    else nudgeRef.current?.();
  };
  const capped = play.capped;
  const taxPct = tax === "danUrad" ? "−23 %" : tax === "bezDane" ? "+23 %" : "";

  const full = play.full && (phase === "close" || phase === "multi" || phase === "pay" || banner?.kind === "full");
  const multTotal = +(play.sumX * bet).toFixed(2);
  const lives = Math.max(ZBOX_WINDOWS, windows);
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
            <div ref={wallRef} className={`zb-wall ${lit ? "is-lit" : ""}`} style={{ left: SIDE, top: CAP + INSET, width: FIELD_W, height: g.fieldH }}>
              {decorRects(g).map((r, i) => (
                <div key={`d${i}`} className="zb-fix" style={{ ...r, ...faceStyle(r, g) }} />
              ))}
              {ZBOX_LAYOUT.map((c) => {
                const r = cellRect(c, g);
                const p = open[c.id];
                const isShut = !!shut[c.id];
                const state = p && !isShut ? "is-open" : "is-closed";
                const tag = tags[c.id];
                const isNil = nil.includes(c.id) && !p;
                return (
                  <div
                    key={c.id}
                    ref={(el) => {
                      cellRefs.current[c.id] = el;
                    }}
                    className={`zb-cell side-${c.side} size-${c.size} ${state} ${p ? "has-parcel" : ""} ${test === c.id ? "is-test" : ""} ${hit === c.id ? "is-hit" : ""} ${isNil ? "is-nil" : ""} ${p?.vip ? "is-vip" : ""} ${p?.mod ? `is-mod mod-${p.mod}` : ""} ${fresh.includes(c.id) ? "is-fresh" : ""} ${tag ? `is-tag is-${tag.tone}` : ""}`}
                    style={{ ...r, ["--d" as string]: `${(c.row * 90 + c.col * 30 + (c.side === "r" ? 15 : 0)) * k}ms` }}
                  >
                    <div className="zb-in">
                      {p ? (
                        <>
                          <img className="zb-parcel" src="/zbox/parcel.webp" alt="" draggable={false} />
                          {p.mod ? (
                            <span className="zb-modb">
                              <ModIcon mod={p.mod} size={view.portrait ? 22 : 13} />
                              <i>{MOD_BY[p.mod].name}</i>
                            </span>
                          ) : null}
                          <span className="zb-val">
                            {p.vip ? <i>PRIORITNÁ</i> : null}
                            <b>
                              <CellVal value={(vals[c.id] ?? p.x) * bet} rise={fresh.includes(c.id) && !reduced} />
                              &nbsp;€
                            </b>
                          </span>
                        </>
                      ) : null}
                    </div>
                    <div className="zb-door">
                      <span className="zb-face" style={faceStyle(r, g)} />
                      <span className="zb-back" />
                      <span className="zb-edge" />
                    </div>
                    {isNil ? <span className="zb-nil">prázdne</span> : null}
                    {test === c.id || hit === c.id ? <span className="zb-scanline" aria-hidden="true" /> : null}
                    {tag ? (
                      <span key={tag.k} className="zb-tag">
                        {tag.t}
                      </span>
                    ) : null}
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

      {phase !== "arrive" && phase !== "intro" ? (
        <div className="zb-round" aria-hidden="true">
          <b key={round ?? 0}>{round ? `KOLO ${round}` : phase === "start" ? "ŠTART" : "KONIEC"}</b>
          <span>
            Balíky <em key={allParcels.length}>{allParcels.length}</em>/{ZBOX_CELLS}
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
        <div className={`zb-lcd is-${status.tone ?? "info"}`} aria-live="polite">
          <b key={status.t}>{status.t}</b>
          {status.s ? <span>{status.s}</span> : null}
        </div>
        <div
          ref={winRef}
          key={winFx ? `${winFx.kind}${winFx.n}` : "w"}
          className={`zb-windows ${winFx ? `is-${winFx.kind}` : ""}`}
          aria-label={`Doručovacie okná (pokusy): ${windows}`}
        >
          <span>
            <b>Okná = pokusy: {windows}</b>
            <small>Nový balík doplní na {ZBOX_WINDOWS} · pri 0 koniec</small>
          </span>
          <div>
            {Array.from({ length: lives }, (_, i) => (
              <i key={i} className={`${i < windows ? "is-on" : "is-off"} ${i >= ZBOX_WINDOWS ? "is-extra" : ""} ${winFx?.kind === "drop" && i === windows ? "is-lost" : ""}`} style={{ ["--i" as string]: String(i) }}>
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
            <CountUp value={banked} ms={420} glide />
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
          <button type="button" className="zb-info" onClick={openInfo} aria-label="Pravidlá Ž-BOXu">
            <Info size={20} strokeWidth={2.4} />
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
        <div key={banner.title + (banner.sub ?? "")} className={`zb-banner is-${banner.kind} ${banner.mod ? `mod-${banner.mod}` : ""}`} aria-live="assertive">
          {banner.mod ? (
            <i className="zb-banner-ico">
              <ModIcon mod={banner.mod} size={34} />
            </i>
          ) : null}
          {banner.mod ? <em>ŠPECIÁLNY BALÍK</em> : null}
          <b>{banner.title}</b>
          {banner.sub ? <span>{banner.sub}</span> : null}
        </div>
      ) : null}

      {tip && !sheet ? (
        <div
          className={`zb-tip ${tip.below ? "is-below" : "is-above"}`}
          style={{ left: tip.x, top: tip.y, width: tip.w }}
          role="note"
          onClick={(e) => e.stopPropagation()}
        >
          <p>{tip.text}</p>
          <div>
            <button type="button" className="zb-tip-ok" onClick={(e) => { e.stopPropagation(); setTip(null); }}>
              OK
            </button>
            <button type="button" className="zb-tip-off" onClick={askOff}>
              Už nezobrazovať
            </button>
          </div>
        </div>
      ) : null}

      {phase === "intro" ? (
        <div className="zb-intro" role="status">
          <p className="zb-intro-head">
            <span className="zb-mark">
              <ZboxCube />
            </span>
            Ž-BOX · ako to funguje
          </p>
          <ol>
            <li>
              <b>Každé kolo</b> kuriér otestuje všetky zatvorené schránky. Zlatá = balík s výhrou, sivé „prázdne“ = nič.
            </li>
            <li>
              <b>Okná = pokusy.</b> Nový balík ich doplní na {ZBOX_WINDOWS}. Kolo bez balíka = −1 okno. Pri 0 Ž-BOX končí.
            </li>
            <li>
              <b>Výplata</b> = súčet balíkov. Plná stena ({ZBOX_CELLS}/{ZBOX_CELLS}) = <b>×{ZBOX_FULL_MUL}</b>.
            </li>
          </ol>
          <p className="zb-intro-extra">
            <img src={canSrc(2)} alt="" />
            <span>
              <b>Kuriérsky príplatok:</b> plechovka na streche ({CAN_TABLE.map((c) => `×${c.x}`).join(" / ")}) násobí súčet na konci.
            </span>
          </p>
          <p className="zb-intro-extra">
            <span className="zb-intro-mods" aria-hidden="true">
              {ZBOX_MODS.slice(0, 3).map((m) => (
                <ModIcon key={m.mod} mod={m.mod} size={14} />
              ))}
            </span>
            <span>
              <b>Špeciálne balíky</b> (KURIÉR, DOBIERKA, ZBERNÝ KURIÉR…) menia hodnoty v stene. Všetko v (i).
            </span>
          </p>
          <div className="zb-intro-btns">
            <button type="button" className="zb-intro-go" onClick={(e) => { e.stopPropagation(); nudgeRef.current?.(); }}>
              Pokračovať
            </button>
            <button type="button" className="zb-intro-off" onClick={askOff}>
              Už nezobrazovať
            </button>
          </div>
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
                <b>×{ZBOX_FULL_MUL}</b>
              </span>
            ) : null}
          </div>
          <div className={`zb-eq-res ${multStep >= 4 ? "is-on" : ""}`}>
            <i>= výplata</i>
            <b>
              <CountUp value={multStep >= 4 ? gross : 0} ms={1100 * k} />
              &nbsp;€
            </b>
            {capped && multStep >= 4 ? <em>Strop Ž-BOXu: {ZBOX_CAP_X}× stávky</em> : null}
          </div>
          <p className="zb-pay-tap">{"\u00a0"}</p>
        </div>
      ) : null}

      {phase === "pay" ? (
        <div className="zb-pay" role="status">
          <p className="zb-pay-head">Ž-BOX SA ZATVÁRA</p>
          <ul>
            <li>
              <span>Balíky ({allParcels.length}/{ZBOX_CELLS})</span>
              <b>{eur(play.sumX * bet)}</b>
            </li>
            <li className={payStep >= 1 && play.canSum ? "is-on" : "is-dim"}>
              <span>Kuriérsky príplatok</span>
              <b>×{play.canSum || 1}</b>
            </li>
            {play.full ? (
              <li className={payStep >= 2 ? "is-on is-full" : "is-dim"}>
                <span>VŠETKO DORUČENÉ</span>
                <b>×{ZBOX_FULL_MUL}</b>
              </li>
            ) : null}
            {capped ? (
              <li className={payStep >= 2 ? "is-on" : "is-dim"}>
                <span>Strop Ž-BOXu</span>
                <b>{ZBOX_CAP_X}× stávky</b>
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

      {sheet === "info" ? (
        <div className="zb-sheet-back" onClick={closeSheet} role="presentation">
          <div className="zb-sheet" role="dialog" aria-label="Pravidlá Ž-BOXu" onClick={(e) => e.stopPropagation()}>
            <header>
              <span className="zb-mark">
                <ZboxCube />
              </span>
              <b>Ž-BOX · pravidlá</b>
              <em>Hra stojí</em>
            </header>
            <ZboxRules compact />
            <button type="button" className="zb-sheet-go" onClick={closeSheet}>
              Späť do Ž-BOXu
            </button>
          </div>
        </div>
      ) : null}

      {sheet === "off" ? (
        <div className="zb-sheet-back" onClick={closeSheet} role="presentation">
          <div className="zb-sheet is-confirm" role="alertdialog" aria-label="Už nezobrazovať vysvetlenie" onClick={(e) => e.stopPropagation()}>
            <p>Určite? Ak niečo nepochopíš, informácie o mechanike nájdeš v Pravidlá (i) → Ž-BOX.</p>
            <div className="zb-sheet-btns">
              <button type="button" className="zb-sheet-go" onClick={confirmOff}>
                Áno, nezobrazovať
              </button>
              <button type="button" className="zb-sheet-no" onClick={closeSheet}>
                Zrušiť
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
