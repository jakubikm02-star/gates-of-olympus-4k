import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";

const APP_NAME = "Gates of Olympus 4K";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: APP_NAME },
      {
        name: "description",
        content: "Remake Gates of Olympus s vlastnými symbolmi. Demo automat v prehliadači.",
      },
      { name: "theme-color", content: "#07060c" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      { rel: "preload", as: "image", href: "/symbols/rj45.png" },
      { rel: "preload", as: "image", href: "/symbols/router.png" },
      { rel: "preload", as: "image", href: "/symbols/hap.png" },
      { rel: "preload", as: "image", href: "/symbols/roof.png" },
      { rel: "preload", as: "image", href: "/symbols/arris.png" },
      { rel: "preload", as: "image", href: "/symbols/case.png" },
      { rel: "preload", as: "image", href: "/symbols/meter.png" },
      { rel: "preload", as: "image", href: "/symbols/pdf.png" },
      { rel: "preload", as: "image", href: "/symbols/dacia.png" },
      { rel: "preload", as: "image", href: "/symbols/tv4ka.png" },
      { rel: "preload", as: "image", href: "/art/orb.png" },
      { rel: "preload", as: "image", href: "/art/zeus.png" },
    ],
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
