import { createFileRoute } from "@tanstack/react-router";
import { handleEgoAdmin } from "@/lib/slot/smrtega-admin.server";

const handle = ({ request }: { request: Request }) => handleEgoAdmin(request);

export const Route = createFileRoute("/api/smrtega-admin")({
  server: { handlers: { GET: handle, POST: handle } },
});
