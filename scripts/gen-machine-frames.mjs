#!/usr/bin/env node
/**
 * Rank cabinet around the 6×5 reels → public/machine/*.svg
 *
 * The bezel is built from the rank's own objects:
 *   <id>-<tier>.svg  64×64 top-left corner = the hero object (CSS mirrors it).
 *                    Bezel = 20/64 of the box (CSS: 3.2 × bezel); the hero stays
 *                    inside 23/64, so it never reaches a symbol.
 *   <id>-h[2].svg    W×20 side tile, outer edge at y=0, repeated (round) along
 *                    the top/bottom bezel; "2" = richer tile for tiers II/I.
 *   <id>-v[2].svg    the same tile transposed for the left/right bezel.
 * Tier IV…I: lights 1…4 tier marks on the corner arms, II/I switch to the rich
 * tile, I adds the family's extra ornament.
 *
 *   node scripts/gen-machine-frames.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "machine");
const ROMAN = ["", "i", "ii", "iii", "iv"];
const H = 20;

const f = (n) => +n.toFixed(2);
const stops = (s) => s.map(([o, c, op]) => `<stop offset="${o}" stop-color="${c}"${op != null ? ` stop-opacity="${op}"` : ""}/>`).join("");
const lin = (id, s, x1 = 0, y1 = 0, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops(s)}</linearGradient>`;
const rad = (id, s, cx = 0.5, cy = 0.5, r = 0.5) => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops(s)}</radialGradient>`;
const P = (pts) => pts.map((p) => p.map(f).join(",")).join(" ");
const ngon = (n, r, cx, cy, rot = -90) =>
  Array.from({ length: n }, (_, i) => {
    const a = ((rot + (360 / n) * i) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
const wave = (x0, x1, y, amp, period, phase = 0) => {
  let d = "";
  for (let x = x0; x <= x1 + 0.01; x += 0.5) d += `${d ? "L" : "M"}${f(x)} ${f(y + amp * Math.sin(((x - x0) / period) * 2 * Math.PI + phase))}`;
  return d;
};
/** Rect with perforated (stamp) edges, traversed clockwise, bites inward. */
function perf(x, y, w, h, r = 0.85, step = 2.6) {
  const side = (len) => Math.max(2, Math.round(len / step));
  let d = `M${f(x)} ${f(y)}`;
  const edge = (ax, ay, dx, dy, len) => {
    const n = side(len), seg = len / n;
    for (let i = 0; i < n; i++) {
      const c = seg * (i + 0.5);
      d += `L${f(ax + dx * (c - r))} ${f(ay + dy * (c - r))}A${r} ${r} 0 0 0 ${f(ax + dx * (c + r))} ${f(ay + dy * (c + r))}`;
    }
    d += `L${f(ax + dx * len)} ${f(ay + dy * len)}`;
  };
  edge(x, y, 1, 0, w);
  edge(x + w, y, 0, 1, h);
  edge(x + w, y + h, -1, 0, w);
  edge(x, y + h, 0, -1, h);
  return d + "Z";
}

const doc = (w, h, defs, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${defs}</defs>${body}</svg>\n`;
/** Corner arm bed: top 0→64, left 0→64, 20 deep, inner edge line. */
/** Corner arm: transparent (the CSS bed shows through, same as the sides), inner edge line only. */
const bed = (_fill, edge) =>
  `<path d="M${H} 64 V${H} H64" fill="none" stroke="${edge}" stroke-width=".8" stroke-opacity=".8"/>`;
/** Four tier marks per arm, at the inner edge. */
const marks = (lit, draw) => {
  let s = "";
  for (let i = 0; i < 4; i++) s += draw(32 + i * 8, 17.2, i < lit) + draw(17.2, 32 + i * 8, i < lit);
  return s;
};
/** Repeat a drawing along an arm: fn(along) returns markup for the top arm, mirrored onto the left arm. */
const both = (g) => g + `<g transform="matrix(0 1 1 0 0 0)">${g}</g>`;

// ───────────────────────── objects ─────────────────────────

function coin(cx, cy, r, id = "co") {
  const star = P(Array.from({ length: 10 }, (_, i) => {
    const a = (-90 + i * 36) * Math.PI / 180, rr = i % 2 ? r * 0.17 : r * 0.4;
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  }));
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id})" stroke="#2c3137" stroke-width=".55"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${f(r - 0.75)}" fill="none" stroke="#3a4047" stroke-opacity=".7" stroke-width=".8" stroke-dasharray=".45 .55"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${f(r * 0.66)}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width=".45"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${f(r * 0.66)}" fill="none" stroke="#2c3137" stroke-opacity=".5" stroke-width=".45" transform="translate(.35 .35)"/>` +
    `<polygon points="${star}" fill="#5c636b" opacity=".85"/><polygon points="${star}" fill="#f4f6f8" opacity=".55" transform="translate(-.3 -.3)"/>`;
}

function rosette(cx, cy, r, c) {
  let s = "";
  for (let i = 0; i < 6; i++) {
    const a = (i * 60 * Math.PI) / 180;
    s += `<circle cx="${f(cx + (r / 2) * Math.cos(a))}" cy="${f(cy + (r / 2) * Math.sin(a))}" r="${f(r / 2)}"/>`;
  }
  return `<g fill="none" stroke="${c}" stroke-width=".4">${s}<circle cx="${cx}" cy="${cy}" r="${r}"/></g>`;
}

function stamp(x, y, w, h) {
  return `<path d="${perf(x, y, w, h)}" fill="url(#sb)" stroke="#2a3542" stroke-width=".45"/>` +
    `<rect x="${f(x + 2)}" y="${f(y + 2)}" width="${f(w - 4)}" height="${f(h - 4)}" rx=".6" fill="url(#si)" stroke="#e6edf4" stroke-opacity=".75" stroke-width=".4"/>` +
    rosette(x + w / 2, y + h / 2, Math.min(w, h) / 2 - 3.6, "#eef3f8") +
    `<circle cx="${f(x + w / 2)}" cy="${f(y + h / 2)}" r=".7" fill="#eef3f8"/>`;
}

function rj45(x, y) {
  // plug body 13×11 with 8 gold pins, latch on the inner side, boot on the left
  let pins = "";
  for (let i = 0; i < 8; i++) pins += `<rect x="${f(x + 2.1 + i * 1.18)}" y="${f(y + 0.9)}" width=".62" height="3.6" fill="url(#pin)"/>`;
  return `<path d="M${x - 5.5} ${y + 3} L${x} ${y + 1.6} V${y + 9.4} L${x - 5.5} ${y + 8} Z" fill="url(#boot)" stroke="#3a1a08" stroke-width=".4"/>` +
    `<path d="M${x - 4.6} ${y + 3.6} V${y + 7.4} M${x - 3} ${y + 3.1} V${y + 7.9} M${x - 1.4} ${y + 2.6} V${y + 8.4}" stroke="#1a0b04" stroke-opacity=".45" stroke-width=".45"/>` +
    `<rect x="${x}" y="${y}" width="13" height="11" rx="1.2" fill="url(#pl)" stroke="#e9f3f7" stroke-opacity=".85" stroke-width=".5"/>` +
    `<rect x="${x}" y="${y}" width="13" height="11" rx="1.2" fill="none" stroke="#2a1306" stroke-opacity=".5" stroke-width=".3"/>` +
    pins + `<path d="M${x + 1.2} ${y + 5.6} H${x + 11.8}" stroke="#fff" stroke-opacity=".5" stroke-width=".35"/>` +
    `<path d="M${x + 3.5} ${y + 11} L${x + 4.5} ${y + 13.2} H${x + 8.5} L${x + 9.5} ${y + 11}" fill="url(#pl)" stroke="#e9f3f7" stroke-opacity=".7" stroke-width=".4"/>`;
}

function rivet(cx, cy, r = 1.5) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#rv)" stroke="#2a1306" stroke-width=".4"/><circle cx="${f(cx - r * 0.3)}" cy="${f(cy - r * 0.35)}" r="${f(r * 0.32)}" fill="#fff3e0" opacity=".8"/>`;
}

function chip(x, y, s, pinC = "#dfe6ee") {
  let pins = "";
  const n = Math.max(3, Math.round(s / 2.2)), step = (s - 2) / n;
  for (let i = 0; i < n; i++) {
    const p = f(x + 1 + step * (i + 0.5) - 0.4);
    const q = f(y + 1 + step * (i + 0.5) - 0.4);
    pins += `<rect x="${p}" y="${f(y - 1.3)}" width=".8" height="1.5"/><rect x="${p}" y="${f(y + s - 0.2)}" width=".8" height="1.5"/>` +
      `<rect x="${f(x - 1.3)}" y="${q}" width="1.5" height=".8"/><rect x="${f(x + s - 0.2)}" y="${q}" width="1.5" height=".8"/>`;
  }
  return `<g fill="${pinC}">${pins}</g><rect x="${x}" y="${y}" width="${s}" height="${s}" rx=".8" fill="url(#cb)" stroke="#000" stroke-width=".4"/>` +
    `<rect x="${f(x + 0.6)}" y="${f(y + 0.6)}" width="${f(s - 1.2)}" height="${f(s - 1.2)}" rx=".5" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width=".4"/>` +
    `<circle cx="${f(x + 1.9)}" cy="${f(y + 1.9)}" r=".55" fill="#7d8894"/>`;
}

function fconn(x, y) {
  // F-connector: hex nut, threaded sleeve, centre pin (pointing +x), on a coax
  let thr = "";
  for (let i = 0; i < 6; i++) thr += `<path d="M${f(x + 6.6 + i * 1.1)} ${y - 2.6} l.6 5.2" />`;
  return `<path d="M${x} ${y - 4.6} H${x + 6} L${x + 6.6} ${y - 3} V${y + 3} L${x + 6} ${y + 4.6} H${x} L${x - 0.6} ${y + 3} V${y - 3} Z" fill="url(#au)" stroke="#4a3204" stroke-width=".45"/>` +
    `<path d="M${x - 0.6} ${y - 1.4} H${x + 6.6} M${x - 0.6} ${y + 1.4} H${x + 6.6}" stroke="#4a3204" stroke-opacity=".55" stroke-width=".35"/>` +
    `<rect x="${x + 6.6}" y="${y - 2.6}" width="6.8" height="5.2" fill="url(#au2)" stroke="#4a3204" stroke-width=".4"/>` +
    `<g stroke="#4a3204" stroke-opacity=".6" stroke-width=".35">${thr}</g>` +
    `<rect x="${x + 13.4}" y="${y - 0.45}" width="3.4" height=".9" rx=".45" fill="#fff4c4"/>`;
}

function button(cx, cy, r, c) {
  return `<circle cx="${cx}" cy="${cy}" r="${f(r + 0.5)}" fill="#120e04"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#btn)"/>`;
}

function sfp(x, y) {
  // SFP transceiver 18×12, port end on the right (LC duplex), pull bail on the left
  let vent = "";
  for (let i = 0; i < 5; i++) vent += `<rect x="${f(x + 3 + i * 1.6)}" y="${y + 1.4}" width=".7" height="3" rx=".3"/>`;
  return `<path d="M${x - 2.4} ${y + 2.6} H${x} M${x - 2.4} ${y + 9.4} H${x} M${x - 2.4} ${y + 2.6} V${y + 9.4}" fill="none" stroke="#3a7bd5" stroke-width="1.2" stroke-linecap="round"/>` +
    `<rect x="${x}" y="${y}" width="18" height="12" rx="1" fill="url(#sfp)" stroke="#1c2a30" stroke-width=".45"/>` +
    `<g fill="#1c2a30" opacity=".55">${vent}</g>` +
    `<rect x="${x + 2.4}" y="${y + 6.2}" width="10" height="3.8" rx=".4" fill="url(#cg)" stroke="#5a3e14" stroke-width=".3"/>` +
    `<path d="M${x + 3.2} ${y + 7.4} h6 M${x + 3.2} ${y + 8.8} h4" stroke="#5a3e14" stroke-opacity=".7" stroke-width=".35"/>` +
    `<rect x="${x + 15}" y="${y + 1.2}" width="3.6" height="9.6" rx=".6" fill="#0a1a1f"/>` +
    `<circle cx="${x + 16.8}" cy="${y + 3.9}" r="1.1" fill="#d9f7ff"/><circle cx="${x + 16.8}" cy="${y + 8.1}" r="1.1" fill="#d9f7ff"/>` +
    `<circle cx="${x + 16.8}" cy="${y + 3.9}" r="2.2" fill="url(#lit)"/><circle cx="${x + 16.8}" cy="${y + 8.1}" r="2.2" fill="url(#lit)"/>`;
}

function sleeve(cx, cy, w = 6) {
  return `<rect x="${f(cx - w / 2)}" y="${f(cy - 1.5)}" width="${w}" height="3" rx="1.5" fill="#d9f7ff" fill-opacity=".28" stroke="#d9f7ff" stroke-opacity=".8" stroke-width=".35"/>` +
    `<path d="M${f(cx - w / 2 + 1)} ${f(cy + 0.6)} h${w - 2}" stroke="url(#sfp)" stroke-width=".7"/><path d="M${f(cx - w / 2 + 1)} ${f(cy - 0.8)} h${w - 2}" stroke="#fff" stroke-opacity=".6" stroke-width=".35"/>`;
}

function infLink(cx, cy, w, h, sw = 1.9) {
  const a = w / 2, b = h / 2;
  const d = `M${cx} ${cy} C${f(cx + a * 0.45)} ${f(cy - b * 1.3)} ${f(cx + a * 1.05)} ${f(cy - b * 1.3)} ${f(cx + a)} ${cy} C${f(cx + a * 1.05)} ${f(cy + b * 1.3)} ${f(cx + a * 0.45)} ${f(cy + b * 1.3)} ${cx} ${cy} C${f(cx - a * 0.45)} ${f(cy - b * 1.3)} ${f(cx - a * 1.05)} ${f(cy - b * 1.3)} ${f(cx - a)} ${cy} C${f(cx - a * 1.05)} ${f(cy + b * 1.3)} ${f(cx - a * 0.45)} ${f(cy + b * 1.3)} ${cx} ${cy} Z`;
  return `<path d="${d}" fill="none" stroke="#2a1402" stroke-width="${f(sw + 1)}"/><path d="${d}" fill="none" stroke="url(#gd)" stroke-width="${sw}"/><path d="${d}" fill="none" stroke="#fff6d8" stroke-opacity=".55" stroke-width=".4" transform="translate(-.25 -.35)"/>`;
}

function blade(x, y, len, wid) {
  // dagger pointing +x: guard at x, tip at x+len
  return `<rect x="${f(x - 3.4)}" y="${f(y - 0.9)}" width="3.4" height="1.8" rx=".8" fill="url(#gd)" stroke="#3a1e02" stroke-width=".3"/>` +
    `<rect x="${f(x - 0.6)}" y="${f(y - wid * 0.95)}" width="1.5" height="${f(wid * 1.9)}" rx=".6" fill="url(#gd)" stroke="#3a1e02" stroke-width=".3"/>` +
    `<path d="M${f(x + 0.9)} ${f(y - wid / 2)} L${f(x + len * 0.78)} ${f(y - wid * 0.42)} L${f(x + len)} ${y} L${f(x + len * 0.78)} ${f(y + wid * 0.42)} L${f(x + 0.9)} ${f(y + wid / 2)} Z" fill="url(#bl)" stroke="url(#gd)" stroke-width=".4" stroke-linejoin="round"/>` +
    `<path d="M${f(x + 1.6)} ${y} H${f(x + len * 0.8)}" stroke="#ffd0d6" stroke-opacity=".55" stroke-width=".35"/>`;
}

function crystal(cx, by, h, w, rot = 0) {
  // amethyst prism standing on (cx, by), pointing up
  const t = by - h, s = by - h * 0.72;
  return `<g transform="rotate(${rot} ${cx} ${by})"><polygon points="${P([[cx - w / 2, by], [cx - w / 2, s], [cx, t], [cx, by]])}" fill="url(#am1)"/>` +
    `<polygon points="${P([[cx, by], [cx, t], [cx + w / 2, s], [cx + w / 2, by]])}" fill="url(#am2)"/>` +
    `<polygon points="${P([[cx - w / 2, by], [cx - w / 2, s], [cx, t], [cx + w / 2, s], [cx + w / 2, by]])}" fill="none" stroke="#f6e5ff" stroke-opacity=".7" stroke-width=".35" stroke-linejoin="round"/></g>`;
}

function panel(x, y, w, h) {
  let ribs = "";
  for (let i = 1; i < 4; i++) ribs += `<path d="M${f(x + 0.8)} ${f(y + (h / 4) * i)} h${f(w - 1.6)}"/>`;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.1" fill="url(#pn)" stroke="#5a1a8f" stroke-width=".45"/><g stroke="#8a4ac0" stroke-opacity=".45" stroke-width=".3">${ribs}</g>`;
}

// ───────────────────────── ranks ─────────────────────────
// Each rank: defs, tile(rich) → [W, body], corner(lit) → body.

const K = {};

K.kredit = {
  defs: lin("st", [[0, "#d5dade"], [0.5, "#8d949c"], [1, "#4a5057"]], 0, 0, 0.7, 1) +
    rad("co", [[0, "#ffffff"], [0.3, "#dde1e5"], [0.75, "#8d949c"], [1, "#50565d"]], 0.36, 0.3, 0.75) +
    lin("pa", [[0, "#fbf8ee"], [1, "#d6d0bd"]]) +
    lin("sb", [[0, "#aebccb"], [1, "#5b6c80"]], 0, 0, 0.6, 1) + lin("si", [[0, "#6f8297"], [1, "#3e4d5e"]]) +
    lin("gc", [[0, "#f7edc6"], [0.5, "#c9b16a"], [1, "#7c6a33"]], 0, 0, 1, 1) +
    lin("ce", [[0, "#3c4148"], [1, "#2a2e33"]], 0, 0, 1, 0),
  tile(rich) {
    let s = "";
    if (rich) {
      let zz = "M0 13.4 H44 V18.2";
      for (let x = 44; x > 0; x -= 2) zz += ` L${x - 1} 19.4 L${x - 2} 18.2`;
      s += `<path d="${zz} Z" fill="url(#pa)" stroke="#8d866f" stroke-width=".3"/>`;
      s += `<g fill="#6d6a5e" opacity=".55"><rect x="22" y="15" width="5" height=".8"/><rect x="28.4" y="15" width="2.6" height=".8"/><rect x="38" y="15" width="4" height=".8"/><rect x="1" y="15" width="1.6" height=".8"/><rect x="22" y="16.6" width="3" height=".6"/></g>`;
    }
    s += `<g opacity=".9">${stamp(3, 2.2, 16, 15)}</g>` + coin(32, 10, 7.6);
    return [44, s];
  },
  corner(lit) {
    let paper = "M24 2.6 H64 V16.4 H24 Z";
    let print = "";
    for (let r = 0; r < 3; r++) for (let x = 27 + r * 2; x < 62; x += 7 + ((x + r) % 3)) print += `<rect x="${x}" y="${5 + r * 3}" width="${3 + ((x * 7 + r) % 4)}" height=".9"/>`;
    let stack = "";
    for (let y = 24; y < 63; y += 3.2) stack += `<rect x="3" y="${f(y)}" width="14" height="3" rx="1.2" fill="url(#ce)" stroke="#1d2125" stroke-width=".3"/><rect x="3.4" y="${f(y + 0.5)}" width="13.2" height="1.2" rx=".6" fill="url(#st)"/><path d="M4 ${f(y + 2.4)} h12" stroke="#1d2125" stroke-width=".5" stroke-dasharray=".3 .4"/>`;
    let pads = "";
    for (const [px, py] of [[8.2, 9.5], [12.4, 9.5], [8.2, 12.6], [12.4, 12.6], [8.2, 15.7], [12.4, 15.7]]) pads += `<rect x="${px}" y="${py}" width="3.8" height="2.7" rx=".4"/>`;
    return bed("url(#st)", "#1d2125") +
      `<path d="${paper}" fill="url(#pa)" stroke="#8d866f" stroke-width=".35"/><g fill="#6d6a5e" opacity=".6">${print}</g>` +
      `<path d="M24 2.6 c-2 0-2 13.8 0 13.8" fill="#bdb6a2"/>` + stack +
      `<g transform="rotate(-10 13 13)">${stamp(2.4, 2.4, 20, 20)}</g>` +
      `<path d="M2 1.6 H16.6 L21 6 V21.2 H2 Z" fill="url(#st)" stroke="#1d2125" stroke-width=".55"/>` +
      `<path d="M2.7 2.3 H16.3 L20.3 6.3" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width=".4"/>` +
      `<rect x="7.4" y="8.7" width="10" height="10.4" rx="1.4" fill="url(#gc)" stroke="#5a4a1e" stroke-width=".45"/>` +
      `<g fill="none" stroke="#5a4a1e" stroke-width=".35" opacity=".8">${pads}</g>` +
      (lit >= 4 ? coin(19.4, 19.4, 4.4) : "") +
      marks(lit, (x, y, on) => `<circle cx="${x}" cy="${y}" r="1.55" fill="${on ? "url(#co)" : "#1d2125"}" stroke="#2c3137" stroke-width=".4"/>`);
  },
};

K.sloboda = {
  defs: lin("cu", [[0, "#ffd7ab"], [0.35, "#d68a48"], [0.7, "#9d5522"], [1, "#5e2f10"]], 0, 0, 0, 1) +
    lin("cub", [[0, "#7a3f18"], [0.5, "#4a2410"], [1, "#2a1306"]], 0, 0, 0.6, 1) +
    rad("rv", [[0, "#ffe6c8"], [0.45, "#d0894c"], [1, "#5a2c0e"]], 0.35, 0.3, 0.7) +
    lin("pl", [[0, "#f2f8fb", 0.75], [1, "#a9c0ca", 0.45]]) + lin("pin", [[0, "#fff1b8"], [1, "#c99a2a"]]) +
    lin("boot", [[0, "#e6964e"], [1, "#7a3f18"]]),
  tile(rich) {
    const a = wave(0, 48, 10, 3.2, 12), b = wave(0, 48, 10, 3.2, 12, Math.PI);
    const strand = (d) => `<path d="${d}" fill="none" stroke="#2a1306" stroke-width="3.2"/><path d="${d}" fill="none" stroke="url(#cu)" stroke-width="2.3"/><path d="${d}" fill="none" stroke="#ffe6c8" stroke-opacity=".55" stroke-width=".55" transform="translate(0 -.55)"/>`;
    return [48, (rich ? `<path d="M0 18.3 H48" stroke="#2a1306" stroke-width="2"/><path d="M0 18.3 H48" stroke="url(#cu)" stroke-width="1.4" stroke-dasharray="1.2 .5"/>` : "") +
      strand(a) + strand(b) + rj45(19, 4.4) +
      `<rect x="32" y="3" width="5" height="14" rx=".8" fill="url(#cub)" stroke="#ffcf9e" stroke-opacity=".5" stroke-width=".4"/><rect x="33.2" y="6.4" width="2.6" height="7.2" rx=".4" fill="#1a0b04"/>` +
      rivet(43.5, 3.6, 1.45) + rivet(43.5, 16.4, 1.45) + rivet(4.5, 3.6, 1.45)];
  },
  corner(lit) {
    let coil = "";
    for (let x = 26; x <= 62; x += 2.6) coil += `<ellipse cx="${f(x)}" cy="9.6" rx="2.1" ry="5.6" fill="none" stroke="#2a1306" stroke-width="2"/><ellipse cx="${f(x)}" cy="9.6" rx="2.1" ry="5.6" fill="none" stroke="url(#cu)" stroke-width="1.25"/>`;
    let holes = "";
    for (let i = 0; i < 10; i++) {
      const a = ((-60 - i * 28) * Math.PI) / 180;
      const x = 11.5 + 7 * Math.cos(a), y = 11.5 + 7 * Math.sin(a);
      holes += `<circle cx="${f(x)}" cy="${f(y)}" r="1.75" fill="#1a0b04" stroke="#ffd7ab" stroke-opacity=".7" stroke-width=".35"/><circle cx="${f(x + 0.3)}" cy="${f(y + 0.35)}" r=".9" fill="#ffd7ab" opacity=".85"/>`;
    }
    return bed("url(#cub)", "#ffcf9e") + `<path d="M0 0 H64 V20 H20 V64 H0 Z" fill="none" stroke="#ffcf9e" stroke-opacity=".25" stroke-width=".5" transform="translate(.6 .6)"/>` +
      both(coil) +
      `<circle cx="11.5" cy="11.5" r="11.3" fill="url(#cu)" stroke="#2a1306" stroke-width=".7"/>` +
      `<circle cx="11.5" cy="11.5" r="10.2" fill="none" stroke="#ffe6c8" stroke-opacity=".5" stroke-width=".4"/>` +
      holes + `<path d="M17.6 18.6 L20.2 21.4" stroke="#ffe6c8" stroke-width="1.3" stroke-linecap="round"/>` +
      `<circle cx="11.5" cy="11.5" r="3.6" fill="url(#cub)" stroke="#ffcf9e" stroke-opacity=".7" stroke-width=".45"/>` + rivet(11.5, 11.5, 1.6) +
      (lit >= 4 ? rivet(60.5, 3, 1.5) + rivet(3, 60.5, 1.5) + rivet(60.5, 17, 1.5) + rivet(17, 60.5, 1.5) : "") +
      marks(lit, (x, y, on) => on ? rivet(x, y, 1.6) : `<circle cx="${x}" cy="${y}" r="1.6" fill="#1a0b04" stroke="#8a5530" stroke-width=".45"/>`);
  },
};

K.smart = {
  defs: lin("pt", [[0, "#ffffff"], [0.3, "#cfd6de"], [0.65, "#7c8794"], [1, "#e8edf2"]], 0, 0, 0.5, 1) +
    lin("gl", [[0, "#3a4d60"], [0.45, "#0f1822"], [1, "#05080c"]], 0, 0, 1, 1) +
    lin("gg", [[0, "#ffffff", 0.55], [0.4, "#ffffff", 0.06], [1, "#ffffff", 0]], 0, 0, 1, 1) +
    lin("cb", [[0, "#2a3038"], [1, "#0b0e12"]], 0, 0, 1, 1) + lin("pb", [[0, "#1f2730"], [1, "#0c1015"]]),
  tile(rich) {
    const tr = `<g fill="none" stroke="url(#pt)" stroke-width=".7" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="M17.4 6.2 H20.8"/><path d="M17.4 13.8 H20.8"/><path d="M33.8 6.2 L36 6.2 L38 4 H40"/><path d="M33.8 13.8 L36 13.8 L38 16 H40"/><path d="M33.8 10 H40"/><path d="M0 4 H1.2 M0 16 H1.2 M0 10 H1.2"/></g>` +
      `<g fill="#0c1015" stroke="url(#pt)" stroke-width=".45"><circle cx="38" cy="10" r=".85"/><circle cx="20.8" cy="6.2" r=".7"/><circle cx="20.8" cy="13.8" r=".7"/></g>`;
    return [40, `` +
      `<path d="M0 1 H40 M0 19 H40" stroke="url(#pt)" stroke-width=".9"/>` +
      `<rect x="1.4" y="3.2" width="16" height="13.6" rx="1.6" fill="url(#gl)" stroke="url(#pt)" stroke-width=".7"/>` +
      `<path d="M2.4 4.2 L10 4.2 L4 15.8 H2.4 Z" fill="url(#gg)"/>` +
      `<rect x="6.6" y="4.4" width="5.6" height=".8" rx=".4" fill="#0a0e12" stroke="#5c6874" stroke-width=".25"/>` +
      chip(23.2, 4.4, 11.2) + tr +
      (rich ? `<g fill="none" stroke="#e8eef5" stroke-opacity=".75" stroke-width=".4"><path d="M3.6 13 L6.4 10.2 H12 L14.4 12.6"/><path d="M26 7.2 h5.6 v5.6 h-5.6 z"/></g><circle cx="14.4" cy="12.6" r=".6" fill="#e8eef5"/>` : "")];
  },
  corner(lit) {
    let tr = "";
    for (let i = 0; i < 4; i++) {
      const y = 4.4 + i * 3.6;
      tr += `<path d="M${22 + i * 0.6} ${f(y)} H${40 + i * 4} L${f(43 + i * 4)} ${f(y + (i % 2 ? 2.4 : -2.4) * 0.6)} H64"/>`;
    }
    const traces = `<g fill="none" stroke="url(#pt)" stroke-width=".75" stroke-linecap="round">${tr}</g>` +
      `<g fill="#0c1015" stroke="url(#pt)" stroke-width=".45"><circle cx="40" cy="4.4" r=".9"/><circle cx="44" cy="8" r=".9"/><circle cx="48" cy="11.6" r=".9"/><circle cx="52" cy="15.2" r=".9"/></g>`;
    const hex = ngon(6, 3.6, 11.8, 11.8, 0);
    return bed("url(#pb)", "#5c6874") + `<path d="M0 1 H64 M1 0 V64" stroke="url(#pt)" stroke-width="1.4"/>` + both(traces) +
      `<rect x="1.4" y="1.4" width="21" height="21" rx="2.8" fill="url(#gl)" stroke="url(#pt)" stroke-width="1"/>` +
      `<path d="M2.6 2.6 H13 L3.6 20 H2.6 Z" fill="url(#gg)"/>` +
      chip(5.4, 5.4, 12.8) +
      `<rect x="7.4" y="7.4" width="8.8" height="8.8" rx=".6" fill="url(#pt)" opacity=".92"/>` +
      `<polygon points="${P(hex)}" fill="#11161c" stroke="#ffffff" stroke-opacity=".8" stroke-width=".45"/>` +
      `<polygon points="${P(ngon(6, 1.6, 11.8, 11.8, 0))}" fill="#e8eef5"/>` +
      (lit >= 4 ? `<g fill="none" stroke="#ffffff" stroke-opacity=".7" stroke-width=".35"><polygon points="${P(ngon(6, 3, 60, 10, 0))}"/><polygon points="${P(ngon(6, 3, 10, 60, 0))}"/></g>` : "") +
      marks(lit, (x, y, on) => `<path d="M${x} ${f(y - 1.7)}l1.7 1.7-1.7 1.7-1.7-1.7z" fill="${on ? "#f4f7fb" : "#121820"}" stroke="#7c8794" stroke-width=".4"/>`);
  },
};

K.telka = {
  defs: lin("au", [[0, "#fff4c4"], [0.3, "#f2c83a"], [0.65, "#c48d10"], [1, "#6e4a06"]], 0, 0, 0, 1) +
    lin("au2", [[0, "#fff8dc"], [0.5, "#e0b23a"], [1, "#7a5208"]]) + lin("aub", [[0, "#3a2c08"], [1, "#140f03"]]) +
    rad("sc", [[0, "#ffe9a0"], [0.25, "#e0a530"], [0.7, "#4a3206"], [1, "#120c02"]], 0.5, 0.5, 0.6) +
    rad("btn", [[0, "#ffffff", 0.75], [0.35, "#ffffff", 0.1], [1, "#000000", 0.35]], 0.35, 0.3, 0.75) +
    rad("tip", [[0, "#fff6cf"], [0.5, "#ffd34a", 0.8], [1, "#ffd34a", 0]]),
  tile(rich) {
    return [44, (rich ? `<path d="M0 1.2 H44 M0 18.8 H44" stroke="url(#au)" stroke-width=".9"/><g fill="#ffe27a">${[6, 17, 28, 39].map((x) => `<circle cx="${x}" cy="1.2" r=".8"/><circle cx="${x}" cy="18.8" r=".8"/>`).join("")}</g>` : "") +
      `<rect x="0" y="7.8" width="44" height="4.4" fill="#0b0b0d"/><rect x="0" y="8.4" width="44" height="1" fill="#3a3a40"/><path d="M0 11.4 H44" stroke="#ffe27a" stroke-opacity=".35" stroke-width=".4"/>` +
      fconn(4.6, 10) +
      `<rect x="25.6" y="1.6" width="16.8" height="16.8" rx="3.6" fill="url(#aub)" stroke="url(#au)" stroke-width="1"/>` +
      `<rect x="26.6" y="2.6" width="14.8" height="14.8" rx="2.8" fill="none" stroke="#fff4c4" stroke-opacity=".3" stroke-width=".4"/>` +
      button(30.2, 6.2, 2.2, "#e8352f") + button(37.8, 6.2, 2.2, "#2fb84a") + button(30.2, 13.8, 2.2, "#f2c418") + button(37.8, 13.8, 2.2, "#2f6ee8")];
  },
  corner(lit) {
    const ant = `<path d="M18 9.2 H56" stroke="#2a1d03" stroke-width="2.2" stroke-linecap="round"/><path d="M18 9.2 H56" stroke="url(#au)" stroke-width="1.3" stroke-linecap="round"/><circle cx="57" cy="9.2" r="2.1" fill="url(#au)" stroke="#4a3204" stroke-width=".4"/>` +
      `<g stroke="#ffe27a" stroke-opacity=".5" stroke-width=".4">${[30, 38, 46].map((x) => `<path d="M${x} 7.6 v3.2"/>`).join("")}</g>`;
    let lines = "";
    for (let y = 6.2; y < 18; y += 1.2) lines += `<path d="M4.6 ${f(y)} H17.4"/>`;
    const LED = ["#e8352f", "#2fb84a", "#f2c418", "#2f6ee8"];
    return bed("url(#aub)", "#c48d10") + `<path d="M0 .8 H64 M.8 0 V64" stroke="url(#au)" stroke-width="1.6"/>` +
      `<path d="M0 18.6 H64 M18.6 20 V64" stroke="url(#au)" stroke-width=".7" stroke-opacity=".7"/>` + both(ant) +
      `<rect x="1" y="1.6" width="21.4" height="20.6" rx="4.6" fill="url(#au)" stroke="#4a3204" stroke-width=".7"/>` +
      `<rect x="1.8" y="2.4" width="19.8" height="19" rx="4" fill="none" stroke="#fff8dc" stroke-opacity=".6" stroke-width=".4"/>` +
      `<rect x="3.6" y="4.6" width="14.8" height="14.6" rx="3.4" fill="url(#sc)" stroke="#2a1d03" stroke-width=".6"/>` +
      `<g stroke="#000" stroke-opacity=".25" stroke-width=".35">${lines}</g>` +
      `<circle cx="11" cy="11.9" r="2.6" fill="url(#tip)"/>` +
      `<path d="M5 5.8 Q11 4.4 17 5.8" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width=".5"/>` +
      `<circle cx="20.2" cy="8" r="1" fill="#2a1d03"/><circle cx="20.2" cy="11.6" r="1" fill="#2a1d03"/>` +
      (lit >= 4 ? `<circle cx="57" cy="9.2" r="3.4" fill="url(#tip)"/><circle cx="9.2" cy="57" r="3.4" fill="url(#tip)"/>` : "") +
      marks(lit, (x, y, on) => button(x, y, 1.45, on ? LED[Math.round((Math.max(x, y) - 32) / 8)] : "#2a2310"));
  },
};

K.optika = {
  defs: lin("cg", [[0, "#f3dca2"], [0.5, "#c9a15a"], [1, "#6a4a18"]], 0, 0, 0, 1) +
    lin("sfp", [[0, "#f1f5f7"], [0.4, "#b9c4ca"], [1, "#5d6a72"]]) +
    lin("tray", [[0, "#0e3a45"], [1, "#03141a"]], 0, 0, 1, 1) +
    lin("glz", [[0, "#d9f7ff", 0.5], [0.5, "#d9f7ff", 0.05], [1, "#d9f7ff", 0.2]], 0, 0, 1, 1) +
    rad("lit", [[0, "#3ec6e0", 0.8], [1, "#3ec6e0", 0]]) +
    rad("core", [[0, "#ffffff"], [0.3, "#d9f7ff"], [0.65, "#3ec6e0"], [1, "#062a33", 0]]),
  tile(rich) {
    const fib = [wave(0, 48, 7.4, 0.9, 24), wave(0, 48, 9.2, 0.9, 24, 1), wave(0, 48, 11, 0.9, 24, 2), wave(0, 48, 12.8, 0.9, 24, 3)];
    const C = ["#3ec6e0", "#effcff", "#7fe3f2", "#3ec6e0"];
    return [48, `<path d="M0 3 H48 M0 17 H48" stroke="url(#cg)" stroke-width=".8"/>` +
      `<path d="${wave(0, 48, 10, 0.9, 24, 1.5)}" fill="none" stroke="#3ec6e0" stroke-opacity=".28" stroke-width="7.4"/>` +
      fib.map((d, i) => `<path d="${d}" fill="none" stroke="${C[i]}" stroke-width=".7"/>`).join("") +
      (rich ? fib.map((d, i) => `<path d="${d}" fill="none" stroke="#fff" stroke-width=".55" stroke-dasharray="1.4 6" stroke-dashoffset="${i * 3}"/>`).join("") : "") +
      sfp(15, 4) + sleeve(41, 7.4) + sleeve(41, 12.8) + sleeve(6, 9.2, 5) +
      (rich ? `<g fill="url(#cg)" stroke="#5a3e14" stroke-width=".3">${[3, 21, 39].map((x) => `<circle cx="${x}" cy="3" r=".95"/><circle cx="${x + 6}" cy="17" r=".95"/>`).join("")}</g>` : "")];
  },
  corner(lit) {
    const fib = `<g fill="none" stroke-width=".7"><path d="M22 7.4 H64" stroke="#3ec6e0"/><path d="M22 9.2 H64" stroke="#effcff"/><path d="M22 11 H64" stroke="#7fe3f2"/><path d="M22 12.8 H64" stroke="#3ec6e0"/></g>` +
      `<path d="M22 10.1 H64" stroke="#3ec6e0" stroke-opacity=".25" stroke-width="7"/>` + sleeve(34, 9.2, 6) + sleeve(46, 12.8, 6) + sleeve(56, 7.4, 6);
    return bed("url(#tray)", "#c9a15a") + `<path d="M0 3 H64 M0 17 H20 M3 0 V64 M17 20 V64" stroke="url(#cg)" stroke-width=".8"/>` + both(fib) +
      `<rect x="1.2" y="1.2" width="21.4" height="21.4" rx="4" fill="url(#tray)" stroke="url(#cg)" stroke-width="1"/>` +
      `<g fill="none" stroke-width=".6"><rect x="3.6" y="3.6" width="16.6" height="16.6" rx="6" stroke="#3ec6e0"/><rect x="5" y="5" width="13.8" height="13.8" rx="5" stroke="#effcff" stroke-opacity=".9"/><rect x="6.4" y="6.4" width="11" height="11" rx="4" stroke="#7fe3f2"/></g>` +
      `<g fill="#0a2a33" stroke="#c9a15a" stroke-width=".3"><rect x="8.6" y="9.4" width="6.6" height="1.3" rx=".4"/><rect x="8.6" y="11.3" width="6.6" height="1.3" rx=".4"/><rect x="8.6" y="13.2" width="6.6" height="1.3" rx=".4"/></g>` +
      `<circle cx="11.9" cy="11.9" r="${lit >= 4 ? 7.5 : 5.6}" fill="url(#core)" opacity=".75"/>` +
      `<rect x="1.2" y="1.2" width="21.4" height="21.4" rx="4" fill="url(#glz)"/>` +
      marks(lit, (x, y, on) => on ? `<circle cx="${x}" cy="${y}" r="2.3" fill="url(#lit)"/><circle cx="${x}" cy="${y}" r="1.05" fill="#effcff"/>` : `<circle cx="${x}" cy="${y}" r="1.05" fill="#04161b" stroke="#2b7f91" stroke-width=".4"/>`);
  },
};

K.duo = {
  defs: lin("ag", [[0, "#ffffff"], [0.45, "#b9c6d6"], [1, "#4a5a70"]], 0, 0, 0.6, 1) +
    lin("agd", [[0, "#2a3a52"], [1, "#0c1626"]], 0, 0, 1, 1) +
    rad("sp", [[0, "#e7f0ff"], [0.4, "#6ea8ff"], [1, "#0e2156"]], 0.35, 0.3, 0.7) +
    rad("en", [[0, "#9cc4ff"], [0.55, "#3c6fd8"], [1, "#0e2156"]], 0.45, 0.35, 0.7),
  tile(rich) {
    const ring = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#0c1626" stroke-width="3"/><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="url(#ag)" stroke-width="2.1"/><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width=".4" transform="translate(-.3 -.4)"/>`;
    const edge = (cx) => `<rect x="${cx - 4.6}" y="8.4" width="9.2" height="3.2" rx="1.6" fill="url(#ag)" stroke="#0c1626" stroke-width=".55"/><path d="M${cx - 3.6} 9.3 h7.2" stroke="#fff" stroke-opacity=".7" stroke-width=".4"/>`;
    return [40, `<path d="M0 2 H40 M0 18 H40" stroke="#6ea8ff" stroke-opacity=".55" stroke-width=".5"/>` +
      ring(10, 10, 6.4, 4.4) + edge(0) + edge(40) + edge(20) +
      `<circle cx="27.6" cy="10" r="4.8" fill="none" stroke="#0c1626" stroke-width="2.8"/><circle cx="27.6" cy="10" r="4.8" fill="none" stroke="url(#ag)" stroke-width="1.9"/>` +
      `<circle cx="32.4" cy="10" r="4.8" fill="none" stroke="#0c1626" stroke-width="2.8"/><circle cx="32.4" cy="10" r="4.8" fill="none" stroke="#6ea8ff" stroke-width="1.9"/>` +
      `<path d="M27.6 5.2 A4.8 4.8 0 0 1 31 6.6" fill="none" stroke="url(#ag)" stroke-width="1.9"/>` +
      `<circle cx="30" cy="10" r="1.25" fill="url(#sp)" stroke="#e7f0ff" stroke-width=".3"/>` +
      (rich ? `<circle cx="10" cy="10" r="1.6" fill="url(#sp)" stroke="#e7f0ff" stroke-width=".35"/><g fill="url(#sp)">${[5, 15, 25, 35].map((x) => `<circle cx="${x}" cy="2" r=".85"/><circle cx="${x}" cy="18" r=".85"/>`).join("")}</g>` : "")];
  },
  corner(lit) {
    const chain = [26, 36, 46, 56].map((x, i) => i % 2
      ? `<rect x="${x - 4.4}" y="8.4" width="8.8" height="3.2" rx="1.6" fill="url(#ag)" stroke="#0c1626" stroke-width=".5"/>`
      : `<ellipse cx="${x}" cy="10" rx="5.8" ry="4" fill="none" stroke="#0c1626" stroke-width="2.8"/><ellipse cx="${x}" cy="10" rx="5.8" ry="4" fill="none" stroke="url(#ag)" stroke-width="1.9"/>`).join("") + `<rect x="59.6" y="8.4" width="8.8" height="3.2" rx="1.6" fill="url(#ag)" stroke="#0c1626" stroke-width=".5"/>`;
    return bed("url(#agd)", "#6ea8ff") + `<path d="M0 1 H64 M1 0 V64" stroke="url(#ag)" stroke-width="1.6"/>` + both(chain) +
      // ring A (router), ring B (TV) interlocked
      `<circle cx="9" cy="14.8" r="6.8" fill="url(#en)" stroke="#0c1626" stroke-width="3.2"/><circle cx="9" cy="14.8" r="6.8" fill="none" stroke="url(#ag)" stroke-width="2.2"/>` +
      `<circle cx="14.8" cy="9" r="6.8" fill="url(#en)" stroke="#0c1626" stroke-width="3.2"/><circle cx="14.8" cy="9" r="6.8" fill="none" stroke="url(#ag)" stroke-width="2.2"/>` +
      `<path d="M4.3 9.9 A6.8 6.8 0 0 1 8.9 8" fill="none" stroke="#0c1626" stroke-width="3.2"/><path d="M4.3 9.9 A6.8 6.8 0 0 1 8.9 8" fill="none" stroke="url(#ag)" stroke-width="2.2"/>` +
      // router glyph in A
      `<rect x="4.6" y="14.4" width="8" height="3.6" rx=".8" fill="url(#ag)" stroke="#0c1626" stroke-width=".35"/><path d="M5.8 14.4 V11 M11.4 14.4 V11" stroke="url(#ag)" stroke-width=".8" stroke-linecap="round"/>` +
      `<g fill="#6ea8ff"><circle cx="6.4" cy="16.2" r=".45"/><circle cx="7.8" cy="16.2" r=".45"/><circle cx="9.2" cy="16.2" r=".45"/></g>` +
      // TV glyph in B
      `<rect x="10.8" y="5.2" width="7.6" height="5.4" rx="1" fill="#0e2156" stroke="url(#ag)" stroke-width=".7"/><path d="M13 12 h3.2" stroke="url(#ag)" stroke-width=".7" stroke-linecap="round"/><path d="M11.8 6.2 l2 2" stroke="#e7f0ff" stroke-opacity=".6" stroke-width=".4"/>` +
      (lit >= 4 ? `<circle cx="20.4" cy="20.4" r="1.9" fill="url(#sp)" stroke="#e7f0ff" stroke-width=".35"/>` : "") +
      marks(lit, (x, y, on) => `<circle cx="${x}" cy="${y}" r="1.55" fill="${on ? "url(#sp)" : "#0b1630"}" stroke="${on ? "#e7f0ff" : "#4a6aa0"}" stroke-width=".4"/>`);
  },
};

K.fiveg = {
  defs: lin("lt", [[0, "#e9d6ff"], [0.5, "#9a6ac8"], [1, "#4a2a6e"]], 0, 0, 0, 1) +
    lin("ar", [[0, "#2c1048"], [1, "#0c0416"]], 0, 0, 1, 1) +
    lin("am1", [[0, "#f6e5ff"], [1, "#a94ff0"]], 0, 0, 1, 1) + lin("am2", [[0, "#c86bff"], [1, "#3a0d66"]], 0, 0, 1, 1) +
    lin("pn", [[0, "#ffffff"], [0.6, "#e6d6f2"], [1, "#a68ac0"]], 0, 0, 1, 0),
  tile(rich) {
    const truss = `<path d="M0 3.4 H36 M0 16.6 H36" stroke="#1a0830" stroke-width="2"/><path d="M0 3.4 H36 M0 16.6 H36" stroke="url(#lt)" stroke-width="1.3"/>` +
      `<path d="M0 3.4 L9 16.6 L18 3.4 L27 16.6 L36 3.4" fill="none" stroke="url(#lt)" stroke-width=".85"/><path d="M9 3.4 V16.6 M27 3.4 V16.6" stroke="url(#lt)" stroke-width=".5" stroke-opacity=".7"/>`;
    return [36, truss + panel(12, 5.6, 4.6, 8.8) +
      crystal(31.4, 15.6, 11, 3.6, 8) + crystal(28.4, 15.6, 8, 3, -14) +
      (rich ? `<g fill="none" stroke="#e2b4ff" stroke-linecap="round" stroke-width=".6"><path d="M18.4 7.4 a3.2 3.2 0 0 1 0 5.2" stroke-opacity=".9"/><path d="M20.2 6 a5 5 0 0 1 0 8" stroke-opacity=".55"/><path d="M10.2 7.4 a3.2 3.2 0 0 0 0 5.2" stroke-opacity=".9"/><path d="M8.4 6 a5 5 0 0 0 0 8" stroke-opacity=".55"/></g>` : "")];
  },
  corner() {
    const truss = `<path d="M22 3.4 H64 M22 16.6 H64" stroke="#1a0830" stroke-width="2"/><path d="M22 3.4 H64 M22 16.6 H64" stroke="url(#lt)" stroke-width="1.3"/>` +
      `<path d="M22 16.6 L28 3.4 L34 16.6 L40 3.4 L46 16.6 L52 3.4 L58 16.6 L64 3.4" fill="none" stroke="url(#lt)" stroke-width=".8"/>` +
      panel(41.6, 5.8, 3.6, 8.4) + panel(53.6, 5.8, 3.6, 8.4);
    const arcs = [0, 1, 2].map((i) => `<path d="M${f(21 + i * 4.6)} 1.2 A${f(19.8 + i * 4.6)} ${f(19.8 + i * 4.6)} 0 0 1 1.2 ${f(21 + i * 4.6)}" stroke-opacity="${[0.95, 0.6, 0.3][i]}"/>`).join("");
    return bed("url(#ar)", "#c86bff") + both(truss) +
      `<g fill="none" stroke="#e2b4ff" stroke-width=".8" stroke-linecap="round" stroke-dasharray="2.4 1.6">${arcs}</g>` +
      // badge: a lattice cell tower aimed at the outer corner, amethysts at its foot
      `<rect x="1.4" y="1.4" width="21" height="21" rx="4.4" fill="url(#ar)" stroke="url(#lt)" stroke-width="1"/>` +
      `<g transform="rotate(-45 11.9 11.9)">` +
      `<path d="M8.4 21 L11.9 4.4 L15.4 21" fill="none" stroke="url(#lt)" stroke-width="1"/>` +
      `<path d="M9.2 17.4 L14.7 17.4 L9.9 13.8 L13.9 13.8 L10.6 10.4 L13.2 10.4" fill="none" stroke="url(#lt)" stroke-width=".55"/>` +
      panel(8.3, 4.6, 2.2, 4.8) + panel(10.8, 3.8, 2.2, 4.8) + panel(13.3, 4.6, 2.2, 4.8) +
      `<circle cx="11.9" cy="2.4" r="1" fill="#f6e5ff"/>` +
      crystal(10.2, 22.4, 5.6, 2.6, -18) + crystal(13.6, 22.4, 5, 2.4, 20) + crystal(11.9, 22.6, 7.4, 3.2, 0) +
      `</g>` +
      `<path d="M58 1.6 l1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1z M1.6 58 l1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1z" fill="#f6e5ff" transform="translate(1.6 -.4)"/>`;
  },
};

K.nekonecno = {
  defs: lin("gd", [[0, "#fff6d8"], [0.3, "#ffe3b0"], [0.6, "#e0a540"], [1, "#7a4a0c"]], 0, 0, 0.6, 1) +
    lin("rd", [[0, "#ff6a78"], [0.5, "#c8142c"], [1, "#4a0410"]]) +
    lin("ob", [[0, "#2a070d"], [1, "#060104"]], 0, 0, 1, 1) +
    rad("gem", [[0, "#ffd0d6"], [0.35, "#ff3b4e"], [1, "#5a0410"]], 0.4, 0.3, 0.75) +
    lin("bl", [[0, "#ff5a6a"], [0.55, "#8a0a1c"], [1, "#1a0207"]], 0, 0, 0, 1),
  tile() {
    return [40, `<path d="M0 1.3 H40" stroke="url(#gd)" stroke-width="1.6"/><path d="M0 18.7 H40" stroke="#c8142c" stroke-width="1.2"/><path d="M0 17.6 H40" stroke="url(#gd)" stroke-width=".5"/>` +
      `<path d="M0 10 H3 M25 10 H27" stroke="url(#gd)" stroke-width="1.2"/>` +
      infLink(14, 10, 20, 8.6) + `<circle cx="14" cy="10" r="1.25" fill="url(#gem)" stroke="#fff6d8" stroke-width=".3"/>` +
      blade(30.4, 10, 9, 4) +
      `<g fill="url(#gem)" stroke="#fff6d8" stroke-width=".25">${[7, 21, 34].map((x) => `<circle cx="${x}" cy="1.3" r=".75"/>`).join("")}</g>`];
  },
  corner() {
    const arm = `<path d="M22 1.3 H64" stroke="url(#gd)" stroke-width="1.6"/><path d="M22 18.7 H64" stroke="#c8142c" stroke-width="1.2"/>` + blade(28.6, 10, 26, 5.2) + infLink(60, 10, 10, 5.4, 1.4);
    const crown = "M3.2 8.4 L5.8 1.6 L8.8 5.8 L11.8 0.6 L14.8 5.8 L17.8 1.6 L20.4 8.4 Z";
    return bed("url(#ob)", "#e0a540") + `<path d="M0 .9 H64 M.9 0 V64" stroke="url(#gd)" stroke-width="1.8"/>` + both(arm) +
      // shield
      `<path d="M11.8 5.4 L21.6 8.4 L21.4 14.6 C20.6 19 16.6 21.6 11.8 23 C7 21.6 3 19 2.2 14.6 L2 8.4 Z" fill="url(#gd)" stroke="#3a1e02" stroke-width=".6" stroke-linejoin="round"/>` +
      `<path d="M11.8 7.6 L19.4 10 L19.2 14.6 C18.6 17.8 15.6 19.8 11.8 20.8 C8 19.8 5 17.8 4.4 14.6 L4.2 10 Z" fill="url(#rd)"/>` +
      `<path d="M11.8 9.6 L17.2 11.4 L17 14.6 C16.6 16.6 14.6 18 11.8 18.8 C9 18 7 16.6 6.6 14.6 L6.4 11.4 Z" fill="url(#ob)" stroke="#ffe3b0" stroke-opacity=".7" stroke-width=".35"/>` +
      infLink(11.8, 14.2, 7.6, 3.6, 1) +
      // crown
      `<path d="${crown}" fill="url(#gd)" stroke="#3a1e02" stroke-width=".5" stroke-linejoin="round"/>` +
      `<path d="M3.6 8.4 H20" stroke="#3a1e02" stroke-width=".4"/>` +
      `<g fill="url(#gem)" stroke="#fff6d8" stroke-width=".25"><circle cx="5.8" cy="1.8" r="1"/><circle cx="11.8" cy="1" r="1.15"/><circle cx="17.8" cy="1.8" r="1"/><circle cx="11.8" cy="6.4" r=".95"/></g>` +
      `<g fill="url(#gem)" stroke="#fff6d8" stroke-width=".3"><circle cx="61" cy="5" r="1.4"/><circle cx="5" cy="61" r="1.4"/></g>`;
  },
};

// ───────────────────────── write ─────────────────────────

mkdirSync(OUT, { recursive: true });
let n = 0;
const put = (name, text) => { writeFileSync(join(OUT, name), text); n++; };
for (const [id, k] of Object.entries(K)) {
  const master = id === "fiveg" || id === "nekonecno";
  if (master) put(`${id}.svg`, doc(64, 64, k.defs, k.corner(4)));
  else for (let d = 4; d >= 1; d--) put(`${id}-${ROMAN[d]}.svg`, doc(64, 64, k.defs, k.corner(5 - d)));
  for (const rich of master ? [true] : [false, true]) {
    const [W, body] = k.tile(rich);
    const sfx = rich && !master ? "2" : "";
    put(`${id}-h${sfx}.svg`, doc(W, H, k.defs, body));
    put(`${id}-v${sfx}.svg`, doc(H, W, k.defs, `<g transform="matrix(0 1 1 0 0 0)">${body}</g>`));
  }
}
console.log(`machine frames: ${n} files → public/machine`);
