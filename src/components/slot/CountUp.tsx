import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/slot/format";

export function CountUp({ value, meter }: { value: number; meter?: boolean }) {
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
    const start = !meter && value < from ? 0 : from;
    const t0 = performance.now();
    const ticks = 10;
    const dur = Math.min(560, 280 + Math.abs(value - start) * 8);
    let id = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const step = Math.round(k * ticks) / ticks;
      setN(start + (value - start) * step);
      if (k < 1) id = requestAnimationFrame(tick);
      else setN(value);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [value, meter]);

  return <>{formatMoney(+n.toFixed(2))}</>;
}
