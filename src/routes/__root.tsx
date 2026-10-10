import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";
import { A2HS_HEAD_SCRIPT } from "@/lib/slot/a2hs-client";
import { MIRROR_HEAD_SCRIPT } from "@/lib/slot/mirror-bridge";

const APP_NAME = "Ports of Parkizmus";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" },
      { title: APP_NAME },
      {
        name: "description",
        content: "Ports of Parkizmus — nočná garáž, rampa, lístok, pokuta. Demo automat.",
      },
      { name: "theme-color", content: "#0b0d10" },
      { name: "apple-mobile-web-app-title", content: "Parkizmus" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "application-name", content: "Parkizmus" },
    ],
    links: [
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      // Intro first paint: garage before the symbol set (the intro hero <img fetchPriority="high"> preloads itself).
      { rel: "preload", as: "image", href: "/art/parking-bg.webp", type: "image/webp", fetchPriority: "high" },
      { rel: "preload", as: "image", href: "/symbols/rj45.png" },
      { rel: "preload", as: "image", href: "/symbols/router.png?v=3" },
      { rel: "preload", as: "image", href: "/symbols/hap.png" },
      { rel: "preload", as: "image", href: "/symbols/roof.png" },
      { rel: "preload", as: "image", href: "/symbols/arris.png" },
      { rel: "preload", as: "image", href: "/symbols/case.png" },
      { rel: "preload", as: "image", href: "/symbols/meter.png" },
      { rel: "preload", as: "image", href: "/symbols/pdf.png" },
      { rel: "preload", as: "image", href: "/symbols/dacia.png" },
      { rel: "preload", as: "image", href: "/symbols/tv4ka.png" },
      { rel: "preload", as: "image", href: "/symbols/can-t1.webp" },
      { rel: "preload", as: "image", href: "/art/paas-idle.png?v=3" },
    ],
    // PRIDAŤ NA PLOCHU: keep Chromium's beforeinstallprompt even when it fires before hydration.
    scripts: [{ children: MIRROR_HEAD_SCRIPT }, { children: A2HS_HEAD_SCRIPT }],
  }),
  component: () => (
    <html lang="sk" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
