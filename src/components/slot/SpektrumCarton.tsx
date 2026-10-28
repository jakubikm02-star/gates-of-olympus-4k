import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { COLORS, type SpectrumHud, type SpectrumMark } from "@/lib/slot/spectrum";
import { SPEK_RING, SPEK_WEATHER, spekCanSrc } from "@/lib/slot/spektrum-art";
import { COLOR_SHORT, spektrumSummary } from "@/lib/slot/spektrum-summary";
import "./spektrum-carton.css";

/** The spiked colour ring: base, lit segments (opacity = spins left), centre gem, 1-FTTB spins. */
function Ring({ hud }: { hud: SpectrumHud }) {
  return (
    <span className="spec-ring spk-ring" aria-hidden="true">
      <img src={SPEK_RING.base} alt="" decoding="async" loading="lazy" draggable={false} />
      {COLORS.map((c, i) => {
        const left = hud.lit[i] ?? 0;
        return left > 0 ? (
          <img key={c.id} src={SPEK_RING.segs[i]} alt="" decoding="async" draggable={false} style={{ opacity: 0.4 + 0.6 * (left / 12) }} />
        ) : null;
      })}
      <img src={SPEK_RING.center} alt="" decoding="async" loading="lazy" draggable={false} />
      {hud.fttb > 0 ? <b className="spec-fttb">{hud.fttb}</b> : null}
      <img className="spk-weather" src={SPEK_WEATHER[hud.weather] ?? SPEK_WEATHER[1]} alt="" width={13} height={13} decoding="async" loading="lazy" draggable={false} />
    </span>
  );
}

/**
 * PARKVOLT multipack carton with today's three colour cans. Portrait: under the rank / SUCHO
 * (TIKET BEŽÍ) chips. Landscape: under the QUICK / TURBO / TIKETY / VERSUS grid in the left panel
 * (the slot under TIKET BEŽÍ there belongs to the ticket card). Always absolute: it takes no layout
 * space, so the reels keep their size and nothing moves when a ticket starts or ends.
 * Tapping it opens the short "Dnes v automate" popover (portal on <body>, tap outside closes).
 */
export function SpektrumCarton({
  hud,
  mark,
  tip,
  where,
}: {
  hud: SpectrumHud;
  mark: SpectrumMark | null;
  tip: string | null;
  /** "head": portrait, under the rank chips. "side": landscape, under QUICK / TURBO / TIKETY / VERSUS. CSS shows one. */
  where: "head" | "side";
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxH: number } | null>(null);

  const place = useCallback(() => {
    const el = btn.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(290, vw - 16);
    const left = Math.min(Math.max(8, r.left), vw - width - 8);
    const below = vh - r.bottom - 14;
    const above = r.top - 14;
    // Below the carton (portrait); above it when the carton sits low (landscape left panel).
    if (below >= 220 || below >= above) setPos({ top: r.bottom + 6, left, width, maxH: Math.max(120, below) });
    else setPos({ bottom: vh - r.top + 6, left, width, maxH: above });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && (pop.current?.contains(t) || btn.current?.contains(t))) return;
      setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  useEffect(() => {
    if (!hud.on) setOpen(false);
  }, [hud.on]);

  if (!hud.on) return null;
  const sum = open ? spektrumSummary(hud) : null;
  return (
    <div className={`spk-wrap is-${where}`}>
      <button
        ref={btn}
        type="button"
        className={`spk-carton${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-label="Parkvolt spektrum: čo je dnes v automate"
        onClick={() => setOpen((v) => !v)}
      >
        <Ring hud={hud} />
        <span className="spk-box">
          <span className="spk-back" aria-hidden="true" />
          <span className="spk-cans">
            {hud.roles.map((r) => {
              const left = hud.lit[r.id] ?? 0;
              const src = spekCanSrc(r.id);
              return (
                <span key={r.role} className={`spk-slot${left > 0 ? " is-lit" : ""}`} style={{ ["--spk-hex" as string]: r.hex }}>
                  <span className="spk-can">{src ? <img src={src} alt="" width={14} height={28} decoding="async" loading="lazy" draggable={false} /> : null}</span>
                  <span className="spk-label">{COLOR_SHORT[r.id] ?? r.name}</span>
                  <span className="spk-left">{left > 0 ? `${left} sp` : "–"}</span>
                </span>
              );
            })}
          </span>
          <span className="spk-front" aria-hidden="true" />
          <span className="spk-print" aria-hidden="true">
            PARKVOLT
          </span>
        </span>
      </button>
      {mark?.label ? (
        <span className="spk-now" style={{ ["--spk-hex" as string]: mark.hex }}>
          {mark.label}
        </span>
      ) : null}
      {tip && !open ? <p className="spec-tip spk-tip">{tip}</p> : null}
      {sum && pos && typeof document !== "undefined"
        ? createPortal(
            <div ref={pop} className={`spk-pop${pos.bottom != null ? " is-up" : ""}`}
              role="dialog"
              aria-label={sum.title}
              style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: pos.maxH }}>
              <header>
                <b>{sum.title}</b>
                <em>{sum.kicker}</em>
              </header>
              <ul>
                {sum.lines.map((l) => (
                  <li key={l.key}>
                    {l.hex ? <i style={{ background: l.hex }} aria-hidden="true" /> : <i className="is-plain" aria-hidden="true" />}
                    <span>
                      <strong>{l.lead}</strong> {l.text}
                    </span>
                  </li>
                ))}
              </ul>
              <p>{sum.foot}</p>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
