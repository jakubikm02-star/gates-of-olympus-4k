import { useEffect, useState } from "react";

export type Shell = "pc" | "pwa" | "mw";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone) return true;
  return window.matchMedia("(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)").matches;
}

function readShell(): Shell {
  if (typeof window === "undefined") return "pc";
  const phoneLand = window.matchMedia("(pointer: coarse) and (max-height: 560px)").matches;
  if (!phoneLand && window.innerWidth >= 821) return "pc";
  if (isStandalone()) return "pwa";
  return "mw";
}

function syncAppHeight(): void {
  const vv = window.visualViewport;
  const h = vv?.height ?? window.innerHeight;
  const top = vv?.offsetTop ?? 0;
  const root = document.documentElement;
  root.style.setProperty("--app-h", `${Math.round(h)}px`);
  root.style.setProperty("--app-top", `${Math.round(top)}px`);
  // Short portrait phone (browser URL bar + nav bar eat the height): the reels would be height-bound
  // and narrow, so short-vp.css compacts the chrome around them. Uses the visible height, not the
  // media-query (largest) viewport. Above ~0.91w + 400 px the stock layout already fills the width.
  const w = root.clientWidth || window.innerWidth;
  const phone = w <= 720 && h > w;
  root.toggleAttribute("data-phone-vp", phone);
  root.toggleAttribute("data-short-vp", phone && h < w * 0.91 + 400);
}

export function useShell(): Shell {
  // SSR always renders "pc"; reading the real shell in the initializer made hydration keep
  // the server class forever (React does not patch mismatched attributes). Resolve it after mount.
  const [shell, setShell] = useState<Shell>("pc");

  useEffect(() => {
    const apply = () => {
      syncAppHeight();
      setShell(readShell());
    };
    apply();
    const mqPc = window.matchMedia("(min-width: 821px)");
    const mqLand = window.matchMedia("(pointer: coarse) and (max-height: 560px)");
    const mqPwa = window.matchMedia(
      "(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)",
    );
    mqPc.addEventListener("change", apply);
    mqLand.addEventListener("change", apply);
    mqPwa.addEventListener("change", apply);
    window.visualViewport?.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      mqPc.removeEventListener("change", apply);
      mqLand.removeEventListener("change", apply);
      mqPwa.removeEventListener("change", apply);
      window.visualViewport?.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, []);

  return shell;
}

export interface LayoutFlags {
  /** Phone, tablet, or unfolded landscape: reels in the centre, controls in side columns. */
  land: boolean;
  /** cover | inner | flex-v | flex-h, or empty. */
  fold: string;
}

function readLayout(): LayoutFlags {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const q = new URLSearchParams(window.location.search).get("fold");
  const segV = window.matchMedia("(vertical-viewport-segments: 2)").matches;
  const segH = window.matchMedia("(horizontal-viewport-segments: 2)").matches;
  let fold = "";
  if (q === "flex-v" || q === "flex-h" || q === "cover" || q === "inner") fold = q;
  else if (segV) fold = "flex-v";
  else if (segH) fold = "flex-h";
  else {
    const tall = h / Math.max(1, w);
    const shortSide = Math.min(w, h);
    const longSide = Math.max(w, h);
    // Cover is ~21:9 or narrower. Phones sit around 19.5:9, so they stay on the phone layout.
    if (w <= 430 && tall >= 2.28) fold = "cover";
    // Unfolded inner is near-square. Real Fold CSS viewports reach about 884×1104.
    else if (shortSide >= 640 && longSide <= 1280 && longSide / shortSide <= 1.28) fold = "inner";
  }
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const land =
    fold === "flex-h" ||
    (fold === "inner" && w > h) ||
    (w > h && h <= 560) ||
    (coarse && w > h && h > 560 && w <= 1400);
  return { land, fold };
}

/** Viewport class for the responsive shells. Resolved after mount, same as the shell. */
export function useLayoutFlags(): LayoutFlags {
  const [flags, setFlags] = useState<LayoutFlags>({ land: false, fold: "" });
  useEffect(() => {
    const apply = () => {
      const next = readLayout();
      const root = document.documentElement;
      root.dataset.fold = next.fold;
      root.dataset.orient = window.innerHeight >= window.innerWidth ? "portrait" : "landscape";
      root.toggleAttribute("data-land", next.land);
      setFlags(next);
    };
    apply();
    const lists = ["(orientation: landscape)", "(pointer: coarse)", "(vertical-viewport-segments: 2)", "(horizontal-viewport-segments: 2)"].map(
      (q) => window.matchMedia(q),
    );
    for (const mq of lists) mq.addEventListener("change", apply);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    window.visualViewport?.addEventListener("resize", apply);
    return () => {
      for (const mq of lists) mq.removeEventListener("change", apply);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
      window.visualViewport?.removeEventListener("resize", apply);
    };
  }, []);
  return flags;
}
