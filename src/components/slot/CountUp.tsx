import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/slot/format";
import { frameNow, onFrame } from "@/lib/slot/frame-loop";

/** glide: a drop animates down from the shown value instead of restarting from 0 (tax step). */
export function CountUp({ value, meter, glide, ms }: { value: number; meter?: boolean; glide?: boolean; ms?: number }) {
  const [n, setN] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (Math.abs(value - from) < 0.009) {
      setN(value);
      return;
    }
    if (meter && value < from) {
      setN(value);
      return;
    }
    const start = !meter && !glide && value < from ? 0 : from;
    const t0 = frameNow();
    const ticks = ms ? 24 : 10;
    const dur = ms ?? Math.min(560, 280 + Math.abs(value - start) * 8);
    return onFrame((t) => {
      const k = Math.min(1, Math.max(0, (t - t0) / dur));
      const step = Math.round(k * ticks) / ticks;
      setN(start + (value - start) * step);
      if (k < 1) return true;
      setN(value);
      return false;
    });
  }, [value, meter, glide, ms]);

  return <>{formatMoney(+n.toFixed(2))}</>;
}
