import { createFileRoute } from "@tanstack/react-router";
import { SlotGame } from "@/components/slot/SlotGame";
import { MovedScreen, useMovedHere } from "@/components/slot/SaveMove";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  // Old link after the move: the save is read-only, so the game is not mounted at all.
  const moved = useMovedHere();
  if (moved) return <MovedScreen />;
  return <SlotGame />;
}
