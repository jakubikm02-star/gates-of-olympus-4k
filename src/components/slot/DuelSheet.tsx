import { useState } from "react";
import { formatMoney } from "@/lib/slot/format";
import { duelLeft, duelWinner, type Duel, type DuelMode } from "@/lib/slot/duel";

interface Props {
  open: boolean;
  duel: Duel | null;
  onClose: () => void;
  onStart: (mode: DuelMode, a: string, b: string) => void;
  onSwap: () => void;
  onEnd: () => void;
}

export function DuelSheet({ open, duel, onClose, onStart, onSwap, onEnd }: Props) {
  const [a, setA] = useState("HRÁČ 1");
  const [b, setB] = useState("HRÁČ 2");
  const [mode, setMode] = useState<DuelMode>("spins");

  if (duel?.phase === "swap") {
    return (
      <div className="modal-back" role="presentation">
        <div className="modal-card spend-card" role="dialog" aria-labelledby="duel-title">
          <header className="modal-head">
            <h2 id="duel-title">PREDÁŠ TELEFÓN</h2>
          </header>
          <p className="modal-lead">
            {duel.seats[0].name} má {formatMoney(duel.seats[0].score)}. Teraz točí {duel.seats[1].name} — rovnaká
            stávka {formatMoney(duel.bet)}.
          </p>
          <button type="button" className="chip-btn gold" onClick={onSwap}>
            HRAJ {duel.seats[1].name}
          </button>
        </div>
      </div>
    );
  }

  if (duel?.phase === "done") {
    const w = duelWinner(duel);
    const title = w === null ? "REMÍZA" : `VYHRAL ${duel.seats[w].name}`;
    return (
      <div className="modal-back" role="presentation">
        <div className="modal-card spend-card" role="dialog" aria-labelledby="duel-title">
          <header className="modal-head">
            <h2 id="duel-title">{title}</h2>
          </header>
          <p className="modal-lead">
            {duel.seats[0].name} {formatMoney(duel.seats[0].score)} · {duel.seats[1].name}{" "}
            {formatMoney(duel.seats[1].score)}
          </p>
          <button type="button" className="chip-btn gold" onClick={onEnd}>
            HOTOVO
          </button>
        </div>
      </div>
    );
  }

  if (!open) return null;
  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <div
        className="modal-card spend-card"
        role="dialog"
        aria-labelledby="duel-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2 id="duel-title">DUEL PRI STOLE</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Zavrieť">
            ×
          </button>
        </header>
        <p className="modal-lead">
          Dvaja pri jednom zariadení, ako dva automaty vedľa seba. Rovnaká stávka, rovnaký počet točení. Vyšší súčet
          výhier vyhráva. Stávka sa zamkne. Parknet kúpa v 10 točeniach nejde — na LIVE mód daj 1× PARKNET.
        </p>
        <label className="duel-field">
          Hráč 1
          <input value={a} onChange={(e) => setA(e.target.value)} maxLength={16} />
        </label>
        <label className="duel-field">
          Hráč 2
          <input value={b} onChange={(e) => setB(e.target.value)} maxLength={16} />
        </label>
        <div className="spend-jobs">
          <button type="button" className={`spend-job ${mode === "spins" ? "stred" : "lacna"}`} onClick={() => setMode("spins")}>
            <em>10 TOČENÍ</em>
            <span>Každý desať spinov. Potom predáš zariadenie.</span>
          </button>
          <button type="button" className={`spend-job ${mode === "live" ? "draha" : "lacna"}`} onClick={() => setMode("live")}>
            <em>1× LIVE</em>
            <span>Každý kúpi PARKNET. Väčší bonus vyhráva.</span>
          </button>
        </div>
        <button type="button" className="chip-btn gold" onClick={() => onStart(mode, a, b)}>
          ZAČNI DUEL
        </button>
      </div>
    </div>
  );
}

export function DuelBar({ duel }: { duel: Duel }) {
  const left = duelLeft(duel);
  const me = duel.seats[duel.turn];
  return (
    <div className="duel-bar" aria-live="polite">
      <span className={duel.turn === 0 ? "on" : ""}>
        {duel.seats[0].name}
        <b>{formatMoney(duel.seats[0].score)}</b>
      </span>
      <em>
        VS · {me.name} · ešte {left}
      </em>
      <span className={duel.turn === 1 ? "on" : ""}>
        {duel.seats[1].name}
        <b>{formatMoney(duel.seats[1].score)}</b>
      </span>
    </div>
  );
}
