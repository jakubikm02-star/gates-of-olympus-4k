import { useEffect, useState } from "react";
import { formatMoney, formatX } from "@/lib/slot/format";
import { LIVE_HIT_MS, liveHitHead, liveHitPoll, type LiveHit } from "@/lib/slot/live-hit";
import "./live-hit.css";

interface Props {
  /** This phone. Its own hits are not shown. */
  selfId: string;
  /** Regular game is on screen (not the boot). */
  on: boolean;
  /** VERSUS / duel: the card stays off. */
  paused: boolean;
}

/** One other player's MASÍVNA VÝHRA. Slides in, stays 3 s, slides away. */
export function LiveHits({ selfId, on, paused }: Props) {
  const [hit, setHit] = useState<LiveHit | null>(null);
  const [queue, setQueue] = useState<LiveHit[]>([]);

  useEffect(() => {
    if (!on || paused) return;
    let stop = false;
    let after = 0;
    let ready = false;
    let dead = false;
    const pull = async () => {
      if (stop || dead) return;
      try {
        if (!ready) {
          after = await liveHitHead();
          ready = true;
          return;
        }
        const rows = await liveHitPoll(after, selfId);
        if (stop || rows.length === 0) return;
        after = rows[rows.length - 1].id;
        setQueue((q) => [...q, ...rows].slice(-4));
      } catch {
        dead = true;
      }
    };
    void pull();
    const timer = window.setInterval(() => void pull(), 2000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [on, paused, selfId]);

  useEffect(() => {
    if (paused) {
      setHit(null);
      setQueue([]);
    }
  }, [paused]);

  useEffect(() => {
    if (hit || queue.length === 0) return;
    setHit(queue[0]);
    setQueue((q) => q.slice(1));
  }, [hit, queue]);

  useEffect(() => {
    if (!hit) return;
    const timer = window.setTimeout(() => setHit(null), LIVE_HIT_MS);
    return () => window.clearTimeout(timer);
  }, [hit]);

  if (!hit || paused) return null;
  return (
    <div className="live-hit" role="status" aria-live="polite" key={hit.id}>
      <i className="lh-bar" aria-hidden="true" />
      <span className="lh-kicker">
        4KA <em>{hit.mult >= 250 ? "MASÍVNA" : "VÝHRA"}</em>
      </span>
      <b className="lh-nick">{hit.nick}</b>
      <span className="lh-pay">
        <em>{formatX(hit.mult)}</em>
        <b>{formatMoney(hit.amount)}</b>
      </span>
    </div>
  );
}
