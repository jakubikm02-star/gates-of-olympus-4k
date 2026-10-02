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
