import "./massive-win.css";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { formatMoney } from "@/lib/slot/format";
import type { TaxFly } from "@/hooks/use-slot-game";
import { TaxChip } from "./TaxChip";
import { frameNow, onFrame } from "@/lib/slot/frame-loop";

/** Count-up length. The card never auto-closes (autoplay too): first tap finishes the count, the next one closes. */
const COUNT_MS = 4200;
const TITLE = ["MASÍVNA", "VÝHRA"];
/** Count-up "drops": share of the sum at which the stage takes a hit (≈ 1.1 / 1.7 / 2.3 / 2.9 s with the ease-out). */
const DROPS = [0.6, 0.8, 0.9, 0.97];
const BARS = 28;

type Bit = {
  kind: "coin" | "can" | "ticket" | "shard";
  x: number;
  y: number;
  fall: number;
  rot: number;
  s: number;
  d: number;
  t: number;
};

function makeBits(n: number): Bit[] {
  const out: Bit[] = [];
  for (let i = 0; i < n; i += 1) {
    const r = Math.random();
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.25;
    const v = 26 + Math.random() * 30;
    out.push({
      kind: r < 0.46 ? "coin" : r < 0.62 ? "can" : r < 0.78 ? "ticket" : "shard",
      x: Math.cos(a) * v,
      y: Math.sin(a) * v * 0.9,
      fall: 55 + Math.random() * 45,
      rot: (Math.random() - 0.5) * 900,
      s: 0.6 + Math.random() * 0.75,
      d: (i % 12) * 0.32 + Math.random() * 0.25,
      t: 2.1 + Math.random() * 1.1,
    });
  }
  return out;
}

const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);

function Title({ ghost }: { ghost?: "a" | "b" }) {
  return (
    <span className={ghost ? `mw-title-in is-ghost is-${ghost}` : "mw-title-in"}>
      {TITLE.map((word, w) => (
        <span className="mw-word" key={word}>
          {[...word].map((ch, i) =>
            ghost ? (
              <span className="mw-ch" key={i} style={{ "--i": w * 7 + i } as CSSProperties}>
                {ch}
              </span>
            ) : (
              <span
                className="mw-ch"
                key={i}
                data-ch={ch}
                style={{ "--i": w * 7 + i } as CSSProperties}
              >
                <span className="mw-ch-fill" data-ch={ch}>
                  {ch}
                </span>
              </span>
            ),
          )}
        </span>
      ))}
    </span>
  );
}

/** Flat parking-barrier arm on a post with a small "P" sign; lifts when the count lands. */
function Barrier() {
  return (
    <div className="mw-gate" aria-hidden="true">
      <span className="mw-gate-post">
        <span className="mw-gate-p">P</span>
      </span>
      <span className="mw-gate-arm" />
    </div>
  );
}

/**
 * MASÍVNA VÝHRA (250×+), riddim / 4KA / PAAS look. Transform / opacity animation only; the
 * count is text. First tap finishes the count, the next one closes. Reduced motion: no
 * particles, rays, slam, wobble, glitch or shake, the final sum shows at once.
 */
export function MassiveWin({
  amount,
  x,
  tax = null,
  onClose,
}: {
  amount: number;
  x: number;
  /** BEZ DANE / DAŇOVÝ ÚNIK step behind `amount` (display only; `amount` is already what is credited). */
  tax?: TaxFly | null;
  onClose: () => void;
}) {
  const reduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const small = typeof window !== "undefined" && window.innerWidth < 640;
  const bits = useMemo(() => (reduced ? [] : makeBits(small ? 26 : 44)), [reduced, small]);
  const bars = useMemo(
    () =>
      Array.from({ length: BARS }, (_, i) => ({
        // Bass-heavy: tall on the left, falling off to the right, with a little randomness.
        h: 0.35 + 0.65 * Math.pow(1 - i / BARS, 0.6) * (0.65 + Math.random() * 0.35),
        t: 0.22 + Math.random() * 0.32,
        d: -Math.random(),
      })),
    [],
  );
  const [k, setK] = useState(reduced ? 1 : 0);
  const done = k >= 1;
  const stopCount = useRef<() => void>(() => {});

  useEffect(() => {
    if (reduced) return;
    const t0 = frameNow();
    const stop = onFrame((t) => {
      const p = Math.min(1, Math.max(0, (t - t0) / COUNT_MS));
      setK(p);
      return p < 1;
    });
    stopCount.current = stop;
    return stop;
  }, [reduced]);

  const shown = done ? amount : amount * easeOut(k);
  const shownX = done ? x : x * easeOut(k);
  // Drops passed so far; the class alternates so each hit restarts the shake keyframes.
  const hits = done ? DROPS.length : DROPS.filter((f) => easeOut(k) >= f).length;
  const hitCls = reduced || hits === 0 ? "" : done ? "is-drop" : hits % 2 ? "is-hit-a" : "is-hit-b";
  const skip = () => {
    if (!done) {
      stopCount.current();
      setK(1);
      return;
    }
    onClose();
  };

  return (
    <div
      className={`mw ${done ? "is-done" : ""} ${reduced ? "is-still" : ""} ${hitCls}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Masívna výhra ${formatMoney(amount)}`}
      onClick={(e) => {
        e.stopPropagation();
        skip();
      }}
    >
      <div className="mw-back" aria-hidden="true" />
      <div className="mw-fibre" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <i key={i} style={{ "--f": i } as CSSProperties} />
        ))}
      </div>
      <div className="mw-rays" aria-hidden="true" />
      <div className="mw-glow" aria-hidden="true" />
      <div className="mw-flash" aria-hidden="true" />
      <div className="mw-spec" aria-hidden="true">
        <div className="mw-spec-in">
          {bars.map((b, i) => (
            <i
              key={i}
              style={
                {
                  "--h": b.h.toFixed(2),
                  "--t": `${b.t.toFixed(2)}s`,
                  "--d": `${b.d.toFixed(2)}s`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      </div>
      <Barrier />
      <div className="mw-fx" aria-hidden="true">
        {bits.map((b, i) => (
          <i
            key={i}
            className={`mw-bit is-${b.kind}`}
            style={
              {
                "--dx": `${b.x}vmin`,
                "--dy": `${b.y}vmin`,
                "--fall": `${b.fall}vmin`,
                "--rot": `${b.rot}deg`,
                "--s": b.s,
                "--d": `${b.d}s`,
                "--t": `${b.t}s`,
              } as CSSProperties
            }
          >
            <b />
          </i>
        ))}
      </div>
      <div className="mw-stage">
        <div className="mw-core">
          <p className="mw-kicker">
            <span className="mw-sig" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
            <span className="mw-kick-txt">
              <b>4KA</b> × PAAS × FINANČNÁ SPRÁVA
            </span>
            <span className="mw-live" aria-hidden="true">
              LIVE
            </span>
          </p>
          <h2 className="mw-title" aria-hidden="true">
            <span className="mw-wave" />
            <span className="mw-title-wob">
              <Title ghost="a" />
              <Title ghost="b" />
              <Title />
            </span>
            <span className="mw-shine" />
          </h2>
          <div className="mw-amt">
            <div className="mw-plate">
              <span className="mw-plate-eu" aria-hidden="true">
                <span className="mw-plate-stars" />
                SK
              </span>
              <span className="mw-amt-val">{formatMoney(+shown.toFixed(2))}</span>
              <span className="mw-plate-shine" aria-hidden="true" />
            </div>
          </div>
          {tax ? (
            <p className="mw-tax">
              <TaxChip tax={tax} detail />
            </p>
          ) : null}
          <p className="mw-x">
            <span className="mw-x-tag" aria-hidden="true">
              PAAS
            </span>
            <b>{Math.floor(shownX).toLocaleString("sk-SK")}×</b> stávka
          </p>
          <div className="mw-ticket" aria-hidden="true">
            <span className="mw-ticket-head">PARKOVACÍ LÍSTOK · VÝJAZD VOĽNÝ</span>
            {tax?.kind === "danUrad" ? (
              <span className="mw-stamp is-tax">
                <span>DAŇOVÝ ÚNIK −23 %</span>
                <small>Finančná správa si vzala svoje</small>
              </span>
            ) : (
              <span className="mw-stamp">
                <span>{tax ? "BEZ DANE +23 %" : "BEZ DANE"}</span>
                <small>Finančná správa nič nenašla</small>
              </span>
            )}
          </div>
          {done ? (
            <p key="go" className="mw-hint is-go">Ťukni pre pokračovanie</p>
          ) : (
            <p key="skip" className="mw-hint">ťukni a preskoč</p>
          )}
        </div>
      </div>
    </div>
  );
}
