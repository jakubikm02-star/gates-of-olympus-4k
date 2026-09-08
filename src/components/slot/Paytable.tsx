import { useEffect } from "react";
import { PAY_SYMBOLS, SCATTER } from "@/lib/slot/symbols";

interface Props {
  open: boolean;
  onClose: () => void;
  bet: number;
}

export function Paytable({ open, onClose, bet }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <div
        className="modal-card"
        role="dialog"
        aria-labelledby="pay-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2 id="pay-title">Výplatná tabuľka</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Zavrieť">
            ×
          </button>
        </header>
        <p className="modal-lead">
          Výhra za 8–9 / 10–11 / 12+ rovnakých symbolov kdekoľvek na 6×5 poli. Stávka{" "}
          {bet.toFixed(2)}.
        </p>
        <div className="pay-list">
          {[...PAY_SYMBOLS].reverse().map((s) => (
            <div key={s.id} className="pay-row">
              <img src={s.src} alt="" className="pay-ico" />
              <div>
                <div className="pay-name">{s.name}</div>
                <div className="pay-vals">
                  <span>8+ {(s.pays[0] * bet).toFixed(2)}</span>
                  <span>10+ {(s.pays[1] * bet).toFixed(2)}</span>
                  <span>12+ {(s.pays[2] * bet).toFixed(2)}</span>
                </div>
              </div>
            </div>
          ))}
          <div className="pay-row">
            <img src={SCATTER.src} alt="" className="pay-ico" />
            <div>
              <div className="pay-name">{SCATTER.name} · scatter</div>
              <div className="pay-vals">
                <span>4 = {(SCATTER.pays[0] * bet).toFixed(2)} + FS</span>
                <span>5 = {(SCATTER.pays[1] * bet).toFixed(2)}</span>
                <span>6 = {(SCATTER.pays[2] * bet).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
        <ul className="rules">
          <li>8 a viac rovnakých symbolov kdekoľvek na poli sa vypláca. Žiadne línie.</li>
          <li>Výherné symboly zmiznú, nové spadnú zhora (tumble).</li>
          <li>Zlaté gule sú násobiče. Aktivujú sa až keď Zeus hodí blesk — na konci tumble reťaze, a len ak bola výhra.</li>
          <li>Vo voľných točeniach Zeus zbiera gule do globálneho násobiča. Bez výhry gule prepadnú.</li>
          <li>4 scatteri spustia 15 voľných točení. Ďalšie 4+ počas FS pridajú +5.</li>
          <li>Ante (1.25× stávka) zdvojnásobí šancu na scatter. Kúpa bonusu stojí 100× stávku.</li>
          <li>Maximálna výhra 5000× stávka. Toto je demo — žiadne skutočné peniaze.</li>
        </ul>
      </div>
    </div>
  );
}
