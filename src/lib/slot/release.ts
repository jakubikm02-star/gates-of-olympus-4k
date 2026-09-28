declare const __PARK_BUILD__: string;

/** Baked at build time. The live deploy answers with its own id. */
export const BUILD_ID: string = typeof __PARK_BUILD__ === "string" ? __PARK_BUILD__ : "local";

export async function releaseMatches(): Promise<boolean> {
  const res = await fetch(`/api/release?t=${Date.now()}`, { cache: "no-store", headers: { accept: "application/json" } });
  if (!res.ok) return true;
  const data = (await res.json()) as { id?: unknown };
  if (typeof data.id !== "string" || !data.id) return true;
  return data.id === BUILD_ID;
}

export async function dropStaleCaches(): Promise<void> {
  if ("serviceWorker" in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((reg) => reg.unregister()));
  }
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
}

export function hardReload(): void {
  const url = new URL(window.location.href);
  url.searchParams.set("v", String(Date.now()));
  window.location.replace(url.toString());
}
