/**
 * SUCHO guard (sucho2): an open ticket stops SUCHO only while it is really being played.
 *
 * Before: any open ticket paused SUCHO. A ticket that waits for something the player never does (a 4KA TV buy,
 * a natural 4KA TV for a 4KA TV-only goal, a rare bar mode, the second goal of an OTRS) could be held open for
 * ever and SUCHO never ran.
 *
 * One rule for every ticket type:
 *  1. A ticket whose only open goal needs a 4KA TV buy (POHOTOVOSŤ, OTRS / dual with a KÚPA leg) does not stop
 *     SUCHO until the buy. The buy spin itself is the action: it is shielded and counts as progress.
 *  2. Any other ticket stops SUCHO for at most TICKET_STALL paid spins without progress. Progress = its meter
 *     moved (either goal), a 4KA TV round was spent on it, or the event it waits for was played (a ZÁSAH for a
 *     ZÁSAH goal, a bar bonus of its mode for a KONTROLA / Ž-BOX / bar goal), even when that try did not beat
 *     its best. Progress resets the count, so a ticket that is being played shields as before.
 *  3. A ticket that stands (rule 1 or 2) stays open and can still be cleared; SUCHO counts on from where it was.
 *  4. Spins that never move SUCHO (ZÁSAH, duel, a paused ticket) do not move this count either.
 */
import { featureHave, isFeatureKind, jobDone, type JobCard, type JobEvent } from "./spend.ts";

/** Paid spins without progress after which an open ticket stops holding SUCHO. */
export const TICKET_STALL = 30;
/** From this many spins without progress the chip warns that the ticket is about to stand. */
export const TICKET_STALL_WARN = 20;

export type TicketShield =
  /** No open ticket (or it is paused by a duel): SUCHO runs as usual. */
  | "none"
  /** The ticket is being played: SUCHO stands. */
  | "run"
  /** No progress for TICKET_STALL paid spins: SUCHO runs. */
  | "stall"
  /** Waits for a 4KA TV buy: SUCHO runs until the buy. */
  | "buy";

/** Per-ticket stall count, saved with the player (PlayerSave.ticketStall). */
export interface TicketStall {
  /** Ticket id the count belongs to. Another id = a new ticket = 0. */
  id: string;
  /** Paid SUCHO spins since the last progress. */
  n: number;
}

export function emptyStall(): TicketStall {
  return { id: "", n: 0 };
}

export function sanitizeStall(raw: unknown): TicketStall {
  if (!raw || typeof raw !== "object") return emptyStall();
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id.slice(0, 80) : "";
  const n = typeof r.n === "number" && Number.isFinite(r.n) ? Math.max(0, Math.min(100_000, Math.floor(r.n))) : 0;
  return id ? { id, n } : emptyStall();
}

/** Stall count of this ticket (0 for a ticket the record is not about). */
export function stallOf(rec: TicketStall, job: Pick<JobCard, "id"> | null | undefined): number {
  return job && rec.id === job.id ? rec.n : 0;
}

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
export function ticketShield(job: JobCard | null | undefined, stall: number, paused: boolean, bought = false): TicketShield {
  if (!job || paused || jobDone(job)) return "none";
  if (job.seal) return "run";
  if (ticketWaitsBuy(job)) return bought ? "run" : "buy";
  return stall < TICKET_STALL ? "run" : "stall";
}

export function shields(s: TicketShield): boolean {
  return s === "run";
}

/** The event moved this ticket: meter, 4KA TV round, the awaited ZÁSAH / bar bonus, or the buy it waited for. */
export function ticketMoved(prev: JobCard, next: JobCard, ev: JobEvent): boolean {
  if (next.have > prev.have) return true;
  if ((next.haveB ?? 0) > (prev.haveB ?? 0)) return true;
  if ((next.triesUsed ?? 0) > (prev.triesUsed ?? 0)) return true;
  if (ev.bought && ticketWaitsBuy(prev)) return true;
  // Best-of-one feature goals: a played try is progress even if it did not beat the best.
  if (isFeatureKind(prev.kind) && !prev.kindB && !ev.liveSpin && !ev.bought) {
    if (prev.kind === "zasahBest" && ev.chaseOver) return true;
    if ((prev.kind === "bonus" || prev.kind === "bonusBest") && ev.bonus && featureHave(prev, ev) != null) return true;
  }
  return false;
}

/** Stall record after one paid SUCHO spin with `job` open (call before the spin's result). */
export function stallTick(rec: TicketStall, job: JobCard): TicketStall {
  return { id: job.id, n: Math.min(100_000, stallOf(rec, job) + 1) };
}

/** Stall record after the ticket was settled with this event. */
export function stallAfter(rec: TicketStall, prev: JobCard, next: JobCard | null, ev: JobEvent): TicketStall {
  if (!next) return emptyStall();
  if (ticketMoved(prev, next, ev)) return { id: next.id, n: 0 };
  return { id: next.id, n: stallOf(rec, prev) };
}

/** Paid spins this ticket still holds SUCHO without progress (0 = standing or not applicable). */
export function stallLeft(job: JobCard | null | undefined, stall: number): number {
  if (!job || job.seal || ticketWaitsBuy(job)) return 0;
  return Math.max(0, TICKET_STALL - stall);
}
