import { useEffect, useRef, useState } from "react";
import { MATH_NOTE, PAY_SYMBOLS, SCATTER, TICKETS } from "@/lib/slot/symbols";
import { formatMoney } from "@/lib/slot/format";
import { cueSrc, isCustomCue, replaceCue, resetCues, subscribeSfx, unlockAudio } from "@/lib/slot/audio";
import type { DeskDay } from "@/lib/slot/desk-api";

interface Props {
  open: boolean;
  onClose: () => void;
  bet: number;
  desk?: DeskDay;
  mine?: DeskDay;
}

const SOUND_CUES: { id: string; name: string; loop?: boolean; when: string }[] = [
  { id: "click", name: "Klik", when: "Tlačidlá, stávka, ante, menu." },
  { id: "spin", name: "Točenie", loop: true, when: "Slučka od štartu točenia, kým valce bežia. Pri 2+ scatteroch stíchne." },
  { id: "land", name: "Dopad 1", when: "Náhodne jeden z troch, keď stĺpec zastane." },
  { id: "land2", name: "Dopad 2", when: "Náhodne jeden z troch, keď stĺpec zastane." },
  { id: "land3", name: "Dopad 3", when: "Náhodne jeden z troch, keď stĺpec zastane." },
  { id: "scatter", name: "Scatter", when: "1. a 2. scatter pri dopade alebo v páde." },
  { id: "harp", name: "Harfa", when: "3. scatter. Spolu s ním ide aj Zber." },
  { id: "thunder", name: "Hrom", when: "4. scatter, hod plechoviek, +5 FS, ohlásenie free spinov a neúspešný tiket." },
  { id: "anticipate", name: "Napätie", loop: true, when: "Base, keď sú 2+ scattere a valce ešte idú." },
  { id: "coin", name: "Minca", when: "Výhra v sekvencii pod 5×. Aj splnený tiket." },
  { id: "win", name: "Výhra", when: "Výhra v sekvencii od 5× do 20×." },
  { id: "winFull", name: "Výhra plná", when: "Výhra v sekvencii od 20×." },
  { id: "pop", name: "Prasknutie", when: "Výherné symboly zmiznú pred pádom." },
  { id: "tumble", name: "Pád", when: "Nové symboly padnú. Ďalší pád je o niečo vyšší." },
  { id: "can", name: "Plechovka", when: "Dopad plechovky a jej započítanie do výhry." },
  { id: "zap", name: "Rampa", when: "Plechovka po páde. Spolu s ňou ide aj Elektrika." },
  { id: "electric", name: "Elektrika", when: "Spolu s Rampou pri plechovke po páde." },
  { id: "collect", name: "Zber", when: "Výhra lístka (pot) a tretí scatter." },
  { id: "payout", name: "Výplata", when: "Výhra sa pripíše na kredit v base, mimo duelu." },
  { id: "fsStart", name: "Štart feature", when: "Začiatok PARKNET / 4ka TV." },
  { id: "bed", name: "Podklad feature", loop: true, when: "Počas celej feature. V hre naskočí na náhodnom mieste skladby." },
  { id: "kontrola", name: "Kontrola", when: "Štart KONTROLA." },
  { id: "tableA", name: "Big win A", when: "Náhodne A alebo B: BIG od 20×, MEGA od 35×, SUPER MEGA od 50×, aj koniec feature s výhrou. MAX 5000× hrá to isté." },
  { id: "tableB", name: "Big win B", when: "Náhodne A alebo B pri veľkej výhre a na konci feature." },
];

function SoundSheet() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [, bump] = useState(0);
  const [err, setErr] = useState("");
  useEffect(() => subscribeSfx(() => bump((n) => n + 1)), []);
  useEffect(() => {
    return () => {
      audio.current?.pause();
    };
  }, []);
  const play = (id: string, loop = false) => {
    unlockAudio();
    if (!audio.current) audio.current = new Audio();
    const el = audio.current;
    el.pause();
    el.loop = loop;
    el.src = cueSrc(id);
    el.volume = 0.85;
    void el.play();
  };
  const stop = () => {
    audio.current?.pause();
  };
  const pick = async (id: string, file: File | undefined) => {
    if (!file) return;
    stop();
    const msg = await replaceCue(id, file);
    setErr(msg ?? "");
  };
  return (
    <details className="sound-sheet">
      <summary>ZVUKY · prehrať a kedy hrajú</summary>
      <p className="sound-note">
        Ku každému zvuku vieš nahrať vlastný súbor. Hra ho potom používa namiesto pôvodného. Jedno tlačidlo dole vráti všetky naraz.
      </p>
      {err ? <p className="sound-err">{err}</p> : null}
      {SOUND_CUES.map((cue) => (
        <div className="sound-row" key={cue.id}>
          <button type="button" onClick={() => play(cue.id, cue.loop)}>
            {cue.loop ? "Slučka" : "Hraj"}
          </button>
          <label className="sound-file">
            {isCustomCue(cue.id) ? "Zmeniť" : "Súbor"}
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.webm"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                void pick(cue.id, file);
              }}
            />
          </label>
          <div>
            <b>
              {cue.name}
              {isCustomCue(cue.id) ? <i className="sound-own">vlastný</i> : null}
            </b>
            <span>{cue.when}</span>
          </div>
        </div>
      ))}
      <div className="sound-row is-wide">
        <button type="button" onClick={stop}>
          Stop
        </button>
        <div>
          <b>Stop</b>
          <span>Zastaví náhľad. Hru nechá bežať.</span>
        </div>
      </div>
      <button
        type="button"
        className="sound-reset"
        onClick={() => {
          stop();
          setErr("");
          void resetCues();
        }}
      >
        Pôvodné zvuky
      </button>
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
