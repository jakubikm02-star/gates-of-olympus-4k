import { useEffect } from "react";
import { MATH_NOTE, PAY_SYMBOLS, SCATTER } from "@/lib/slot/symbols";

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
          8+ kdekoľvek na 6×5. Stávka {bet.toFixed(2)}. Demo — žiadne vklady.
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
                <div className="pay-quip">{s.quip}</div>
              </div>
            </div>
          ))}
          <div className="pay-row">
            <img src={SCATTER.src} alt="" className="pay-ico" />
            <div>
              <div className="pay-name">{SCATTER.name} · scatter</div>
              <div className="pay-vals">
                <span>4 = {(SCATTER.pays[0] * bet).toFixed(2)} + 15 FS</span>
                <span>5 = {(SCATTER.pays[1] * bet).toFixed(2)}</span>
                <span>6 = {(SCATTER.pays[2] * bet).toFixed(2)}</span>
              </div>
              <div className="pay-quip">Štyri obrazovky a Zeus otvorí bránu.</div>
            </div>
          </div>
        </div>
        <ul className="rules">
          <li>8 a viac rovnakých symbolov kdekoľvek. Žiadne línie. 7/8 je near-miss, nie výhra.</li>
          <li>Výherné symboly zmiznú, nové spadnú zhora (tumble). Orby a scatter tumble prežijú.</li>
          <li>Násobiče nepadajú z valca ako RJ45. Zeus ich hodí. Aktivujú sa až na konci reťaze, a len ak bola výhra.</li>
          <li>Base: súčet orbov × celá tumble sekvencia. Vo FS orby tečú do globálneho metra; bez výhry gule prepadnú.</li>
          <li>4 scatteri = 15 voľných točení. V bonuse 3+ scatteri = +5. Pay scatteru ostáva 4 / 5 / 6.</li>
          <li>Ante 1.25× stávka dvíha P(bonus) približne na dvojnásobok cez binom, nie surový ×2 na bunke. Vo FS sa ante vypína.</li>
          <li>Kúpa FS = 100× základná stávka. Ante sa na kúpu nevzťahuje. Max 5000× je cap celej feature, nie jedného spinu — potom FEATURE TERMINATED.</li>
          <li>
            Simulácia {MATH_NOTE.spins.toLocaleString("sk-SK")} spinov: RTP {(MATH_NOTE.rtp * 100).toFixed(1)} %,
            hit {(MATH_NOTE.hit * 100).toFixed(1)} %, bonus 1/{MATH_NOTE.bonusEvery}, kúpa vracia{" "}
            {(MATH_NOTE.buyEv * 100).toFixed(0)}× z 100×. High-vol demo, nie certifikát 96.50 %.
          </li>
        </ul>
        <details className="math-box">
          <summary>MATH</summary>
          <p>
            {MATH_NOTE.spins.toLocaleString("sk-SK")} paid spinov, rovnaký engine ako hra. Hit rate{" "}
            {(MATH_NOTE.hit * 100).toFixed(2)} %. Bonus každých {MATH_NOTE.bonusEvery} točení, s ante 1/
            {MATH_NOTE.anteBonusEvery}. Buy EV {MATH_NOTE.buyEv.toFixed(2)} (100× stávka, ante off). Max 5000×{" "}
            {MATH_NOTE.maxEvery ? `~1/${MATH_NOTE.maxEvery}` : "v tejto vzorke 0×"}.
          </p>
        </details>
      </div>
    </div>
  );
}
