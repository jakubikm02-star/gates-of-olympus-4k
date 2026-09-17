import { createFileRoute } from "@tanstack/react-router";
import { SlotAuthScreen } from "@/components/slot/SlotAuth";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return <SlotAuthScreen />;
}
