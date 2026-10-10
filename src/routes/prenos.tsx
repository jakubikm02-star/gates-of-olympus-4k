import { createFileRoute } from "@tanstack/react-router";
import { MoveBridgePage } from "@/components/slot/SaveMove";

/** Opened as a popup on the old link by "PRENIESŤ HRU ZO STARÉHO LINKU" on the new link. */
export const Route = createFileRoute("/prenos")({
  component: MoveBridgePage,
  head: () => ({ meta: [{ title: "Prenos hry · Parkizmus" }, { name: "robots", content: "noindex" }] }),
});
