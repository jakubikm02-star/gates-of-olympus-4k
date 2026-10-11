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
  /** VYBERÁM: the player chooses the letter out of KOLESO_OFFER shown letters (default). false = JOŽO picks. */
  pick: boolean;
}

function read(): HelpState {
  try {
    const r = JSON.parse(localStorage.getItem(HELP_KEY) || "{}") as Partial<HelpState>;
    return { off: r.off === true, coach: Math.max(0, Math.floor(Number(r.coach) || 0)), pick: r.pick !== false };
  } catch {
    return { off: false, coach: 0, pick: true };
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
 * VYBERÁM (default on): on every letter the player sees KOLESO_OFFER random letters and chooses one (timeout,
 * autoplay or PRESKOČIŤ = Jožo's pick, offer[0]). Off = JOŽO: Jožo Pročkár always picks, no prompt. Knowing the
 * phrase is a legit edge; scripts/koleso-ev.ts reports EV for auto / naive / strong players.
 */
export function kolesoChoose(): boolean {
  return typeof localStorage === "undefined" || read().pick;
}

export function setKolesoChoose(on: boolean): void {
  write({ ...read(), pick: on });
}

/** Seconds the letter offer waits before Jožo picks (turbo: KOLESO_PICK_TURBO_S). */
export const KOLESO_PICK_S = 9;
export const KOLESO_PICK_TURBO_S = 6;
