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
            <img src="/symbols/can.png" alt="" className="pay-ico" />
            <div>
              <div className="pay-name">Energy plechovka · násobič</div>
              <div className="pay-vals">
                <span>2×–500×</span>
              </div>
              <div className="pay-quip">Rampa ju hodí. Bez výhry prepadne.</div>
            </div>
          </div>
          <div className="pay-row">
            <img src={SCATTER.src} alt="" className="pay-ico" />
            <div>
              <div className="pay-name">{SCATTER.name} · scatter</div>
              <div className="pay-vals">
                <span>4 = {(SCATTER.pays[0] * bet).toFixed(2)} + 15 FS</span>
                <span>5 = {(SCATTER.pays[1] * bet).toFixed(2)}</span>
                <span>6 = {(SCATTER.pays[2] * bet).toFixed(2)}</span>
              </div>
              <div className="pay-quip">Štyri obrazovky a rampa ide hore.</div>
            </div>
          </div>
        </div>
        <ul className="rules">
          <li>8 a viac rovnakých symbolov kdekoľvek. Žiadne línie. 7/8 je near-miss, nie výhra.</li>
          <li>
            4 a viac scatterov kdekoľvek na obrazovke — aj počas tumble — spustí 15 free spins.
            Scatter ostane na poli, kým bonus nezačne.
          </li>
          <li>Výherné symboly zmiznú, nové spadnú zhora (tumble). Plechovky a scatter tumble prežijú.</li>
          <li>Násobiče nepadajú z valca ako RJ45. Rampa ich pustí ako energy plechovky. Aktivujú sa až na konci reťaze, a len ak bola výhra.</li>
          <li>Base: súčet plechoviek × celá tumble sekvencia. Vo FS tečú do globálneho metra; bez výhry prepadnú.</li>
          <li>4 scatteri = 15 voľných točení. V bonuse 3+ scatteri = +5. Pay scatteru ostáva 4 / 5 / 6.</li>
          <li>Ante základ 1.25× stávka dvíha P(bonus). Od SMART ligy ante 1.20×. Vo FS sa ante vypína.</li>
          <li>
            KONTROLA má vlastný PITY meter na každú stávku (100). Iba mŕtvy spin (+2) a 3 / 4 scattere
            (+20 / +35) na tej stávke. Po spustení bar padne na 0 — pretečenie sa neprenáša. Kúpiť sa nedá.
          </li>
          <li>
            Kredit, pity aj rank sa ukladajú v tomto prehliadači. Bez účtu — po vymazaní dát prehliadača
            sa zostatok resetuje. PARK POOL je globálny (jeden jackpot pre všetkých). Bankrot +5000 berie
            RP podľa stávky (max bet dump ≈ −800, opakované dobitie násobí). 80 platených spinov bez
            dobitia sériu trestov vynuluje.
          </li>
          <li>
            Ranked liga 4ky: KREDIT → SLOBODA → SMART → 4KA TV → OPTIKA → DUO → 5G NA DOMA → NEKONEČNO.
            Raz za týždeň klesáš o jednu skupinu na IV predchádzajúcej ligy (4KA TV II → SMART IV). AFK max
            3 skupiny. Štít nechráni.
            RP za sumu výhry, výšku stávky, násobič, sériu, tumble, BIG+ bannery, FS total, retrigger a
            KONTROLU. Vyššia stávka priamo pridáva RP (1 € ≈ +3, 10 € ≈ +10, 100 € ≈ +19). Aktívna liga
            dáva herný perk (lacnejšie ante, pity, cashback, extra FS, zľava na kúpu, sticky plechovky) — nenásobí RP. Ante pri výhre
            +1. Mŕtvy spin berie nízke entry. 100× ťa nevyhodí o celý rank. Po postupe buffer 40 RP a štít.
          </li>
          <li>
            PARK POOL: 1.2 % z každej platenej stávky (max 12) ide do spoločného jackpotu. Seed 2 500,
            must-drop na 18 000. Šanca ~1/480 × lístky z tvojej ligy × škála stávky. Lístky: KREDIT 1 →
            NEKONEČNO 4. Výhra ide hráčovi, pool sa resetne na seed.
          </li>
          <li>
            Win popup ako na Olympuse: BIG WIN od 20× stávky, MEGA WIN od 35×, SUPER MEGA WIN od 50×.
            MAX WIN 5000× ukončí feature.
          </li>
          <li>Kúpa FS = 100× základná stávka (95× od 5G, 90× v NEKONEČNE). Ante sa na kúpu nevzťahuje. Do ranku sa kúpa ráta ako 100 točení: výhra z FS ide voči cene kúpy (250 € z 100 € = 2.5×, nie 250×). Prehra berie entry ako mŕtve spiny, max jedna divízia. Max 5000× je cap celej feature — potom FEATURE TERMINATED.</li>
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
