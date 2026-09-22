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
  if (window.innerWidth >= 821) return "pc";
  if (isStandalone()) return "pwa";
  return "mw";
}

function syncAppHeight(): void {
  const h = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty("--app-h", `${Math.round(h)}px`);
}

export function useShell(): Shell {
  const [shell, setShell] = useState<Shell>(readShell);

  useEffect(() => {
    const apply = () => {
      syncAppHeight();
      setShell(readShell());
    };
    apply();
    const mqPc = window.matchMedia("(min-width: 821px)");
    const mqPwa = window.matchMedia(
      "(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)",
    );
    mqPc.addEventListener("change", apply);
    mqPwa.addEventListener("change", apply);
    window.visualViewport?.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      mqPc.removeEventListener("change", apply);
      mqPwa.removeEventListener("change", apply);
      window.visualViewport?.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, []);

  return shell;
}
