/**
 * HLÁSENIE (the ZÁSAH charge meter) drawn as a mini Slovak paper tax return, FO typ B style:
 * mint form, white comb cells filled in blue "pen" as the meter charges, corner registration marks,
 * a barcode with the value under it, a yellow edge strip and a red PODANÉ stamp when full.
 * Visual only: it reads `heat` / `max` and never feeds anything back into the game.
 */

/** One comb cell per tenth of the bar. */
const ZF_CELLS = 10;
/** What the player "confesses" cell by cell. Exactly ZF_CELLS characters. */
const ZF_TEXT = "PRIZNÁVAM!";

/** Row label by charge band. Dark-humour micro-copy; the nick stands in for the surname. */
function zasahFormRow(heat: number, max: number, nick: string): { no: string; text: string } {
  const r = max > 0 ? heat / max : 0;
  const who = nick.trim() || "Daňovník";
  if (r >= 1) return { no: "05", text: "Prijaté. Už ťa hľadajú." };
  if (r >= 0.9) return { no: "04", text: "Podpis: krvou" };
  if (r >= 0.6) return { no: "03", text: "Hriechy: všetky" };
  if (r >= 0.3) return { no: "02", text: "Príjmy: nepriznané" };
  return { no: "01", text: `Priezvisko: ${who}` };
}

/** Barcode: fixed bar/gap widths (bar, gap, bar, gap…) so it never flickers between renders. */
const BARS = [2, 1, 1, 1, 3, 1, 1, 2, 2, 1, 1, 1, 3, 2, 1, 1, 2, 1, 1, 1, 3, 1, 2];
const CODE = (() => {
  let x = 0;
  const rects: { x: number; w: number }[] = [];
  BARS.forEach((w, i) => {
    if (i % 2 === 0) rects.push({ x, w });
    x += w;
  });
  return { rects, w: x };
})();

export function ZasahForm({
  heat,
  max,
  nick = "",
  turbo = false,
  className = "",
}: {
  heat: number;
  max: number;
  nick?: string;
  turbo?: boolean;
  className?: string;
}) {
  const v = Math.max(0, Math.min(max, heat));
  const ratio = max > 0 ? v / max : 0;
  const full = v >= max && max > 0;
  const filled = full ? ZF_CELLS : Math.floor(ratio * ZF_CELLS);
  const part = full ? 0 : ratio * ZF_CELLS - filled;
  const row = zasahFormRow(v, max, nick);
  return (
    <div
      className={`zform ${full ? "is-full" : ""} ${v <= 0 ? "is-empty" : ""} ${turbo ? "is-turbo" : ""} ${className}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={v}
      aria-label={full ? `Hlásenie podané: ZÁSAH začne na ďalšom spine` : `Hlásenie ${v} z ${max}, pri ${max} začne ZÁSAH`}
      title={`HLÁSENIE ${v}/${max} · pri ${max} začne ZÁSAH`}
    >
      <span className="zform-logo" aria-hidden="true">
        <b>ZÁSAH</b>
        <i>typ: H</i>
      </span>
      <span className="zform-main" aria-hidden="true">
        <span className="zform-head">I. ODDIEL – HLÁSENIE O DAŇOVNÍKOVI</span>
        <span className="zform-lbl">
          <em>{row.no}</em>
          <span>{row.text}</span>
        </span>
        <span className="zform-comb">
            {Array.from({ length: ZF_CELLS }, (_, i) => (
              <span
                key={i}
                className={`zform-cell ${i < filled ? "is-on" : ""} ${i === filled && !full ? "is-pen" : ""}`}
                style={i === filled && !full ? { ["--part" as string]: part.toFixed(2) } : undefined}
              >
                {i < filled ? <b>{ZF_TEXT[i]}</b> : null}
            </span>
          ))}
          {full ? <span className="zform-stamp">PODANÉ</span> : null}
        </span>
      </span>
      <span className="zform-code" aria-hidden="true">
        <svg viewBox={`0 0 ${CODE.w} 10`} preserveAspectRatio="none">
          {CODE.rects.map((r) => (
            <rect key={r.x} x={r.x} y={0} width={r.w} height={10} />
          ))}
        </svg>
        <b>{String(Math.round(v)).padStart(3, "0")}</b>
      </span>
    </div>
  );
}
