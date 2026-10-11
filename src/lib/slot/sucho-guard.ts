/**
 * SUCHO guard (sucho fix): which open ticket stops SUCHO.
 *
 * Abuse that sucho2 closed: a ticket whose only open goal needs a 4KA TV buy (POHOTOVOSŤ, OTRS / dual with a
 * KÚPA leg) never moves on normal spins. Held open without buying, it used to pause SUCHO for ever.
 *
 * Rule:
 *  1. A ticket whose every open goal needs a 4KA TV buy does not stop SUCHO until the buy. The buy spin itself
 *     is shielded (the ticket is being played).
 *  2. Every other running ticket stops SUCHO for its whole life, whatever its luck (waiting for an OLP, a
 *     sivý lístok, a bar bonus of its mode…). Its life is bounded by normal paid play:
 *      - base / any-scope and combo tickets spend `limit` on every paid base spin (≤ 800, player-save),
 *      - feature tickets (ZÁSAH / bar bonus goals) spend `limit` on base spins too; a seal ends with its run,
 *      - 4KA TV-scope tickets (PLECHOVKY, TACHYKARDIA) and a dual's 4KA TV leg spend their budget in the
 *        4KA TV, and the paid spins that hold them trigger one naturally (≈ 1 in 370 spins, 1 in 190 with
 *        ante; the player cannot steer it), so they cannot be parked either.
 *     The sucho2 "30 spins without progress" stall is gone: it punished players who were really chasing a
 *     ticket's random symbol.
 *  3. A paused ticket (duel) does not stop SUCHO, as before.
 * Pure function of the ticket: nothing is saved, a loaded save is judged by the same rule at once.
 */
import { jobDone, type JobCard } from "./spend.ts";

export type TicketShield =
  /** No open ticket (or it is paused by a duel): SUCHO runs as usual. */
  | "none"
  /** A running ticket: SUCHO stands. */
  | "run"
  /** Waits for a 4KA TV buy: SUCHO runs until the buy. */
  | "buy";

/** A goal that only a bought 4KA TV can move. */
function legNeedsBuy(kind: JobCard["kind"] | undefined): boolean {
  return kind === "buy";
}

/** Every goal still open needs a 4KA TV buy: nothing but a buy can move this ticket. */
export function ticketWaitsBuy(job: JobCard): boolean {
  if (jobDone(job)) return false;
  const open: (JobCard["kind"] | undefined)[] = [];
  if (job.have < job.need) open.push(job.kind);
  if (job.kindB && (job.haveB ?? 0) < (job.needB ?? 1)) open.push(job.kindB);
  // Hydra keeps both symbols in kind "hydra" (no buy).
  return open.length > 0 && open.every(legNeedsBuy);
}

/**
 * Shield state of the ticket for the next paid spin. `bought` = that spin is a 4KA TV buy.
 * A seal (the ticket waits for a ZÁSAH / bonus / 4KA TV that already started) always shields: it ends with that run.
 */
export function ticketShield(job: JobCard | null | undefined, paused: boolean, bought = false): TicketShield {
  if (!job || paused || jobDone(job)) return "none";
  if (job.seal) return "run";
  if (ticketWaitsBuy(job)) return bought ? "run" : "buy";
  return "run";
}

export function shields(s: TicketShield): boolean {
  return s === "run";
}
