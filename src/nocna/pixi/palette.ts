export interface Palette {
  bg: number;
  text: number;
  accent: number;
  btn: number;
  ink: number;
  metal: number;
  glow: number;
  danger: number;
  hp: number;
  shield: number;
  plate: number;
}

const FALLBACK: Palette = {
  bg: 0x07080c,
  text: 0xf6f1e7,
  accent: 0xf0c419,
  btn: 0xf2bb0c,
  ink: 0x1a1204,
  metal: 0x8d8678,
  glow: 0xffe56a,
  danger: 0xe23b3b,
  hp: 0xff4d4d,
  shield: 0x3ec6e0,
  plate: 0x141820,
};

export function readPalette(el: Element | null): Palette {
  if (!el || typeof getComputedStyle !== "function") return FALLBACK;
  const style = getComputedStyle(el);
  const pick = (name: string, fb: number) => cssColor(style.getPropertyValue(name), fb);
  return {
    bg: pick("--ns-bg", FALLBACK.bg),
    text: pick("--ns-text", FALLBACK.text),
    accent: pick("--ns-accent", FALLBACK.accent),
    btn: pick("--ns-btn", FALLBACK.btn),
    ink: pick("--ns-btn-ink", FALLBACK.ink),
    metal: pick("--ns-metal", FALLBACK.metal),
    glow: pick("--ns-glow", FALLBACK.glow),
    danger: pick("--ns-danger", FALLBACK.danger),
    hp: pick("--ns-hp", FALLBACK.hp),
    shield: pick("--ns-shield", FALLBACK.shield),
    plate: pick("--ns-plate", FALLBACK.plate),
  };
}

function cssColor(raw: string, fallback: number) {
  const v = raw.trim();
  if (!v) return fallback;
  if (v.startsWith("#")) {
    const h = v.slice(1);
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
    const n = Number.parseInt(full, 16);
    return Number.isFinite(n) ? n : fallback;
  }
  const m = v.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (!m) return fallback;
  return (Number(m[1]) << 16) + (Number(m[2]) << 8) + Number(m[3]);
}
