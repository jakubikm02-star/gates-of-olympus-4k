/**
 * One more try only when the request never got an answer (fetch TypeError: offline blip, reset connection).
 * A timeout (AbortError) or an HTTP error is final: retrying doubled the stall, and a timed-out
 * park_jackpot_spin may already have committed on the server, so a second call would feed the pool twice.
 */
export function shouldRetry(err: unknown): boolean {
  return err instanceof TypeError;
}

export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!shouldRetry(err)) throw err;
    return await fn();
  }
}
