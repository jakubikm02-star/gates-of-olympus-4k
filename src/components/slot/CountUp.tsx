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
    const delta = Math.abs(value - from);
    const dur = Math.min(1200, 360 + delta * 16);
    let id = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - (1 - k) ** 2.4;
      setN(from + (value - from) * e);
      if (k < 1) id = requestAnimationFrame(tick);
      else setN(value);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [value]);

  return <>{formatMoney(+n.toFixed(2))}</>;
}
