/**
 * KOLESO NEŠŤASTIA explanation (rules card): shown until the player turns it off.
 * Device: localStorage HELP_KEY. The player save carries `kolesoHelpOff` too (player-save.ts kolesoHelpOff), so the choice
 * follows the save; Settings can turn it back on.
 */
export const HELP_KEY = "parkizmus-koleso-help";
/** Coach tips: only the first COACH_RUNS KOLESO runs per device. */
export const COACH_RUNS = 2;

interface HelpState {
  off: boolean;
  /** KOLESO runs that showed the coach tips. */
  coach: number;
  /** Obálky: the player taps one of three envelopes for the letter (off = Jožo Pročkár picks by himself). */
  env: boolean;
}

function read(): HelpState {
  try {
    const r = JSON.parse(localStorage.getItem(HELP_KEY) || "{}") as Partial<HelpState>;
    return { off: r.off === true, coach: Math.max(0, Math.floor(Number(r.coach) || 0)), env: r.env === true };
  } catch {
    return { off: false, coach: 0, env: false };
  }
}

function write(s: HelpState): void {
  try {
    localStorage.setItem(HELP_KEY, JSON.stringify(s));
    window.dispatchEvent(new Event("koleso-help"));
  } catch {
    /* private mode */
  }
}

export function kolesoHelpOff(): boolean {
  return typeof localStorage !== "undefined" && read().off;
}

export function setKolesoHelpOff(off: boolean): void {
  const s = read();
  write({ ...s, off, coach: off ? s.coach : 0 });
}

/** Should this run show the coach tips? Counts the run. */
export function takeKolesoCoach(): boolean {
  const s = read();
  if (s.off || s.coach >= COACH_RUNS) return false;
  write({ ...s, coach: s.coach + 1 });
  return true;
}

/**
 * Obálky (envelopes) on: three envelopes, the player taps one. Purely cosmetic: the letter is decided by the
 * seeded run before the tap, the two unopened envelopes are never shown, so EV and replay do not change.
 */
export function kolesoEnvelopes(): boolean {
  return typeof localStorage !== "undefined" && read().env;
}

export function setKolesoEnvelopes(on: boolean): void {
  write({ ...read(), env: on });
}
