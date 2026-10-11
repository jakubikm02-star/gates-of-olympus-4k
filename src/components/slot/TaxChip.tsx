import type { TaxFly } from "@/hooks/use-slot-game";
import { formatMoney } from "@/lib/slot/format";
import { suchoRtpLabel } from "@/lib/slot/sucho-rtp";

/**
 * BEZ DANE (+23 %) / DAŇOVÝ ÚNIK (−23 %) chip, the zásah modifier step shown next to a win amount.
 * kind "sucho": the red SUCHO · RTP 96 % cut (lib/slot/sucho-rtp), same before → after step.
 * Display only: `tax.net` is what the engine credited, `tax.gross` the amount before the modifier.
 * `detail` adds the before → after line (banners, summaries).
 */
export function TaxChip({ tax, detail = false, className = "" }: { tax: TaxFly; detail?: boolean; className?: string }) {
  const sucho = tax.kind === "sucho";
  const loss = tax.kind === "danUrad";
  const label = sucho ? `SUCHO · ${suchoRtpLabel()}` : loss ? "DAŇOVÝ ÚNIK −23 %" : "BEZ DANE +23 %";
  return (
    <em
      className={`tax-fly ${sucho ? "is-tax is-sucho" : loss ? "is-tax" : "is-free"} ${detail ? "has-detail" : ""} ${className}`}
      title={sucho ? "SUCHO: kým nehráš tiket, hra vypláca na RTP 96 %. Výhra pred SUCHOM → pripísané." : undefined}
    >
      {label}
      <small>
        {tax.delta < 0 ? "−" : "+"}
        {formatMoney(Math.abs(tax.delta))}
      </small>
      {detail ? (
        <small className="tax-fly-detail">
          {formatMoney(tax.gross)} → {formatMoney(tax.net)}
        </small>
      ) : null}
    </em>
  );
}
