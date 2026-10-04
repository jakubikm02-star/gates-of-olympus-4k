/**
 * Ž-BOX explanation (rules card + first-round coach tips): shown until the player turns it off.
 * Device: localStorage HELP_KEY. The player save carries `zboxHelpOff` too (player-save.ts), so the choice
 * follows the save; Settings can turn it back on.
 */
export const HELP_KEY = "parkizmus-zbox-help";
/** Coach tips: only the first COACH_RUNS Ž-BOXes per device. */
export const COACH_RUNS = 2;

interface HelpState {
  off: boolean;
  /** Ž-BOX runs that showed the coach tips. */
  coach: number;
}

function read(): HelpState {
  try {
    const r = JSON.parse(localStorage.getItem(HELP_KEY) || "{}") as Partial<HelpState>;
    return { off: r.off === true, coach: Math.max(0, Math.floor(Number(r.coach) || 0)) };
  } catch {
    return { off: false, coach: 0 };
  }
}

function write(s: HelpState): void {
  try {
    localStorage.setItem(HELP_KEY, JSON.stringify(s));
    window.dispatchEvent(new Event("zbox-help"));
  } catch {
    /* private mode */
  }
}

export function zboxHelpOff(): boolean {
  return typeof localStorage !== "undefined" && read().off;
}

export function setZboxHelpOff(off: boolean): void {
  const s = read();
  write({ off, coach: off ? s.coach : 0 });
}

/** Should this run show the coach tips? Counts the run. */
export function takeZboxCoach(): boolean {
  const s = read();
  if (s.off || s.coach >= COACH_RUNS) return false;
  write({ ...s, coach: s.coach + 1 });
  return true;
}
