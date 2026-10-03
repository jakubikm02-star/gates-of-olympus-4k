import { useEffect, useState, useSyncExternalStore } from "react";
import {
  bootHud,
  displayMode,
  hudState,
  hudVersion,
  parseBrowser,
  resetLoopMax,
  setHudEnabled,
  subscribeHud,
  summarizeFrames,
  type FrameSummary,
} from "@/lib/slot/debug-hud";
import { BUILD_ID } from "@/lib/slot/release";

const SAMPLE = 120;

/**
 * Hidden diagnostics panel: `?debug=1` or five taps on the build label in Nastavenia.
 * Renders nothing (and runs no loop) while disabled.
 */
export function DebugOverlay({ busy, perfLite, reduced }: { busy: boolean; perfLite: boolean; reduced: boolean }) {
  useEffect(() => bootHud(), []);
  useSyncExternalStore(subscribeHud, hudVersion, () => 0);
  const s = hudState();
  const [frames, setFrames] = useState<FrameSummary | null>(null);
  const [mode, setMode] = useState("?");
  const [min, setMin] = useState(false);

  // Own rAF sampler, only while the HUD is open. It counts as one of the loops shown.
  useEffect(() => {
    if (!s.enabled) return;
    let raf = 0;
    let last = 0;
    const buf: number[] = [];
    let shown = 0;
    const tick = (t: number) => {
      if (last) buf.push(t - last);
      if (buf.length > SAMPLE) buf.shift();
      last = t;
      if (t - shown > 500) {
        shown = t;
        setFrames(summarizeFrames(buf));
        setMode(displayMode());
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // A hidden page gets no frames; drop the gap so the next reading is not one huge interval.
    const onVis = () => {
      last = 0;
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [s.enabled]);

  if (!s.enabled) return null;
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const br = parseBrowser(ua);
  const l = s.lifecycle;
  const r = s.lastReel;
  const f = frames;
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio : 1;
  return (
    <div className={`debug-hud${min ? " is-min" : ""}`} role="status" aria-live="off">
      <div className="debug-hud-head">
        <button type="button" onClick={() => setMin((v) => !v)}>
          {f ? `${f.hz.toFixed(0)} Hz` : "… Hz"} · loops {s.loopsNow}
        </button>
        <button type="button" onClick={resetLoopMax} title="Reset max">
          ↺
        </button>
        <button type="button" onClick={() => setHudEnabled(false)} aria-label="Zavrieť debug">
          ×
        </button>
      </div>
      {min ? null : (
        <pre>
          {[
            f
              ? `rAF ${f.hz.toFixed(1)} Hz  avg ${f.meanMs.toFixed(1)} min ${f.minMs.toFixed(1)} p95 ${f.p95Ms.toFixed(1)} max ${f.maxMs.toFixed(0)} ms`
              : "rAF …",
            f ? `>34ms frames ${(f.over34 * 100).toFixed(0)} %` : "",
            `rAF cb/frame ${s.loopsNow}  max ${s.loopsMax}  (HUD 1 + reels 1 + wait 1 počas spinu; bed 1 vo FS)`,
            r
              ? `reels ${Math.round(r.reelMs)} ms  ${r.cellsPerSec.toFixed(1)} cells/s  ${r.frames} fr  avg ${r.meanFrameMs.toFixed(1)} max ${r.maxFrameMs.toFixed(0)} ms`
              : "reel —",
            `busy ${busy ? "yes" : "no"}  reel runs ${s.spins}`,
            `display ${mode}  dpr ${dpr}  ${typeof window !== "undefined" ? `${window.innerWidth}×${window.innerHeight}` : ""}`,
            `${br.name} ${br.version}`,
            `vis ${l.visibilitychange}  freeze ${l.freeze}  resume ${l.resume}  pageshow ${l.pageshow}  pagehide ${l.pagehide}  focus ${l.focus}/${l.blur}`,
            `lite ${perfLite ? "ON" : "off"}  reduced-motion ${reduced ? "ON" : "off"}  build ${BUILD_ID.slice(0, 10)}`,
            ...s.log,
          ]
            .filter(Boolean)
            .join("\n")}
        </pre>
      )}
    </div>
  );
}
