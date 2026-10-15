import { createFileRoute } from "@tanstack/react-router";
import { SmrtEgaAdminPage } from "@/components/slot/SmrtEgaAdmin";

/** Martin's SMRŤ EGA admin: 4 moja.4ka.tv slots, paste key, confirm removal, revoke. */
export const Route = createFileRoute("/smrtega-admin")({
  component: SmrtEgaAdminPage,
  head: () => ({ meta: [{ title: "SMRŤ EGA admin · Parkizmus" }, { name: "robots", content: "noindex" }] }),
});
