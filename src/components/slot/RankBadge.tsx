import { Cable, Infinity, Layers, Radio, Smartphone, Sparkles, Tv, Wallet } from "lucide-react";
import { ladderNeedle, RANKS, rankBits, type RankBreakdown, type RankFlash, type Standing } from "@/lib/slot/ranks";

const ICONS = {
  kredit: Wallet,
  sloboda: Smartphone,
  smart: Sparkles,
  telka: Tv,
  optika: Cable,
  duo: Layers,
  fiveg: Radio,
  nekonecno: Infinity,
} as const;

/** Red → green like the tachometer; chrome stays Parkizmus. */
const ARC = ["#d51f24", "#e85d18", "#f0a00a", "#f0d21c", "#b8c82e", "#6fb02a", "#2c9a42", "#176c32"] as const;

const CX = 100;
const CY = 108;
const RO = 92;
const RI = 56;

function polar(t: number, r: number): [number, number] {
  const a = Math.PI - t;
  return [CX + r * Math.cos(a), CY - r * Math.sin(t)];
}

function wedgePath(t0: number, t1: number): string {
  const [ox0, oy0] = polar(t0, RO);
  const [ox1, oy1] = polar(t1, RO);
  const [ix1, iy1] = polar(t1, RI);
  const [ix0, iy0] = polar(t0, RI);
  return `M ${ox0.toFixed(2)} ${oy0.toFixed(2)} A ${RO} ${RO} 0 0 1 ${ox1.toFixed(2)} ${oy1.toFixed(2)} L ${ix1.toFixed(2)} ${iy1.toFixed(2)} A ${RI} ${RI} 0 0 0 ${ix0.toFixed(2)} ${iy0.toFixed(2)} Z`;
}

export function RankMark({ id, size = 16 }: { id: string; size?: number }) {
  const Icon = ICONS[id as keyof typeof ICONS] ?? Wallet;
  return <Icon size={size} strokeWidth={2.4} />;
}

const FLASH_TITLE: Record<NonNullable<RankFlash["event"]>, string | null> = {
  up: null,
  down: null,
  bust: "BANKROT",
  week: "DROP",
  shield: "ŠTÍT",
  gain: null,
  loss: null,
};

interface Props {
  stand: Standing;
  delta?: number;
  streak?: number;
  parts?: RankBreakdown | null;
  perkTitle?: string;
  flash?: RankFlash | null;
  tick?: number;
  onOpen: () => void;
}

export function RankBadge({ stand, delta = 0, streak = 0, parts = null, perkTitle, flash = null, tick = 0, onOpen }: Props) {
  const n = RANKS.length;
  const needle = ladderNeedle(stand);
  const angle = -90 + needle * 180;
  const hint = parts && parts.total !== 0 ? rankBits(parts).join(" · ") : perkTitle;
  const label = `${stand.name}${stand.roman ? ` ${stand.roman}` : ""}`;
  const event = flash?.event ?? null;
  const signed = delta !== 0 ? delta : flash?.applied ?? 0;
  const gain = signed > 0;
  const loss = signed < 0;
  const pct = stand.need > 0 ? Math.min(100, (stand.into / stand.need) * 100) : 100;
  const promo =
    event === "up"
      ? `▲ ${flash?.after.roman || flash?.after.name || ""}`
      : event === "down"
        ? `▼ ${flash?.after.roman || flash?.after.name || ""}`
        : event && FLASH_TITLE[event]
          ? FLASH_TITLE[event]
          : null;
  const tone = event === "up" || event === "gain" || gain ? "gain" : event === "down" || event === "loss" || event === "week" || event === "bust" || loss ? "loss" : event === "shield" ? "gain" : "";

  return (
    <button
      type="button"
      className={`rank-chip rank-gauge rk-${stand.id}${tone ? ` is-flash is-${tone}` : ""}${event && event !== "gain" && event !== "loss" ? ` is-${event}` : ""}`}
      onClick={onOpen}
      aria-label={`Rank ${label} ${perkTitle ?? ""}`.trim()}
      title={hint}
      style={{ ["--rk" as string]: stand.color, ["--rk-ink" as string]: stand.ink, ["--needle" as string]: `${angle}deg` }}
    >
      <svg className="rank-dial" viewBox="0 8 200 118" aria-hidden="true">
        <defs>
          <linearGradient id="rk-bezel" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffe56a" />
            <stop offset="45%" stopColor="#f0c419" />
            <stop offset="100%" stopColor="#8a6a12" />
          </linearGradient>
          <radialGradient id="rk-face" cx="50%" cy="80%" r="70%">
            <stop offset="0%" stopColor="#1c242c" />
            <stop offset="100%" stopColor="#0a0d11" />
          </radialGradient>
        </defs>
        <path
          d={`M ${polar(0, 98)[0].toFixed(1)} ${polar(0, 98)[1].toFixed(1)} A 98 98 0 0 1 ${polar(Math.PI, 98)[0].toFixed(1)} ${polar(Math.PI, 98)[1].toFixed(1)}`}
          fill="none"
          stroke="url(#rk-bezel)"
          strokeWidth="5"
          strokeLinecap="butt"
        />
        <path
          d={`M ${polar(0, RI - 6)[0].toFixed(1)} ${polar(0, RI - 6)[1].toFixed(1)} A ${RI - 6} ${RI - 6} 0 0 1 ${polar(Math.PI, RI - 6)[0].toFixed(1)} ${polar(Math.PI, RI - 6)[1].toFixed(1)} L ${CX + RI - 6} ${CY} L ${CX - (RI - 6)} ${CY} Z`}
          fill="url(#rk-face)"
        />
        {ARC.map((fill, i) => {
          const t0 = (i / n) * Math.PI;
          const t1 = ((i + 1) / n) * Math.PI;
          const on = i === stand.rankIndex;
          return (
            <path
              key={RANKS[i].id}
              className={on ? "is-now" : ""}
              d={wedgePath(t0, t1)}
              fill={fill}
              stroke="#0b0d10"
              strokeWidth={on ? 1.2 : 0.7}
            />
          );
        })}
        {Array.from({ length: n + 1 }, (_, i) => {
          const t = (i / n) * Math.PI;
          const [a, b] = polar(t, RO + 1);
          const [c, d] = polar(t, RI - 1);
          return <line key={i} x1={a} y1={b} x2={c} y2={d} stroke="rgb(8 10 12 / 0.55)" strokeWidth="1.4" />;
        })}
        <g className="rank-needle">
          <polygon points="100,108 94,100 100,22 106,100" />
          <circle cx="100" cy="108" r="11" />
          <circle cx="100" cy="108" r="5.5" />
        </g>
      </svg>
      <span className="rank-hub" aria-hidden="true">
        <RankMark id={stand.id} size={14} />
      </span>
      <span className="rank-meta">
        <em>{label}</em>
        {perkTitle && !promo ? <span className="rank-perk-tag">{perkTitle}</span> : null}
      </span>
      <i className="rank-fill" aria-hidden="true">
        <b style={{ width: `${pct}%` }} />
      </i>
      {streak >= 2 && (
        <span className="rank-streak" aria-label={`Séria ${streak} výhier`}>
          {streak}
        </span>
      )}
      {signed !== 0 && (
        <strong key={tick} className={`rank-delta ${signed > 0 ? "up" : "dn"}`}>
          {signed > 0 ? `+${signed}` : signed}
        </strong>
      )}
      {promo ? <span className={`rank-promo ${tone}`}>{promo}</span> : null}
    </button>
  );
}
