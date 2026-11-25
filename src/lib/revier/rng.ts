/** Deterministic LCG. Same constants as the slot engine, kept local so Nočná smena never imports it. */

export function mixSeed(seed: number): number {
  let s = seed >>> 0;
  if (s === 0) s = 1;
  return s;
}

export function roll(state: number): { state: number; n: number } {
  const next = (Math.imul(state >>> 0, 1664525) + 1013904223) >>> 0;
  return { state: next === 0 ? 1 : next, n: next / 0x100000000 };
}

export function pick<T>(state: number, list: readonly T[]): { state: number; item: T } {
  const r = roll(state);
  const item = list[Math.min(list.length - 1, Math.floor(r.n * list.length))]!;
  return { state: r.state, item };
}

export function shuffle<T>(state: number, list: readonly T[]): { state: number; items: T[] } {
  const items = list.slice();
  let s = state;
  for (let i = items.length - 1; i > 0; i--) {
    const r = roll(s);
    s = r.state;
    const j = Math.floor(r.n * (i + 1));
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return { state: s, items };
}
