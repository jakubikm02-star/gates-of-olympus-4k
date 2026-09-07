import { createFileRoute } from "@tanstack/react-router";
import { SlotGame } from "@/components/slot/SlotGame";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <SlotGame />;
}
