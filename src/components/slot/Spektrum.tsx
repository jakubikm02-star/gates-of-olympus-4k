import { useEffect } from "react";
import { COLORS, type SpectrumHud, type SpectrumMark } from "@/lib/slot/spectrum";
import { SPEK_FX, SPEK_RING, SPEK_WEATHER, spekWarmList } from "@/lib/slot/spektrum-art";

/**
 * Warm today's cans and the two rare FX once the layer is on, when the browser is idle.
 * Nothing is fetched for players below NEKONEČNO or with ?spektrum=0.
 */
function useWarmSpektrumArt(on: boolean, ids: readonly number[]): void {
  const key = ids.join(",");
  useEffect(() => {
    if (!on || typeof window === "undefined") return;
    const list = spekWarmList(key ? key.split(",").map(Number) : []);
    const run = () => {
      for (const src of list) {
        const img = new Image();
        img.decoding = "async";
        img.src = src;
      }
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(run, { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(run, 1500);
    return () => window.clearTimeout(t);
  }, [on, key]);
}

/** Day legend and the 7-slot ring. Absolute, so it never changes the reel size. */
export function SpektrumDock({
  hud,
  mark,
  tip,
  flash,
}: {
  hud: SpectrumHud;
  mark: SpectrumMark | null;
  tip: string | null;
  flash: "white" | "black" | null;
}) {
  useWarmSpektrumArt(hud.on, hud.roles.map((r) => r.id));
  const weatherSrc = SPEK_WEATHER[hud.weather] ?? SPEK_WEATHER[1];
  return (
    <>
      {hud.on ? (
        <div className="spec-dock" aria-label="Parkvolt spektrum">
          <div className="spec-legend">
            {hud.roles.map((r) => (
              <span key={r.role} className="spec-role">
                <i style={{ background: r.hex }} />
                <b>{r.name}</b>
              </span>
            ))}
          </div>
          <div className="spec-meta">
            <span className="spec-ring" aria-hidden="true">
              <img src={SPEK_RING.base} alt="" decoding="async" loading="lazy" draggable={false} />
              {COLORS.map((c, i) => {
                const left = hud.lit[i] ?? 0;
                return left > 0 ? (
                  <img
                    key={c.id}
                    src={SPEK_RING.segs[i]}
                    alt=""
                    decoding="async"
                    draggable={false}
                    style={{ opacity: 0.4 + 0.6 * (left / 12) }}
                  />
                ) : null;
              })}
              <img src={SPEK_RING.center} alt="" decoding="async" loading="lazy" draggable={false} />
              {hud.fttb > 0 ? <b className="spec-fttb">{hud.fttb}</b> : null}
            </span>
            <span className="spec-weather">
              <img src={weatherSrc} alt="" width={14} height={14} decoding="async" loading="lazy" draggable={false} />
              {hud.weatherLabel}
            </span>
          </div>
          {mark?.label ? <div className="spec-now">{mark.label}</div> : null}
          {tip ? <p className="spec-tip">{tip}</p> : null}
        </div>
      ) : null}
      {flash ? (
        <div className={`spec-flash is-${flash}`} aria-hidden="true">
          <img src={flash === "white" ? SPEK_FX.white : SPEK_FX.black} alt="" decoding="async" draggable={false} />
        </div>
      ) : null}
    </>
  );
}
