#!/usr/bin/env node
/**
 * Rank frame emblems for the 4KA LIGA ladder → public/ranks/*.svg
 *
 * One crisp 64×64 SVG per rank tier (KREDIT IV … DUO I, 5G NA DOMA, NEKONEČNO)
 * plus the rotating NEKONEČNO halo. Tiers inside a family keep the same body and
 * light 1–4 of the four tier marks; tier I adds the family's finishing ornament.
 * Motion (shine, glow, sparks, halo spin) lives in CSS, never in these files.
 *
 *   node scripts/gen-rank-frames.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "ranks");
const ROMAN = ["", "i", "ii", "iii", "iv"];

/* ---------- glyphs (24×24 line icons, Lucide ISC) ---------- */
const GLYPH = {
  wallet: [
    ["path", { d: "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" }],
    ["path", { d: "M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" }],
  ],
  smartphone: [
    ["rect", { width: 14, height: 20, x: 5, y: 2, rx: 2.5 }],
    ["path", { d: "M10 18h4" }],
  ],
  sparkles: [
    ["path", { d: "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" }],
    ["path", { d: "M20 3v4" }],
    ["path", { d: "M22 5h-4" }],
  ],
  tower: [
    ["path", { d: "M4.9 16.1C1 12.2 1 5.8 4.9 1.9" }],
    ["path", { d: "M7.8 4.7a6.14 6.14 0 0 0-.8 7.5" }],
    ["circle", { cx: 12, cy: 9, r: 2 }],
    ["path", { d: "M16.2 4.8c2 2 2.26 5.11.8 7.47" }],
    ["path", { d: "M19.1 1.9a9.96 9.96 0 0 1 0 14.1" }],
    ["path", { d: "M9.5 18h5" }],
    ["path", { d: "m8 22 4-11 4 11" }],
  ],
  infinity: [["path", { d: "M6 16c5 0 7-8 12-8a4 4 0 0 1 0 8c-5 0-7-8-12-8a4 4 0 1 0 0 8" }]],
};

function node([tag, attrs]) {
  const a = Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");
  return `<${tag} ${a}/>`;
}

/** Engraved glyph: dark cut under, lit edge on top. */
function glyph(name, cx, cy, size, { ink, cut = "#000", w = 2.2, cutOp = 0.55 }) {
  const s = size / 24;
  const at = (dx, dy) => `translate(${(cx - size / 2 + dx).toFixed(2)} ${(cy - size / 2 + dy).toFixed(2)}) scale(${s.toFixed(4)})`;
  const body = GLYPH[name].map(node).join("");
  return (
    `<g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="${w}">` +
    `<g transform="${at(0, 0.7)}" stroke="${cut}" stroke-opacity="${cutOp}">${body}</g>` +
    `<g transform="${at(0, 0)}" stroke="${ink}">${body}</g>` +
    `</g>`
  );
}

const lin = (id, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops
    .map(([o, c, op]) => `<stop offset="${o}" stop-color="${c}"${op != null ? ` stop-opacity="${op}"` : ""}/>`)
    .join("")}</linearGradient>`;
const rad = (id, stops, cx = 0.5, cy = 0.5, r = 0.5) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops
    .map(([o, c, op]) => `<stop offset="${o}" stop-color="${c}"${op != null ? ` stop-opacity="${op}"` : ""}/>`)
    .join("")}</radialGradient>`;

/** Four tier slots; `lit` of them on (IV = 1 … I = 4). */
function marks(lit, { cx = 32, y, gap, draw }) {
  let out = "";
  for (let i = 0; i < 4; i++) {
    const x = cx + (i - 1.5) * gap;
    out += draw(x, y, i < lit);
  }
  return out;
}

const poly = (pts) => pts.map((p) => p.map((n) => n.toFixed(2)).join(",")).join(" ");
function ngon(n, r, cx = 32, cy = 32, rot = -90) {
  return Array.from({ length: n }, (_, i) => {
    const a = ((rot + (360 / n) * i) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
}

const svg = (body, defs) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><defs>${defs}</defs>${body}</svg>\n`;

/* ---------- KREDIT · kolok (stamped steel top-up voucher, Finančná správa stamp) ---------- */
function kredit(lit) {
  const perf = [];
  for (let i = 0; i <= 8; i++) {
    const p = 8 + i * 6;
    perf.push([p, 8], [p, 56], [8, p], [56, p]);
  }
  const defs =
    lin("m", [[0, "#b3b9c0"], [0.5, "#80878f"], [1, "#4b5158"]]) +
    lin("p", [[0, "#3a4047"], [1, "#1c2025"]]) +
    `<pattern id="h" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v3" stroke="#fff" stroke-opacity=".05" stroke-width="1"/></pattern>` +
    `<mask id="perf"><rect width="64" height="64" fill="#fff"/>${perf.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="#000"/>`).join("")}</mask>`;
  const ring = lit >= 4 ? `<rect x="4.5" y="4.5" width="55" height="55" rx="4" fill="none" stroke="#d9dde2" stroke-opacity=".55" stroke-width="1"/>` : "";
  const body =
    ring +
    `<g mask="url(#perf)"><rect x="7" y="7" width="50" height="50" rx="2" fill="url(#m)"/><rect x="7" y="7" width="50" height="50" rx="2" fill="url(#h)"/></g>` +
    `<rect x="13" y="13" width="38" height="38" rx="2.5" fill="url(#p)" stroke="#000" stroke-opacity=".45"/>` +
    (lit >= 3
      ? `<rect x="14" y="14" width="36" height="36" rx="2" fill="none" stroke="#dfe3e8" stroke-opacity=".6" stroke-width=".8"/>`
      : `<rect x="14" y="14" width="36" height="36" rx="2" fill="none" stroke="#c9ced4" stroke-opacity=".35" stroke-dasharray="1.2 1.6"/>`) +
    glyph("wallet", 32, 28.5, 17, { ink: "#dde1e6", w: 2.3 }) +
    marks(lit, {
      y: 44,
      gap: 5.4,
      draw: (x, y, on) =>
        `<rect x="${(x - 1.9).toFixed(2)}" y="${y - 1.2}" width="3.8" height="2.4" rx=".5" fill="${on ? "#eef0f3" : "#0d1013"}" stroke="${on ? "none" : "#5d646c"}" stroke-width=".6"/>`,
    });
  return svg(body, defs);
}

/* ---------- SLOBODA · brushed copper heater shield with rivets ---------- */
function sloboda(lit) {
  const outer = "M32 5 L54 11.5 V29 C54 43.5 44.5 52.5 32 59 C19.5 52.5 10 43.5 10 29 V11.5 Z";
  const inner = "M32 10.5 L49 15.6 V29.4 C49 40.6 41.6 47.8 32 53 C22.4 47.8 15 40.6 15 29.4 V15.6 Z";
  const defs =
    lin("c", [[0, "#ffd0a0"], [0.35, "#d68a48"], [0.7, "#a35a24"], [1, "#5e2f10"]], 0, 0, 1, 1) +
    lin("in", [[0, "#3b2114"], [1, "#160b05"]]) +
    `<pattern id="b" width="64" height="1.6" patternUnits="userSpaceOnUse"><path d="M0 .4h64" stroke="#fff" stroke-opacity=".09" stroke-width=".5"/></pattern>` +
    rad("rv", [[0, "#ffe6c8"], [0.45, "#d0894c"], [1, "#5a2c0e"]], 0.35, 0.3, 0.7);
  const rivet = (x, y) => `<circle cx="${x}" cy="${y}" r="1.9" fill="url(#rv)" stroke="#2a1306" stroke-width=".5"/>`;
  const crest = lit >= 4 ? `<path d="M24 5.8 L32 2.5 L40 5.8 L32 8.2 Z" fill="url(#c)" stroke="#2a1306" stroke-width=".6"/>` : "";
  const body =
    `<path d="${outer}" fill="url(#c)" stroke="#2a1306" stroke-width="1"/>` +
    `<path d="${outer}" fill="url(#b)"/>` +
    `<path d="${inner}" fill="url(#in)" stroke="#ffcf9e" stroke-opacity=".5" stroke-width=".8"/>` +
    rivet(13.2, 14.4) + rivet(50.8, 14.4) + (lit >= 3 ? rivet(12.6, 30) + rivet(51.4, 30) : "") +
    crest +
    glyph("smartphone", 32, 28, 16, { ink: "#ffe1c0", w: 2.2 }) +
    marks(lit, {
      y: 42.5,
      gap: 5,
      draw: (x, y, on) =>
        `<circle cx="${x.toFixed(2)}" cy="${y}" r="1.55" fill="${on ? "url(#rv)" : "#120804"}" stroke="${on ? "#2a1306" : "#8a5530"}" stroke-width=".55"/>`,
    });
  return svg(body, defs);
}

/* ---------- SMART · polished platinum hexagon with chamfer facets ---------- */
function smart(lit) {
  const O = ngon(6, 27.5);
  const I = ngon(6, 20.5);
  const shade = ["#ffffff", "#c6ced8", "#7b8794", "#4d5763", "#8e99a6", "#e4e9ef"];
  const facets = O.map((p, i) => {
    const q = O[(i + 1) % 6];
    return `<polygon points="${poly([p, q, I[(i + 1) % 6], I[i]])}" fill="${shade[i]}"/>`;
  }).join("");
  const defs =
    lin("f", [[0, "#26303a"], [1, "#0a0e12"]]) +
    lin("g", [[0, "#fff", 0.28], [0.5, "#fff", 0]], 0, 0, 0.6, 1) +
    lin("e", [[0, "#ffffff"], [1, "#9fb2c6"]]);
  const halo = lit >= 4 ? `<polygon points="${poly(ngon(6, 30.5))}" fill="none" stroke="#e8eef5" stroke-opacity=".7" stroke-width=".9"/>` : "";
  const body =
    halo +
    `<polygon points="${poly(O)}" fill="#59636f"/>` + facets +
    `<polygon points="${poly(O)}" fill="none" stroke="#1a2027" stroke-width=".9"/>` +
    `<polygon points="${poly(I)}" fill="url(#f)" stroke="#0a0d10" stroke-width=".8"/>` +
    (lit >= 3 ? `<polygon points="${poly(ngon(6, 18.6))}" fill="none" stroke="#e8eef5" stroke-opacity=".45" stroke-width=".6"/>` : "") +
    `<path d="M14.25 21.75 L32 11.5 L49.75 21.75 L49.75 27 C40 22 24 22 14.25 30 Z" fill="url(#g)"/>` +
    glyph("sparkles", 32, 30, 17, { ink: "url(#e)", w: 1.9 }) +
    marks(lit, {
      y: 44.2,
      gap: 4.8,
      draw: (x, y, on) =>
        `<path d="M${x.toFixed(2)} ${y - 1.9}l1.9 1.9-1.9 1.9-1.9-1.9z" fill="${on ? "#f4f7fb" : "#121820"}" stroke="${on ? "#9fb2c6" : "#5c6874"}" stroke-width=".5"/>`,
    });
  return svg(body, defs);
}

/* ---------- 4KA TV · gold CRT set with antenna (telka cez anténu) ---------- */
function telka(lit) {
  const defs =
    lin("au", [[0, "#fff4c4"], [0.3, "#f2c83a"], [0.65, "#c48d10"], [1, "#6e4a06"]], 0, 0, 0.4, 1) +
    lin("au2", [[0, "#7a5408"], [1, "#ffe27a"]]) +
    rad("sc", [[0, "#3a3216"], [0.7, "#14110a"], [1, "#060504"]], 0.5, 0.42, 0.65) +
    `<pattern id="sl" width="2" height="1.6" patternUnits="userSpaceOnUse"><path d="M0 .4h2" stroke="#ffe27a" stroke-opacity=".09" stroke-width=".55"/></pattern>` +
    lin("four", [[0, "#fff6cf"], [0.55, "#f0c419"], [1, "#a8760a"]]) +
    rad("tip", [[0, "#fff6cf"], [0.5, "#ffd34a", 0.8], [1, "#ffd34a", 0]]);
  const waves =
    lit >= 3
      ? `<g fill="none" stroke="#ffe27a" stroke-opacity=".7" stroke-width=".8" stroke-linecap="round"><path d="M15.6 3.4 A5 5 0 0 0 15.6 7"/><path d="M48.4 3.4 A5 5 0 0 1 48.4 7"/><path d="M13.4 2 A7.6 7.6 0 0 0 13.4 8.4" stroke-opacity=".4"/><path d="M50.6 2 A7.6 7.6 0 0 1 50.6 8.4" stroke-opacity=".4"/></g>`
      : "";
  const tips = lit >= 4 ? `<circle cx="20" cy="5.2" r="4.2" fill="url(#tip)"/><circle cx="44" cy="5.2" r="4.2" fill="url(#tip)"/>` : "";
  const four = "M33.2 23 h5 v11.6 h2.8 v3.6 h-2.8 v4.6 h-5 v-4.6 h-10 v-3.4 Z M33.2 29 l-5.6 5.6 h5.6 Z";
  const body =
    waves +
    tips +
    `<path d="M32 17 L20 5.2 M32 17 L44 5.2" stroke="url(#au)" stroke-width="2.2" stroke-linecap="round"/>` +
    `<circle cx="20" cy="5.2" r="1.9" fill="url(#au)" stroke="#5a3c04" stroke-width=".5"/><circle cx="44" cy="5.2" r="1.9" fill="url(#au)" stroke="#5a3c04" stroke-width=".5"/>` +
    `<rect x="6.5" y="15.5" width="51" height="42" rx="9" fill="url(#au)" stroke="#4a3204" stroke-width="1"/>` +
    `<rect x="9" y="18" width="46" height="37" rx="7" fill="none" stroke="#fff4c4" stroke-opacity=".55" stroke-width=".7"/>` +
    `<rect x="12" y="21" width="40" height="31" rx="6" fill="url(#au2)"/>` +
    `<rect x="13.2" y="22.2" width="37.6" height="28.6" rx="5" fill="url(#sc)"/>` +
    `<rect x="13.2" y="22.2" width="37.6" height="28.6" rx="5" fill="url(#sl)"/>` +
    `<path d="M15 24.5 C24 22.6 40 22.6 49 24.5 L49 28 C40 26 24 26 15 29 Z" fill="#fff" fill-opacity=".07"/>` +
    `<path d="${four}" fill="#000" fill-opacity=".5" fill-rule="evenodd" transform="translate(0 .8)"/>` +
    `<path d="${four}" fill="url(#four)" fill-rule="evenodd"/>` +
    [[10.5, 19.5], [53.5, 19.5], [10.5, 53.5], [53.5, 53.5]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".9" fill="#fff4c4" fill-opacity=".8"/>`).join("") +
    marks(lit, {
      y: 47,
      gap: 4.6,
      draw: (x, y, on) =>
        `<rect x="${(x - 1.6).toFixed(2)}" y="${y - 0.9}" width="3.2" height="1.8" rx=".9" fill="${on ? "#ffe27a" : "#2a2310"}" stroke="${on ? "#fff4c4" : "#6e5a20"}" stroke-width=".4"/>`,
    });
  return svg(body, defs);
}

/* ---------- OPTIKA · cut-glass octagon around a fibre cross-section ---------- */
function optika(lit) {
  const O = ngon(8, 25, 32, 32, -112.5);
  const I = ngon(8, 18.5, 32, 32, -112.5);
  const tint = ["#d9f7ff", "#9fe9f7", "#3ec6e0", "#1688a3", "#0d5a6e", "#1688a3", "#3ec6e0", "#b8f1fb"];
  const facets = O.map((p, i) => `<polygon points="${poly([p, O[(i + 1) % 8], I[(i + 1) % 8], I[i]])}" fill="${tint[i]}" fill-opacity=".92"/>`).join("");
  const strands = [-14, -6, 6, 14]
    .map((dy) => {
      const y = 32 + dy;
      return `<path d="M14 ${y} C8 ${y} 6 ${y + dy * 0.5} 2.2 ${y + dy * 0.9}" /><path d="M50 ${y} C56 ${y} 58 ${y + dy * 0.5} 61.8 ${y + dy * 0.9}"/>`;
    })
    .join("");
  const ends = [-14, -6, 6, 14]
    .map((dy) => `<circle cx="2.2" cy="${32 + dy * 1.9}" r="1.2"/><circle cx="61.8" cy="${32 + dy * 1.9}" r="1.2"/>`)
    .join("");
  const defs =
    rad("core", [[0, "#ffffff"], [0.25, "#d9f7ff"], [0.6, "#3ec6e0"], [1, "#062a33"]]) +
    rad("clad", [[0.55, "#0a2f38"], [1, "#04161b"]]) +
    lin("rim", [[0, "#f3dca2"], [0.5, "#b88a3e"], [1, "#5a3e14"]], 0, 0, 1, 1);
  const showStrands = lit >= 2;
  const body =
    (showStrands
      ? `<g fill="none" stroke="#3ec6e0" stroke-opacity="${lit >= 4 ? 0.85 : 0.55}" stroke-width=".9" stroke-linecap="round">${strands}</g><g fill="#d9f7ff" fill-opacity="${lit >= 4 ? 1 : 0.7}">${ends}</g>`
      : "") +
    `<polygon points="${poly(ngon(8, 27, 32, 32, -112.5))}" fill="url(#rim)" stroke="#2a1c08" stroke-width=".8"/>` +
    facets +
    `<polygon points="${poly(O)}" fill="none" stroke="#04161b" stroke-width=".7"/>` +
    `<polygon points="${poly(I)}" fill="url(#clad)" stroke="#d9f7ff" stroke-opacity=".55" stroke-width=".6"/>` +
    `<circle cx="32" cy="30" r="10" fill="none" stroke="#3ec6e0" stroke-opacity=".35" stroke-width="2.4"/>` +
    `<circle cx="32" cy="30" r="6.5" fill="url(#core)"/>` +
    `<circle cx="29.8" cy="27.8" r="1.6" fill="#fff" fill-opacity=".9"/>` +
    marks(lit, {
      y: 44.6,
      gap: 4.4,
      draw: (x, y, on) =>
        on
          ? `<circle cx="${x.toFixed(2)}" cy="${y}" r="2.4" fill="#3ec6e0" fill-opacity=".35"/><circle cx="${x.toFixed(2)}" cy="${y}" r="1.25" fill="#effcff"/>`
          : `<circle cx="${x.toFixed(2)}" cy="${y}" r="1.25" fill="#04161b" stroke="#2b7f91" stroke-width=".5"/>`,
    });
  return svg(body, defs);
}

/* ---------- DUO · silver medallion, two interlocked rings over sapphire enamel ---------- */
function duo(lit) {
  const ticks = Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    const r0 = 24.2;
    const r1 = i % 4 === 0 ? 21.6 : 22.8;
    return `<line x1="${(32 + r0 * Math.cos(a)).toFixed(2)}" y1="${(32 + r0 * Math.sin(a)).toFixed(2)}" x2="${(32 + r1 * Math.cos(a)).toFixed(2)}" y2="${(32 + r1 * Math.sin(a)).toFixed(2)}"/>`;
  }).join("");
  const fin = (s) =>
    `<path transform="translate(32 0) scale(${s} 1) translate(-32 0)" d="M10.4 19.6 C6 18.4 3 15.4 1.6 11 C4.8 13.8 8.4 15 12.6 15.2 Z M7.6 28 C4.2 27.6 1.8 25.8 .6 23 C3.2 24.2 6 24.4 9 24 Z M7.6 36 C4.2 36.4 1.8 38.2 .6 41 C3.2 39.8 6 39.6 9 40 Z M10.4 44.4 C6 45.6 3 48.6 1.6 53 C4.8 50.2 8.4 49 12.6 48.8 Z" fill="url(#ag)" stroke="#0e1a30" stroke-width=".6" stroke-linejoin="round"/>`;
  const defs =
    lin("ag", [[0, "#ffffff"], [0.45, "#b9c6d6"], [1, "#4a5a70"]], 0, 0, 0.5, 1) +
    rad("en", [[0, "#9cc4ff"], [0.55, "#3c6fd8"], [1, "#0e2156"]], 0.45, 0.35, 0.7) +
    lin("ring", [[0, "#ffffff"], [0.5, "#c7d4e6"], [1, "#6c7d96"]]) +
    rad("gem", [[0, "#e7f0ff"], [0.4, "#6ea8ff"], [1, "#0e2156"]], 0.35, 0.3, 0.7);
  const ring = (cx) => `<circle cx="${cx}" cy="29" r="8.6" fill="none" stroke="#0a1430" stroke-opacity=".6" stroke-width="3.4" transform="translate(0 .7)"/><circle cx="${cx}" cy="29" r="8.6" fill="none" stroke="url(#ring)" stroke-width="2.6"/>`;
  const body =
    (lit >= 3 ? fin(1) + fin(-1) : "") +
    `<circle cx="32" cy="32" r="27" fill="url(#ag)" stroke="#1a2a44" stroke-width=".9"/>` +
    `<circle cx="32" cy="32" r="24.6" fill="#1c2a44"/>` +
    `<g stroke="#e7f0ff" stroke-opacity=".55" stroke-width=".55">${ticks}</g>` +
    `<circle cx="32" cy="32" r="20.6" fill="url(#en)" stroke="#e7f0ff" stroke-opacity=".7" stroke-width=".7"/>` +
    ring(27.4) + ring(36.6) +
    /* re-draw the left ring's top-right arc over the right ring so they interlock */
    `<path d="M27.4 20.4 A8.6 8.6 0 0 1 35.6 25.4" fill="none" stroke="url(#ring)" stroke-width="2.6"/>` +
    `<path d="M32 26.2 l1 2 2 .8-2 .8-1 2-1-2-2-.8 2-.8z" fill="#fff"/>` +
    marks(lit, {
      y: 44.8,
      gap: 4.6,
      draw: (x, y, on) =>
        `<circle cx="${x.toFixed(2)}" cy="${y}" r="1.7" fill="${on ? "url(#gem)" : "#0b1630"}" stroke="${on ? "#e7f0ff" : "#4a6aa0"}" stroke-width=".5"/>`,
    });
  return svg(body, defs);
}

/* ---------- 5G NA DOMA · amethyst crystal with radio-wave wings (master) ---------- */
function fiveg() {
  const T = [32, 4], R = [55, 32], B = [32, 60], L = [9, 32];
  const t = [32, 14], r = [45, 32], b = [32, 50], l = [19, 32];
  const defs =
    lin("v1", [[0, "#f6e5ff"], [1, "#c86bff"]], 0, 0, 1, 1) +
    lin("v2", [[0, "#c86bff"], [1, "#4a1280"]], 1, 0, 0, 1) +
    lin("v3", [[0, "#7a2bc4"], [1, "#22063d"]]) +
    lin("v4", [[0, "#a94ff0"], [1, "#2c0a4e"]], 0, 0, 1, 1) +
    rad("pl", [[0, "#ffffff"], [0.3, "#eac2ff"], [0.7, "#8a2fd6"], [1, "#1a0430"]]) +
    lin("wv", [[0, "#f6e5ff"], [1, "#c86bff"]]);
  const arcs = [0, 1, 2]
    .map((i) => {
      const r0 = 7 + i * 3.4;
      const op = [0.95, 0.7, 0.45][i];
      return `<path d="M${(9 - i * 2.2).toFixed(1)} ${(32 - r0).toFixed(1)} A${r0} ${r0} 0 0 0 ${(9 - i * 2.2).toFixed(1)} ${(32 + r0).toFixed(1)}" stroke-opacity="${op}"/><path d="M${(55 + i * 2.2).toFixed(1)} ${(32 - r0).toFixed(1)} A${r0} ${r0} 0 0 1 ${(55 + i * 2.2).toFixed(1)} ${(32 + r0).toFixed(1)}" stroke-opacity="${op}"/>`;
    })
    .join("");
  const body =
    `<g fill="none" stroke="url(#wv)" stroke-width="1.5" stroke-linecap="round">${arcs}</g>` +
    `<polygon points="${poly([T, R, B, L])}" fill="#22063d" stroke="#12021f" stroke-width="1"/>` +
    `<polygon points="${poly([T, R, r, t])}" fill="url(#v1)"/>` +
    `<polygon points="${poly([R, B, b, r])}" fill="url(#v2)"/>` +
    `<polygon points="${poly([B, L, l, b])}" fill="url(#v3)"/>` +
    `<polygon points="${poly([L, T, t, l])}" fill="url(#v4)"/>` +
    `<polygon points="${poly([t, r, b, l])}" fill="url(#pl)" stroke="#f6e5ff" stroke-opacity=".6" stroke-width=".6"/>` +
    `<g stroke="#f6e5ff" stroke-opacity=".35" stroke-width=".5">${[T, R, B, L].map((p, i) => `<line x1="${p[0]}" y1="${p[1]}" x2="${[t, r, b, l][i][0]}" y2="${[t, r, b, l][i][1]}"/>`).join("")}</g>` +
    glyph("tower", 32, 33, 15, { ink: "#ffffff", cut: "#2a0848", w: 2.1, cutOp: 0.8 }) +
    `<path d="M32 .8 l1.3 2.6 2.6 1.3-2.6 1.3-1.3 2.6-1.3-2.6-2.6-1.3 2.6-1.3z" fill="#fff"/>`;
  return svg(body, defs);
}

/* ---------- NEKONEČNO · apex crest: crimson enamel, obsidian, champagne gold, crown & blade wings ---------- */
function nekonecno() {
  const crest = "M32 6.5 L47 12 L52.5 28 L46 45.5 L32 58.5 L18 45.5 L11.5 28 L17 12 Z";
  const band = "M32 9.2 L45.2 14.1 L50 28.1 L44.2 43.9 L32 55.4 L19.8 43.9 L14 28.1 L18.8 14.1 Z";
  const plateL = "M32 13 L21.3 17 L17.4 28.2 L22.4 41.6 L32 50.8 Z";
  const plateR = "M32 13 L42.7 17 L46.6 28.2 L41.6 41.6 L32 50.8 Z";
  const defs =
    lin("gd", [[0, "#fff6d8"], [0.3, "#ffe3b0"], [0.6, "#e0a540"], [1, "#7a4a0c"]], 0, 0, 0.5, 1) +
    lin("rd", [[0, "#ff8a96"], [0.35, "#ff3b4e"], [0.75, "#a50f22"], [1, "#4a0410"]], 0, 0, 0.6, 1) +
    lin("obL", [[0, "#2a070d"], [1, "#0a0205"]], 1, 0, 0, 1) +
    lin("obR", [[0, "#40101a"], [1, "#12030a"]], 0, 0, 1, 1) +
    lin("inf", [[0, "#fffbe8"], [0.45, "#ffd27a"], [1, "#c27a14"]]) +
    rad("hot", [[0, "#ff5a6a", 0.5], [1, "#ff3b4e", 0]]) +
    rad("gem", [[0, "#ffd0d6"], [0.35, "#ff3b4e"], [1, "#5a0410"]], 0.4, 0.3, 0.75) +
    lin("bl", [[0, "#ff3b4e"], [0.55, "#6a0614"], [1, "#140105"]], 1, 1, 0, 0);
  const blades = [
    "M17.6 14 C11 12.2 6 7.4 3.2 1.6 C9.4 4.6 14.8 6 20.6 7.6 Z",
    "M13.4 22 C7.4 21.6 3 18.6 .8 13.6 C6.4 15.2 10.8 15.6 15.4 15.6 Z",
    "M12.2 30.6 C7.2 31.6 3.4 30.4 1 27 C5.6 27.2 9.2 26.4 12.8 25 Z",
    "M14.2 38.8 C10.2 41 6.6 41.2 3.6 39.4 C7.4 38.4 10.4 36.6 13 34.4 Z",
  ];
  const wing = (s) =>
    blades
      .map((d, i) => `<path transform="translate(32 0) scale(${s} 1) translate(-32 0)" d="${d}" fill="url(#bl)" stroke="url(#gd)" stroke-width="${i === 0 ? 0.9 : 0.7}" stroke-linejoin="round"/>`)
      .join("");
  const inf = GLYPH.infinity[0][1].d;
  const body =
    wing(1) + wing(-1) +
    `<path d="M23.4 10.4 L24.6 3.4 L28 7.2 L32 .4 L36 7.2 L39.4 3.4 L40.6 10.4 Z" fill="url(#gd)" stroke="#5a3606" stroke-width=".6" stroke-linejoin="round"/>` +
    `<circle cx="32" cy="3.4" r="1.15" fill="url(#gem)" stroke="#fff6d8" stroke-width=".4"/>` +
    `<circle cx="24.6" cy="3.4" r=".7" fill="#fff6d8"/><circle cx="39.4" cy="3.4" r=".7" fill="#fff6d8"/>` +
    `<path d="${crest}" fill="url(#gd)" stroke="#3a1e02" stroke-width="1" stroke-linejoin="round"/>` +
    `<path d="${band}" fill="url(#rd)"/>` +
    `<path d="${plateL}" fill="url(#obL)"/><path d="${plateR}" fill="url(#obR)"/>` +
    `<path d="M32 13 L42.7 17 L46.6 28.2 L41.6 41.6 L32 50.8 L22.4 41.6 L17.4 28.2 L21.3 17 Z" fill="none" stroke="#ffe3b0" stroke-opacity=".8" stroke-width=".7" stroke-linejoin="round"/>` +
    `<path d="M32 13.6 V50" stroke="#ffe3b0" stroke-opacity=".12" stroke-width=".5"/>` +
    `<ellipse cx="32" cy="29" rx="15" ry="8.5" fill="url(#hot)"/>` +
    `<g fill="none" stroke-linecap="round" stroke-linejoin="round" transform="translate(16.4 15.2) scale(1.3)">` +
    `<path d="${inf}" stroke="#000" stroke-opacity=".75" stroke-width="3.6" transform="translate(0 .6)"/><path d="${inf}" stroke="url(#inf)" stroke-width="3"/><path d="${inf}" stroke="#fff" stroke-opacity=".6" stroke-width=".6" transform="translate(0 -.75)"/></g>` +
    `<path d="M32 39.4 L35.2 43.4 L32 47.6 L28.8 43.4 Z" fill="url(#gem)" stroke="url(#gd)" stroke-width=".9" stroke-linejoin="round"/>` +
    `<path d="M30.9 41.6 L32 40.4 L32.9 41.6" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width=".45"/>`;
  return svg(body, defs);
}

/** Halo ring that turns slowly behind the NEKONEČNO crest (CSS rotates it). */
function nekonecnoHalo() {
  const spikes = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const long = i % 2 === 0;
    const r0 = 26.5, r1 = long ? 31.6 : 29.4, w = long ? 0.07 : 0.05;
    const p = (r, d) => `${(32 + r * Math.cos(a + d)).toFixed(2)},${(32 + r * Math.sin(a + d)).toFixed(2)}`;
    return `<polygon points="${p(r0, -w)} ${p(r1, 0)} ${p(r0, w)}"/>`;
  }).join("");
  const defs = lin("gd", [[0, "#fff6d8"], [0.5, "#ffd27a"], [1, "#c27a14"]], 0, 0, 1, 1);
  const body =
    `<circle cx="32" cy="32" r="26.5" fill="none" stroke="url(#gd)" stroke-opacity=".75" stroke-width=".8"/>` +
    `<circle cx="32" cy="32" r="24.6" fill="none" stroke="#ff3b4e" stroke-opacity=".55" stroke-width=".6" stroke-dasharray="1.2 2.6"/>` +
    `<g fill="url(#gd)" fill-opacity=".9">${spikes}</g>`;
  return svg(body, defs);
}

mkdirSync(OUT, { recursive: true });
const files = {};
for (const [id, fn] of Object.entries({ kredit, sloboda, smart, telka, optika, duo })) {
  for (let d = 4; d >= 1; d--) files[`${id}-${ROMAN[d]}.svg`] = fn(5 - d);
}
files["fiveg.svg"] = fiveg();
files["nekonecno.svg"] = nekonecno();
files["nekonecno-halo.svg"] = nekonecnoHalo();
for (const [name, text] of Object.entries(files)) writeFileSync(join(OUT, name), text);
console.log(`rank frames: ${Object.keys(files).length} files → public/ranks`);
