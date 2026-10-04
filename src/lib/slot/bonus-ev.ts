/**
 * EV of the two bar modes per rank (× bet). KONTROLA has a closed form; Ž-BOX is simulated
 * (scripts/zbox-ev.ts) and tuned to it, so the KONTROLA bar keeps its RTP share whichever mode is drawn.
 */
import { dealPickBoard, rankPeekIds, type PickTile } from "./pick-bonus.ts";
import { RANK_PERKS } from "./ranks.ts";

/**
 * Exact E[KONTROLA] with the rank peek, played "peeked pins first, then random" (kontrola_ev.py policy).
 * 9 safes + 3 ODŤAH: a random safe comes before all 3 tows with p = 1/4; clearing all m unknown safes
 * has p = 3!·m!/(m+3)! and doubles the total.
 */
export function kontrolaExactEv(peekCap: number, peekCount: number): number {
  const tiles = dealPickBoard(() => 0);
  const peek = rankPeekIds(tiles, peekCap, peekCount);
  const all = tiles.filter((t) => t.payX > 0);
  const known = all.filter((t) => peek.includes(t.id)).reduce((s, t) => s + t.payX, 0);
  const total = all.reduce((s, t) => s + t.payX, 0);
  const rest = total - known;
  const m = all.length - peek.length;
  let pClear = 6;
  for (let i = 1; i <= m; i++) pClear *= i;
  let den = 1;
  for (let i = 1; i <= m + 3; i++) den *= i;
  pClear /= den;
  return known + rest / 4 + pClear * total;
}

/** One KONTROLA with the same policy (for the simulation cross-check). */
export function kontrolaPlay(rng: () => number, peekCap: number, peekCount: number): number {
  return kontrolaRun(rng, peekCap, peekCount).x;
}

/** One KONTROLA with details: payout (× bet), safe pins found, all 9 cleared. Used by the ticket simulation. */
export function kontrolaRun(rng: () => number, peekCap: number, peekCount: number): { x: number; safes: number; cleared: boolean } {
  const tiles: PickTile[] = dealPickBoard(rng);
  const peek = rankPeekIds(tiles, peekCap, peekCount);
  const rest = tiles.map((t) => t.id).filter((id) => !peek.includes(id));
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const safes = tiles.filter((t) => t.payX > 0).length;
  let sum = 0;
  let n = 0;
  for (const id of [...peek, ...rest]) {
    const t = tiles[id];
    if (t.payX <= 0) break;
    sum += t.payX;
    n += 1;
    if (n === safes) return { x: sum * 2, safes: n, cleared: true };
  }
  return { x: sum, safes: n, cleared: false };
}

/** Target per rank id: E[KONTROLA] with that rank's peek. */
export function kontrolaTargets(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of RANK_PERKS) out[p.id] = kontrolaExactEv(p.peekCap, p.peekCount);
  return out;
}
