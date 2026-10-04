import { useCallback, useRef } from "react";

/**
 * Mirror a size container's content box into `--cq-w` / `--cq-h` (px) on the container itself.
 *
 * The board/cabinet rules sized the reel frame with `100cqw` / `100cqh` (and the AI frame bezel with
 * `cqw`). In Chromium every layout pass that reaches such a container re-resolves those styles and then
 * re-lays out the whole frame subtree, all ~300 reel cells included, even when nothing in it changed. A
 * 0.35 s pity-bar width transition or a class flip on one reel column therefore cost a full board
 * relayout per frame (measured 20+ ms at 4× CPU throttling). Reading plain px custom properties instead
 * (`var(--cq-w, 100cqw)`) keeps the same sizes without that dependency; the cq fallback only applies
 * until the first ResizeObserver callback, which runs before the first paint.
 *
 * Vars are only set while the element really is a size container, so `var(--cq-w, 100cqw)` keeps the
 * nearest-container meaning of `100cqw` (an inner container overrides the inherited value).
 */
/** Returns a callback ref; attach it to the size container. */
export function useContainerVars(): (el: HTMLElement | null) => void {
  const stop = useRef<(() => void) | null>(null);
  return useCallback((el: HTMLElement | null) => {
    stop.current?.();
    stop.current = null;
    if (el) stop.current = observeContainer(el);
  }, []);
}

function observeContainer(el: HTMLElement): () => void {
  if (typeof ResizeObserver === "undefined") return () => {};
  let w = -1;
  let h = -1;
  const clear = () => {
    el.style.removeProperty("--cq-w");
    el.style.removeProperty("--cq-h");
    w = -1;
    h = -1;
  };
  const apply = (cw: number, ch: number) => {
    const isSize = /\bsize\b/.test(getComputedStyle(el).containerType || "");
    if (!isSize) {
      if (w >= 0) clear();
      return;
    }
    if (cw === w && ch === h) return;
    w = cw;
    h = ch;
    el.style.setProperty("--cq-w", `${cw}px`);
    el.style.setProperty("--cq-h", `${ch}px`);
  };
  const ro = new ResizeObserver((entries) => {
    const e = entries[entries.length - 1];
    const box = e.contentBoxSize?.[0];
    apply(box ? box.inlineSize : e.contentRect.width, box ? box.blockSize : e.contentRect.height);
  });
  ro.observe(el);
  return () => {
    ro.disconnect();
    clear();
  };
}
