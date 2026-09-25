import type { RankFlash } from "@/lib/slot/ranks";

/** Corner nameplate on the reel frame. Never a modal. */
export function RankToast({ flash }: { flash: RankFlash | null; onDone?: () => void }) {
  if (!flash || (flash.event !== "up" && flash.event !== "down")) return null;
  const from = `${flash.before.name}${flash.before.roman ? ` ${flash.before.roman}` : ""}`;
  const to = `${flash.after.name}${flash.after.roman ? ` ${flash.after.roman}` : ""}`;
  if (from === to) return null;
  return (
    <span className={`frame-toast is-${flash.event}`} aria-live="polite">
      {from} → {to}
    </span>
  );
}
