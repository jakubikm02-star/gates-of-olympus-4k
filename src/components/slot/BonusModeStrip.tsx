import { useEffect, useRef, useState } from "react";
import { BONUS_MODES, bonusModeDef, stripMs, stripTarget, type BonusModeId } from "@/lib/slot/bonus-mode";
import * as sfx from "@/lib/slot/audio";

const LAPS = 4;
/** Tile pitch in px (CSS --ms-tile + gap). */
const TILE = 168;

/**
 * Bar full: the screen dims, a strip of the mode tiles (KONTROLA · Ž-BOX · ?) spins like a lottery and
 * decelerates into the mode drawn when the bar filled (it never decides anything). Tap = skip. Compositor
 * only: one CSS transform transition on the strip.
 */
export function BonusModeStrip({ mode, turbo, reduced, onDone }: { mode: BonusModeId; turbo: boolean; reduced: boolean; onDone: () => void }) {
  const target = stripTarget(mode, reduced ? 0 : LAPS);
  const ms = stripMs(turbo, reduced);
  const [go, setGo] = useState(false);
  const [landed, setLanded] = useState(false);
  const doneRef = useRef(false);
  const timers = useRef<number[]>([]);
  const tiles = Array.from({ length: (LAPS + 2) * BONUS_MODES.length }, (_, i) => BONUS_MODES[i % BONUS_MODES.length]);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    for (const t of timers.current) window.clearTimeout(t);
    onDone();
  };

  useEffect(() => {
    const t = timers.current;
    const raf = window.requestAnimationFrame(() => setGo(true));
    if (!reduced) {
      // Ticks follow the easing: a tile passes the window at progress k = 1 − (1 − u)^3 (u = time share).
      for (let i = 1; i < target; i++) {
        const k = i / target;
        const u = 1 - Math.cbrt(1 - k);
        t.push(window.setTimeout(() => sfx.playStripTick(), u * ms));
      }
    }
    t.push(
      window.setTimeout(() => {
        setLanded(true);
        sfx.playZboxBeep();
      }, ms),
    );
    t.push(window.setTimeout(finish, ms + (turbo ? 450 : 900)));
    return () => {
      window.cancelAnimationFrame(raf);
      for (const id of t) window.clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const def = bonusModeDef(mode);
  return (
    <div className={`ms-back ${landed ? "is-landed" : ""} ${reduced ? "is-reduced" : ""}`} role="dialog" aria-label={`Bonus: ${def.label}`} onClick={finish}>
      <p className="ms-kicker">BAR PLNÝ · LOSUJE SA BONUS</p>
      <div className="ms-window">
        <div
          className="ms-strip"
          style={{
            transform: `translate3d(${go ? -target * TILE : 0}px,0,0)`,
            transitionDuration: `${go ? ms : 0}ms`,
          }}
        >
          {tiles.map((m, i) => (
            <div key={i} className={`ms-tile is-${m.id} ${landed && i === target ? "is-hit" : ""}`}>
              <b>{m.label}</b>
              <span>{m.sub}</span>
            </div>
          ))}
        </div>
        <i className="ms-pointer" aria-hidden="true" />
      </div>
      <p className="ms-result" aria-live="assertive">
        {landed ? (mode === "zbox" ? "Ž-BOX · PAKEŤÁK DORUČUJE" : "KONTROLA · PARKOVNÉ") : "\u00a0"}
      </p>
      <p className="ms-hint">Ťukni pre preskočenie</p>
    </div>
  );
}
