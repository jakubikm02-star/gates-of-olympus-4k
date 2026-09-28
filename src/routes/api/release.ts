import { createFileRoute } from "@tanstack/react-router";
import { BUILD_ID } from "@/lib/slot/release";

export const Route = createFileRoute("/api/release")({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          { id: BUILD_ID },
          { headers: { "cache-control": "no-store, max-age=0", "content-type": "application/json" } },
        ),
    },
  },
});
