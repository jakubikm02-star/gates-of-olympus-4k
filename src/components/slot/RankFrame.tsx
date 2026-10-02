import type { CSSProperties } from "react";
import { frameMoves, frameTier, RANK_HALO_SRC, rankFrameSrc } from "@/lib/slot/rank-frames";

/**
 * Rank frame emblem (public/ranks/*.svg, built by scripts/gen-rank-frames.mjs).
 * KREDIT → SMART stay still metal, 4KA TV / OPTIKA get richer static materials,
 * DUO starts to shimmer, 5G NA DOMA glows and pulses signal, NEKONEČNO turns a
 * halo and sheds embers. Motion is transform/opacity only and stops under
 * prefers-reduced-motion.
 */

interface Props {
  id: string;
  division?: number;
  /** Layout box in px; art may be drawn larger with `scale` without moving layout. */
  size?: number;
  scale?: number;
  /** Lists: keep the frame but skip particles and halo spin. */
  still?: boolean;
  dim?: boolean;
  className?: string;
}

export function RankFrame({ id, division = 0, size = 32, scale = 1, still = false, dim = false, className = "" }: Props) {
  const tier = frameTier(id);
  const src = rankFrameSrc(id, division);
  const moving = !still && frameMoves(id);
  const style = {
    ["--rf-size" as string]: `${size}px`,
    ["--rf-scale" as string]: String(scale),
    ["--rf-mask" as string]: `url("${src}")`,
  } as CSSProperties;
  return (
    <span
      className={`rf rf-${id} rf-${tier}${moving ? " rf-live" : ""}${dim ? " rf-dim" : ""}${className ? ` ${className}` : ""}`}
      style={style}
      aria-hidden="true"
    >
      <span className="rf-body">
        {moving && (tier === "elite" || tier === "apex") ? <i className="rf-glow" /> : null}
        {moving && tier === "apex" ? <img className="rf-halo" src={RANK_HALO_SRC} alt="" draggable={false} /> : null}
        {moving && tier === "elite" ? (
          <i className="rf-waves">
            <b />
            <b />
          </i>
        ) : null}
        <img className="rf-art" src={src} alt="" width={size} height={size} draggable={false} decoding="async" />
        {moving ? (
          <i className="rf-shine">
            <b />
          </i>
        ) : null}
        {moving && tier !== "lux" ? (
          <i className="rf-sparks">
            <b />
            <b />
            <b />
            <b />
            <b />
            <b />
          </i>
        ) : null}
      </span>
    </span>
  );
}

/** Pill sweep for the top-left rank chip (DUO and up). */
export function RankPillFx({ id }: { id: string }) {
  if (!frameMoves(id)) return null;
  return (
    <span className="rf-pill-fx" aria-hidden="true">
      <i />
    </span>
  );
}
