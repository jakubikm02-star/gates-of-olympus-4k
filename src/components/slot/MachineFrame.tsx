import { useEffect, useState, type CSSProperties } from "react";
import {
  frameDivisionLook,
  frameMoves,
  frameTier,
  MACHINE_AI_MOBILE_Q,
  machineAiSrc,
  machineFrameSrc,
  machineTileSrc,
  RANK_HALO_SRC,
  rankFrameSrc,
} from "@/lib/slot/rank-frames";

/** Sheets already decoded (or failed) this session, so a rank change / remount never flashes the SVG cabinet. */
const aiState = new Map<string, "ok" | "fail">();

/**
 * Loads the rank's AI 9-slice sheet (the size the CSS will pick). Until it is decoded, or if it fails,
 * the SVG cabinet stays on screen.
 */
function useAiSheet(id: string): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const src = machineAiSrc(id, window.matchMedia(MACHINE_AI_MOBILE_Q).matches ? "m" : "hi");
    const known = aiState.get(src);
    if (known) {
      setOk(known === "ok");
      return;
    }
    setOk(false);
    let live = true;
    const img = new Image();
    img.decoding = "async";
    const done = (state: "ok" | "fail") => {
      aiState.set(src, state);
      if (live) setOk(state === "ok");
    };
    img.onload = () => {
      // decode off the main thread before the swap; a failing decode() still means a usable image
      (img.decode ? img.decode() : Promise.resolve()).then(() => done("ok"), () => done("ok"));
    };
    img.onerror = () => done("fail");
    img.src = src;
    return () => {
      live = false;
    };
  }, [id]);
  return ok;
}

/** Pause every cabinet animation while the tab / PWA is in the background. */
function usePageHidden(): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const apply = () => setHidden(document.visibilityState === "hidden");
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => document.removeEventListener("visibilitychange", apply);
  }, []);
  return hidden;
}

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
  const ai = useAiSheet(id);
  const hidden = usePageHidden();
  const look = frameDivisionLook(id, division);
  const style = {
    ["--mf-corner" as string]: `url("${machineFrameSrc(id, division)}")`,
    ["--mf-h" as string]: `url("${machineTileSrc(id, division, "h")}")`,
    ["--mf-v" as string]: `url("${machineTileSrc(id, division, "v")}")`,
    ["--mai-src" as string]: `url("${machineAiSrc(id, "hi")}")`,
    ["--mai-src-m" as string]: `url("${machineAiSrc(id, "m")}")`,
    ["--mai-sat" as string]: String(look.sat),
    ["--mai-bri" as string]: String(look.bri),
    ["--mai-glow" as string]: String(look.glow),
  } as CSSProperties;
  return (
    <div
      className={`mf mf-${id} mf-${tier} mf-l${lit || "m"}${ai ? " is-ai" : ""}`}
      data-rank={id}
      data-tier={division || "m"}
      data-hidden={hidden ? "" : undefined}
      style={style}
      aria-hidden="true"
    >
      {ai ? <AiCabinet tier={tier} /> : null}
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

/**
 * AI raster cabinet: one 9-slice border-image (corners keep their shape, straight bands repeat),
 * plus tier motion on cheap layers (transform / opacity only). See src/machine-ai-frames.css.
 */
function AiCabinet({ tier }: { tier: string }) {
  const corners = ["nw", "ne", "sw", "se"] as const;
  return (
    <>
      <i className="mai-back" />
      {tier === "elite" || tier === "apex" ? <i className="mai-halo" /> : null}
      <i className="mai-img" />
      <span className="mai-fx mai-shape">
        <i className="mai-sweep" />
        {tier === "elite" || tier === "apex" ? <i className="mai-tint" /> : null}
      </span>
      {tier !== "base" ? (
        <span className="mai-fx mai-ring">
          {corners.map((c) => (
            <i key={c} className={`mai-gem mai-${c}`}>
              {tier === "rich" && (c === "nw" || c === "se") ? <b className="mai-glint" /> : null}
              {tier === "lux" ? <b className="mai-glint" /> : null}
              {tier === "elite" ? (
                <>
                  <b className="mai-ripple" />
                  <b className="mai-ripple" />
                  <b className="mai-glint" />
                </>
              ) : null}
              {tier === "apex" ? (
                <>
                  <b className="mai-ember" />
                  <b className="mai-ember" />
                  <b className="mai-ember" />
                  <b className="mai-ember" />
                  <b className="mai-glint" />
                </>
              ) : null}
            </i>
          ))}
        </span>
      ) : null}
    </>
  );
}
