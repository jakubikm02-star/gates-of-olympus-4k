import type { RankFlash } from "@/lib/slot/ranks";

/** Rank feedback lives on the gauge. This overlay must stay unmounted. */
export function RankToast(_props: { flash: RankFlash | null; onDone?: () => void }) {
  return null;
}
