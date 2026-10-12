import { useEffect, useRef, useState } from "react";
import { ONLINE_BEAT_MS, ONLINE_LABEL, onlineBlink, onlineDigits, parkOnlineBeat, segMask } from "@/lib/slot/online";
import "./online-meter.css";

/** One 7-segment glyph. Unlit segments stay faintly visible, like a real module. */
function Seg({ ch, big = false }: { ch: string; big?: boolean }) {
  const on = segMask(ch);
  const lit = (id: string) => (on.includes(id) ? " is-on" : "");
  return (
    <svg className={`seg${big ? " is-big" : ""}`} viewBox="0 0 24 40" aria-hidden="true">
      <polygon className={`seg-a${lit("a")}`} points="4,2 20,2 18,5 6,5" />
      <polygon className={`seg-b${lit("b")}`} points="21,3 23,5 23,17 21,19 18,16 18,6" />
      <polygon className={`seg-c${lit("c")}`} points="21,21 23,23 23,35 21,37 18,34 18,24" />
      <polygon className={`seg-d${lit("d")}`} points="4,38 20,38 18,35 6,35" />
      <polygon className={`seg-e${lit("e")}`} points="3,21 5,24 5,34 3,37 1,35 1,23" />
      <polygon className={`seg-f${lit("f")}`} points="3,3 5,6 5,16 3,19 1,17 1,5" />
      <polygon className={`seg-g${lit("g")}`} points="5,18.5 19,18.5 17.5,21 6.5,21" />
    </svg>
  );
}

/**
 * Player count in the free band above the reels. The green dot blinks once when the number changes.
 */
export function OnlineMeter({ playerId }: { playerId: string }) {
  const [count, setCount] = useState<number | null>(null);
  const [blink, setBlink] = useState(false);
  const prev = useRef<number | null>(null);

  useEffect(() => {
    if (playerId.trim().length < 8) return;
    let stop = false;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void parkOnlineBeat(playerId).then((n) => {
        if (!stop && n != null) setCount(n);
      });
    };
    tick();
    const id = setInterval(tick, ONLINE_BEAT_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [playerId]);

  useEffect(() => {
    if (!onlineBlink(prev.current, count)) {
      prev.current = count;
      return;
    }
    prev.current = count;
    setBlink(true);
    const t = window.setTimeout(() => setBlink(false), 720);
    return () => window.clearTimeout(t);
  }, [count]);

  const digits = onlineDigits(count);
  const label = count == null ? "Online hráči sa načítavajú" : `Online hráči: ${count}`;

  return (
    <div className="online-meter" role="status" aria-live="polite" aria-label={label}>
      <i className={`online-dot${blink ? " is-blink" : ""}`} />
      <span className="online-word">
        {ONLINE_LABEL.split("").map((ch, i) => (
          <Seg key={`${ch}${i}`} ch={ch} />
        ))}
      </span>
      <span className="online-num">
        {digits.split("").map((ch, i) => (
          <Seg key={`${ch}${i}`} ch={ch} big />
        ))}
      </span>
    </div>
  );
}
