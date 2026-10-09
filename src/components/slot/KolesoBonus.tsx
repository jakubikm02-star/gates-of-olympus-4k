import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Ban, Gavel, Info, Landmark, Mail, Package, Plug, RotateCw, Skull, Star, Type } from "lucide-react";
import {
  KOLESO_CAP_X,
  KOLESO_COLS,
  KOLESO_EXEK,
  KOLESO_SLICES,
  KOLESO_SOLVE_AT,
  KOLESO_SOLVE_FLAT,
  KOLESO_SOLVE_MUL,
  KOLESO_SPINS,
  KOLESO_SPINS_MAX,
  KOLESO_TAX,
  KOLESO_VOWEL_COST,
  KOLESO_WHEEL,
  kolesoBase,
  kolesoRows,
  type KPlay,
  type KSegKind,
  type KStep,
} from "@/lib/slot/koleso";
import { kolesoEnvelopes, kolesoHelpOff, setKolesoEnvelopes, setKolesoHelpOff, takeKolesoCoach } from "@/lib/slot/koleso-help";
import type { ChaseModKind } from "@/lib/slot/zasah";
import * as sfx from "@/lib/slot/audio";
import { CountUp } from "./CountUp";
import { KolesoHost, type HostPose } from "./KolesoHost";
import { KolesoRules } from "./KolesoRules";

/**
 * Scene = Martin's reference art (public/koleso/rim.webp, 941×1672) in its own pixel space: the rim / chains /
 * warehouse with a transparent hole, the procedural disc (disc.webp, no text) under it, the pointer (pointer.webp)
 * and the skull hub (hub.webp) above. Values and gag names are drawn in code on the rotating disc.
 */
const SC_W = 941;
const SC_H = 1672;
const CX = 470;
const CY = 732;
const DISC_R = 392;
const HUB_R = 119;
const PTR = { x: 396, y: 193, w: 153, h: 192, px: 75, py: 16 };
/** Wheel extent in scene px (rim + chains), for fitting. */
const WHEEL_TOP = 180;
const WHEEL_BOT = 1150;
/** Bottom of the wheel stand in the art. */
const STAND_BOT = 1360;
const SLICE = 360 / KOLESO_SLICES;

const ICON: Partial<Record<KSegKind, typeof Skull>> = {
  bankrot: Skull,
  lost: Ban,
  tax: Landmark,
  exek: Gavel,
  courier: Package,
  vowel: Type,
  extra: RotateCw,
  x2: Plug,
};

/** Who announces what (all fictional parody characters). */
const CAST: Record<KSegKind, { who: string; title: string; vo: sfx.KolesoVo | null; pose: HostPose }> = {
  val: { who: "Jožo Pročkár", title: "", vo: null, pose: "point" },
  x2: { who: "Lukáš Adapter", title: "DVOJNÁSOBOK", vo: "x2", pose: "cheer" },
  bankrot: { who: "Peter Marcipán", title: "BANKROT!", vo: "bankrot", pose: "shock" },
  lost: { who: "Peter Marcipán", title: "STRATILI STE ŤAH", vo: "lost", pose: "sad" },
  tax: { who: "Daňová Danka", title: "DAŇOVÁ KONTROLA", vo: null, pose: "shock" },
  exek: { who: "JUDr. Zabavil", title: "EXEKÚCIA", vo: "exek", pose: "shock" },
  courier: { who: "Kuriér Nezastihol", title: "KURIÉR", vo: "courier", pose: "point" },
  vowel: { who: "Jožo Pročkár", title: "SAMOHLÁSKA ZA PENIAZE", vo: "vowel", pose: "point" },
  extra: { who: "Peter Marcipán", title: "EXTRA ŤAH", vo: "extra", pose: "cheer" },
};

const eurX = (x: number, bet: number) => `${(+(x * bet).toFixed(2)).toFixed(2).replace(".", ",")} €`;
const pct = (x: number) => `${Math.round(x * 100)} %`;
const mult = (x: number) => `${String(x).replace(".", ",")}×`;
function pl(n: number, one: string, few: string, many: string): string {
  return n === 1 ? one : n >= 2 && n <= 4 ? few : many;
}

type Banner = { kind: KSegKind | "solve" | "end" | "start"; who?: string; title: string; sub?: string; big?: string } | null;
type Status = { t: string; s?: string; tone?: "ok" | "bad" | "info" | "gag" };

interface Props {
  play: KPlay;
  bet: number;
  gross: number;
  net: number;
  tax: ChaseModKind | null;
  turbo: boolean;
  reduced: boolean;
  onDone: () => void;
}

/** One slice label (value or gag) on the rotating disc, read from the rim towards the hub. */
function SliceLabel({ i }: { i: number }) {
  const s = KOLESO_WHEEL[i];
  const Ico = ICON[s.kind];
  const val = s.kind === "val";
  const two = !!s.sub && !val;
  const main = val ? s.label : s.label;
  const fs = val ? (s.v && s.v >= 1 ? 58 : 50) : main.length > 7 ? 30 : 34;
  return (
    <g transform={`rotate(${i * SLICE})`}>
      <g transform="translate(0,-232) rotate(90)">
        <text className={`kn-sl ${val ? "is-val" : "is-gag"} ${s.v && s.v >= 1 ? "is-prem" : ""}`} x={two ? 0 : 0} y={two ? -14 : 0} fontSize={fs} textAnchor="middle" dominantBaseline="central">
          {main}
        </text>
        {s.sub ? (
          <text className={`kn-sl is-sub ${val ? "is-val" : "is-gag"}`} x={0} y={two ? 22 : 40} fontSize={val ? 22 : 26} textAnchor="middle" dominantBaseline="central">
            {s.sub}
          </text>
        ) : null}
      </g>
      {Ico ? (
        <g transform="translate(-17,-372)">
          <Ico width={34} height={34} strokeWidth={2.4} className="kn-sl-ico" />
        </g>
      ) : val ? (
        <g transform="translate(-13,-368)">{s.v && s.v >= 1 ? <Star width={26} height={26} strokeWidth={2.4} className="kn-sl-ico is-val" /> : <circle cx={13} cy={13} r={5} className="kn-sl-dot" />}</g>
      ) : null}
    </g>
  );
}

function wedge(r0: number, r1: number): string {
  const a0 = ((-90 - SLICE / 2) * Math.PI) / 180;
  const a1 = ((-90 + SLICE / 2) * Math.PI) / 180;
  const p = (r: number, a: number) => `${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`;
  return `M${p(r0, a0)} L${p(r1, a0)} A${r1},${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0},${r0} 0 0 0 ${p(r0, a0)} Z`;
}

/** The tile board: rows centred on KOLESO_COLS columns; a tile flips when its letter is called. */
function Board({ rows, shown, flipping, cat, solved, missed }: { rows: string[]; shown: Set<number>; flipping: Set<number>; cat: string; solved: boolean; missed: boolean }) {
  let idx = 0;
  const grid = rows.map((r) => {
    const pad = Math.floor((KOLESO_COLS - r.length) / 2);
    const cells: { ch: string | null; id: number; letter: boolean }[] = [];
    for (let c = 0; c < KOLESO_COLS; c++) {
      const ch = c >= pad && c < pad + r.length ? r[c - pad] : null;
      if (ch && ch !== " ") {
        const letter = !!kolesoBase(ch);
        cells.push({ ch, id: idx++, letter });
      } else cells.push({ ch: null, id: -1, letter: false });
    }
    return cells;
  });
  const rowsAll = grid.length < 4 ? [...(grid.length < 3 ? [null] : []), ...grid, ...(grid.length < 2 ? [null, null] : grid.length < 4 ? [null] : [])].slice(0, 4) : grid;
  return (
    <div className={`kn-board ${solved ? "is-solved" : ""} ${missed ? "is-missed" : ""}`}>
      <div className="kn-cat">
        <span>TAJNIČKA</span>
        <b>{cat}</b>
      </div>
      <div className="kn-grid">
        {rowsAll.map((row, ri) =>
          (row ?? Array.from({ length: KOLESO_COLS }, () => ({ ch: null, id: -1, letter: false }))).map((c, ci) => {
            if (!c.ch) return <i key={`${ri}-${ci}`} className="kn-t is-void" />;
            const open = !c.letter || shown.has(c.id);
            const flip = flipping.has(c.id);
            return (
              <i key={`${ri}-${ci}`} className={`kn-t ${c.letter ? "is-letter" : "is-punct"} ${open ? "is-open" : "is-hid"} ${flip ? "is-flip" : ""}`}>
                <b>{open ? c.ch : ""}</b>
              </i>
            );
          }),
        )}
      </div>
    </div>
  );
}

/**
 * KOLESO NEŠŤASTIA overlay. Animates a run decided up front (lib/slot/koleso playKoleso, seeded): host welcome,
 * rules card (until turned off), then every spin: TOČ (or auto), the wheel spins (rAF, ease-out with a short
 * wind-up, pointer flicks on every stud with a tick), the slice lights up, its character announces, the effect
 * lands (letter → Betka turns the tiles, bank counts), the solve sequence or the end, and the payout card.
 * Obálky (optional): three envelopes, the tap opens one; the letter is already decided, the others stay shut.
 * Tap = end the current step, PRESKOČIŤ = jump to the payout, turbo ≈ 2×, reduced motion = no spin, fades only.
 */
export function KolesoBonus({ play, bet, gross, net, tax, turbo, reduced, onDone }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const rotorRef = useRef<HTMLDivElement>(null);
  const ptrRef = useRef<HTMLImageElement>(null);
  const bankRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ s: 0.44, x: 0, y: 0, portrait: true });
  const [phase, setPhase] = useState<"arrive" | "intro" | "game" | "pay">("arrive");
  const [pose, setPose] = useState<HostPose>("welcome");
  const [bank, setBank] = useState(0);
  const [bankFx, setBankFx] = useState<{ k: number; tone: "up" | "down" | "zero"; t: string } | null>(null);
  const [left, setLeft] = useState(KOLESO_SPINS);
  const [given, setGiven] = useState(KOLESO_SPINS);
  const [spinNo, setSpinNo] = useState(0);
  const [lit, setLit] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const [status, setStatus] = useState<Status>({ t: "KOLESO NEŠŤASTIA", s: "Peter Marcipán prichádza do štúdia…", tone: "info" });
  const [shown, setShown] = useState<Set<number>>(new Set());
  const [flipping, setFlipping] = useState<Set<number>>(new Set());
  const [called, setCalled] = useState<string[]>([]);
  const [solvedFx, setSolvedFx] = useState(false);
  const [missed, setMissed] = useState(false);
  const [canAsk, setCanAsk] = useState(false);
  const [env, setEnv] = useState(() => kolesoEnvelopes());
  const [envAsk, setEnvAsk] = useState<{ letter: string; picked: number | null } | null>(null);
  const [payStep, setPayStep] = useState(0);
  const [flash, setFlash] = useState<{ k: number; tone: string } | null>(null);
  const [sheet, setSheet] = useState<null | "info" | "off">(null);
  const fastRef = useRef(false);
  const nudgeRef = useRef<(() => void) | null>(null);
  const envRef = useRef<((i: number) => void) | null>(null);
  const aliveRef = useRef(true);
  const pausedRef = useRef(false);
  const heldRef = useRef<(() => void)[]>([]);
  const helpRef = useRef(!kolesoHelpOff());
  const coachRef = useRef(false);
  const envOn = useRef(env);
  const k = turbo ? 0.5 : 1;
  /** Wheel angle (deg, clockwise) and the pointer spring; driven by one rAF loop, written straight to the DOM. */
  const wheel = useRef({ rot: 0, p: 0, pv: 0, spin: null as null | { from: number; delta: number; t0: number; dur: number; done: () => void }, lastIdx: 0, lastTick: 0 });

  const rows = useMemo(() => kolesoRows(play.text) ?? [play.text.toUpperCase()], [play.text]);
  /** Board letters in reading order with their base letter (tile ids = index here). */
  const tiles = useMemo(() => {
    const out: string[] = [];
    for (const r of rows) for (const ch of r) if (ch !== " " && kolesoBase(ch)) out.push(kolesoBase(ch)!);
    return out;
  }, [rows]);

  // Fit. Portrait: the wheel fills the width under the board; landscape: wheel left of centre, board on the right.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const portrait = w / h < 1.05;
      if (portrait) {
        const boardBottom = Math.min(222, h * 0.25);
        const room = h - boardBottom - Math.min(150, h * 0.17);
        const s = Math.min(w / 900, room / (WHEEL_BOT - WHEEL_TOP - 40));
        setView({ s, x: w / 2 - CX * s, y: boardBottom - (WHEEL_TOP + 8) * s, portrait });
      } else {
        // wheel + stand (scene y 170 … 1360) fill the height, wheel left of centre
        const s = Math.min((h * 0.96) / (STAND_BOT - WHEEL_TOP + 10), (w * 0.42) / 900);
        const cx = w * 0.42;
        setView({ s, x: cx - CX * s, y: h * 0.5 - ((WHEEL_TOP - 10 + STAND_BOT) / 2) * s, portrait });
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The wheel loop: spin easing + pointer spring + ticks. Runs while mounted, idles cheaply when nothing moves.
  useEffect(() => {
    let raf = 0;
    let prev = performance.now();
    const W = wheel.current;
    W.lastIdx = Math.floor((W.rot + SLICE / 2) / SLICE);
    const step = (t: number) => {
      const dt = Math.min(0.05, (t - prev) / 1000);
      prev = t;
      let speed = 0;
      const sp = W.spin;
      if (sp) {
        const u = Math.min(1, (t - sp.t0) / sp.dur);
        const wu = 0.07;
        let ang: number;
        if (u < wu) ang = sp.from - 7 * Math.sin((Math.PI * u) / wu);
        else {
          const v = (u - wu) / (1 - wu);
          // ease-out: fast start, long glide, soft stop (quartic-ish with a hint of friction at the end)
          ang = sp.from + sp.delta * (1 - Math.pow(1 - v, 3.4));
        }
        speed = Math.abs(ang - W.rot) / Math.max(0.001, dt) / 900;
        W.rot = ang;
        if (u >= 1) {
          W.rot = sp.from + sp.delta;
          W.spin = null;
          sp.done();
        }
      }
      const idx = Math.floor((W.rot + SLICE / 2) / SLICE);
      if (idx !== W.lastIdx) {
        const n = Math.abs(idx - W.lastIdx);
        W.lastIdx = idx;
        W.pv -= Math.min(260, 60 + 120 * Math.min(1.5, speed)) * Math.min(2, n);
        if (t - W.lastTick > 38) {
          W.lastTick = t;
          sfx.playKolesoTick(Math.min(1.2, speed));
        }
      }
      // pointer: damped spring towards 0, can only be pushed one way (tip to the right = negative)
      W.pv += (-520 * W.p - 26 * W.pv) * dt;
      W.p = Math.max(-16, Math.min(3, W.p + W.pv * dt));
      if (rotorRef.current) rotorRef.current.style.transform = `rotate(${W.rot.toFixed(3)}deg)`;
      if (ptrRef.current) ptrRef.current.style.transform = `rotate(${W.p.toFixed(2)}deg)`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  /** Script wait (turbo-scaled, 0 when skipped, a tap ends it, held while a sheet is open). */
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

  /** Spin to slice `seg` (jitter = where inside it). Resolves when the wheel stops. */
  const spinTo = useCallback(
    (seg: number, jitter: number) =>
      new Promise<void>((resolve) => {
        const W = wheel.current;
        const off = (jitter - 0.5) * SLICE * 0.74;
        const want = (((-(seg * SLICE + off)) % 360) + 360) % 360;
        const cur = W.rot;
        const base = (((want - (((cur % 360) + 360) % 360)) % 360) + 360) % 360;
        const delta = base + 360 * (turbo ? 2 : 3);
        if (fastRef.current || reduced) {
          W.spin = null;
          W.rot = cur + delta;
          W.lastIdx = Math.floor((W.rot + SLICE / 2) / SLICE);
          return resolve();
        }
        W.spin = { from: cur, delta, t0: performance.now(), dur: (3000 + delta * 1.05) * k, done: resolve };
      }),
    [turbo, reduced, k],
  );

  useEffect(() => {
    aliveRef.current = true;
    coachRef.current = helpRef.current && takeKolesoCoach();
    const loud = () => !fastRef.current;
    let b = 0;
    const shownNow = new Set<number>();
    const say = (line: sfx.KolesoVo) => {
      if (loud()) sfx.playKolesoVo(line);
    };
    const setB = (v: number, tone: "up" | "down" | "zero", t: string) => {
      b = v;
      setBank(v * bet);
      setBankFx((f) => ({ k: (f?.k ?? 0) + 1, tone, t }));
    };
    /** Betka Frekvencová turns every tile of `letter`, one by one. */
    const reveal = async (letter: string, gap = 240) => {
      const ids = tiles.map((c, i) => (c === letter ? i : -1)).filter((i) => i >= 0 && !shownNow.has(i));
      let n = 0;
      for (const id of ids) {
        shownNow.add(id);
        setFlipping(new Set([id]));
        setShown(new Set(shownNow));
        if (loud()) sfx.playKolesoLetter(n++);
        await wait(gap);
      }
      setFlipping(new Set());
      return ids.length;
    };
    /** Jožo Pročkár calls the letter, or (Obálky) the player taps an envelope: the letter is the same either way. */
    const callLetter = async (letter: string, vowel: boolean) => {
      const L = letter.toUpperCase();
      if (envOn.current && !fastRef.current) {
        setStatus({ t: "Vyber si obálku", s: "V každej je písmeno. Otvorí sa tá, na ktorú ťukneš.", tone: "info" });
        setEnvAsk({ letter: L, picked: null });
        const picked = await new Promise<number>((resolve) => {
          const t = window.setTimeout(() => resolve(1), 7000 * k);
          envRef.current = (i) => {
            window.clearTimeout(t);
            resolve(i);
          };
          nudgeRef.current = () => {
            window.clearTimeout(t);
            resolve(1);
          };
        });
        envRef.current = null;
        nudgeRef.current = null;
        setEnvAsk({ letter: L, picked });
        if (loud()) sfx.playClick();
        await wait(1100);
        setEnvAsk(null);
      } else {
        setBanner({ kind: vowel ? "vowel" : "val", who: "Jožo Pročkár", title: vowel ? "Samohláska" : "Písmeno", big: L });
        if (loud()) sfx.playZboxBeep(1.2);
        await wait(1000);
        setBanner(null);
      }
      setCalled((c) => [...c, L]);
    };
    const lightSeg = (seg: number | null) => setLit(seg);

    const doStep = async (st: KStep, i: number) => {
      const seg = KOLESO_WHEEL[st.seg];
      const cast = CAST[st.kind];
      lightSeg(st.seg);
      if (st.kind === "val") {
        setPose("point");
        setStatus({ t: `${mult(seg.v ?? 0)} stávky za každé políčko`, s: `= ${eurX(seg.v ?? 0, bet)} za políčko`, tone: "info" });
        if (st.letter) {
          await callLetter(st.letter, false);
          const n = await reveal(st.letter);
          if (n > 0) {
            setPose("cheer");
            setStatus({ t: `${st.letter.toUpperCase()} × ${n} = +${eurX(st.gain, bet)}`, s: `Betka Frekvencová otočila ${n} ${pl(n, "políčko", "políčka", "políčok")}.`, tone: "ok" });
            setB(st.bankAfter, "up", `+${eurX(st.gain, bet)}`);
            if (loud()) sfx.playMult();
          } else {
            setPose("sad");
            setMissed(true);
            say("none");
            if (loud()) sfx.playKolesoMiss();
            setStatus({ t: `${st.letter.toUpperCase()} — nie je tam!`, s: "Jožo sa ospravedlňuje. Banka ostáva.", tone: "bad" });
            await wait(900);
            setMissed(false);
          }
        }
      } else if (st.kind === "vowel") {
        setPose("point");
        say("vowel");
        setBanner({ kind: "vowel", who: cast.who, title: cast.title, sub: st.cost ? `−${eurX(st.cost, bet)} z banky` : "Banka je prázdna, samohláska na splátky (zadarmo)" });
        await wait(1500);
        setBanner(null);
        if (st.cost) setB(+(st.bankBefore - st.cost).toFixed(6), "down", `−${eurX(st.cost, bet)}`);
        if (st.letter) {
          await callLetter(st.letter, true);
          const n = await reveal(st.letter);
          setStatus(n ? { t: `${st.letter.toUpperCase()} × ${n}`, s: "Samohláska nič nezarába, len odkrýva.", tone: "ok" } : { t: `${st.letter.toUpperCase()} — nie je tam!`, tone: "bad" });
          if (!n) {
            say("none");
            if (loud()) sfx.playKolesoMiss();
          }
        }
      } else {
        setPose(cast.pose);
        let sub = "";
        if (st.kind === "x2") sub = st.bankBefore > 0 ? `Banka ×2: ${eurX(st.bankBefore, bet)} → ${eurX(st.bankAfter, bet)}` : "Banka je prázdna. Dvakrát nič je stále nič.";
        else if (st.kind === "bankrot") sub = st.bankBefore > 0 ? `Banka ${eurX(st.bankBefore, bet)} prepadá. Sponzorský šek ostáva.` : "Nebolo čo stratiť. Sponzorský šek ostáva.";
        else if (st.kind === "lost") sub = st.extra ? "Prichádzate o jedno ďalšie točenie." : "Už nebolo čo stratiť.";
        else if (st.kind === "tax") sub = `Banka × ${String(KOLESO_TAX).replace(".", ",")} (−23 %)${st.bankBefore > 0 ? `: ${eurX(st.bankBefore, bet)} → ${eurX(st.bankAfter, bet)}` : ""}`;
        else if (st.kind === "exek") sub = `Polovica banky${st.bankBefore > 0 ? `: ${eurX(st.bankBefore, bet)} → ${eurX(st.bankAfter, bet)}` : " (prázdna, nič nezabavil)"} · ×${String(KOLESO_EXEK).replace(".", ",")}`;
        else if (st.kind === "courier") sub = st.parcel > 0 ? `Balík nechal u suseda: +${eurX(st.parcel, bet)}` : "Nezastihol vás. Lístok vo dverách, balík na pošte.";
        else if (st.kind === "extra") sub = st.extra ? "+1 točenie od sponzora" : `Sponzor už nemá rozpočet (max ${KOLESO_SPINS_MAX} točení).`;
        if (cast.vo) say(cast.vo);
        if (st.kind === "bankrot") {
          setFlash({ k: i, tone: "bankrot" });
          if (loud()) sfx.playKolesoBankrot();
        } else if (st.kind === "tax" || st.kind === "exek") {
          setFlash({ k: i, tone: "tax" });
          if (loud()) (st.kind === "tax" ? sfx.playTaxLoss : sfx.playZboxSlam)();
        } else if (loud()) sfx.playMult();
        setBanner({ kind: st.kind, who: cast.who, title: cast.title, sub, big: st.kind === "courier" && st.parcel ? `+${eurX(st.parcel, bet)}` : undefined });
        setStatus({ t: cast.title, s: sub, tone: st.kind === "x2" || st.kind === "extra" || (st.kind === "courier" && st.parcel > 0) ? "ok" : "gag" });
        await wait(st.kind === "bankrot" ? 1900 : 1600);
        setBanner(null);
        if (st.bankAfter !== st.bankBefore) {
          const up = st.bankAfter > st.bankBefore;
          setB(st.bankAfter, st.bankAfter === 0 ? "zero" : up ? "up" : "down", st.bankAfter === 0 ? "0 €" : `${up ? "+" : "−"}${eurX(Math.abs(st.bankAfter - st.bankBefore), bet)}`);
        }
        if (st.kind === "lost" || st.kind === "extra") setLeft(st.left);
        if (st.kind === "extra" && st.extra) setGiven((g) => g + 1);
      }
      await wait(650);
      lightSeg(null);
    };

    const run = async () => {
      await wait(400);
      setPose("welcome");
      say("welcome");
      setStatus({ t: "Dobrý večer!", s: "Peter Marcipán vás víta v Kolese nešťastia.", tone: "info" });
      await wait(2200);
      if (helpRef.current) {
        setPhase("intro");
        setPose("idle");
        await wait(16000);
      }
      setPhase("game");
      // Jožo daruje: the start letters
      setStatus({ t: "Jožo daruje S T N A E", s: "Štartové písmená sú zadarmo.", tone: "info" });
      setPose("point");
      for (const L of play.start) {
        await reveal(L, 120);
      }
      setCalled(play.start.map((c) => c.toUpperCase()));
      await wait(500);
      let leftL = KOLESO_SPINS;
      for (let i = 0; i < play.steps.length; i++) {
        const st = play.steps[i];
        setSpinNo(i + 1);
        setPose("idle");
        setStatus({ t: `Točenie ${i + 1}`, s: coachRef.current && i === 0 ? "Ťukni TOČ (alebo počkaj). Každý zo 16 dielov má šancu 1/16." : `Po ňom ${pl(leftL - 1, "ostáva", "ostávajú", "ostáva")} ${leftL - 1} ${pl(leftL - 1, "točenie", "točenia", "točení")}`, tone: "info" });
        await wait(i === 0 ? 1600 : 1100, true);
        leftL = Math.max(0, leftL - 1);
        setLeft(leftL);
        if (i === 0 || i % 3 === 2) say("spin");
        setPose("point");
        setSpinning(true);
        await spinTo(st.seg, st.jitter);
        setSpinning(false);
        if (loud()) sfx.playZboxBeep(0.8);
        await doStep(st, i);
        leftL = st.left;
        setLeft(leftL);
        if (st.solved) break;
      }
      // solve or end
      if (play.solved) {
        setPose("cheer");
        setSolvedFx(true);
        say("solve");
        if (loud()) sfx.playKolesoSolve();
        setStatus({ t: "TAJNIČKA VYRIEŠENÁ!", s: `Odkrytých ${pct(Math.max(KOLESO_SOLVE_AT, play.steps[play.steps.length - 1]?.shown ?? 1))} písmen · banka ×${KOLESO_SOLVE_MUL} + ${mult(KOLESO_SOLVE_FLAT)} stávky`, tone: "ok" });
        setBanner({ kind: "solve", who: "Peter Marcipán", title: "TAJNIČKA JE VYRIEŠENÁ!", sub: `Banka ×${KOLESO_SOLVE_MUL} + ${eurX(KOLESO_SOLVE_FLAT, bet)}` });
      } else {
        setPose("sad");
        say("end");
        setStatus({ t: "Koniec kola", s: `Tajnička ostala nevylúštená (treba ${pct(KOLESO_SOLVE_AT)} písmen). Banka sa vypláca tak, ako je.`, tone: "bad" });
        setBanner({ kind: "end", who: "Peter Marcipán", title: "KONIEC KOLA", sub: "Riešenie bolo…" });
      }
      await wait(1200);
      // show the whole phrase
      const rest = tiles.map((_, i) => i).filter((i) => !shownNow.has(i));
      for (const id of rest) {
        shownNow.add(id);
        setShown(new Set(shownNow));
        if (loud() && play.solved) sfx.playKolesoLetter(id);
        await wait(play.solved ? 70 : 40);
      }
      await wait(1600);
      setBanner(null);
      setPhase("pay");
      setPose(play.solved || play.vip > 0 ? "cheer" : "sad");
      setB(play.bankX, "up", "");
      setPayStep(1);
      await wait(700);
      setPayStep(2);
      await wait(play.solved ? 800 : 300);
      setPayStep(3);
      await wait(play.capped ? 700 : 200);
      setPayStep(4);
      await wait(700);
      setPayStep(5);
      await wait(tax ? 900 : 200);
      if (tax && loud()) (tax === "danUrad" ? sfx.playTaxLoss : sfx.playMult)();
      setPayStep(6);
      sfx.playBigWin();
    };
    void run();
    return () => {
      aliveRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doneAll = phase === "pay" && payStep >= 6;
  const tap = () => {
    if (sheet) return;
    if (doneAll) return onDone();
    if (envAsk && envAsk.picked == null) return;
    nudgeRef.current?.();
  };
  // Space / Enter = TOČ / next, like a tap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "Enter") return;
      e.preventDefault();
      tap();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const skip = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (phase === "pay") return;
    fastRef.current = true;
    const W = wheel.current;
    if (W.spin) {
      const sp = W.spin;
      W.spin = null;
      W.rot = sp.from + sp.delta;
      sp.done();
    }
    envRef.current?.(1);
    nudgeRef.current?.();
  };
  const go = (e: React.MouseEvent) => {
    e.stopPropagation();
    sfx.playClick();
    nudgeRef.current?.();
  };
  const toggleEnv = (e: React.MouseEvent) => {
    e.stopPropagation();
    sfx.playClick();
    const next = !envOn.current;
    envOn.current = next;
    setEnv(next);
    setKolesoEnvelopes(next);
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
    setKolesoHelpOff(true);
    helpRef.current = false;
    coachRef.current = false;
    const intro = phase === "intro";
    resume();
    if (intro) nudgeRef.current?.();
  };
  const closeSheet = (e: React.MouseEvent) => {
    e.stopPropagation();
    sfx.playClick();
    resume();
  };

  const taxPct = tax === "danUrad" ? "−23 %" : tax === "bezDane" ? "+23 %" : "";
  const pips = Math.max(given, KOLESO_SPINS);
  const wheelPart = Math.min(play.grossX, KOLESO_CAP_X);
  return (
    <div
      ref={rootRef}
      className={`kn-root ph-${phase} ${view.portrait ? "is-portrait" : "is-wide"} ${turbo ? "is-turbo" : ""} ${reduced ? "is-reduced" : ""} ${solvedFx ? "is-solved" : ""} ${spinning ? "is-spinning" : ""}`}
      role="dialog"
      aria-label="Koleso nešťastia"
      onClick={tap}
      style={{ ["--wx" as string]: `${view.x + CX * view.s}px`, ["--wy" as string]: `${view.y + CY * view.s}px`, ["--wr" as string]: `${DISC_R * view.s}px`, ["--wb" as string]: `${view.y + WHEEL_BOT * view.s}px` }}
    >
      <div className="kn-blur" aria-hidden="true" />
      <div className="kn-scene" style={{ width: SC_W, height: SC_H, transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.s})` }}>
        <div className="kn-disc" style={{ left: CX - DISC_R, top: CY - DISC_R, width: DISC_R * 2, height: DISC_R * 2 }}>
          <div ref={rotorRef} className="kn-rotor">
            <img src="/koleso/disc.webp" alt="" draggable={false} />
            <svg viewBox={`${-DISC_R} ${-DISC_R} ${DISC_R * 2} ${DISC_R * 2}`} aria-hidden="true">
              {lit != null ? (
                <g transform={`rotate(${lit * SLICE})`}>
                  <path className={`kn-lit is-${KOLESO_WHEEL[lit].kind}`} d={wedge(HUB_R, DISC_R - 6)} />
                </g>
              ) : null}
              {KOLESO_WHEEL.map((_, i) => (
                <SliceLabel key={i} i={i} />
              ))}
            </svg>
          </div>
        </div>
        <img className="kn-rim" src="/koleso/rim.webp" alt="" draggable={false} />
        <img className="kn-hub" src="/koleso/hub.webp" alt="" draggable={false} style={{ left: CX - HUB_R, top: CY - HUB_R, width: HUB_R * 2, height: HUB_R * 2 }} />
        <img
          ref={ptrRef}
          className="kn-ptr"
          src="/koleso/pointer.webp"
          alt=""
          draggable={false}
          style={{ left: PTR.x, top: PTR.y, width: PTR.w, height: PTR.h, transformOrigin: `${PTR.px}px ${PTR.py}px` }}
        />
        {flash ? <div key={flash.k} className={`kn-flash is-${flash.tone}`} style={{ left: CX - 470, top: CY - 470 }} aria-hidden="true" /> : null}
      </div>
      <div className="kn-neon" aria-hidden="true" />

      <div className={`kn-host is-${pose}`} aria-hidden="true">
        <KolesoHost pose={pose} />
        <span className="kn-host-name">Peter Marcipán</span>
      </div>

      <div className="kn-side">
      <header className="kn-top">
        <div className="kn-logo">
          <em>KOLESO</em>
          <b>NEŠŤASTIA</b>
          <span>s Petrom Marcipánom</span>
        </div>
        <Board rows={rows} shown={shown} flipping={flipping} cat={play.cat} solved={solvedFx} missed={missed} />
        <div className="kn-called" aria-label="Volané písmená">
          {called.map((c, i) => (
            <i key={i}>{c}</i>
          ))}
        </div>
      </header>


      <aside className="kn-hud">
        <div className={`kn-lcd is-${status.tone ?? "info"}`} aria-live="polite">
          <b key={status.t}>{status.t}</b>
          {status.s ? <span>{status.s}</span> : null}
        </div>
        <div className="kn-meters">
          <div ref={bankRef} className="kn-bank">
            <span>BANKA</span>
            <b>
              <CountUp value={bank} ms={480} glide />
              &nbsp;€
            </b>
            {bankFx && bankFx.t ? (
              <em key={bankFx.k} className={`kn-bank-fx is-${bankFx.tone}`}>
                {bankFx.t}
              </em>
            ) : null}
          </div>
          <div className="kn-spins" aria-label={`Točenia: ${left}`}>
            <span>TOČENIA</span>
            <div>
              {Array.from({ length: pips }, (_, i) => (
                <i key={i} className={`${i < left ? "is-on" : "is-off"} ${i >= KOLESO_SPINS ? "is-extra" : ""}`} />
              ))}
            </div>
          </div>
          <div className={`kn-cheque ${play.vip > 0 ? "is-on" : ""}`}>
            <span>SPONZORSKÝ ŠEK</span>
            <b>+{eurX(play.vip, bet)}</b>
          </div>
        </div>
        <div className="kn-actions">
          <button type="button" className={`kn-go ${canAsk ? "is-ready" : ""}`} onClick={go} disabled={!canAsk}>
            {spinNo ? "TOČ" : "TOČ"}
          </button>
          <button type="button" className={`kn-env ${env ? "is-on" : ""}`} onClick={toggleEnv} aria-pressed={env} title="Obálky: písmeno si vyberieš ťuknutím (výhra je rovnaká)">
            <Mail size={18} strokeWidth={2.4} />
            <span>{env ? "OBÁLKY" : "JOŽO"}</span>
          </button>
          <button type="button" className="kn-skip" onClick={skip} disabled={phase === "pay"}>
            PRESKOČIŤ
          </button>
          <button type="button" className="kn-info" onClick={openInfo} aria-label="Pravidlá Kolesa nešťastia">
            <Info size={20} strokeWidth={2.4} />
          </button>
        </div>
      </aside>
      </div>

      {banner ? (
        <div key={banner.title + (banner.sub ?? "") + (banner.big ?? "")} className={`kn-banner is-${banner.kind}`} aria-live="assertive">
          {banner.who ? <em>{banner.who}</em> : null}
          {banner.big ? <strong>{banner.big}</strong> : null}
          <b>{banner.title}</b>
          {banner.sub ? <span>{banner.sub}</span> : null}
        </div>
      ) : null}

      {envAsk ? (
        <div className="kn-envs" role="dialog" aria-label="Vyber obálku" onClick={(e) => e.stopPropagation()}>
          <p>Vyber obálku</p>
          <div>
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                type="button"
                className={`kn-envelope ${envAsk.picked === i ? "is-picked" : envAsk.picked != null ? "is-gone" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (envAsk.picked == null) envRef.current?.(i);
                }}
                aria-label={`Obálka ${i + 1}`}
              >
                <span className="kn-envelope-flap" />
                {envAsk.picked === i ? <b>{envAsk.letter}</b> : <i>?</i>}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {solvedFx && !reduced ? (
        <div className="kn-confetti" aria-hidden="true">
          {Array.from({ length: 36 }, (_, i) => (
            <i key={i} style={{ ["--x" as string]: `${(i * 37) % 100}%`, ["--t" as string]: `${(i % 9) * 0.11}s`, ["--h" as string]: String([0, 45, 330, 350, 20][i % 5]) }} />
          ))}
        </div>
      ) : null}

      {phase === "intro" ? (
        <div className="kn-intro" role="status" onClick={(e) => e.stopPropagation()}>
          <p className="kn-intro-head">KOLESO NEŠŤASTIA · ako to funguje</p>
          <ol>
            <li>
              <b>{KOLESO_SPINS} točení.</b> Každý zo 16 dielov má šancu 1/16. Hodnota = × stávky za <b>každé</b> odkryté políčko.
            </li>
            <li>
              <b>Písmeno</b> vyberá Jožo Pročkár (alebo si ťukneš obálku). Betka Frekvencová otáča políčka.
            </li>
            <li>
              <b>Tajnička vyriešená</b> (aspoň {pct(KOLESO_SOLVE_AT)} písmen) = banka <b>×{KOLESO_SOLVE_MUL} + {mult(KOLESO_SOLVE_FLAT)}</b> stávky.
            </li>
            <li>
              <b>Nešťastia:</b> BANKROT, EXEKÚCIA ×{String(KOLESO_EXEK).replace(".", ",")}, DAŇOVÁ KONTROLA −23 %, STRATIL SI ŤAH. Šťastia: ×2, EXTRA ŤAH, KURIÉR, SAMOHLÁSKA za {mult(KOLESO_VOWEL_COST)}.
            </li>
          </ol>
          <p className="kn-intro-extra">
            <b>Sponzorský šek</b> +{eurX(play.vip, bet)} podľa ranku sa pripíše vždy, BANKROT ho nezoberie.
          </p>
          <div className="kn-intro-btns">
            <button
              type="button"
              className="kn-intro-go"
              onClick={(e) => {
                e.stopPropagation();
                nudgeRef.current?.();
              }}
            >
              Pokračovať
            </button>
            <button type="button" className="kn-intro-off" onClick={askOff}>
              Už nezobrazovať
            </button>
          </div>
        </div>
      ) : null}

      {phase === "pay" ? (
        <div className="kn-pay" role="status">
          <p className="kn-pay-head">{play.solved ? "TAJNIČKA VYRIEŠENÁ" : "KONIEC KOLA"}</p>
          <ul>
            <li className={payStep >= 1 ? "is-on" : "is-dim"}>
              <span>Banka</span>
              <b>{eurX(play.bankX, bet)}</b>
            </li>
            {play.solved ? (
              <li className={payStep >= 2 ? "is-on is-solve" : "is-dim"}>
                <span>Tajnička ×{KOLESO_SOLVE_MUL} + {mult(KOLESO_SOLVE_FLAT)}</span>
                <b>{eurX(play.grossX, bet)}</b>
              </li>
            ) : null}
            {play.capped ? (
              <li className={payStep >= 3 ? "is-on" : "is-dim"}>
                <span>Strop kolesa</span>
                <b>{KOLESO_CAP_X}× stávky</b>
              </li>
            ) : null}
            <li className={payStep >= 4 ? "is-on is-cheque" : "is-dim"}>
              <span>Sponzorský šek</span>
              <b>+{eurX(play.vip, bet)}</b>
            </li>
            {tax ? (
              <li className={payStep >= 5 ? `is-on is-${tax}` : "is-dim"}>
                <span>{tax === "danUrad" ? "Daňové obdobie" : "Bez dane"}</span>
                <b>{taxPct}</b>
              </li>
            ) : null}
          </ul>
          <div className="kn-pay-win">
            <span>VÝHRA</span>
            <b>
              <CountUp value={payStep >= 6 ? net : payStep >= 4 ? gross : +(wheelPart * bet).toFixed(2)} ms={payStep >= 6 ? 1100 * k : 420} glide />
              &nbsp;€
            </b>
          </div>
          <p className="kn-pay-tap">{doneAll ? "Ťukni pre návrat" : "\u00a0"}</p>
        </div>
      ) : null}

      {sheet === "info" ? (
        <div className="kn-sheet-back" onClick={closeSheet} role="presentation">
          <div className="kn-sheet" role="dialog" aria-label="Pravidlá Kolesa nešťastia" onClick={(e) => e.stopPropagation()}>
            <header>
              <b>KOLESO NEŠŤASTIA · pravidlá</b>
              <em>Hra stojí</em>
            </header>
            <KolesoRules compact />
            <button type="button" className="kn-sheet-go" onClick={closeSheet}>
              Späť ku kolesu
            </button>
          </div>
        </div>
      ) : null}

      {sheet === "off" ? (
        <div className="kn-sheet-back" onClick={closeSheet} role="presentation">
          <div className="kn-sheet is-confirm" role="alertdialog" aria-label="Už nezobrazovať vysvetlenie" onClick={(e) => e.stopPropagation()}>
            <p>Určite? Ak niečo nepochopíš, informácie o mechanike nájdeš v Pravidlá (i) → Bonus bar → KOLESO NEŠŤASTIA.</p>
            <div className="kn-sheet-btns">
              <button type="button" className="kn-sheet-go" onClick={confirmOff}>
                Áno, nezobrazovať
              </button>
              <button type="button" className="kn-sheet-no" onClick={closeSheet}>
                Zrušiť
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
