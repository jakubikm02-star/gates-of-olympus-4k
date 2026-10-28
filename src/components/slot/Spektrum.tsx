import { useEffect } from "react";
import type { SpectrumHud } from "@/lib/slot/spectrum";
import { SPEK_FX, spekWarmList } from "@/lib/slot/spektrum-art";
import { predecode } from "@/lib/slot/predecode";

/**
 * Warm today's cans and the two rare FX once the layer is on, when the browser is idle.
 * Deliberately not in the boot preload list: the art is for NEKONEČNO only.
 * Nothing is fetched for players below NEKONEČNO or with ?spektrum=0.
 */
function useWarmSpektrumArt(on: boolean, ids: readonly number[]): void {
  const key = ids.join(",");
  useEffect(() => {
    if (!on || typeof window === "undefined") return;
    const list = spekWarmList(key ? key.split(",").map(Number) : []);
    // predecode keeps the bitmaps decoded, so the first colour can or FX does not hitch a spin.
    const run = () => void predecode(list);
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(run, { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(run, 1500);
    return () => window.clearTimeout(t);
  }, [on, key]);
}

/** Warms the art and draws the ŽIVÁ VODA / ČIERNA DIERA flash. The HUD is SpektrumCarton (under the rank chips). */
export function SpektrumDock({
  hud,
  flash,
}: {
  hud: SpectrumHud;
  flash: "white" | "black" | null;
}) {
  useWarmSpektrumArt(hud.on, hud.roles.map((r) => r.id));
  return (
    <>
      {flash ? (
        <div className={`spec-flash is-${flash}`} aria-hidden="true">
          <img src={flash === "white" ? SPEK_FX.white : SPEK_FX.black} alt="" decoding="async" draggable={false} />
        </div>
      ) : null}
    </>
  );
}
