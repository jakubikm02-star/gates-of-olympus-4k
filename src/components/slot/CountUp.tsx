import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/slot/format";

export function CountUp({ value }: { value: number }) {
  const [n, setN] = useState(value);
  const prev = useRef(0);

  useEffect(() => {
    const from = value < prev.current ? 0 : prev.current;
    prev.current = value;
    if (Math.abs(value - from) < 0.009) {
      setN(value);
      return;
    }
    const t0 = performance.now();
    const ticks = 10;
    const dur = Math.min(560, 280 + Math.abs(value - from) * 8);
    let id = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const step = Math.round(k * ticks) / ticks;
      setN(from + (value - from) * step);
      if (k < 1) id = requestAnimationFrame(tick);
      else setN(value);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [value]);

  return <>{formatMoney(+n.toFixed(2))}</>;
}
