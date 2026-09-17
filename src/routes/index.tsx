import { createFileRoute } from "@tanstack/react-router";
import { SlotGame } from "@/components/slot/SlotGame";
import { SlotAuthScreen } from "@/components/slot/SlotAuth";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { sessionUser } = Route.useRouteContext();
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id ?? sessionUser?.id ?? null;
  if (userId) return <SlotGame key={userId} userId={userId} />;
  // Cookie SSR already ran in beforeLoad. Hold the skeleton only when that
  // result has not arrived yet — never block a known signed-out visitor.
  if (isPending && sessionUser === undefined) return <SlotAuthScreen pending />;
  return <SlotAuthScreen />;
}
