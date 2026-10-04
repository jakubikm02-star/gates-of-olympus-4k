/* Parkizmus service worker: makes the game installable (Chromium wants a fetch handler before it
   offers "Inštalovať") without caching anything. Page navigations go to the network as usual; only
   when the phone is offline does it answer with a small Slovak offline card. Assets, API and
   Supabase calls are not touched at all (no respondWith), so a new build is never served stale. */
const OFFLINE_HTML =
  '<!doctype html><html lang="sk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<meta name="theme-color" content="#0b0d10"><title>Parkizmus · offline</title>' +
  '<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#07090c;color:#f3f4f6;font:600 16px system-ui,sans-serif;text-align:center">' +
  '<div style="padding:28px 22px;max-width:320px;border-radius:20px;background:#11161c;box-shadow:inset 0 0 0 1px rgba(240,196,25,.45)">' +
  '<div style="font-size:12px;letter-spacing:.3em;color:#3ec6e0">PORTS OF</div>' +
  '<div style="font-size:34px;letter-spacing:.06em;color:#f0c419;margin:4px 0 14px">PARKIZMUS</div>' +
  '<p style="margin:0 0 18px;color:#c9d3dc;font-weight:500;line-height:1.45">Garáž je bez signálu. Hra potrebuje internet – pripoj sa a skús znova.</p>' +
  '<button onclick="location.reload()" style="border:0;border-radius:999px;padding:12px 26px;font:700 15px system-ui;letter-spacing:.2em;color:#1a1204;background:linear-gradient(180deg,#fff6b8,#f2bb0c)">SKÚSIŤ ZNOVA</button>' +
  "</div></body></html>";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // The page request starts in parallel with the worker boot, so the worker adds no latency.
      self.registration.navigationPreload ? self.registration.navigationPreload.enable().catch(() => {}) : null,
    ]),
  ),
);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate" || req.method !== "GET") return;
  event.respondWith(
    Promise.resolve(event.preloadResponse)
      .then((pre) => pre || fetch(req))
      .catch(
        () => new Response(OFFLINE_HTML, { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }),
      ),
  );
});
