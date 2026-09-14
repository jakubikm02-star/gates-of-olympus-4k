import { Cable, Infinity, Layers, Radio, Smartphone, Sparkles, Tv, Wallet } from "lucide-react";
import type { Standing } from "@/lib/slot/ranks";

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

export function RankMark({ id, size = 16 }: { id: string; size?: number }) {
  const Icon = ICONS[id as keyof typeof ICONS] ?? Wallet;
  return <Icon size={size} strokeWidth={2.4} />;
}

interface Props {
  stand: Standing;
  delta?: number;
  onOpen: () => void;
}

export function RankBadge({ stand, delta = 0, onOpen }: Props) {
  const pct = stand.need > 0 ? Math.min(100, (stand.into / stand.need) * 100) : 100;
  return (
    <button
      type="button"
      className={`rank-chip rk-${stand.id}`}
      onClick={onOpen}
      aria-label={`Rank ${stand.name} ${stand.roman}`.trim()}
      style={{ ["--rk" as string]: stand.color, ["--rk-ink" as string]: stand.ink }}
    >
      <span className="rank-shield" aria-hidden="true">
        <RankMark id={stand.id} size={16} />
      </span>
      <span className="rank-meta">
        <em>
          {stand.name}
          {stand.roman ? ` ${stand.roman}` : ""}
        </em>
        <i className="rank-mini">
          <b style={{ width: `${pct}%` }} />
        </i>
      </span>
      {delta !== 0 && (
        <strong className={`rank-delta ${delta > 0 ? "up" : "dn"}`}>
          {delta > 0 ? `+${delta}` : delta}
        </strong>
      )}
    </button>
  );
}
