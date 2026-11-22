import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SlotGame } from "@/components/slot/SlotGame";
import { MovedScreen, useMovedHere } from "@/components/slot/SaveMove";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  // Old link after the move: the save is read-only, so the game is not mounted at all.
  const moved = useMovedHere();
  const rig = useRigFlag();
  if (moved) return <MovedScreen />;
  if (rig) return <RigHost />;
  return <SlotGame />;
}

/** `/?rig=1` pulls the editor chunk. The player bundle does not include it until then. */
function useRigFlag() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(new URLSearchParams(window.location.search).get("rig") === "1");
  }, []);
  return on;
}

function RigHost() {
  const [Editor, setEditor] = useState<null | typeof import("@/nocna/rig/editor/RigEditor").RigEditor>(null);
  useEffect(() => {
    let dead = false;
    void import("@/nocna/rig/editor/RigEditor").then((m) => {
      if (!dead) setEditor(() => m.RigEditor);
    });
    return () => {
      dead = true;
    };
  }, []);
  return Editor ? <Editor /> : null;
}
