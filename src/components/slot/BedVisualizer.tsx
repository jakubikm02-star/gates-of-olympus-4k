import { useEffect, useRef } from "react";
import { isPerfLite } from "@/lib/slot/perf-guard";
import { bedAnalyser, bedLatency } from "@/lib/slot/audio";
import {
  BassNorm,
  BeatDetector,
  BinNorm,
  FlashGate,
  FlowDrive,
  KickMeter,
  LagLine,
  VIZ,
  bandAmp,
  bandBins,
  bandLevel,
  ease,
  edgeErase,
  featherErase,
  flowSpeed,
  fogHue,
  follow,
  latencyCompMs,
  ringBins,
  ringAmps,
  roundRectSd,
  smoothBins,
  tileNoise,
} from "@/lib/slot/bed-viz";
import "./bed-viz.css";

/**
 * 4KA TV light show, driven by the bed loop ("Podklad 4KA TV").
 *
 * - Rainbow liquid fog across the whole background behind the machine: layered soft blobs from a
 *   prerendered, already blurred sprite sheet (public/fx/fog-rainbow.webp, scripts/gen-rainbow-fog.py),
 *   drawn on a coarse viewport-sized canvas and only moved / rotated / faded (no live blur). The blobs
 *   swirl around the frame in two counter-rotating layers; the hue runs around the frame like a colour
 *   wheel and drifts with the mids/highs. The bass drives the fog's MOTION (one flow clock for orbit,
 *   spin, wobble and wisp drift; fast attack, smooth release), not its size; brightness only lifts a
 *   little and its rises are rate-limited (FlashGate, strobe-safe). Two prerendered noise masks keep it
 *   gaseous: drifting wisps carved out of the fog, and a noise-feathered fade into the frame (no straight
 *   edge anywhere), so the fog never covers symbols.
 * - Everything follows per-frame band energy; the beat detector only adds punches (rim flash,
 *   background shake, star push).
 * - Analyser frames are held back by the reported output latency so the picture lands with the sound.
 * One rAF loop, two canvases (stars DPR ≤ 2, fog at FOG_RES), DOM layers get opacity/transform writes only.
 * Display only: reads an AnalyserNode, never touches audio output or game math.
 */
type Props = { muted: boolean; reduced: boolean };

/** Spectrum bins (log spaced, RING_HZ): only read for the mids/highs hue drift. */
const BINS = 48;
const RADIUS = 12;
/** Fog sprite sheet: 4×4 cells of CELL px, cell = shape × 8 + hue. */
const FOG_SRC = "/fx/fog-rainbow.webp";
const CELL = 256;

type Geo = {
  /** Stars canvas CSS size and the frame box inside it. */
  cw: number;
  ch: number;
  fx: number;
  fy: number;
  w: number;
  h: number;
  dpr: number;
  /** Outline points around the frame (x, y relative to frame centre, dir x, dir y, room outward). */
  pts: Float32Array;
  n: number;
  /** Fog canvas (= viewport): frame box position in it, px per CSS px, prerendered masks (null when unavailable). */
  ox: number;
  oy: number;
  fs: number;
  mask: HTMLCanvasElement | null;
  wisp: CanvasPattern | null;
  small: boolean;
};

/** Wisp tile: fog px per side and noise lattice cells per side (tileable). */
const WISP_PX = 96;
const WISP_CELLS = 4;

/**
 * Fog mask (fog canvas px, opaque = erase, used with destination-out), prerendered on resize:
 * - into the frame: the fog fades over a band whose edge wanders with noise (featherErase);
 * - towards the canvas edges: a cloud-shaped falloff `edge` px deep whose depth varies with noise,
 *   so neither the frame box nor the clip box ever shows as a straight line.
 */
function fogMask(cw: number, ch: number, fs: number, x: number, y: number, w: number, h: number, edge: number): HTMLCanvasElement | null {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(cw * fs));
  c.height = Math.max(1, Math.round(ch * fs));
  const m = c.getContext("2d");
  if (!m) return null;
  const img = m.createImageData(c.width, c.height);
  const d = img.data;
  const hx = x + w / 2;
  const hy = y + h / 2;
  const far = VIZ.FEATHER_OUT + VIZ.FEATHER_JITTER + 2;
  for (let py = 0; py < c.height; py++) {
    const yy = (py + 0.5) / fs;
    const cy = yy - hy;
    for (let px = 0; px < c.width; px++) {
      const xx = (px + 0.5) / fs;
      const cx = xx - hx;
      const sd = roundRectSd(cx, cy, w / 2, h / 2, RADIUS);
      let a = 0;
      if (sd < far)
        a = sd < -VIZ.FEATHER_IN - VIZ.FEATHER_JITTER ? 1 : featherErase(sd, tileNoise(cx / 46, cy / 46, 1 << 20, 7));
      const e = Math.min(xx, yy, cw - xx, ch - yy);
      if (a < 1 && e < edge * 1.5) a = 1 - (1 - a) * (1 - edgeErase(e, edge, tileNoise(xx / 90, yy / 90, 1 << 20, 11)));
      d[(py * c.width + px) * 4 + 3] = Math.round(a * 255);
    }
  }
  m.putImageData(img, 0, 0);
  return c;
}

/** Tileable wisp texture (opaque = erase): soft streaks and holes that drift through the fog. */
function wispTile(): HTMLCanvasElement | null {
  const c = document.createElement("canvas");
  c.width = c.height = WISP_PX;
  const m = c.getContext("2d");
  if (!m) return null;
  const img = m.createImageData(WISP_PX, WISP_PX);
  const d = img.data;
  for (let y = 0; y < WISP_PX; y++)
    for (let x = 0; x < WISP_PX; x++) {
      const n = tileNoise((x / WISP_PX) * WISP_CELLS, (y / WISP_PX) * WISP_CELLS, WISP_CELLS, 3);
      const u = Math.min(1, Math.max(0, (n - 0.38) / 0.34));
      d[(y * WISP_PX + x) * 4 + 3] = Math.round(u * u * (3 - 2 * u) * 255);
    }
  m.putImageData(img, 0, 0);
  return c;
}

/** Points around a rounded rect, t=0 top-centre, clockwise, with outward normals. */
function outline(w: number, h: number, n: number): Float32Array {
  const r = Math.min(RADIUS, w / 2, h / 2);
  const sw = w - 2 * r;
  const sh = h - 2 * r;
  const arc = (Math.PI / 2) * r;
  const segs = [sw / 2, arc, sh, arc, sw, arc, sh, arc, sw / 2];
  const perim = segs.reduce((a, b) => a + b, 0);
  const out = new Float32Array(n * 4);
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
    out[i * 4] = x;
    out[i * 4 + 1] = y;
    out[i * 4 + 2] = nx;
    out[i * 4 + 3] = ny;
  }
  return out;
}

/** 4KA TV emblem: dark disc, panelák skyline, stars. Original artwork, not a real logo. */
function Emblem() {
  return (
    <svg viewBox="0 0 100 100" className="bv-emblem-art">
      <defs>
        <radialGradient id="bvEmbBg" cx="50%" cy="38%" r="65%">
          <stop offset="0%" stopColor="#173a52" />
          <stop offset="70%" stopColor="#081520" />
          <stop offset="100%" stopColor="#04090e" />
        </radialGradient>
        <clipPath id="bvEmbClip">
          <circle cx="50" cy="50" r="45" />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="48.5" fill="#f4fbff" />
      <circle cx="50" cy="50" r="45" fill="url(#bvEmbBg)" />
      <g clipPath="url(#bvEmbClip)" fill="#f4fbff">
        <path d="M5 100V78h7v-6h9v10h5V66h12v14h4V74h8v-9h11v13h5V70h10v10h6v-6h9v26z" />
        <g fill="#0b1b28">
          <rect x="28" y="69" width="2" height="2" />
          <rect x="33" y="69" width="2" height="2" />
          <rect x="28" y="74" width="2" height="2" />
          <rect x="54" y="68" width="2" height="2" />
          <rect x="59" y="68" width="2" height="2" />
          <rect x="54" y="73" width="2" height="2" />
          <rect x="73" y="73" width="2" height="2" />
        </g>
        <circle cx="22" cy="28" r="1.2" />
        <circle cx="78" cy="24" r="1.4" />
        <circle cx="70" cy="44" r="0.9" />
        <circle cx="26" cy="48" r="0.8" />
        <circle cx="84" cy="56" r="0.9" />
      </g>
      <text x="50" y="45" textAnchor="middle" className="bv-emblem-4ka">
        4KA
      </text>
      <text x="51.5" y="61" textAnchor="middle" className="bv-emblem-tv">
        TV
      </text>
    </svg>
  );
}

type Trace = {
  t: number;
  env: number;
  /** Fog brightness (FlashGate output × live) – what the beat screenshots / A/V check key on. */
  disp: number;
  /** Bass motion drive (0..1) and the resulting fog speed multiplier. */
  flow: number;
  speed: number;
  hue: number;
  punch: number;
  comp: number;
  amp: number;
  ms: number;
  lowQ: boolean;
  live: number;
}[];

/** One fog blob: anchor along the frame outline, layer, motion and look parameters. */
type Blob = {
  u: number;
  layer: 0 | 1;
  orbit: number;
  off: number;
  size: number;
  rot: number;
  spin: number;
  shape: number;
  hue: number;
  ph: number;
  wob: number;
};

/** Back layer: big, far out, slow clockwise; front layer: smaller, hugging the edge, counter-clockwise. */
function makeBlobs(rnd: () => number): Blob[] {
  const out: Blob[] = [];
  const BACK = 9;
  const FRONT = 9;
  for (let i = 0; i < BACK + FRONT; i++) {
    const front = i >= BACK;
    const k = front ? i - BACK : i;
    const cnt = front ? FRONT : BACK;
    out.push({
      u: (k + 0.2 + rnd() * 0.6) / cnt + (front ? 0.5 / cnt : 0),
      layer: front ? 1 : 0,
      orbit: (front ? -1 : 1) * (0.006 + rnd() * 0.006),
      off: front ? 0.04 + rnd() * 0.16 : 0.22 + rnd() * 0.36,
      size: front ? 0.95 + rnd() * 0.35 : 1.8 + rnd() * 0.6,
      rot: rnd() * Math.PI * 2,
      spin: (rnd() < 0.5 ? -1 : 1) * (0.12 + rnd() * 0.22),
      shape: i % 2,
      hue: (rnd() - 0.5) * 0.06,
      ph: rnd() * Math.PI * 2,
      wob: 0.4 + rnd() * 0.5,
    });
  }
  // Interleave so the low-quality subset (every other blob) still covers both layers evenly.
  return out.map((_, i) => out[i % 2 ? BACK + (i >> 1) : i >> 1]);
}

export function BedVisualizer({ muted, reduced }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fogRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const hotRef = useRef<HTMLDivElement>(null);
  const auraRef = useRef<HTMLDivElement>(null);
  const emblemRef = useRef<HTMLDivElement>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(() => {
    const root = rootRef.current;
    const host = root?.parentElement;
    const canvas = canvasRef.current;
    const fog = fogRef.current;
    const glow = glowRef.current;
    const hot = hotRef.current;
    const aura = auraRef.current;
    const emblem = emblemRef.current;
    if (!root || !host || !canvas || !fog || !glow || !hot || !aura || !emblem) return;
    const frame = host.querySelector<HTMLElement>(".reel-frame");
    const g2d = canvas.getContext("2d", { alpha: true });
    const f2d = fog.getContext("2d", { alpha: true });

    let geo: Geo | null = null;
    const place = () => {
      const f = frame ?? host;
      const w = f.offsetWidth;
      const h = f.offsetHeight;
      if (!w || !h) return;
      const small = w < 560;
      const fr = f.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Unscaled frame box in viewport px (the beat pulse scales the frame about its centre).
      const fl = fr.left + (fr.width - w) / 2;
      const ft = fr.top + (fr.height - h) / 2;
      // Stars canvas: a margin around the frame as far as the viewport allows (under the HUD).
      const mx = Math.round(Math.max(8, Math.min(small ? 60 : 150, fl, vw - fl - w)));
      const mt = Math.round(Math.max(8, Math.min(small ? 110 : 100, ft)));
      const mb = Math.round(Math.max(8, Math.min(small ? 130 : 160, vh - ft - h)));
      const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
      const cw = w + 2 * mx;
      const ch = h + mt + mb;
      root.style.left = `${f === host ? 0 : f.offsetLeft}px`;
      root.style.top = `${f === host ? 0 : f.offsetTop}px`;
      root.style.width = `${w}px`;
      root.style.height = `${h}px`;
      canvas.style.left = `${-mx}px`;
      canvas.style.top = `${-mt}px`;
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      // Fog canvas: the whole background behind the machine, i.e. the visible box of the nearest
      // clipping ancestor (the arena), within the viewport. Its edges are feathered with noise (see
      // fogMask), so the clip never shows as a straight line. Coarse (FOG_RES), ≤ ~420k px.
      let cl = 0;
      let ct = 0;
      let cr = vw;
      let cb = vh;
      for (let e = host.parentElement; e && e !== document.body; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
        const r = e.getBoundingClientRect();
        cl = Math.max(0, r.left);
        ct = Math.max(0, r.top);
        cr = Math.min(vw, r.right);
        cb = Math.min(vh, r.bottom);
        break;
      }
      const fw = Math.max(w, Math.round(cr - cl));
      const fh = Math.max(h, Math.round(cb - ct));
      const ox = Math.round(fl - cl);
      const oy = Math.round(ft - ct);
      fog.style.left = `${-ox}px`;
      fog.style.top = `${-oy}px`;
      fog.style.width = `${fw}px`;
      fog.style.height = `${fh}px`;
      const fs = Math.min(small ? VIZ.FOG_RES * 0.8 : VIZ.FOG_RES, Math.sqrt(420000 / Math.max(1, fw * fh)));
      fog.width = Math.max(1, Math.round(fw * fs));
      fog.height = Math.max(1, Math.round(fh * fs));
      // Emblem: centred under the frame, overlapping only the bottom rail.
      const er = Math.round(Math.max(24, Math.min(38, w * 0.055)));
      const eoff = Math.round(er * 0.42);
      emblem.style.width = emblem.style.height = `${er * 2}px`;
      emblem.style.left = `${w / 2}px`;
      emblem.style.top = `${h + eoff}px`;
      const n = 96;
      // Background room on each side of the frame (to the fog canvas edge).
      const room = { l: ox, r: fw - ox - w, t: oy, b: fh - oy - h };
      // Blobs travel the outline faster where there is little room (phone sides, where the fog would sit
      // hidden behind the frame) and linger where it shows: resample the outline by visible room.
      const dense = outline(w, h, n * 4);
      const cum = new Float32Array(n * 4 + 1);
      for (let i = 0; i < n * 4; i++) {
        const nx = dense[i * 4 + 2];
        const ny = dense[i * 4 + 3];
        const r = ny < -0.5 ? room.t : ny > 0.5 ? room.b : nx < 0 ? room.l : room.r;
        cum[i + 1] = cum[i] + Math.min(1, Math.max(0.2, r / 120));
      }
      const raw = new Float32Array(n * 4);
      for (let j = 0, i = 0; j < n; j++) {
        const target = ((j + 0.5) / n) * cum[n * 4];
        while (i < n * 4 - 1 && cum[i + 1] < target) i++;
        raw.set(dense.subarray(i * 4, i * 4 + 4), j * 4);
      }
      const pts = new Float32Array(n * 5);
      for (let i = 0; i < n; i++) {
        const x = raw[i * 4] - w / 2;
        const y = raw[i * 4 + 1] - h / 2;
        const nx = raw[i * 4 + 2];
        const ny = raw[i * 4 + 3];
        const len = Math.hypot(x, y) || 1;
        let dx = nx * 0.7 + (x / len) * 0.3;
        let dy = ny * 0.7 + (y / len) * 0.3;
        const dl = Math.hypot(dx, dy) || 1;
        dx /= dl;
        dy /= dl;
        pts[i * 5] = x;
        pts[i * 5 + 1] = y;
        pts[i * 5 + 2] = dx;
        pts[i * 5 + 3] = dy;
        // Room outward on that side (at least a little, so a side with no margin still glows at the edge).
        pts[i * 5 + 4] = Math.max(18, dy < -0.5 ? room.t : dy > 0.5 ? room.b : dx < 0 ? room.l : room.r);
      }
      let mask: HTMLCanvasElement | null = null;
      let wisp: CanvasPattern | null = null;
      if (typeof document !== "undefined" && f2d) {
        mask = fogMask(fw, fh, fs, ox, oy, w, h, small ? 44 : 120);
        const tile = wispTile();
        wisp = tile ? f2d.createPattern(tile, "repeat") : null;
      }
      geo = { cw, ch, fx: mx, fy: mt, w, h, dpr, pts, n, ox, oy, fs, mask, wisp, small };
    };

    // Stars: positions relative to the frame centre, pushed outward by the bass.
    const STARS = 96;
    const sx = new Float32Array(STARS);
    const sy = new Float32Array(STARS);
    const sdx = new Float32Array(STARS);
    const sdy = new Float32Array(STARS);
    const ssz = new Float32Array(STARS);
    const sph = new Float32Array(STARS);
    let seed = 0x4ca7;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const spawn = (i: number, anywhere: boolean) => {
      if (!geo) return;
      const a = rnd() * Math.PI * 2;
      const hw = geo.w / 2;
      const hh = geo.h / 2;
      const edge = Math.min(hw / Math.abs(Math.cos(a) || 1e-6), hh / Math.abs(Math.sin(a) || 1e-6));
      const far = Math.hypot(geo.cw / 2, geo.ch / 2);
      const d = anywhere ? edge + rnd() * (far - edge) : edge * (0.92 + rnd() * 0.12);
      sx[i] = Math.cos(a) * d;
      sy[i] = Math.sin(a) * d;
      sdx[i] = Math.cos(a);
      sdy[i] = Math.sin(a);
      ssz[i] = 1 + rnd() * 1.8;
      sph[i] = rnd() * Math.PI * 2;
    };
    const blobs = makeBlobs(rnd);

    // Fog sprite sheet (prerendered + blurred). Until it decodes the fog layer just stays empty.
    let sheet: HTMLImageElement | null = null;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      sheet = img;
      if (reduced) paintStatic();
    };
    img.src = FOG_SRC;

    let levels = new Float32Array(BINS);
    const smooth = new Float32Array(BINS);
    let env = 0;
    let punch = 0;
    let live = 0;
    let scale = 1;
    let shakeX = 0;
    let shakeY = 0;
    /** Fog state: brightness (0..1), bass motion drive (0..1), flow clock (s at cruising speed), hue drift (turns). */
    let bright = 0;
    let flow = 0;
    let flowT = 0;
    let hueT = 0;
    let midHi = 0;

    const drawStars = (t: number, starsN: number) => {
      if (!g2d || !geo) return;
      const { cw, ch, fx, fy, w, h, dpr } = geo;
      g2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      g2d.clearRect(0, 0, cw, ch);
      g2d.translate(shakeX, shakeY);
      const cx = fx + w / 2;
      const cy = fy + h / 2;
      // Clip the frame box away: nothing is ever painted over the reels.
      g2d.save();
      g2d.beginPath();
      g2d.rect(-20, -20, cw + 40, ch + 40);
      const iw = w * scale - 4;
      const ih = h * scale - 4;
      if (g2d.roundRect) g2d.roundRect(cx - iw / 2 - shakeX, cy - ih / 2 - shakeY, iw, ih, RADIUS);
      else g2d.rect(cx - iw / 2 - shakeX, cy - ih / 2 - shakeY, iw, ih);
      g2d.clip("evenodd");
      g2d.fillStyle = "#eaf8ff";
      for (let pass = 0; pass < 2; pass++) {
        g2d.globalAlpha = (pass ? 0.9 : 0.45) * (0.55 + 0.45 * live);
        g2d.beginPath();
        for (let i = pass; i < starsN; i += 2) {
          const tw = 0.6 + 0.4 * Math.sin(t / 420 + sph[i]);
          const s = ssz[i] * tw;
          g2d.rect(cx + sx[i] - s / 2, cy + sy[i] - s / 2, s, s);
        }
        g2d.fill();
      }
      g2d.globalAlpha = 1;
      g2d.restore();
    };

    /**
     * Fog: each blob = one or two drawImage calls of a blurred sprite (neighbouring hues crossfaded),
     * additive; then two drifting wisp layers and the feathered frame mask are carved out
     * (destination-out). All motion runs on the flow clock `ft`, which the bass speeds up.
     * Alpha per layer: base (idle) + a small brightness lift.
     */
    const drawFog = (ft: number, lowQ: boolean, aBack: number, aFront: number) => {
      if (!f2d || !geo) return;
      const { ox, oy, w, h, pts, n, fs, mask, wisp, small } = geo;
      f2d.setTransform(1, 0, 0, 1, 0, 0);
      f2d.globalCompositeOperation = "source-over";
      f2d.globalAlpha = 1;
      f2d.clearRect(0, 0, fog.width, fog.height);
      if (!sheet) return;
      f2d.globalCompositeOperation = "lighter";
      const cx = ox + w / 2;
      const cy = oy + h / 2;
      const base = small ? Math.max(130, Math.min(190, w * 0.46)) : Math.max(190, Math.min(300, w * 0.42));
      const ts = ft;
      // Phones: 12 of the 18 blobs (each a bit bigger), low quality: every other one.
      for (let b = 0; b < blobs.length; b += lowQ ? 2 : 1) {
        if (small && !lowQ && b % 3 === 2) continue;
        const B = blobs[b];
        const u = B.u + B.orbit * ts;
        const pos = ((u % 1) + 1) % 1;
        const fi = pos * n;
        const i0 = Math.floor(fi) % n;
        const i1 = (i0 + 1) % n;
        const fr = fi - Math.floor(fi);
        const o0 = i0 * 5;
        const o1 = i1 * 5;
        const px = pts[o0] + (pts[o1] - pts[o0]) * fr;
        const py = pts[o0 + 1] + (pts[o1 + 1] - pts[o0 + 1]) * fr;
        const dx = pts[o0 + 2] + (pts[o1 + 2] - pts[o0 + 2]) * fr;
        const dy = pts[o0 + 3] + (pts[o1 + 3] - pts[o0 + 3]) * fr;
        const room = pts[o0 + 4] + (pts[o1 + 4] - pts[o0 + 4]) * fr;
        const front = B.layer === 1;
        // Fixed distance from the frame (no bass swell) + a slow liquid wobble that also rides the flow clock.
        const d = room * B.off + Math.sin(ts * B.wob + B.ph) * (front ? 8 : 18);
        const x = cx + px * scale + dx * d + Math.cos(ts * B.wob * 0.8 + B.ph) * (front ? 7 : 16);
        const y = cy + py * scale + dy * d;
        const size = base * B.size * (small ? 1.2 : 1);
        const rot = B.rot + B.spin * ts;
        const c = Math.cos(rot) * fs;
        const s2 = Math.sin(rot) * fs;
        f2d.setTransform(c, s2, -s2, c, x * fs, y * fs);
        // Hue runs around the frame like a colour wheel, plus the drift.
        const [h0, h1, hf] = fogHue(pos + B.hue + hueT);
        // Phones: the sides behind the frame have no room, so the visible top/bottom fog gets a bit denser.
        const a = (front ? aFront : aBack) * (small ? 1.3 : 1);
        const c0 = B.shape * 8 + h0;
        const c1 = B.shape * 8 + h1;
        const half = size / 2;
        if (hf < 0.97) {
          f2d.globalAlpha = a * (1 - hf);
          f2d.drawImage(sheet, (c0 % 4) * CELL, (c0 >> 2) * CELL, CELL, CELL, -half, -half, size, size);
        }
        if (hf > 0.03) {
          f2d.globalAlpha = a * hf;
          f2d.drawImage(sheet, (c1 % 4) * CELL, (c1 >> 2) * CELL, CELL, CELL, -half, -half, size, size);
        }
      }
      f2d.globalCompositeOperation = "destination-out";
      if (wisp) {
        // Two wisp layers (different scale, direction and speed) drift through the fog: gaseous, not a solid sheet.
        const W = fog.width;
        const H = fog.height;
        for (let k = 0; k < 2; k++) {
          const sc = ((small ? 230 : 330) * (k ? 1.6 : 1) * fs) / WISP_PX;
          const span = WISP_PX * sc;
          const sx = (((ts * (k ? -9 : 14)) * fs) % span + span) % span;
          const sy = (((ts * (k ? 6 : -4)) * fs) % span + span) % span;
          f2d.setTransform(sc, 0, 0, sc, sx - span, sy - span);
          f2d.globalAlpha = k ? 0.28 : 0.4;
          f2d.fillStyle = wisp;
          f2d.fillRect(0, 0, W / sc + 2 * WISP_PX, H / sc + 2 * WISP_PX);
        }
      }
      f2d.setTransform(1, 0, 0, 1, 0, 0);
      f2d.globalAlpha = 1;
      if (mask) f2d.drawImage(mask, 0, 0);
      f2d.globalCompositeOperation = "source-over";
    };

    /** Reduced motion: one still, soft rainbow glow (no loop, no pulse). */
    const paintStatic = () => {
      bright = 0;
      flow = 0;
      hueT = 0;
      drawFog(0, false, VIZ.FOG_BASE * 0.85, VIZ.FOG_BASE * 0.7);
    };

    // Write a style only when its string changes: no style invalidation on steady frames.
    const last = new Map<string, string>();
    const put = (id: string, el: HTMLElement, key: "opacity" | "transform", v: string) => {
      const k = id + key;
      if (last.get(k) === v) return;
      last.set(k, v);
      el.style[key] = v;
    };

    const relayout = () => {
      place();
      for (let i = 0; i < STARS; i++) spawn(i, true);
      if (reduced) {
        drawStars(0, STARS);
        paintStatic();
      }
    };
    const ro = new ResizeObserver(relayout);
    // The fog spans the viewport, so a viewport change (rotation, URL bar) re-lays it out too.
    window.addEventListener("resize", relayout);
    ro.observe(host);
    if (frame) ro.observe(frame);
    place();
    for (let i = 0; i < STARS; i++) spawn(i, true);

    if (reduced) {
      // Static: soft glow + still rainbow fog, still stars. No loop, no pulse, no shake.
      glow.style.opacity = String(VIZ.STATIC_GLOW);
      drawStars(0, STARS);
      paintStatic();
      return () => {
        img.onload = null;
        ro.disconnect();
        window.removeEventListener("resize", relayout);
      };
    }

    // Pulse target: the reel frame (overflow-hidden, so promoting it cannot reorder anything outside it).
    const bumpEl = frame ?? host;
    bumpEl.classList.add("has-bed-viz");
    const det = new BeatDetector();
    const norm = new BassNorm();
    const subNorm = new BassNorm(VIZ.SUB_FLOOR);
    const gate = new FlashGate();
    const drive = new FlowDrive();
    let kick: KickMeter | null = null;
    let td = new Float32Array(0);
    let sub = 0;
    const binNorm = new BinNorm(BINS);
    const lag = new LagLine(48, BINS + 3);
    let data = new Float32Array(0);
    let rb: Uint16Array | null = null;
    let bins: { bass: [number, number]; mid: [number, number]; high: [number, number] } | null =
      null;
    let lastAn: AnalyserNode | null = null;
    let raf = 0;
    let prevT = 0;
    let quietFor = 0;
    let comp = 0;
    let compAt = -Infinity;
    let slowShare = 0;
    let lowQ = false;
    const trace = import.meta.env.DEV ? (window as unknown as { __bedVizTrace?: Trace }) : null;

    const tick = (t: number) => {
      const t0 = performance.now();
      raf = requestAnimationFrame(tick);
      const dt = prevT ? Math.min(100, t - prevT) : 16.7;
      prevT = t;
      const an = mutedRef.current ? null : bedAnalyser();
      if (an !== lastAn) {
        lastAn = an;
        det.reset();
        norm.reset();
        subNorm.reset();
        binNorm.reset();
        lag.reset();
        if (an) {
          const sr = an.context.sampleRate;
          data = new Float32Array(an.frequencyBinCount);
          td = new Float32Array(an.fftSize);
          kick = new KickMeter(sr);
          bins = {
            bass: bandBins(VIZ.BASS_HZ, sr, an.fftSize),
            mid: bandBins(VIZ.MID_HZ, sr, an.fftSize),
            high: bandBins(VIZ.HIGH_HZ, sr, an.fftSize),
          };
          rb = ringBins(BINS, VIZ.RING_HZ, sr, an.fftSize);
          levels = new Float32Array(BINS);
        }
      }
      let hit = 0;
      let amp = 0;
      if (an && bins && rb && kick) {
        if (t - compAt > 1000) {
          compAt = t;
          const l = bedLatency();
          comp = latencyCompMs(l.output, l.base);
        }
        an.getFloatFrequencyData(data);
        an.getFloatTimeDomainData(td);
        // Snapshot this frame, read back the one that matches what the speaker plays now.
        const snap = lag.push(t);
        ringAmps(data, rb, levels);
        snap.set(levels);
        snap[BINS] = kick.amp(td);
        snap[BINS + 1] =
          bandLevel(data, bins.bass) + bandLevel(data, bins.mid) + bandLevel(data, bins.high);
        snap[BINS + 2] = bandAmp(data, bins.bass);
        const cur = comp > 1 ? (lag.read(t, comp) ?? snap) : snap;
        amp = cur[BINS];
        hit = det.step(amp, t, dt);
        env = follow(env, norm.step(amp, dt), dt, VIZ.RELEASE_MS);
        sub = follow(sub, subNorm.step(cur[BINS + 2], dt), dt, 160);
        binNorm.step(cur.subarray(0, BINS), levels, dt);
        smoothBins(levels, smooth);
        quietFor = cur[BINS + 1] < VIZ.SILENCE_LEVEL ? quietFor + dt : 0;
      } else {
        quietFor = VIZ.SILENCE_MS;
        env += (0 - env) * ease(dt, 200);
        sub += (0 - sub) * ease(dt, 200);
        smooth.fill(0);
      }
      const signal = quietFor < VIZ.SILENCE_MS ? 1 : 0;
      live += (signal - live) * ease(dt, signal ? 90 : 450);
      if (hit > 0) punch = Math.max(punch, hit);
      else punch *= 1 - ease(dt, VIZ.PULSE_DECAY_MS);

      // Mids/highs (per-bin auto-gained spectrum, upper 2/3) only steer the hue drift, slowly.
      let mh = 0;
      for (let i = BINS / 3; i < BINS; i++) mh += smooth[i];
      mh /= BINS - BINS / 3;
      midHi += (mh - midHi) * ease(dt, 400);
      const breath =
        VIZ.IDLE_GLOW + VIZ.IDLE_SWING * Math.sin((t / VIZ.IDLE_PERIOD_MS) * Math.PI * 2);
      hueT += (dt / 1000) * (VIZ.FOG_HUE_BASE + VIZ.FOG_HUE_MIDHI * midHi * live);
      // Bass → motion: the flow clock runs faster on every kick (fast attack, smooth release); idle /
      // muted it cruises a bit slower. Brightness only lifts slightly (strobe-gated). No size change.
      // Kick envelope only (it drops between kicks); the sustained 808 sub would keep the fog racing.
      flow = drive.step((env * 0.85 + punch * 0.15) * live, dt);
      flowT += (dt / 1000) * (flowSpeed(flow) * live + VIZ.FLOW_IDLE * (1 - live));
      bright = gate.step(Math.min(1, env * 0.8 + sub * 0.25 + punch * 0.2), t, dt) * live;
      const idle = 0.55 + (breath - VIZ.IDLE_GLOW) * 1.2;
      const aBack = VIZ.FOG_BASE * (live + idle * (1 - live)) + VIZ.FOG_SWING * 0.75 * bright;
      const aFront = VIZ.FOG_BASE * 0.8 * (live + idle * (1 - live)) + VIZ.FOG_SWING * bright;

      // Frame + emblem pulse, background shake, stars.
      scale = 1 + Math.min(VIZ.FRAME_MAX, env * VIZ.FRAME_PULSE + punch * VIZ.FRAME_PUNCH) * live;
      const shake = VIZ.SHAKE_PX * Math.max(punch * 0.8, (env - 0.65) / 0.35) * live;
      if (shake > 0.15) {
        shakeX = (rnd() * 2 - 1) * shake;
        shakeY = (rnd() * 2 - 1) * shake;
      } else shakeX = shakeY = 0;
      if (slowShare > 0.6 || isPerfLite()) lowQ = true;
      else if (slowShare < 0.3) lowQ = false;
      const starsN = lowQ ? STARS >> 1 : geo?.small ? 60 : STARS;
      const push = (dt / 1000) * (10 + (190 * env + 260 * punch) * live);
      if (geo) {
        const fx2 = geo.cw / 2 + 4;
        const fy2 = geo.ch / 2 + 4;
        for (let i = 0; i < starsN; i++) {
          sx[i] += sdx[i] * push;
          sy[i] += sdy[i] * push;
          if (Math.abs(sx[i]) > fx2 || Math.abs(sy[i]) > fy2) spawn(i, false);
        }
      }

      put(
        "g",
        glow,
        "opacity",
        (
          breath * (1 - live) +
          Math.min(VIZ.GLOW_MAX, VIZ.GLOW_BASE + env * 0.55 + punch * 0.2) * live
        ).toFixed(3),
      );
      put("h", hot, "opacity", (Math.min(VIZ.HOT_MAX, punch * VIZ.HOT_MAX) * live).toFixed(3));
      put(
        "a",
        aura,
        "opacity",
        (Math.min(VIZ.AURA_MAX, VIZ.AURA_BASE + env * 0.5 + punch * 0.25) * live).toFixed(3),
      );
      put(
        "a",
        aura,
        "transform",
        `translate(calc(-50% + ${shakeX.toFixed(1)}px), calc(-50% + ${shakeY.toFixed(1)}px)) scale(${(0.92 + env * 0.07 + punch * 0.04).toFixed(3)})`,
      );
      const es = 1 + Math.min(VIZ.EMBLEM_MAX, env * VIZ.EMBLEM_PULSE + punch * 0.03) * live;
      put("e", emblem, "transform", `translate(-50%, -50%) scale(${es.toFixed(3)})`);
      put("f", bumpEl, "transform", scale > 1.0004 ? `scale(${scale.toFixed(4)})` : "");
      slowShare += ((dt > 22 ? 1 : 0) - slowShare) * ease(dt, 1000);
      drawFog(flowT, lowQ, aBack, aFront);
      drawStars(t, starsN);
      if (trace?.__bedVizTrace && trace.__bedVizTrace.length < 20000)
        trace.__bedVizTrace.push({
          t,
          env,
          disp: bright,
          flow,
          speed: flowSpeed(flow) * live + VIZ.FLOW_IDLE * (1 - live),
          hue: hueT,
          punch,
          comp,
          amp,
          ms: performance.now() - t0,
          lowQ,
          live,
        });
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
      img.onload = null;
      ro.disconnect();
      window.removeEventListener("resize", relayout);
      document.removeEventListener("visibilitychange", onVis);
      bumpEl.style.transform = "";
      bumpEl.classList.remove("has-bed-viz");
    };
  }, [reduced]);

  return (
    <div ref={rootRef} className={`bed-viz${reduced ? " is-static" : ""}`} aria-hidden="true">
      <div ref={auraRef} className="bv-aura" />
      <canvas ref={fogRef} className="bv-fog" />
      <div ref={glowRef} className="bv-glow" />
      <canvas ref={canvasRef} className="bv-ring" />
      <div ref={hotRef} className="bv-hot" />
      <div ref={emblemRef} className="bv-emblem">
        <Emblem />
      </div>
    </div>
  );
}
