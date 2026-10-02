import type { TaxFly } from "@/hooks/use-slot-game";
import { formatMoney } from "@/lib/slot/format";

/**
 * BEZ DANE (+23 %) / DAŇOVÝ ÚNIK (−23 %) chip, the zásah modifier step shown next to a win amount.
 * Display only: `tax.net` is what the engine credited, `tax.gross` the amount before the modifier.
 * `detail` adds the before → after line (banners, summaries).
 */
export function TaxChip({ tax, detail = false, className = "" }: { tax: TaxFly; detail?: boolean; className?: string }) {
  const loss = tax.kind === "danUrad";
  return (
    <em className={`tax-fly ${loss ? "is-tax" : "is-free"} ${detail ? "has-detail" : ""} ${className}`}>
      {loss ? "DAŇOVÝ ÚNIK −23 %" : "BEZ DANE +23 %"}
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
