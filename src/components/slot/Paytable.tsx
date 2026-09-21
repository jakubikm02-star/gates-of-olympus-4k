import { useEffect } from "react";
import { MATH_NOTE, PAY_SYMBOLS, SCATTER, TICKETS } from "@/lib/slot/symbols";

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
                <span>2 3 4 5 6 8 10 12 15</span>
                <span>20 25 50 100 250 500</span>
              </div>
              <div className="pay-quip">Rampa ich hodí. Sčítajú sa, nenásobia. Bez výhry prepadnú.</div>
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
          <div className="pay-row">
            <img src={TICKETS.ulica.src} alt="" className="pay-ico" />
            <div>
              <div className="pay-name">LÍSTOK · jediný kľúč k potu</div>
              <div className="pay-vals">
                <span>SIVÝ ULICA</span>
                <span>MODRÝ OKRES</span>
                <span>FIALOVÝ KRAJ</span>
                <span>ZLATÝ ŠTÁT</span>
              </div>
              <div className="pay-quip">Neplatí 8+. Neskáče do SIGNÁL. Max 1 na spin.</div>
            </div>
          </div>
        </div>
        <ul className="rules">
          <li>
            Štyri poty: ULICA 500 / 1 800, OKRES 4 000 / 14 000, KRAJ 28 000 / 90 000, ŠTÁT 120 000 / 220 000.
            Padnú len cez LÍSTOK po resolve tumble — nikdy mystery mid-tumble, nikdy 8+, nikdy SIGNÁL.
            Must-hit: keď meter prekročí skrytý prah, tá farba je do 15 spinov, 16. spin ju donúti. ŠTÁT 70 / 15 / 15.
          </li>
          <li>
            4 a viac scatterov kdekoľvek na obrazovke — aj počas tumble — spustí 15 free spins.
            Scatter ostane na poli, kým bonus nezačne. 4tv trigger bije lístok: ceremónia čaká.
          </li>
          <li>Výherné symboly zmiznú, nové spadnú zhora (tumble). Plechovky, scatter aj lístok tumble prežijú.</li>
          <li>Násobiče nepadajú z valca ako RJ45. Rampa ich pustí ako energy plechovky. 15 hodnôt, sčítajú sa (50+100=150, nie 5 000). Aktivujú sa až na konci reťaze, a len ak bola výhra. 2/3/5 sú ~70 % plechoviek; 500× je vzácnejšia ako PDF 8+.</li>
          <li>Base: súčet plechoviek × celá tumble sekvencia, potom reset. Vo FS tečú do SIGNÁL a ostávajú; bez výhry prepadnú ako tapeta.</li>
          <li>4 scattere = 15 voľných točení. V bonuse 3+ scattere = +5. Výplata scatteru ostáva 4 / 5 / 6.</li>
          <li>
            Lístok vo feature smie padnúť, ceremónia ide až po SIEŤ SPADLA. Banner je{" "}
            <code>ULICA · 1 742,20</code> — žiadny WinBox, žiadny terminál.
          </li>
          <li>Ante 1.20× zdvojnásobí 4tv, nie šancu lístka. Buy 100× = LIVE so SIGNÁL 0×. Pity je IDLE meter, nikdy jackpot.</li>
          <li>
            KONTROLA má vlastný PITY meter na každú stávku (100). Iba mŕtvy spin (+2) a 3 / 4 scattere
            (+30). Po spustení bar padne na 0. Kúpiť sa nedá.
          </li>
          <li>
            Od kreditu 100 € zákazky: tri na výber, alebo namiešaná náhoda s bonusovou výhrou. Cena aj výhra
            podľa banku a stávky. Po prijatí ostane stávka zamknutá do konca termínu. Kúpa PARKNET sa do
            zákazky nepočíta — postup ide len zo základnej hry. Duel pri stole: dvaja na jednom zariadení, 10
            točení alebo 1× PARKNET, vyššia výhra vyhráva.
          </li>
          <li>
            Kredit, pity aj rank sa ukladajú v tomto prehliadači. Bankrot +5000 berie RP podľa stávky.
            80 platených spinov bez dobitia sériu trestov vynuluje.
          </li>
          <li>
            Ranked liga 4ky: KREDIT → SLOBODA → SMART → 4KA TV → OPTIKA → DUO → 5G NA DOMA → NEKONEČNO.
            Raz za týždeň klesáš o jednu skupinu. RP za reálne vyhrané eurá a za stávku.
          </li>
          <li>
            Win popup ako na Olympuse: BIG WIN od 20× stávky, MEGA WIN od 35×, SUPER MEGA WIN od 50×.
            MAX WIN 5000× ukončí feature.
          </li>
          <li>
            Kúpa voľných točení = 100× základná stávka (95× od 5G, 90× v NEKONEČNE). Ante sa na kúpu nevzťahuje.
            Do ranku sa kúpa ráta ako 100 točení. Max 5000× je strop celej feature — potom FEATURE TERMINATED.
          </li>
          <li>
            Simulácia {MATH_NOTE.spins.toLocaleString("sk-SK")} spinov: base RTP {(MATH_NOTE.rtp * 100).toFixed(1)} % +
            jackpot ~2.3 % contribution = tvar 96.5. Hit {(MATH_NOTE.hit * 100).toFixed(1)} %, bonus 1/{MATH_NOTE.bonusEvery}, kúpa vracia{" "}
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
