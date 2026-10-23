import { COLORS, type SpectrumHud, type SpectrumMark } from "@/lib/slot/spectrum";

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
            <svg className="spec-ring" viewBox="0 0 72 72" aria-hidden="true">
              {COLORS.map((c, i) => {
                const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / 7 + 0.06;
                const a1 = a0 + (2 * Math.PI) / 7 - 0.12;
                const r = 28;
                const x0 = 36 + r * Math.cos(a0);
                const y0 = 36 + r * Math.sin(a0);
                const x1 = 36 + r * Math.cos(a1);
                const y1 = 36 + r * Math.sin(a1);
                const left = hud.lit[i] ?? 0;
                const on = left > 0;
                return (
                  <path
                    key={c.id}
                    d={`M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`}
                    fill="none"
                    stroke={on ? c.hex : "rgba(255,255,255,0.2)"}
                    strokeWidth={on ? 5.5 : 3}
                    strokeLinecap="round"
                    opacity={on ? 0.4 + 0.6 * (left / 12) : 1}
                  />
                );
              })}
              {hud.fttb > 0 ? (
                <text x="36" y="40" textAnchor="middle" className="spec-fttb">
                  {hud.fttb}
                </text>
              ) : null}
            </svg>
            <span className="spec-weather">{hud.weatherLabel}</span>
          </div>
          {mark?.label ? <div className="spec-now">{mark.label}</div> : null}
          {tip ? <p className="spec-tip">{tip}</p> : null}
        </div>
      ) : null}
      {flash ? <div className={`spec-flash is-${flash}`} aria-hidden="true" /> : null}
    </>
  );
}
