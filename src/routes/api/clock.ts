import { createFileRoute } from "@tanstack/react-router";
import { clockReply } from "@/lib/slot/server-day";

/** Server clock + the Europe/Bratislava day (daily reset of ZLATÝ BONUS and other daily features). No DB. */
export const Route = createFileRoute("/api/clock")({
  server: {
    handlers: {
      GET: () =>
        Response.json(clockReply(), {
          headers: { "cache-control": "no-store, max-age=0", "content-type": "application/json" },
        }),
    },
  },
});
