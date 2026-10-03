/**
 * Pure helpers for "every can drop sounds the Rampa slot" and for uploaded one-shots that are not
 * decoded yet. No Web Audio here, so node:test can cover it (audio.ts does the playing).
 */

/** Can moments: cans dropped in after the reels stop, cans dropped in after a tumble, cans thrown (activated). */
export type CanEvent = "land" | "tumble" | "activate";

/**
 * Sound slot of a can moment. Both drops are the rampa letting cans in (top line "RAMPA PÚŠŤA NÁSOBIČE",
 * the attendant's bolt pose), so both are the Rampa slot (zap, Elektrika layered in playZap). The thunder
 * stays on the throw that activates the cans at the end of the chain (Hrom: "hod plechoviek").
 */
export function canEventCue(event: CanEvent): "zap" | "thunder" {
  return event === "activate" ? "thunder" : "zap";
}

/** How long a one-shot may wait for its uploaded sound to arrive / decode before a fallback plays. */
export const CUE_WAIT_MS = 300;

export interface CueState {
  /** A decoded AudioBuffer is ready (custom or built-in). */
  decoded: boolean;
  /** The server lists an upload for this slot (sfx_keys). */
  remote: boolean;
  /** The uploaded bytes are on the device. */
  stored: boolean;
  /** decodeAudioData already failed on these bytes (format the browser's Web Audio cannot read). */
  failed: boolean;
  /** The built-in file is still being fetched / decoded (no upload for this slot). */
  loading?: boolean;
  /** Milliseconds since the game asked for the sound. */
  waitedMs: number;
  maxWaitMs?: number;
}

/**
 * What to do with a one-shot right now:
 * - "buffer": play the decoded buffer;
 * - "wait":   the upload (or the built-in file) is on its way / decoding, ask again when that settles (never past maxWaitMs);
 * - "element": the upload is here but Web Audio cannot decode it, play it through an <audio> element;
 * - "fallback": nothing of the upload is usable in time, play the slot's fallback (built-in / synth).
 */
export function cueRoute(s: CueState): "buffer" | "wait" | "element" | "fallback" {
  if (s.decoded) return "buffer";
  const late = s.waitedMs >= (s.maxWaitMs ?? CUE_WAIT_MS);
  if (s.stored) {
    if (s.failed) return "element";
    return late ? "element" : "wait";
  }
  if ((s.remote || s.loading) && !late) return "wait";
  return "fallback";
}
