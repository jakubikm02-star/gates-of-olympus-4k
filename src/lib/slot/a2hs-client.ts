/**
 * Browser half of "PRIDAŤ NA PLOCHU": the deferred `beforeinstallprompt`, standalone detection and
 * the tiny network-only service worker (Chromium only fires `beforeinstallprompt` for pages whose
 * service worker has a fetch handler). The event is captured by the inline head script in
 * routes/__root.tsx before any bundle runs (it can fire before hydration) and handed over here.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
}

declare global {
  interface Window {
    __parkBip?: BeforeInstallPromptEvent | null;
    __parkInstalled?: boolean;
  }
}

/** Inline (pre-hydration) capture, rendered as a classic <script> in <head>. Keep it ES5-small. */
export const A2HS_HEAD_SCRIPT =
  "(function(){try{window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__parkBip=e;window.dispatchEvent(new Event('park:bip'))});" +
  "window.addEventListener('appinstalled',function(){window.__parkBip=null;window.__parkInstalled=true;window.dispatchEvent(new Event('park:bip'))})}catch(_){}})();";

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone) return true;
  try {
    return window.matchMedia("(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui), (display-mode: window-controls-overlay)").matches;
  } catch {
    return false;
  }
}

export function deferredPrompt(): BeforeInstallPromptEvent | null {
  return (typeof window !== "undefined" && window.__parkBip) || null;
}

/** Subscribe to prompt availability / appinstalled. Returns unsubscribe. */
export function onInstallChange(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  // Fallback when the head script did not run (e.g. stripped by a proxy).
  const bip = (e: Event) => {
    e.preventDefault();
    window.__parkBip = e as BeforeInstallPromptEvent;
    fn();
  };
  const inst = () => {
    window.__parkBip = null;
    window.__parkInstalled = true;
    fn();
  };
  window.addEventListener("park:bip", fn);
  window.addEventListener("beforeinstallprompt", bip);
  window.addEventListener("appinstalled", inst);
  const mq = window.matchMedia?.("(display-mode: standalone)");
  mq?.addEventListener?.("change", fn);
  return () => {
    window.removeEventListener("park:bip", fn);
    window.removeEventListener("beforeinstallprompt", bip);
    window.removeEventListener("appinstalled", inst);
    mq?.removeEventListener?.("change", fn);
  };
}

/** Native install dialog. Resolves to the user's choice; the event is single-use either way. */
export async function runPrompt(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const e = deferredPrompt();
  if (!e) return "unavailable";
  window.__parkBip = null;
  try {
    await e.prompt();
    const choice = await e.userChoice;
    return choice.outcome;
  } catch {
    return "unavailable";
  }
}

/** Register /sw.js (network-only navigations + offline card; it caches nothing, so no stale builds). */
export function registerInstallSw(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !window.isSecureContext) return;
  // Not inside the builder's preview iframe and never on a dev server.
  if (window.top !== window.self || import.meta.env?.DEV) return;
  const go = () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  };
  if (document.readyState === "complete") window.setTimeout(go, 1500);
  else window.addEventListener("load", () => window.setTimeout(go, 1500), { once: true });
}
