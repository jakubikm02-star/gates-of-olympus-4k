import { useState } from "react";
import type { PayId } from "@/lib/slot/symbols";

export interface ChaseAim {
  /** Target the board on screen was played against. Null while the first spin is still aiming. */
  id: PayId | null;
  spin: number;
  /** Bumps on every new target. Keys the snap so a new spin restarts it instead of queuing. */
  seq: number;
  /** Bumps on every HACK hit. Keys the reticle flash. */
  hitSeq: number;
  hits: number;
  /** A chase spin ran in this session, so the board on screen is a chase result (not the restored start board). */
  played: boolean;
}

const NO_AIM: ChaseAim = { id: null, spin: -1, seq: 0, hitSeq: 0, hits: 0, played: false };

/**
 * The hook draws the next target as soon as a chase spin settles. The HUD and the reels keep the
 * target of the board still on screen and switch at the next spin start, so a result never shows
 * a symbol it was not played against. Pure view state: the chase itself is untouched.
 */
export function useChaseAim(chase: { target: PayId | null; spin: number; hits: number } | null, spinning: boolean): ChaseAim {
  const [aim, setAim] = useState<ChaseAim>(NO_AIM);
  let next = aim;
  if (!chase) {
    if (aim.id !== null || aim.spin !== -1 || aim.played) next = { ...NO_AIM, seq: aim.seq, hitSeq: aim.hitSeq };
  } else {
    const live = chase.target;
    if ((spinning && (aim.spin !== chase.spin || aim.id !== live)) || (aim.id === null && live)) {
      next = { ...next, id: live, spin: chase.spin, seq: aim.seq + (live ? 1 : 0) };
    }
    if (spinning && !next.played) next = { ...next, played: true };
    if (chase.hits !== next.hits) {
      next = { ...next, hits: chase.hits, hitSeq: chase.hits > next.hits ? next.hitSeq + 1 : next.hitSeq };
    }
  }
  if (next !== aim) setAim(next);
  return next;
}
