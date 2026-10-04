/** Pure helpers for the duel setup sheet (no React): room-code input and the cost summary line. */
import { depositAmount, duelEntryCost } from "./duel-deposit.ts";

/**
 * Room codes are 4 letters/digits. Typing: uppercase, junk stripped, max 4. A pasted message
 * ("DUEL kód: a7k2") yields its last standalone 4-char token instead of the first 4 letters.
 */
export function cleanRoomCode(raw: string): string {
  const flat = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (flat.length <= 4) return flat;
  const tokens = raw.split(/[^a-zA-Z0-9]+/).filter((t) => t.length === 4);
  return (tokens[tokens.length - 1] ?? flat).toUpperCase().slice(0, 4);
}

/**
 * What the setup summary shows: the stakes actually played (ante multiplier included), the kaucia,
 * their sum, and the min. credit the game checks before it lets the duel start (canAffordDuel).
 */
export function duelSummary(opts: { bet: number; need: number; ante: boolean; anteMul: number; seats: number }): {
  stakes: number;
  deposit: number;
  total: number;
  minCredit: number;
} {
  const per = opts.ante ? +(opts.bet * opts.anteMul).toFixed(2) : opts.bet;
  const stakes = +(per * opts.need * opts.seats).toFixed(2);
  const deposit = +(depositAmount(opts.bet) * opts.seats).toFixed(2);
  return {
    stakes,
    deposit,
    total: +(stakes + deposit).toFixed(2),
    minCredit: duelEntryCost({ bet: opts.bet, need: opts.need, seats: opts.seats }).total,
  };
}
