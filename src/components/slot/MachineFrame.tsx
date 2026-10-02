import type { CSSProperties } from "react";
import {
  frameMoves,
  frameTier,
  machineFrameSrc,
  machineTileSrc,
  RANK_HALO_SRC,
  rankFrameSrc,
} from "@/lib/slot/rank-frames";

/**
 * Rank-themed cabinet around the 6×5 reels, built from the rank's own objects:
 * a hero object in each corner and a chain of linked objects along each side
 * (SVG tiles from scripts/gen-machine-frames.mjs). Paints only the bezel ring,
 * so no symbol is covered and the reel box never changes size.
 * Every animated layer lives in `.mf-live`, which is masked to the bezel ring.
 * Hooks for the bonus visualizer: see src/machine-frames.css header.
 */
export function MachineFrame({ id, division = 0 }: { id: string; division?: number }) {
  const tier = frameTier(id);
  const moving = frameMoves(id);
  const lit = division > 0 ? 5 - division : 0;
  const style = {
    ["--mf-corner" as string]: `url("${machineFrameSrc(id, division)}")`,
    ["--mf-h" as string]: `url("${machineTileSrc(id, division, "h")}")`,
    ["--mf-v" as string]: `url("${machineTileSrc(id, division, "v")}")`,
  } as CSSProperties;
  return (
    <div
      className={`mf mf-${id} mf-${tier} mf-l${lit || "m"}`}
      data-rank={id}
      data-tier={division || "m"}
      style={style}
      aria-hidden="true"
    >
      <i className="mf-rim" />
      {moving && tier !== "lux" ? (
        <span className="mf-live mf-under">
          <i className="mf-glow" />
        </span>
      ) : null}
      <i className="mf-side mf-top" />
      <i className="mf-side mf-bot" />
      <i className="mf-side mf-l" />
      <i className="mf-side mf-r" />
      <i className="mf-lip" />
      {moving ? (
        <span className="mf-live">
          <i className="mf-sweep mf-top" />
          <i className="mf-sweep mf-bot" />
          {tier === "elite" ? (
            <>
              <i className="mf-wave mf-nw" />
              <i className="mf-wave mf-se" />
            </>
          ) : null}
          {tier === "apex" ? (
            <>
              <i className="mf-lane mf-l">
                <b />
                <b />
                <b />
                <b />
              </i>
              <i className="mf-lane mf-r">
                <b />
                <b />
                <b />
                <b />
              </i>
            </>
          ) : null}
        </span>
      ) : null}
      <i className="mf-c mf-nw" />
      <i className="mf-c mf-ne" />
      <i className="mf-c mf-sw" />
      <i className="mf-c mf-se" />
      <i className="mf-crest">
        {tier === "apex" ? <img className="mf-halo" src={RANK_HALO_SRC} alt="" draggable={false} /> : null}
        <img src={rankFrameSrc(id, division)} alt="" draggable={false} decoding="async" />
      </i>
      <i className="mf-tier">
        {lit ? [1, 2, 3, 4].map((n) => <b key={n} className={n <= lit ? "on" : ""} />) : <b className="on is-m" />}
      </i>
    </div>
  );
}
