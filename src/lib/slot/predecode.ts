/**
 * Keep the reel symbol bitmaps decoded and referenced before the reels move.
 *
 * The boot screen decodes all art once with throwaway Image objects; nothing keeps those alive, so the
 * browser may drop the decoded bitmaps under memory pressure (phones do) and then decode a symbol on the
 * raster thread the first frame it scrolls into view — a hitch in the middle of a spin. Here each source
 * gets one long-lived Image and an `img.decode()` before a spin starts (cheap when it is still cached).
 */

const held = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<void>>();

function decodeOne(src: string): Promise<void> {
  const inflight = pending.get(src);
  if (inflight) return inflight;
  let img = held.get(src);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.src = src;
    held.set(src, img);
  }
  const p = (typeof img.decode === "function" ? img.decode() : Promise.resolve())
    .catch(() => {
      /* broken / offline art: the <img> shows its own fallback */
    })
    .finally(() => pending.delete(src));
  pending.set(src, p);
  return p;
}

/** Decode (or re-confirm) every source; resolves when all are ready or failed. Never rejects. */
export function predecode(srcs: Iterable<string>): Promise<void> {
  if (typeof window === "undefined" || typeof Image === "undefined") return Promise.resolve();
  const uniq = new Set<string>();
  for (const s of srcs) if (s) uniq.add(s);
  return Promise.all([...uniq].map(decodeOne)).then(() => undefined);
}

export const predecodedCount = () => held.size;
