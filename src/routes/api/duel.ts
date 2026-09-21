import { createFileRoute } from "@tanstack/react-router";
import { handleDuel } from "@/lib/slot/duel.server";

const handle = ({ request }: { request: Request }) => handleDuel(request);

export const Route = createFileRoute("/api/duel")({
  server: { handlers: { GET: handle, POST: handle } },
});
