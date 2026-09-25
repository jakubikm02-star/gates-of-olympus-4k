import { useEffect, useRef } from "react";
import { MATH_NOTE, PAY_SYMBOLS, SCATTER, TICKETS } from "@/lib/slot/symbols";
import { formatMoney } from "@/lib/slot/format";
import { unlockAudio } from "@/lib/slot/audio";
import type { DeskDay } from "@/lib/slot/desk-api";

interface Props {
  open: boolean;
  onClose: () => void;
  bet: number;
  desk?: DeskDay;
  mine?: DeskDay;
}

const SOUND_CUES: { name: string; src: string; loop?: boolean; when: string }[] = [
  { name: "Klik", src: "/sfx/click.mp3", when: "Tlačidlá, stávka, ante, menu." },
  { name: "Točenie", src: "/sfx/spin.mp3?v=trailer1", loop: true, when: "Slučka od štartu točenia, kým valce bežia. Pri 2+ scatteroch stíchne." },
  { name: "Dopad 1", src: "/sfx/land.mp3?v=keys1", when: "Náhodne jeden z troch, keď stĺpec zastane." },
  { name: "Dopad 2", src: "/sfx/land2.mp3?v=keys1", when: "Náhodne jeden z troch, keď stĺpec zastane." },
  { name: "Dopad 3", src: "/sfx/land3.mp3?v=keys1", when: "Náhodne jeden z troch, keď stĺpec zastane." },
  { name: "Scatter", src: "/sfx/scatter.mp3", when: "1. a 2. scatter pri dopade alebo v páde." },
  { name: "Harfa", src: "/sfx/harp.mp3", when: "3. scatter. Spolu s ním ide aj Zber." },
  { name: "Hrom", src: "/sfx/thunder.mp3?v=park1", when: "4. scatter, hod plechoviek, +5 FS, ohlásenie free spinov a neúspešný tiket." },
  { name: "Napätie", src: "/sfx/bonus-loop.mp3?v=4ka1", loop: true, when: "Base, keď sú 2+ scattere a valce ešte idú." },
  { name: "Minca", src: "/sfx/coin.mp3", when: "Výhra v sekvencii pod 5×. Aj splnený tiket." },
  { name: "Výhra", src: "/sfx/win.mp3?v=phaser1", when: "Výhra v sekvencii od 5× do 20×." },
  { name: "Výhra plná", src: "/sfx/win-full.mp3?v=tumble2", when: "Výhra v sekvencii od 20×." },
  { name: "Prasknutie", src: "/sfx/pop.mp3?v=pneumatic1", when: "Výherné symboly zmiznú pred pádom." },
  { name: "Pád", src: "/sfx/tumble.mp3?v=mech1", when: "Nové symboly padnú. Ďalší pád je o niečo vyšší." },
  { name: "Plechovka", src: "/sfx/can-open.mp3?v=open2", when: "Dopad plechovky a jej započítanie do výhry." },
  { name: "Rampa", src: "/sfx/zap.mp3?v=park1", when: "Plechovka po páde. Spolu s ňou ide aj Elektrika." },
  { name: "Elektrika", src: "/sfx/electric.mp3?v=park1", when: "Spolu s Rampou pri plechovke po páde." },
  { name: "Zber", src: "/sfx/collect.mp3", when: "Výhra lístka (pot) a tretí scatter." },
  { name: "Výplata", src: "/sfx/payout.mp3", when: "Výhra sa pripíše na kredit v base, mimo duelu." },
  { name: "Štart feature", src: "/sfx/fs-start.mp3?v=build1", when: "Začiatok PARKNET / 4ka TV." },
  { name: "Podklad feature", src: "/sfx/fs-bed.mp3?v=moon2", loop: true, when: "Počas celej feature. V hre naskočí na náhodnom mieste skladby." },
  { name: "Kontrola", src: "/sfx/kontrola.mp3?v=ignition1", when: "Štart KONTROLA." },
  { name: "Big win A", src: "/sfx/table-a.mp3?v=glitch1", when: "Náhodne A alebo B: BIG od 20×, MEGA od 35×, SUPER MEGA od 50×, aj koniec feature s výhrou. MAX 5000× hrá to isté." },
  { name: "Big win B", src: "/sfx/table-b.mp3?v=fail1", when: "Náhodne A alebo B pri veľkej výhre a na konci feature." },
];

function SoundSheet() {
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    return () => {
      audio.current?.pause();
    };
  }, []);
  const play = (src: string, loop = false) => {
    unlockAudio();
    if (!audio.current) audio.current = new Audio();
    const el = audio.current;
    el.pause();
    el.loop = loop;
    el.src = src;
    el.volume = 0.85;
    void el.play();
  };
  const stop = () => {
    audio.current?.pause();
  };
  return (
    <details className="sound-sheet">
      <summary>ZVUKY · prehrať a kedy hrajú</summary>
      <p className="sound-note">Tlačidlo (i) dole vľavo. Slučky zastav tlačidlom Stop. Stlmenie hry tento náhľad nestíši.</p>
      {SOUND_CUES.map((cue) => (
        <div className="sound-row" key={cue.src}>
          <button type="button" onClick={() => play(cue.src, cue.loop)}>
            {cue.loop ? "Slučka" : "Hraj"}
          </button>
          <div>
            <b>{cue.name}</b>
            <span>{cue.when}</span>
          </div>
        </div>
      ))}
      <div className="sound-row">
        <button type="button" onClick={stop}>
          Stop
        </button>
        <div>
          <b>Stop</b>
          <span>Zastaví náhľad. Hru nechá bežať.</span>
        </div>
      </div>
    </details>
  );
}

export function Paytable({ open, onClose, bet, desk, mine }: Props) {
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
        <SoundSheet />
        {desk && mine ? (
          <div className="atm-desk in-info" aria-label="Dnešný counter automatu">
            <header>
              <span>PARK BANK</span>
              <b>DNES</b>
            </header>
            <p className="atm-kicker">COUNTER AUTOMATU · VŠETCI HRÁČI · ťukni aj na poty</p>
            <dl>
              <div>
                <dt>PRETOČENÉ</dt>
                <dd>{formatMoney(desk.wagered)}</dd>
                <dd className="atm-me">TY {formatMoney(mine.wagered)}</dd>
              </div>
              <div>
                <dt>VÝHRY</dt>
                <dd>{formatMoney(desk.paid)}</dd>
                <dd className="atm-me">TY {formatMoney(mine.paid)}</dd>
              </div>
              <div>
                <dt>MAX</dt>
                <dd>{formatMoney(desk.best)}</dd>
                <dd className="atm-me">TY {formatMoney(mine.best)}</dd>
              </div>
            </dl>
            <p className="atm-kicker atm-ticket-kicker">TIKETY · LEN TY · MIMO OBRATU</p>
            <dl className="atm-tickets">
              <div>
                <dt>VYHRANÉ</dt>
                <dd>{formatMoney(mine.ticketWon)}</dd>
                <dd className="atm-me">vyplatená výhra</dd>
              </div>
              <div>
                <dt>PREHRANÉ</dt>
                <dd className="is-loss">{formatMoney(mine.ticketLost)}</dd>
                <dd className="atm-me">stávka zlyhaného</dd>
              </div>
            </dl>
          </div>
        ) : null}
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
              <div className="pay-quip">Rampa ich hodí. Sčítajú sa, nenásobia. Bez výhry ostanú, efekt nenastane.</div>
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
                <span>SIVÝ 1-FTTB</span>
                <span>MODRÝ 2-FTTB</span>
                <span>FIALOVÝ 3-FTTB</span>
                <span>ZLATÝ 4-FTTB</span>
              </div>
              <div className="pay-quip">Neplatí 8+. Neskáče do Mbps. Max 1 na spin.</div>
            </div>
          </div>
        </div>
        <ul className="rules">
          <li>
            Štyri poty od najnižšieho: 1-FTTB 500 / 1 800, 2-FTTB 4 000 / 14 000, 3-FTTB 28 000 / 90 000, 4-FTTB 120 000 / 220 000.
            Padnú len cez LÍSTOK po resolve tumble — nikdy mystery mid-tumble, nikdy 8+, nikdy Mbps.
            Must-hit: keď meter prekročí skrytý prah, tá farba je do 15 spinov, 16. spin ju donúti. 4-FTTB 70 / 15 / 15.
          </li>
          <li>
            4 a viac scatterov kdekoľvek na obrazovke — aj počas tumble — spustí 15 free spins.
            Scatter ostane na poli, kým bonus nezačne. 4ka TV trigger bije lístok: ceremónia čaká.
          </li>
          <li>Výherné symboly zmiznú, nové spadnú zhora (tumble). Plechovky, scatter aj lístok tumble prežijú.</li>
          <li>Násobiče nepadajú z valca ako RJ45. Rampa ich pustí ako energy plechovky. 15 hodnôt, sčítajú sa (50+100=150, nie 5 000). Aktivujú sa až na konci reťaze, a len ak bola výhra. 2–5 sú asi 72 % plechoviek, priemer ~7×.</li>
          <li>Base: súčet plechoviek × celá tumble sekvencia, potom reset. Vo FS sa plechovka pripočíta do Mbps len na výhernom spine a najprv sa sčíta (50+5=55), potom sa sekvencia zapíše ako 55× tumble. Výhra bez novej plechovky je samotný tumble — uložený Mbps sa na ňu nepúšťa. Bez výhry ostanú na mieste a nič sa nestane.</li>
          <li>4 scattere = 15 voľných točení. V bonuse 3+ scattere = +5. Výplata scatteru je 3× / 5× / 100×.</li>
          <li>
            Lístok vo feature smie padnúť, ceremónia ide až po SIEŤ SPADLA. Banner je{" "}
            <code>1-FTTB · 1 742,20</code> — žiadny WinBox, žiadny terminál.
          </li>
          <li>Ante zdvojnásobí 4ka TV, nie šancu lístka. Od SMART stojí 1,22× namiesto 1,25×. Buy je vždy 100×. Pity je IDLE meter, nikdy jackpot.</li>
          <li>
            KONTROLA má vlastný PITY meter na každú stávku (100). Iba mŕtvy spin (+2) a 3 / 4 scattere
            (+30). Po spustení bar padne na 0. Kúpiť sa nedá.
          </li>
          <li>
            Od kreditu 100 € tikety. Dokopy je súčet, nemusí ísť po sebe. Po sebe sú len REŤAZ
            (mŕtvy spin radu vynuluje) a SUCHO (výhra tiket hneď končí). LIVE sa plní len v PARKNET.
            Kúpený PARKNET je POHOTOVOSŤ. Duel online točíte naraz, live skóre. Víťaz berie výhry oboch.
          </li>
          <li>
            Kredit, pity aj rank sa ukladajú v tomto prehliadači. Bankrot +5000 berie RP len v 5G a NEKONEČNO, najviac pol divízie.
            80 platených spinov bez dobitia sériu trestov vynuluje.
          </li>
          <li>
            Ranked liga 4ky: KREDIT → SLOBODA → SMART → 4KA TV → OPTIKA → DUO → 5G NA DOMA → NEKONEČNO.
            Raz za týždeň klesáš o jednu divíziu. Od SMART kontrola ukáže cenu bezpečného státia, meter ostáva rovnaký.
          </li>
          <li>
            Win popup ako na Olympuse: BIG WIN od 20× stávky, MEGA WIN od 35×, SUPER MEGA WIN od 50×.
            MAX WIN 5000× ukončí feature.
          </li>
          <li>
            Kúpa voľných točení = 100× základná stávka na každom ranku. Ante sa na kúpu nevzťahuje.
            Do ranku sa kúpa ráta ako 100 točení. Max 5000× je strop celej feature — potom FEATURE TERMINATED.
          </li>
          <li>
            Rovnaký tvar ako Gates of Olympus: RTP okolo {(MATH_NOTE.rtp * 100).toFixed(1)} %, hit{" "}
            {(MATH_NOTE.hit * 100).toFixed(1)} %, PARKNET aj kúpa sú tá istá feature. Bonus 1/{MATH_NOTE.bonusEvery}, kúpa za 100×
            vracia asi {(MATH_NOTE.buyEv * 100).toFixed(1)}×. High-vol demo, nie certifikát 96.50 %.
          </li>
        </ul>
        <details className="math-box">
          <summary>MATH</summary>
          <p>
            {MATH_NOTE.spins.toLocaleString("sk-SK")} paid spinov, rovnaký engine ako hra. Hit rate{" "}
            {(MATH_NOTE.hit * 100).toFixed(2)} %. Bonus každých {MATH_NOTE.bonusEvery} točení, s ante 1/
            {MATH_NOTE.anteBonusEvery}. Buy EV {MATH_NOTE.buyEv.toFixed(3)} (100× stávka, ante off). Max 5000×{" "}
            {MATH_NOTE.maxEvery ? `~1/${MATH_NOTE.maxEvery}` : "v tejto vzorke 0×"}.
          </p>
        </details>
      </div>
    </div>
  );
}
