import type { RankFlash } from "@/lib/slot/ranks";
import { RankFrame } from "./RankFrame";

/** Corner nameplate on the reel frame. Never a modal. */
export function RankToast({ flash }: { flash: RankFlash | null; onDone?: () => void }) {
  if (!flash || (flash.event !== "up" && flash.event !== "down")) return null;
  const from = `${flash.before.name}${flash.before.roman ? ` ${flash.before.roman}` : ""}`;
  const to = `${flash.after.name}${flash.after.roman ? ` ${flash.after.roman}` : ""}`;
  if (from === to) return null;
  return (
    <span className={`frame-toast is-${flash.event}`} aria-live="polite">
      <RankFrame id={flash.before.id} division={flash.before.division} size={18} still />
      <span>{from}</span>
      <span className="rf-toast-arrow">→</span>
      <RankFrame id={flash.after.id} division={flash.after.division} size={22} scale={1.15} still={flash.event !== "up"} />
      <span>{to}</span>
    </span>
  );
}
