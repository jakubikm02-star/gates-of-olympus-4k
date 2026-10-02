import { useEffect, useRef } from "react";
import { bedAnalyser } from "@/lib/slot/audio";
import { BeatDetector, VIZ, bandAmp, bandBins, bandLevel, dbLevel, ease, ringBins } from "@/lib/slot/bed-viz";
import "./bed-viz.css";

/**
 * 4KA TV light show, driven by the bed loop ("Podklad 4KA TV").
 * One rAF loop. The DOM layers only get opacity/transform writes; the spectrum ring is one canvas.
 * Display only: reads an AnalyserNode, never touches audio output or game math.
 */
type Props = { muted: boolean; reduced: boolean };

type Geo = { w: number; h: number; m: number; top: number; dpr: number; bars: Float32Array; n: number; perim: number };

const RADIUS = 10;
/** Bar colours by band: bass ice-white, mids 4KA cyan, highs gold. */
const TONES = ["#e4fcff", "#3ec6e0", "#f0c419"];

/** Points around a rounded rect (frame edge), with outward normals. t=0 is top-center, clockwise. */
function perimeter(w: number, h: number, m: number, n: number): { bars: Float32Array; perim: number } {
  const r = Math.min(RADIUS, w / 2, h / 2);
  const sw = w - 2 * r;
  const sh = h - 2 * r;
  const arc = (Math.PI / 2) * r;
  const segs = [sw / 2, arc, sh, arc, sw, arc, sh, arc, sw / 2];
  const perim = segs.reduce((a, b) => a + b, 0);
  const bars = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    let d = ((i + 0.5) / n) * perim;
    let x = 0;
    let y = 0;
    let nx = 0;
    let ny = 0;
    const corner = (cx: number, cy: number, a0: number, u: number) => {
      const a = a0 + (u / arc) * (Math.PI / 2);
      nx = Math.cos(a);
      ny = Math.sin(a);
      x = cx + nx * r;
      y = cy + ny * r;
    };
    if ((d -= segs[0]) < 0) [x, y, nx, ny] = [w / 2 + (d + segs[0]), 0, 0, -1];
    else if ((d -= segs[1]) < 0) corner(w - r, r, -Math.PI / 2, d + segs[1]);
    else if ((d -= segs[2]) < 0) [x, y, nx, ny] = [w, r + d + segs[2], 1, 0];
    else if ((d -= segs[3]) < 0) corner(w - r, h - r, 0, d + segs[3]);
    else if ((d -= segs[4]) < 0) [x, y, nx, ny] = [w - r - (d + segs[4]), h, 0, 1];
    else if ((d -= segs[5]) < 0) corner(r, h - r, Math.PI / 2, d + segs[5]);
    else if ((d -= segs[6]) < 0) [x, y, nx, ny] = [0, h - r - (d + segs[6]), -1, 0];
    else if ((d -= segs[7]) < 0) corner(r, r, Math.PI, d + segs[7]);
    else [x, y, nx, ny] = [r + (d + segs[8]), 0, 0, -1];
    bars[i * 4] = x + m;
    bars[i * 4 + 1] = y + m;
    bars[i * 4 + 2] = nx;
    bars[i * 4 + 3] = ny;
  }
  return { bars, perim };
}

export function BedVisualizer({ muted, reduced }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const hotRef = useRef<HTMLDivElement>(null);
  const burstRef = useRef<HTMLDivElement>(null);
  const auraRef = useRef<HTMLDivElement>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(() => {
    const root = rootRef.current;
    const host = root?.parentElement;
    const canvas = canvasRef.current;
    const glow = glowRef.current;
    const hot = hotRef.current;
    const burst = burstRef.current;
    const aura = auraRef.current;
    if (!root || !host || !canvas || !glow || !hot || !burst || !aura) return;
    const frame = host.querySelector<HTMLElement>(".reel-frame");
    const g2d = canvas.getContext("2d", { alpha: true });

    let geo: Geo | null = null;
    const place = () => {
      const f = frame ?? host;
      const w = f.offsetWidth;
      const h = f.offsetHeight;
      const small = w < 560;
      const m = small ? 18 : 32;
      const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
      root.style.left = `${f === host ? 0 : f.offsetLeft}px`;
      root.style.top = `${f === host ? 0 : f.offsetTop}px`;
      root.style.width = `${w}px`;
      root.style.height = `${h}px`;
      canvas.style.left = canvas.style.top = `${-m}px`;
      canvas.style.width = `${w + 2 * m}px`;
      canvas.style.height = `${h + 2 * m}px`;
      canvas.width = Math.round((w + 2 * m) * dpr);
      canvas.height = Math.round((h + 2 * m) * dpr);
      // The ring sits above the frame, so top bars must stop short of the meter row above it.
      const meter = host.parentElement?.querySelector<HTMLElement>(".board-meter");
      const fr = f.getBoundingClientRect();
      const mr = meter?.getBoundingClientRect();
      const top = mr && mr.height > 0 && mr.bottom <= fr.top + 2 ? Math.max(4, Math.min(m, fr.top - mr.bottom - 2)) : m;
      const n = 4 * Math.round(Math.max(48, Math.min(small ? 96 : 152, (2 * (w + h)) / (small ? 8 : 10))) / 4);
      geo = { w, h, m, top, dpr, n, ...perimeter(w, h, m, n) };
    };

    if (reduced) {
      // Static soft glow only: no loop, no ring, no flashes.
      place();
      glow.style.opacity = String(VIZ.STATIC_GLOW);
      const ro = new ResizeObserver(place);
      ro.observe(host);
      return () => ro.disconnect();
    }

    // Bump target: the reel frame (overflow-hidden, so promoting it cannot reorder anything outside it).
    const bumpEl = frame ?? host;
    bumpEl.classList.add("has-bed-viz");
    const det = new BeatDetector();
    let data = new Float32Array(0);
    let levels = new Float32Array(0);
    let rb: Uint16Array | null = null;
    let bins: { bass: [number, number]; mid: [number, number]; high: [number, number] } | null = null;
    let lastAn: AnalyserNode | null = null;
    let raf = 0;
    let prevT = 0;
    let pulse = 0;
    let bassS = 0;
    let midS = 0;
    let highS = 0;
    let live = 0;
    let quietFor = 0;
    let spin = 0;
    let painted = true;

    const ro = new ResizeObserver(place);
    ro.observe(host);
    if (frame) ro.observe(frame);
    place();

    const draw = (amp: number) => {
      if (!g2d || !geo) return;
      const { w, h, m, top, dpr, bars, n, perim } = geo;
      g2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      g2d.clearRect(0, 0, w + 2 * m, h + 2 * m);
      if (amp <= 0.01) {
        painted = false;
        return;
      }
      painted = true;
      const reach = m - 3;
      const reachTop = top - 3;
      const count = levels.length;
      const q = n / 4;
      // Four-way mirror: bass at top-center and bottom-center, highs at the side middles.
      for (let pass = 0; pass < 3; pass++) {
        g2d.beginPath();
        for (let i = 0; i < n; i++) {
          const u = i % (n / 2);
          const k = Math.min(u, n / 2 - u) / q;
          const tone = k < 0.34 ? 0 : k < 0.68 ? 1 : 2;
          if (tone !== pass) continue;
          const v = count ? levels[Math.min(count - 1, Math.floor(k * count))] : 0;
          const x = bars[i * 4];
          const y = bars[i * 4 + 1];
          const nx = bars[i * 4 + 2];
          const ny = bars[i * 4 + 3];
          const len = 1.5 + Math.pow(v, 1.1) * (ny < -0.5 ? reachTop : reach) * amp;
          g2d.moveTo(x + nx * 2.5, y + ny * 2.5);
          g2d.lineTo(x + nx * (2.5 + len), y + ny * (2.5 + len));
        }
        g2d.strokeStyle = TONES[pass];
        g2d.lineCap = "round";
        g2d.globalAlpha = 0.24 * amp;
        g2d.lineWidth = 6;
        g2d.stroke();
        g2d.globalAlpha = 0.95 * amp;
        g2d.lineWidth = 2;
        g2d.stroke();
      }
      // Highs shimmer: two comets travelling the frame edge, brightness from the high band.
      const shimmer = Math.min(1, Math.max(0.12, (highS - VIZ.SHIMMER_FROM) * VIZ.SHIMMER_GAIN)) * amp;
      g2d.beginPath();
      if (g2d.roundRect) g2d.roundRect(m + 0.5, m + 0.5, w - 1, h - 1, RADIUS);
      else g2d.rect(m + 0.5, m + 0.5, w - 1, h - 1);
      g2d.globalAlpha = 0.18 * shimmer;
      g2d.lineWidth = 1.5;
      g2d.strokeStyle = "#bff6ff";
      g2d.setLineDash([]);
      g2d.stroke();
      g2d.globalAlpha = 0.85 * shimmer;
      g2d.lineWidth = 2.5;
      g2d.setLineDash([perim * 0.07, perim * 0.43]);
      g2d.lineDashOffset = -spin * perim;
      g2d.stroke();
      g2d.setLineDash([]);
      g2d.globalAlpha = 1;
    };

    // Write a style only when its string changes: no style invalidation on steady frames.
    const last = new Map<string, string>();
    const put = (id: string, el: HTMLElement, key: "opacity" | "transform", v: string) => {
      const k = id + key;
      if (last.get(k) === v) return;
      last.set(k, v);
      el.style[key] = v;
    };
    // Adaptive quality: if the device can't hold ~45 fps, the canvas ring repaints every other frame.
    let slowShare = 0;
    let frameNo = 0;

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const dt = prevT ? Math.min(100, t - prevT) : 16.7;
      prevT = t;
      const an = mutedRef.current ? null : bedAnalyser();
      if (an !== lastAn) {
        lastAn = an;
        det.reset();
        if (an) {
          const sr = an.context.sampleRate;
          data = new Float32Array(an.frequencyBinCount);
          bins = {
            bass: bandBins(VIZ.BASS_HZ, sr, an.fftSize),
            mid: bandBins(VIZ.MID_HZ, sr, an.fftSize),
            high: bandBins(VIZ.HIGH_HZ, sr, an.fftSize),
          };
          const count = geo ? geo.n / 4 : 24;
          rb = ringBins(count, VIZ.RING_HZ, sr, an.fftSize);
          levels = new Float32Array(count);
        }
      }
      let bass = 0;
      let hit = 0;
      if (an && bins && rb) {
        an.getFloatFrequencyData(data);
        bass = bandLevel(data, bins.bass);
        const mid = bandLevel(data, bins.mid);
        const high = bandLevel(data, bins.high);
        hit = det.step(bandAmp(data, bins.bass), t, dt);
        bassS += (bass - bassS) * ease(dt, 60);
        midS += (mid - midS) * ease(dt, 90);
        highS += (high - highS) * ease(dt, 120);
        const up = ease(dt, 30);
        const down = ease(dt, 140);
        for (let i = 0; i < levels.length; i++) {
          const a = rb[i * 2];
          const b = rb[i * 2 + 1];
          let s = -Infinity;
          for (let j = a; j <= b; j++) if (data[j] > s) s = data[j];
          // Gentle tilt so highs read on screen like the bass does.
          const v = Math.min(1, dbLevel(s) * (0.85 + (i / levels.length) * 0.45));
          levels[i] += (v - levels[i]) * (v > levels[i] ? up : down);
        }
        quietFor = bass + mid + high < VIZ.SILENCE_LEVEL ? quietFor + dt : 0;
      } else {
        quietFor = VIZ.SILENCE_MS;
        bassS += (0 - bassS) * ease(dt, 200);
        highS += (0 - highS) * ease(dt, 200);
        for (let i = 0; i < levels.length; i++) levels[i] *= 1 - ease(dt, 200);
      }
      const signal = quietFor < VIZ.SILENCE_MS ? 1 : 0;
      live += (signal - live) * ease(dt, signal ? 120 : 450);
      if (hit > 0) pulse = Math.max(pulse, hit);
      else pulse *= 1 - ease(dt, VIZ.PULSE_DECAY_MS);
      spin = (spin + (dt / 1000) * (0.05 + midS * 0.35)) % 1;

      const breath = VIZ.IDLE_GLOW + VIZ.IDLE_SWING * Math.sin((t / VIZ.IDLE_PERIOD_MS) * Math.PI * 2);
      const liveGlow = Math.min(VIZ.GLOW_MAX, VIZ.GLOW_BASE + bassS * 0.35 + pulse * 0.5);
      put("g", glow, "opacity", (breath * (1 - live) + liveGlow * live).toFixed(3));
      put("h", hot, "opacity", (Math.min(VIZ.HOT_MAX, pulse * VIZ.HOT_MAX) * live).toFixed(3));
      put("b", burst, "opacity", (Math.min(VIZ.BURST_MAX, pulse * VIZ.BURST_MAX) * live).toFixed(3));
      put("b", burst, "transform", `translate(-50%, -50%) scale(${(0.7 + pulse * 0.45).toFixed(3)})`);
      put("a", aura, "opacity", (Math.min(VIZ.AURA_MAX, VIZ.AURA_BASE + bassS * 0.3 + pulse * 0.6) * live).toFixed(3));
      put("a", aura, "transform", `translate(-50%, -50%) scale(${(0.92 + pulse * 0.1 + bassS * 0.04).toFixed(3)})`);
      const bump = Math.min(VIZ.BUMP_MAX, pulse * VIZ.BUMP_MAX) * live;
      put("f", bumpEl, "transform", bump > 0.0004 ? `scale(${(1 + bump).toFixed(4)})` : "");
      slowShare += ((dt > 22 ? 1 : 0) - slowShare) * ease(dt, 1000);
      frameNo++;
      if ((live > 0.01 || painted) && (slowShare < 0.5 || frameNo % 2 === 0)) draw(live);
    };

    const start = () => {
      if (!raf && document.visibilityState === "visible") {
        prevT = 0;
        raf = requestAnimationFrame(tick);
      }
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVis = () => (document.visibilityState === "visible" ? start() : stop());
    document.addEventListener("visibilitychange", onVis);
    start();
    return () => {
      stop();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      bumpEl.style.transform = "";
      bumpEl.classList.remove("has-bed-viz");
    };
  }, [reduced]);

  return (
    <div ref={rootRef} className={`bed-viz${reduced ? " is-static" : ""}`} aria-hidden="true">
      <div ref={auraRef} className="bv-aura" />
      <div ref={glowRef} className="bv-glow" />
      <div ref={hotRef} className="bv-hot" />
      <canvas ref={canvasRef} className="bv-ring" />
      <div ref={burstRef} className="bv-burst" />
    </div>
  );
}
