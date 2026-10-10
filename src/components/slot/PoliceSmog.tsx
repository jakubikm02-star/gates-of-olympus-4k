import { useEffect, useRef } from "react";
import { onFrame } from "@/lib/slot/frame-loop";
import { FX_WARMUP_MS, newFpsWindow, reportFxFps, stepFpsWindow } from "@/lib/slot/perf-guard";
import {
  SMOG_LITE_FRAME_MS,
  advanceSmogClock,
  newSmogClock,
  smogCanvasSize,
  smogFrame,
  type SmogFrame,
  type SmogTier,
} from "@/lib/slot/police-smog";
import "./police-smog.css";

const FOG_SRC = ["/fx/smog-red.webp", "/fx/smog-red2.webp", "/fx/smog-blue.webp", "/fx/smog-blue2.webp"];
const BEAM_SRC = ["/fx/beam-red.webp", "/fx/beam-blue.webp"];

function loadImg(src: string, done: () => void): HTMLImageElement {
  const img = new Image();
  img.decoding = "async";
  img.onload = done;
  img.src = src;
  return img;
}

const ready = (img: HTMLImageElement | undefined): img is HTMLImageElement => !!img && img.complete && img.naturalWidth > 0;

/**
 * ZÁSAH police lights: red and blue haze rolling in from the screen corners, alternating, with two soft
 * beams sweeping through it, thinned out over the reels. Same prerendered textures and motion as before
 * (public/fx, scripts/gen-police-smog.py), but painted into ONE small canvas that the browser scales up
 * (lib/slot/police-smog.ts). The old eight full-screen GPU layers were what dropped ZÁSAH to ~16 fps on
 * PCs without hardware acceleration and filled the GPU memory on phones (blank reels). Red/blue each
 * peak once per cycle (≥ 0.9 s), well under 3 flashes per second. While it is on screen it also samples
 * the frame rate and switches the session to lite FX below 40 fps (perf-guard).
 */
export function PoliceSmog({
  danger = false,
  full = false,
  reduced = false,
  lite = false,
  still = false,
}: {
  danger?: boolean;
  full?: boolean;
  reduced?: boolean;
  lite?: boolean;
  still?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Survives a full → lite switch, so the haze does not jump back to its start position.
  const clockRef = useRef(newSmogClock());
  const opts = useRef({ danger, full });
  opts.current = { danger, full };
  const tier: SmogTier = reduced ? "static" : still ? "still" : lite ? "lite" : "full";
  // Frozen tiers have no loop, so a danger/full change has to repaint them.
  const frozenKey = tier === "static" || tier === "still" ? `${danger}-${full}` : "";

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { alpha: true });
    if (!box || !canvas || !ctx) return;
    let dirty = true;
    const fogs = FOG_SRC.map((s) => loadImg(s, () => (dirty = true)));
    const beams = BEAM_SRC.map((s) => loadImg(s, () => (dirty = true)));
    const sideCv = [document.createElement("canvas"), document.createElement("canvas")];
    const sideCtx = sideCv.map((c) => c.getContext("2d"));
    const maskCv = document.createElement("canvas");
    let w = 0;
    let h = 0;
    let k = 1;

    const resize = () => {
      w = box.clientWidth;
      h = box.clientHeight;
      const s = smogCanvasSize(w, h, tier);
      k = s.k;
      for (const c of [canvas, ...sideCv, maskCv]) {
        c.width = s.cw;
        c.height = s.ch;
      }
      // The old radial mask (police-smog.css), baked once per size.
      const m = maskCv.getContext("2d");
      if (m) {
        m.setTransform(0.52 * s.cw, 0, 0, 0.44 * s.ch, 0.5 * s.cw, 0.46 * s.ch);
        const g = m.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0, "rgb(0 0 0 / 0.1)");
        g.addColorStop(0.55, "rgb(0 0 0 / 0.42)");
        g.addColorStop(1, "#000");
        m.fillStyle = g;
        m.fillRect(-4, -4, 8, 8);
      }
      dirty = true;
    };

    const paint = (f: SmogFrame) => {
      const cw = canvas.width;
      const ch = canvas.height;
      f.sides.forEach((side, i) => {
        const c = sideCtx[i];
        if (!c) return;
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, cw, ch);
        for (const fog of side.fogs) {
          const img = fogs[fog.img];
          if (!ready(img)) continue;
          const s = fog.size * fog.scale * k;
          c.setTransform(1, 0, 0, 1, fog.cx * k, fog.cy * k);
          c.rotate((fog.rot * Math.PI) / 180);
          c.drawImage(img, -s / 2, -s / 2, s, s);
        }
        const b = side.beam;
        if (b && ready(beams[b.img])) {
          c.globalAlpha = b.alpha;
          c.setTransform(1, 0, 0, 1, b.px * k, b.py * k);
          c.rotate((b.rot * Math.PI) / 180);
          c.drawImage(beams[b.img], 0, (-b.h * k) / 2, b.w * k, b.h * k);
          c.globalAlpha = 1;
        }
      });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, cw, ch);
      f.sides.forEach((side, i) => {
        ctx.globalAlpha = side.alpha;
        ctx.drawImage(sideCv[i], 0, 0);
      });
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(maskCv, 0, 0);
      ctx.globalCompositeOperation = "source-over";
    };

    const frame = () => {
      const phone = window.innerWidth <= 720;
      paint(smogFrame(clockRef.current, w, h, { phone, ...opts.current, statik: tier === "static" }));
      dirty = false;
    };

    resize();
    const ro =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            resize();
            if (tier === "static" || tier === "still") frame();
          })
        : null;
    ro?.observe(box);

    if (tier === "static" || tier === "still") {
      // Reduced motion, or a machine still under 30 fps in lite: one frame, repainted only when an
      // image arrives or the size changes. No frame loop at all.
      let alive = true;
      const poll = () => {
        if (!alive) return;
        if (dirty) frame();
        if (!fogs.every(ready)) window.setTimeout(poll, 120);
      };
      poll();
      return () => {
        alive = false;
        ro?.disconnect();
      };
    }

    const born = performance.now();
    const fps = newFpsWindow();
    let lastDraw = 0;
    const off = onFrame((now, dt) => {
      if (now - born > FX_WARMUP_MS && !document.hidden) {
        const m = stepFpsWindow(fps, now);
        if (m !== null) reportFxFps(m);
      }
      clockRef.current = advanceSmogClock(clockRef.current, dt, opts.current.danger);
      if (tier === "lite" && !dirty && now - lastDraw < SMOG_LITE_FRAME_MS) return;
      lastDraw = now;
      frame();
    });
    return () => {
      off();
      ro?.disconnect();
    };
  }, [tier, frozenKey]);

  return (
    <div
      ref={boxRef}
      className={`police-smog${danger ? " is-danger" : ""}${full ? " is-full" : ""} is-${tier}`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="ps-canvas" />
    </div>
  );
}
