import { Truck, Ticket, TriangleAlert, MapPinned } from "lucide-react";
import { formatMoney } from "@/lib/slot/format";
import type { PickTile } from "@/lib/slot/pick-bonus";

interface Props {
  tiles: PickTile[];
  revealed: boolean[];
  ended: boolean;
  totalX: number;
  bet: number;
  killId: number | null;
  picks: number;
  onPick: (id: number) => void;
  onDone: () => void;
}

function BayIcon({ kind }: { kind: PickTile["kind"] }) {
  if (kind === "odtah") return <Truck size={22} strokeWidth={2.2} />;
  if (kind === "pokuta") return <TriangleAlert size={22} strokeWidth={2.2} />;
  if (kind === "zona") return <MapPinned size={22} strokeWidth={2.2} />;
  return <Ticket size={22} strokeWidth={2.2} />;
}

export function PickBonus({ tiles, revealed, ended, totalX, bet, killId, picks, onPick, onDone }: Props) {
  const cash = +(totalX * bet).toFixed(2);

  return (
    <div className="pk-back" role="dialog" aria-label="Kontrola parkovania">
      <div className="pk-app">
        <header className="pk-bar">
          <span className="pk-dot" aria-hidden="true" />
          <div>
            <strong>MESTSKÁ KONTROLA</strong>
            <em>záznam priestupku · live</em>
          </div>
          <span className="pk-chip">ZÓNA 1</span>
        </header>

        <div className="pk-alert">
          <b>ZAPARKOVALI STE NESPRÁVNE</b>
          <span>
            {ended
              ? "Odťah ukončil kontrolu. Potvrď pokutu."
              : "Ťukni na státie. Prvý ODŤAH končí záznam."}
          </span>
        </div>

        <div className="pk-bays">
          {tiles.map((tile) => {
            const open = revealed[tile.id];
            const killer = ended && tile.id === killId;
            return (
              <button
                key={tile.id}
                type="button"
                className={`pk-bay ${open ? `is-open is-${tile.kind}` : ""} ${killer ? "is-kill" : ""}`}
                disabled={ended || open}
                onClick={() => onPick(tile.id)}
                aria-label={open ? tile.title : `Státie ${tile.id + 1}`}
              >
                <span className="pk-stall">P{tile.id + 1}</span>
                {open ? (
                  <span className="pk-face">
                    <BayIcon kind={tile.kind} />
                    <strong>{tile.title}</strong>
                    {tile.payX > 0 ? <em>{formatMoney(+(tile.payX * bet).toFixed(2))}</em> : <em>{tile.note}</em>}
                  </span>
                ) : (
                  <span className="pk-face is-blank">
                    <span className="pk-u" aria-hidden="true" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <footer className="pk-foot">
          <div className="pk-sum">
            <span>SUMÁR · {picks} státí</span>
            <b>{formatMoney(cash)}</b>
          </div>
          {ended ? (
            <button type="button" className="pk-done" onClick={onDone}>
              POTVRDIŤ POKUTU
            </button>
          ) : (
            <p className="pk-hint">Tri odťahy v lotérii · kým nepadne prvý, zbieraš lístky</p>
          )}
        </footer>
      </div>
    </div>
  );
}
