/**
 * Duel entry deposit ("kaucia"). Pure rules, no React, no storage side effects except the explicit
 * app-reload marker helpers at the bottom.
 *
 * Every seat pays DUEL_DEPOSIT_MULT x the duel bet when it enters (lobby for a remote duel, start for
 * hot-seat; hot-seat pays both seats from the one wallet). The deposit is never given to the
 * opponent: it is either returned to the payer or burned (removed from the economy).
 */

export const DUEL_DEPOSIT_MULT = 10;

/** localStorage key set right before a reload the app itself starts (new build) or after a crash. */
export const APP_RELOAD_KEY = "parkizmus-app-reload";
/** An app-reload / crash marker older than this does not count (the user reloaded on their own later). */
export const APP_RELOAD_FRESH_MS = 120_000;

/** Why a deposit was settled. */
export type DepositReason =
  /** Normal end: win, loss or tie. */
  | "finish"
  /** I pressed VZDAŤ / left a running duel. */
  | "forfeit"
  /** The blank (idle) timer forfeited my seat. */
  | "idle"
  /** The opponent's client declared my seat out (no heartbeat / no progress: backgrounded, closed). */
  | "timeout"
  /** The duel was abandoned by a reload / close the user did (found pending on the next boot). */
  | "userReload"
  /** The opponent forfeited, timed out or left: the remaining player gets theirs back. */
  | "peerLeft"
  /** Both seats went silent: nobody is to blame. */
  | "bothDropped"
  /** The lobby closed before the duel started (host never started, guest/host left the lobby). */
  | "notStarted"
  /** The app threw during a duel round. */
  | "appError"
  /** The app reloaded itself (new build) or crashed, found pending on the next boot. */
  | "appReload"
  /** The room row vanished, writes/polls kept failing, or the room got stuck. */
  | "roomFailure";

export const DEPOSIT_REASONS: readonly DepositReason[] = [
  "finish",
  "forfeit",
  "idle",
  "timeout",
  "userReload",
  "peerLeft",
  "bothDropped",
  "notStarted",
  "appError",
  "appReload",
  "roomFailure",
];

/** The player's own leaving: the deposit is burned. Everything else returns it. */
const BURN: ReadonlySet<DepositReason> = new Set<DepositReason>(["forfeit", "idle", "timeout", "userReload"]);

export function depositOutcome(reason: DepositReason): "refund" | "burn" {
  return BURN.has(reason) ? "burn" : "refund";
}

const r2 = (n: number) => +(Math.max(0, n) || 0).toFixed(2);

export function depositAmount(bet: number, mult = DUEL_DEPOSIT_MULT): number {
  return r2(bet * mult);
}

/** Stakes reserve (as before: 1.2 x bet x spins) plus the deposit, per seat and in total. */
export function duelEntryCost(opts: { bet: number; need: number; seats?: 1 | 2 }): {
  stake: number;
  deposit: number;
  perSeat: number;
  total: number;
} {
  const seats = opts.seats ?? 1;
  const stake = r2(opts.bet * opts.need * 1.2);
  const deposit = depositAmount(opts.bet);
  const perSeat = r2(stake + deposit);
  return { stake, deposit, perSeat, total: r2(perSeat * seats) };
}

export function canAffordDuel(balance: number, opts: { bet: number; need: number; seats?: 1 | 2 }): boolean {
  return balance >= duelEntryCost(opts).total;
}

export interface DuelDeposit {
  /** Unique per entry: settlement is keyed on it (exactly once). */
  id: string;
  kind: "hotseat" | "online";
  room: string;
  /** Amount paid from this wallet per seat: online [mine], hot-seat [seat 0, seat 1]. */
  seats: number[];
  paidAt: number;
  /** The duel actually started (a lobby that never started always refunds). */
  started: boolean;
  /** The duel reached its normal end locally (settlement of the pot may still be in flight). */
  finished: boolean;
  /** Polls/writes to the room kept failing during the duel: a later timeout is the network's fault. */
  netFault: boolean;
}

export function depositTotal(dep: DuelDeposit | null | undefined): number {
  if (!dep) return 0;
  return r2(dep.seats.reduce((a, b) => a + b, 0));
}

export function newDeposit(opts: {
  kind: "hotseat" | "online";
  room?: string;
  bet: number;
  now: number;
  id?: string;
  started?: boolean;
}): DuelDeposit {
  const one = depositAmount(opts.bet);
  return {
    id: opts.id ?? `${opts.now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    kind: opts.kind,
    room: opts.room ?? "",
    seats: opts.kind === "hotseat" ? [one, one] : [one],
    paidAt: opts.now,
    started: opts.started ?? opts.kind === "hotseat",
    finished: false,
    netFault: false,
  };
}

export interface DepositSettlement {
  id: string;
  reason: DepositReason;
  refund: number;
  burned: number;
}

/**
 * Money for one settlement. Hot-seat with a seat-specific burn (that seat folded): only that seat's
 * deposit burns, the other seat's comes back. Without `burnSeat` a burn takes the whole deposit.
 */
export function settleDeposit(dep: DuelDeposit, reason: DepositReason, opts?: { burnSeat?: 0 | 1 }): DepositSettlement {
  const total = depositTotal(dep);
  if (depositOutcome(reason) === "refund") return { id: dep.id, reason, refund: total, burned: 0 };
  const seat = opts?.burnSeat;
  if (dep.seats.length > 1 && (seat === 0 || seat === 1)) {
    const burned = r2(dep.seats[seat] ?? 0);
    return { id: dep.id, reason, refund: r2(total - burned), burned };
  }
  return { id: dep.id, reason, refund: 0, burned: total };
}

/**
 * Exactly-once guard: settles only the deposit that is still pending under `id` (or the pending one
 * when `id` is omitted). Returns the cleared pending value and the settlement, or no settlement.
 */
export function settleOnce(
  pending: DuelDeposit | null | undefined,
  reason: DepositReason,
  opts?: { id?: string; burnSeat?: 0 | 1 },
): { pending: DuelDeposit | null; settlement: DepositSettlement | null } {
  if (!pending) return { pending: null, settlement: null };
  if (opts?.id && opts.id !== pending.id) return { pending, settlement: null };
  return { pending: null, settlement: settleDeposit(pending, reason, { burnSeat: opts?.burnSeat }) };
}

/**
 * Why a forfeit ended an online duel, for my deposit. The peer's seat out -> refund. My seat out:
 * my fold / my idle timer / declared out by the peer's client (timeout), unless my own polls/writes
 * had been failing (then the network, not me: roomFailure).
 */
export function forfeitReason(opts: {
  mine: boolean;
  /** What this client knows: I folded, my idle timer ran out, or the room says I was declared out. */
  cause: "fold" | "idle" | "timeout";
  /** My polls/writes kept failing in this duel. */
  netFault?: boolean;
}): DepositReason {
  if (!opts.mine) return "peerLeft";
  if (opts.cause === "fold") return "forfeit";
  if (opts.cause === "idle") return "idle";
  if (opts.netFault) return "roomFailure";
  return "timeout";
}

export interface AppReloadMarker {
  at: number;
  why: "version" | "crash";
}

export function parseMarker(raw: string | null | undefined): AppReloadMarker | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const at = typeof v.at === "number" && Number.isFinite(v.at) ? v.at : 0;
    if (!(at > 0)) return null;
    return { at, why: v.why === "crash" ? "crash" : "version" };
  } catch {
    return null;
  }
}

/**
 * A deposit still pending at boot: the previous page went away mid-duel. Decides how it settles.
 * - duel already finished locally -> finish (refund)
 * - lobby that never started -> notStarted (refund)
 * - fresh app-reload / crash marker set after the deposit was paid -> appReload (refund)
 * - otherwise the user reloaded / closed it -> userReload (burn)
 */
export function bootDepositReason(
  dep: DuelDeposit | null | undefined,
  marker: AppReloadMarker | null,
  now: number,
  freshMs = APP_RELOAD_FRESH_MS,
): DepositReason | null {
  if (!dep) return null;
  if (dep.finished) return "finish";
  if (!dep.started) return "notStarted";
  if (marker && marker.at >= dep.paidAt && now - marker.at <= freshMs && now >= marker.at) return "appReload";
  return "userReload";
}

function money(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return Math.min(1_000_000_000, r2(n));
}

export function sanitizeDeposit(raw: unknown): DuelDeposit | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id.slice(0, 64) : "";
  if (!id) return null;
  const kind = r.kind === "hotseat" ? "hotseat" : r.kind === "online" ? "online" : null;
  if (!kind) return null;
  const list = Array.isArray(r.seats) ? r.seats.slice(0, kind === "hotseat" ? 2 : 1).map(money) : [];
  if (!list.length || list.every((n) => n <= 0)) return null;
  const paidAt = typeof r.paidAt === "number" && Number.isFinite(r.paidAt) && r.paidAt > 0 ? r.paidAt : 0;
  return {
    id,
    kind,
    room: typeof r.room === "string" ? r.room.slice(0, 16) : "",
    seats: list,
    paidAt,
    started: r.started === true,
    finished: r.finished === true,
    netFault: r.netFault === true,
  };
}

/** Browser-only helpers for the marker. */
export function writeAppReloadMarker(why: AppReloadMarker["why"], now = Date.now()): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(APP_RELOAD_KEY, JSON.stringify({ at: now, why }));
  } catch {
    /* storage full / blocked: the deposit then counts as a user reload */
  }
}

export function takeAppReloadMarker(): AppReloadMarker | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const m = parseMarker(localStorage.getItem(APP_RELOAD_KEY));
    localStorage.removeItem(APP_RELOAD_KEY);
    return m;
  } catch {
    return null;
  }
}
