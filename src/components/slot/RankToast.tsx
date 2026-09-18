import { RankMark } from "./RankBadge";
import { rankBits, type RankFlash } from "@/lib/slot/ranks";

interface Props {
  flash: RankFlash | null;
  onDone: () => void;
}

export function RankToast({ flash, onDone }: Props) {
  if (!flash || !flash.event) return null;
  const stand = flash.after;
  const title =
    flash.event === "up"
      ? "RANK UP"
      : flash.event === "down"
        ? "RANK DOWN"
        : flash.event === "bust"
          ? "BANKROT"
          : "ŠTÍT";
  const sub =
    flash.event === "shield"
      ? "Demotion hold — ďalšia prehra zhodí rank"
      : flash.event === "bust"
        ? `Dobitie +5000 · ${flash.applied} RP`
        : `${flash.before.name}${flash.before.roman ? ` ${flash.before.roman}` : ""}  →  ${stand.name}${stand.roman ? ` ${stand.roman}` : ""}`;
  const bits = flash.parts ? rankBits(flash.parts) : [];
  return (
    <button
      type="button"
      className={`rank-toast rk-${stand.id} is-${flash.event}`}
      onClick={onDone}
      style={{ ["--rk" as string]: stand.color, ["--rk-ink" as string]: stand.ink }}
    >
      <span className="rank-shield lg" aria-hidden="true">
        <RankMark id={stand.id} size={26} />
      </span>
      <span>
        <b>{title}</b>
        <em>
          {stand.name}
          {stand.roman ? ` ${stand.roman}` : ""}
        </em>
        <small>{sub}</small>
        {bits.length > 0 && <i className="rank-toast-bits">{bits.join(" · ")}</i>}
      </span>
    </button>
  );
}
