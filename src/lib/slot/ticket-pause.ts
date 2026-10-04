/**
 * A ticket (OTRS job) paused for a duel. Pure rules, no React.
 *
 * Entering a duel (lobby or hot-seat) with a live ticket stores the ticket's locked bet and the ante the
 * player had on it. While paused nothing counts toward the ticket (no spin, no win, no 4KA TV round, no
 * clock), the duel plays at its own stake, and the money guard never fails the ticket. When the duel is
 * over (any end, also a reload), the home slot goes back to the locked bet + ante and the ticket goes on
 * exactly where it stopped.
 */
import { BETS } from "./symbols.ts";
import { formatMoney } from "./format.ts";
import { jobNeedsParknet, jobSplit, jobBonusDone, tickJob, type JobCard, type JobEvent } from "./spend.ts";

export interface TicketPause {
  /** JobCard.id of the paused ticket: a pause never applies to another ticket. */
  jobId: string;
  /** The ticket's locked bet (restored on resume). */
  lockBet: number;
  /** Ante as it was on the ticket when the duel started (restored on resume). */
  ante: boolean;
  /** When the duel took over (ms). */
  at: number;
}

export function pauseTicket(job: JobCard, ante: boolean, now: number): TicketPause {
  return { jobId: job.id, lockBet: job.lockBet, ante: Boolean(ante), at: now };
}

export function sanitizeTicketPause(raw: unknown): TicketPause | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const jobId = typeof r.jobId === "string" ? r.jobId.slice(0, 80) : "";
  const lockBet = typeof r.lockBet === "number" ? r.lockBet : Number(r.lockBet);
  if (!jobId || !Number.isFinite(lockBet) || lockBet <= 0) return null;
  if (!BETS.some((b) => Math.abs(b - lockBet) < 0.001)) return null;
  const at = typeof r.at === "number" && Number.isFinite(r.at) ? r.at : 0;
  return { jobId, lockBet, ante: r.ante === true, at };
}

/**
 * Credit the ticket needs to go on after the duel: one spin at the locked bet, or the 4KA TV buy for a
 * ticket that can only be finished by buying. A duel is entered only when this stays on top of the
 * duel's own entry cost, so a lost duel can never leave the ticket dead (no forfeit caused by the duel).
 */
export function ticketReserve(job: JobCard, buyX: number): number {
  const spin = +Math.max(0, job.lockBet).toFixed(2);
  const buy = +(job.lockBet * Math.max(0, buyX)).toFixed(2);
  if (!jobNeedsParknet(job)) return spin;
  if (job.kind === "buy") return buy;
  if (jobSplit(job) && job.kindB === "buy" && !jobBonusDone(job)) return buy;
  return spin;
}

/**
 * Does this ticket event count? Never while a duel or its lobby is up, never for a round that started
 * inside a duel (even when it settles after the duel closed), never while a pause is still unresolved.
 */
export function ticketCounts(state: TicketGate): boolean {
  return !state.duel && !state.lobby && !state.roundInDuel && !state.paused;
}

export type TicketGate = { duel: boolean; lobby: boolean; roundInDuel: boolean; paused: boolean };

/** The ticket after one event: unchanged (same object) while paused, else the normal tick. */
export function tickUnlessPaused(job: JobCard, ev: JobEvent, gate: TicketGate): JobCard {
  return ticketCounts(gate) ? tickJob(job, ev) : job;
}

/** What to do with a pause once no duel / lobby is left. */
export function resumePlan(
  pause: TicketPause | null,
  job: JobCard | null,
): { betIndex: number; ante: boolean; lockBet: number; toast: string } | { clear: true } | null {
  if (!pause) return null;
  if (!job || job.id !== pause.jobId) return { clear: true };
  const lockBet = job.lockBet || pause.lockBet;
  const betIndex = BETS.findIndex((b) => Math.abs(b - lockBet) < 0.001);
  if (betIndex < 0) return { clear: true };
  return { betIndex, ante: pause.ante, lockBet, toast: `Tiket pokračuje · stávka ${formatMoney(lockBet)}` };
}
