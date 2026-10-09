import { setZboxHelpOff, zboxHelpOff } from "@/lib/slot/zbox-help";
import { AddToHome } from "./AddToHome";
import { kolesoEnvelopes, kolesoHelpOff, setKolesoEnvelopes, setKolesoHelpOff } from "@/lib/slot/koleso-help";
import "./volume.css";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  CUE_LEVEL_MAX,
  VOLUME_MAX,
  cueCanCut,
  cueDuration,
  cueSrc,
  elementVolume,
  fadesDirty,
  fadesSource,
  getCueFade,
  getCueLevel,
  getVolume,
  isCustomCue,
  mediaSource,
  playCoin,
  previewCue,
  previewHeartbeat,
  replaceCue,
  resetCue,
  resetCueLevels,
  resetCues,
  revertFades,
  revertVolumes,
  saveFades,
  saveVolumes,
  setCueFade,
  setCueLevel,
  setVolume,
  stopCuePreview,
  subscribeSfx,
  subscribeVolume,
  unlockAudio,
  volumesDirty,
} from "@/lib/slot/audio";
import { FADE_MS_MAX, clampFadeMs, clampMaxS, formatSec, isDefaultFade, playedLength } from "@/lib/slot/cue-fade";
import { contractCatalog } from "@/lib/slot/spend";
import { saveContractTitles, subscribeContracts } from "@/lib/slot/job-titles";
import { hudState, makeTapCounter, setHudEnabled } from "@/lib/slot/debug-hud";
import { BUILD_ID } from "@/lib/slot/release";

/** Build label; five quick taps toggle the hidden debug HUD. */
function BuildTag() {
  const tap = useRef(makeTapCounter());
  return (
    <p
      className="build-tag"
      onClick={() => {
        if (tap.current()) setHudEnabled(!hudState().enabled);
      }}
    >
      verzia {BUILD_ID.slice(0, 10)}
    </p>
  );
}
import { adminOk } from "@/lib/slot/ticket-names";
import {
  clearStats,
  isStatsBackupEnabled,
  setStatsBackupEnabled,
} from "@/lib/slot/stats";
import { statsDrop } from "@/lib/slot/stats-api";

const SOUND_CUES: { id: string; name: string; loop?: boolean; when?: string; head?: boolean }[] = [
  { id: "click", name: "Klik", when: "Tlačidlá, stávka, ante, menu." },
  { id: "spin", name: "Točenie", loop: true, when: "Slučka od štartu točenia, kým valce bežia. Pri 2+ scatteroch stíchne." },
  { id: "land", name: "Dopad 1", when: "Náhodne jeden z troch, keď stĺpec zastane." },
  { id: "land2", name: "Dopad 2", when: "Náhodne jeden z troch, keď stĺpec zastane." },
  { id: "land3", name: "Dopad 3", when: "Náhodne jeden z troch, keď stĺpec zastane." },
  { id: "scatter", name: "Scatter", when: "Každý scatter od prvého: keď zastane jeho valec, alebo keď dopadne v páde." },
  { id: "harp", name: "Harfa", when: "Po dopade všetkých valcov a pádoch ostali presne 3 scattere (pri 4+ nehrá). Spolu s ňou ide aj Zber." },
  { id: "thunder", name: "Hrom", when: "4. scatter, hod plechoviek do Mbps (aktivácia), +5 točení, ohlásenie 4KA TV a neúspešný tiket." },
  { id: "anticipate", name: "Napätie", loop: true, when: "Base, keď sú 2+ scattere a valce ešte idú." },
  { id: "anticipation2", name: "Napätie 2", loop: true, when: "Čo robí: napätie (2+ scattere, valce ešte idú) 5. až 9. raz za sebou bez 4KA TV. Keď padne bonus, počíta sa znova od 1. Odporúčanie: silnejšia slučka než Napätie. Kým nenahráš vlastný, hrá sa Napätie." },
  { id: "anticipation3", name: "Napätie 3", loop: true, when: "Čo robí: napätie od 10. razu za sebou bez 4KA TV, pri každom ďalšom, kým nepadne bonus. Odporúčanie: najdramatickejšia slučka. Kým nenahráš vlastný, hrá sa Napätie 2, a keď nie je ani ten, Napätie." },
  { id: "coin", name: "Minca", when: "Výhra v sekvencii pod 5×." },
  { id: "ticketOk", name: "Úspešný tiket", when: "Splnený kontrakt. Zber, reťaz a ostatné úlohy." },
  { id: "win", name: "Výhra", when: "Výhra v sekvencii od 5× do 20×." },
  { id: "winFull", name: "Výhra plná", when: "Výhra v sekvencii od 20×." },
  { id: "pop", name: "Cluster tumble", when: "Výherné symboly zmiznú pred pádom." },
  { id: "tumble", name: "Pád", when: "Nové symboly padnú. Ďalší pád je o niečo vyšší." },
  { id: "can", name: "Plechovka", when: "Otvorenie plechovky len pri výhernom násobiči, keď sa započíta do výhry. Pri páde plechoviek nehrá." },
  { id: "can_lightning", name: "Blesk do plechovky", when: "Čo robí: pri výherných násobičoch zaznie raz za spin, aj keď blesk zasiahne viac plechoviek. Pred ním ide Hrom. Odporúčanie: krátke elektrické prasknutie alebo výboj, 0,2–0,6 s, ostrý nástup. Kým nenahráš vlastný, hrá sa praskot Elektriky." },
  { id: "zap", name: "Rampa", when: "Každé pustenie plechoviek rampou: po zastavení valcov aj po páde. Spolu s ňou ide aj Elektrika." },
  { id: "electric", name: "Elektrika", when: "Spolu s Rampou pri každom pustení plechoviek." },
  { id: "collect", name: "Zber", when: "Výhra lístka (pot), presne 3 scattere po dopade a +5 točení." },
  { id: "payout", name: "Výplata", when: "Výhra sa pripíše na kredit v base, mimo VERSUS." },
  { id: "fsStart", name: "Štart 4KA TV", when: "Začiatok 4KA TV." },
  { id: "bed", name: "Podklad 4KA TV", loop: true, when: "Počas celej 4KA TV. Naskočí na náhodnom mieste skladby. Súbor do 50 MB." },
  { id: "zasah", name: "Podklad zásahu", loop: true, when: "Čo robí: hudba pod celým zásahom. Naskočí na náhodnom mieste skladby. Odporúčanie: dlhá tmavá slučka bez spevu, napätie. Do 50 MB." },
  { id: "z-head", name: "Akcie zásahu", head: true },
  { id: "zStart", name: "Štart zásahu", when: "Čo robí: raz, keď zásah naskočí (10 spinov, auto stop). Odporúčanie: krátka siréna alebo klaksón, 1–2 s, ostrý nástup. Kým nenahráš vlastný, hrá sa kontrola." },
  { id: "zTravel", name: "Let okna", when: "Čo robí: skenovacie okno letí na symbol. Odporúčanie: krátky whoosh alebo sken, 0,3–0,6 s. Kým nenahráš vlastný, hrá sa rampa zrýchlene." },
  { id: "zHit", name: "Zásah sedí", when: "Čo robí: okno sadne a symbol sedí. Odporúčanie: suchý lock, klik alebo minca, do 0,5 s. Kým nenahráš vlastný, hrá sa minca." },
  { id: "zFs", name: "Finančná správa", when: "Čo robí: okno sadne na finančnú správu, úder. Odporúčanie: tupý úder alebo krátky alarm, 0,4–0,8 s. Kým nenahráš vlastný, hrá sa tichší hrom." },
  { id: "zHeart", name: "Tep", when: "Čo robí: od druhého úderu finančnej správy sa opakuje, kým zásah neskončí. Odporúčanie: jeden dvojúder srdca (lub-dub), do 1 s, ticho na konci. Kým nenahráš vlastný, je to syntetický tep." },
  { id: "zEscape", name: "Únik", when: "Čo robí: zásah končí únikom, 15 spinov bez dane. Odporúčanie: krátka úľava, nie veľká výhra, 1–2 s. Kým nenahráš vlastný, hrá sa úspešný tiket a harfa." },
  { id: "zTax", name: "Daňový úrad", when: "Čo robí: zásah končí prehrou, 15 spinov s daňou −23 %. Odporúčanie: suchý fail alebo bzučiak, do 2 s. Kým nenahráš vlastný, hrá sa big win B." },
  { id: "zNeutral", name: "Koniec bez ničoho", when: "Čo robí: zásah skončí bez úniku aj bez dane. Odporúčanie: krátke povzdychnutie. Kým nenahráš vlastný, nehrá nič." },
  { id: "kontrola", name: "Kontrola", when: "Štart KONTROLA." },
  { id: "zb-head", name: "Ž-BOX (Pakeťák)", head: true },
  { id: "zbox_beep", name: "Ž-BOX pípnutie", when: "Čo robí: pípnutie displeja Ž-BOXu: výber režimu, štart a nájdený balík. Sken zatvorenej schránky má tri vlastné sloty. Odporúčanie: krátke pípnutie klávesnice, do 0,3 s. Kým nenahráš vlastný, hrá sa syntetické dvojpípnutie." },
  { id: "zbox_scan", name: "Ž-BOX sken 1", when: "Čo robí: sken zatvorenej schránky. Tri skeny sa striedajú v náhodnom poradí, každý sken jeden. Odporúčanie: krátky sken, do 0,6 s. Kým nenahráš vlastný, hrá sa pípnutie." },
  { id: "zbox_scan2", name: "Ž-BOX sken 2", when: "Druhý sken. Strieda sa so skenom 1 a 3, každý prechod schránkou jeden, v náhodnom poradí." },
  { id: "zbox_scan3", name: "Ž-BOX sken 3", when: "Tretí sken. Strieda sa so skenom 1 a 2." },
  { id: "zbox_open", name: "Ž-BOX otvorenie", when: "Čo robí: dvierka sa otvoria, vyskočí balík a cvakne zelený zámok. Odporúčanie: cvak zámku + krátke ťuknutie, 0,3–0,8 s. Kým nenahráš vlastný, hrá sa Zber." },
  { id: "zbox_miss", name: "Ž-BOX nedoručené", when: "Čo robí: pokus bez balíka, NEDORUČENÉ (zhasne jedno doručovacie okno). Odporúčanie: suchý bzučiak „mimo prevádzky“, do 0,6 s. Kým nenahráš vlastný, hrá sa syntetický bzučiak." },
  { id: "zbox_slam", name: "Ž-BOX zatvorenie", when: "Čo robí: na konci sa dvierka zabuchnú rad po rade (Ž-BOX SA ZATVÁRA), raz na rad. Odporúčanie: tupé buchnutie plechových dvierok, do 0,4 s. Kým nenahráš vlastný, hrá sa Dopad 2." },
  { id: "zbox_full", name: "Ž-BOX všetko doručené", when: "Čo robí: plná stena, VŠETKO DORUČENÉ ×2. Odporúčanie: krátka fanfára, 2–4 s. Kým nenahráš vlastný, hrá sa Úspešný tiket a harfa. Plechovka na streche používa Hrom a Plechovku." },
  { id: "kn-head", name: "KOLESO NEŠŤASTIA", head: true },
  { id: "koleso_tick", name: "KOLESO tik", when: "Čo robí: jazýček kolesa preskočí kolík, pri každom kolíku (zrýchľuje a spomaľuje s kolesom, max ~25 za sekundu). Odporúčanie: suché drevené cvaknutie, do 0,05 s. Kým nenahráš vlastný, hrá sa syntetický klik." },
  { id: "koleso_letter", name: "KOLESO písmeno", when: "Čo robí: Betka Frekvencová otočí políčko s písmenom, raz na každé políčko. Odporúčanie: jasné cinknutie, 0,2–0,5 s. Kým nenahráš vlastný, hrá sa syntetické cinknutie." },
  { id: "koleso_miss", name: "KOLESO nie je tam", when: "Čo robí: písmeno v tajničke nie je. Odporúčanie: krátky bzučiak, do 0,6 s. Kým nenahráš vlastný, hrá sa syntetický dvojbzučiak." },
  { id: "koleso_bankrot", name: "KOLESO bankrot", when: "Čo robí: koleso zastane na BANKROT, banka zmizne. Odporúčanie: pád, fail, 1–2 s. Kým nenahráš vlastný, hrá sa Big win B." },
  { id: "koleso_solve", name: "KOLESO tajnička", when: "Čo robí: tajnička vylúštená (×2 + 1,58× stávky). Odporúčanie: fanfára, 2–4 s. Kým nenahráš vlastný, hrá sa Úspešný tiket a harfa." },
  { id: "kv-head", name: "KOLESO · hlášky moderátora", head: true },
  { id: "koleso_vo_welcome", name: "Hláška: vitajte", when: "Čo robí: moderátor Peter Marcipán (fiktívna postava) víta na začiatku KOLESA. Predvolená: „Dobrý večer a vitajte v Kolese nešťastia!“" },
  { id: "koleso_vo_spin", name: "Hláška: točíme", when: "Čo robí: pri roztočení kolesa (nie pri každom, aby neotravovala). Predvolená: „Točíme!“" },
  { id: "koleso_vo_bankrot", name: "Hláška: bankrot", when: "Predvolená: „Bankrot!“" },
  { id: "koleso_vo_vowel", name: "Hláška: samohláska", when: "Predvolená: „Samohláska za peniaze!“" },
  { id: "koleso_vo_solve", name: "Hláška: vyriešené", when: "Predvolená: „Tajnička je vyriešená!“" },
  { id: "koleso_vo_lost", name: "Hláška: stratený ťah", when: "Predvolená: „Stratili ste ťah!“" },
  { id: "koleso_vo_tax", name: "Hláška: daňová kontrola", when: "Nehraje. Daňová kontrola používa slot Daňový úrad, rovnaký ako neúspešný únik po zásahu." },
  { id: "koleso_vo_exek", name: "Hláška: exekúcia", when: "Predvolená: „Exekúcia!“ (JUDr. Zabavil)" },
  { id: "koleso_vo_courier", name: "Hláška: kuriér", when: "Predvolená: „Kuriér vás nezastihol!“ (Kuriér Nezastihol)" },
  { id: "koleso_vo_extra", name: "Hláška: extra ťah", when: "Predvolená: „Extra ťah!“" },
  { id: "koleso_vo_x2", name: "Hláška: dvojnásobok", when: "Predvolená: „Dvojnásobok!“ (Lukáš Adapter)" },
  { id: "koleso_vo_none", name: "Hláška: nie je tam", when: "Predvolená: „Nie je tam!“" },
  { id: "koleso_vo_end", name: "Hláška: koniec", when: "Predvolená: „Koniec kola!“ (tajnička nevylúštená)" },
  { id: "tableA", name: "Big win A", when: "Náhodne A alebo B: BIG od 20×, MEGA od 35×, SUPER MEGA od 50×, aj koniec 4KA TV s výhrou. MAX 5000× hrá to isté." },
  { id: "tableB", name: "Big win B", when: "Náhodne A alebo B pri veľkej výhre a na konci 4KA TV." },
  { id: "massive", name: "Masívna výhra", when: "Čo robí: fanfára pod ohlásením MASÍVNA VÝHRA, od 250× stávky. V base pri spine, v 4KA TV raz na konci (súčet bonusu), pred súhrnom. Odporúčanie: veľká fanfára s nábehom, 4–7 s, nech nesie odpočítavanie sumy. Kým nenahráš vlastný, hrá sa Big win A alebo B." },
];

function ContractNames({ password }: { password: string }) {
  const [rows, setRows] = useState(contractCatalog);
  const [err, setErr] = useState("");
  useEffect(() => subscribeContracts(() => setRows(contractCatalog())), []);
  const setTitle = (id: string, index: number, value: string) => {
    setRows((list) =>
      list.map((row) =>
        row.id === id ? { ...row, titles: row.titles.map((name, i) => (i === index ? value : name)) } : row,
      ),
    );
  };
  const save = async (id: string, titles: string[]) => {
    const msg = await saveContractTitles(id, titles, password);
    setErr(msg ?? "Názvy kontraktu platia pre všetkých. Nové úlohy ich už losujú.");
    if (!msg) setRows(contractCatalog());
  };
  const reset = async (id: string) => {
    const msg = await saveContractTitles(id, null, password);
    setErr(msg ?? "Pôvodné názvy tohto kontraktu sú späť.");
    if (!msg) setRows(contractCatalog());
  };
  return (
    <div className="ticket-names">
      <p className="sound-note">Kontrakty. Každý má niekoľko názvov a hra z nich pri novej úlohe jeden vyberie.</p>
      {err ? <p className="sound-err">{err}</p> : null}
      {rows.map((row) => (
        <form
          key={row.id}
          className="contract-names"
          onSubmit={(e) => {
            e.preventDefault();
            void save(row.id, row.titles);
          }}
        >
          <b>{row.line}</b>
          {row.titles.map((name, i) => (
            <input
              key={`${row.id}-${i}`}
              value={name}
              maxLength={28}
              onChange={(e) => setTitle(row.id, i, e.target.value)}
              aria-label={`${row.line} ${i + 1}`}
            />
          ))}
          <div>
            <button type="submit">Uložiť</button>
            <button type="button" onClick={() => void reset(row.id)}>
              Pôvodné
            </button>
          </div>
        </form>
      ))}
    </div>
  );
}

function SoundSheet({ password }: { password: string }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [, bump] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => subscribeSfx(() => bump((n) => n + 1)), []);
  // Durations arrive asynchronously (file metadata / decode): they notify through the volume listeners.
  useEffect(() => subscribeVolume(() => bump((n) => n + 1)), []);
  useEffect(() => {
    return () => {
      audio.current?.pause();
    };
  }, []);
  const play = (id: string, loop = false) => {
    unlockAudio();
    audio.current?.pause();
    // Same path as the game (Web Audio buffer, per-sound volume, Max. dĺžka + Fade out); the raw <audio> below only
    // while the sample is not loaded yet.
    if (cueCanCut(id) && previewCue(id)) return;
    const src = cueSrc(id);
    if (!src) {
      if (id === "zHeart") previewHeartbeat();
      else setErr("Kým nenahráš súbor, tento slot je ticho.");
      return;
    }
    if (!audio.current) audio.current = new Audio();
    const el = audio.current;
    el.pause();
    el.loop = loop;
    el.src = src;
    mediaSource(el, id);
    el.volume = elementVolume(el, 0.85, id);
    void el.play();
  };
  const stop = () => {
    audio.current?.pause();
    stopCuePreview();
  };
  const pick = async (id: string, file: File | undefined) => {
    if (!file || busy) return;
    stop();
    setBusy(true);
    setErr("Ukladám… veľký súbor môže trvať aj štvrť minúty.");
    const msg = await replaceCue(id, file, password);
    setBusy(false);
    setErr(msg ?? "Uložené. Počujú to všetci hráči.");
  };
  const drop = async (id: string) => {
    stop();
    const msg = await resetCue(id, password);
    setErr(msg ?? "Tento zvuk je späť pôvodný pre všetkých.");
  };
  return (
    <div className="sound-sheet is-open">
      <p className="sound-note">Zmena zvuku ide do jadra. Platí pre všetkých hráčov. Reset pri jednom vráti len ten. Každý slot berie mp3, wav, ogg aj FLAC, do 50 MB. Slot zásahu, kým nemá vlastný súbor, hrá doterajší zvuk.</p>
      {err ? <p className="sound-err">{err}</p> : null}
      {SOUND_CUES.map((cue) =>
        cue.head ? (
          <p className="sound-note sound-group" key={cue.id}>
            {cue.name}
          </p>
        ) : (
        <div className="sound-row" key={cue.id}>
          <button type="button" onClick={() => play(cue.id, cue.loop)}>
            {cue.loop ? "Slučka" : "Hraj"}
          </button>
          <label className="sound-file">
            {isCustomCue(cue.id) ? "Zmeniť" : "Súbor"}
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.webm,.flac,.opus"
              disabled={busy}
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
              <i className="sound-dur">{formatSec(cueDuration(cue.id))}</i>
              {isCustomCue(cue.id) ? <i className="sound-own">jadro</i> : null}
              {isCustomCue(cue.id) ? (
                <button type="button" className="sound-one" onClick={() => void drop(cue.id)}>
                  Reset
                </button>
              ) : null}
            </b>
            <span>{cue.when}</span>
          </div>
        </div>
        ),
      )}
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
          void resetCues(password).then((msg) => setErr(msg ?? "Pôvodné zvuky sú späť pre všetkých."));
        }}
      >
        Pôvodné zvuky
      </button>
    </div>
  );
}

/** Global master volume, 0–200 %. Admin only (behind the password); saved for every player via VolumeSave. */
export function VolumeControl() {
  const [v, setV] = useState(getVolume);
  useEffect(() => subscribeVolume(() => setV(getVolume())), []);
  const pct = Math.round(v * 100);
  const max = Math.round(VOLUME_MAX * 100);
  const set = (next: number) => {
    unlockAudio();
    setVolume(next / 100);
  };
  return (
    <div className={`vol ${pct > 100 ? "is-boost" : ""} ${pct === 0 ? "is-zero" : ""}`}>
      <div className="vol-head">
        <label htmlFor="vol-master">Hlasitosť</label>
        <output htmlFor="vol-master" className="vol-val" aria-hidden="true">
          {pct}&nbsp;%
        </output>
      </div>
      <div className="vol-row">
        <button type="button" className="vol-step" aria-label="Tichšie o 10 %" onClick={() => set(Math.max(0, pct - 10))}>
          −
        </button>
        <div className="vol-track" style={{ "--vol": pct / max } as CSSProperties}>
          <i className="vol-fill" aria-hidden="true" />
          <i className="vol-mark" aria-hidden="true" />
          <input
            id="vol-master"
            type="range"
            min={0}
            max={max}
            step={1}
            value={pct}
            aria-valuetext={`${pct} %`}
            aria-describedby="vol-note"
            onChange={(e) => set(Number(e.target.value))}
            onPointerUp={() => playCoin()}
            onKeyUp={(e) => {
              if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End" || e.key.startsWith("Page")) playCoin();
            }}
          />
        </div>
        <button type="button" className="vol-step" aria-label="Hlasnejšie o 10 %" onClick={() => set(Math.min(max, pct + 10))}>
          +
        </button>
      </div>
      <p className="vol-note" id="vol-note">
        {pct > 100 ? "Nad 100 % zosilňuje celý mix a limiter stráži skreslenie." : "Celá hra, pre všetkých hráčov."}
        {pct !== 100 ? (
          <button type="button" className="vol-reset" onClick={() => set(100)}>
            100 %
          </button>
        ) : null}
      </p>
    </div>
  );
}

/** "1.5" → "1,5" for the text field. */
function maxText(v: number | null): string {
  return v === null ? "" : String(v).replace(".", ",");
}

/**
 * Per-sound Max. dĺžka (s, empty = vyp.) + Fade out (ms) with the real file length and a preview that plays
 * exactly as the game will (cut + fade). Values are live on this device; ULOŽIŤ PRE VŠETKÝCH makes them global.
 */
function CueFadeEdit({ id, name }: { id: string; name: string }) {
  const f = getCueFade(id);
  const canCut = cueCanCut(id);
  const dur = cueDuration(id);
  const [maxTxt, setMaxTxt] = useState(() => maxText(f.maxS));
  const [fadeTxt, setFadeTxt] = useState(() => (f.fadeMs ? String(f.fadeMs) : ""));
  // Reverted / loaded / saved from outside: show the real value unless the field already means it.
  useEffect(() => {
    setMaxTxt((t) => (clampMaxS(t) === f.maxS ? t : maxText(f.maxS)));
  }, [f.maxS]);
  useEffect(() => {
    setFadeTxt((t) => (clampFadeMs(t) === f.fadeMs ? t : f.fadeMs ? String(f.fadeMs) : ""));
  }, [f.fadeMs]);
  const played = dur !== null && canCut ? playedLength(dur, f) : null;
  const cut = played !== null && dur !== null && played < dur - 0.005;
  const maxId = `fade-max-${id}`;
  const fadeId = `fade-ms-${id}`;
  return (
    <div className={`cue-fade ${isDefaultFade(f) ? "" : "is-set"}`}>
      <div className="cue-fade-info">
        <span className="cue-fade-dur" aria-label={`${name}: dĺžka súboru`}>
          Dĺžka <b>{formatSec(dur)}</b>
          {cut ? (
            <>
              {" "}→ hrá <b className="cue-fade-cut">{formatSec(played)}</b>
            </>
          ) : null}
          {f.fadeMs > 0 ? <> · fade {formatSec(f.fadeMs / 1000)}</> : null}
        </span>
        <button
          type="button"
          className="cue-fade-btn"
          aria-label={`Náhľad s orezaním a fade: ${name}`}
          onClick={() => {
            unlockAudio();
            previewCue(id);
          }}
        >
          ▶ Náhľad
        </button>
        <button type="button" className="cue-fade-btn is-stop" aria-label="Zastaviť náhľad (s fade)" onClick={() => stopCuePreview()}>
          ■
        </button>
      </div>
      <div className="cue-fade-fields">
        {canCut ? (
          <label className="cue-fade-field" htmlFor={maxId}>
            <span>Max. dĺžka</span>
            <span className="cue-fade-in">
              <input
                id={maxId}
                type="text"
                inputMode="decimal"
                enterKeyHint="done"
                autoComplete="off"
                placeholder="vyp."
                value={maxTxt}
                onChange={(e) => {
                  setMaxTxt(e.target.value);
                  setCueFade(id, { maxS: clampMaxS(e.target.value) });
                }}
                onBlur={() => setMaxTxt(maxText(getCueFade(id).maxS))}
              />
              <i>s</i>
            </span>
          </label>
        ) : (
          <p className="cue-fade-field cue-fade-hint">Hudba sa neoreže, len pri zastavení stíchne.</p>
        )}
        <label className="cue-fade-field" htmlFor={fadeId}>
          <span>Fade out</span>
          <span className="cue-fade-in">
            <input
              id={fadeId}
              type="text"
              inputMode="numeric"
              enterKeyHint="done"
              autoComplete="off"
              placeholder="0"
              value={fadeTxt}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
                setFadeTxt(raw);
                setCueFade(id, { fadeMs: clampFadeMs(raw) });
              }}
              onBlur={() => {
                const v = getCueFade(id).fadeMs;
                setFadeTxt(v ? String(v) : "");
              }}
            />
            <i>ms</i>
          </span>
        </label>
      </div>
    </div>
  );
}

function CueVolume({ id, name }: { id: string; name: string }) {
  const pct = Math.round(getCueLevel(id) * 100);
  const max = Math.round(CUE_LEVEL_MAX * 100);
  const input = `vol-cue-${id}`;
  const set = (next: number) => {
    unlockAudio();
    setCueLevel(id, next / 100);
  };
  return (
    <div className={`cue-vol ${pct > 100 ? "is-boost" : ""} ${pct === 0 ? "is-zero" : ""}`} data-cue={id}>
      <div className="cue-vol-head">
        <label htmlFor={input}>{name}</label>
        {pct !== 100 ? (
          <button type="button" className="vol-reset" aria-label={`${name}: späť na 100 %`} onClick={() => set(100)}>
            100 %
          </button>
        ) : null}
        <output htmlFor={input} className="cue-vol-val" aria-hidden="true">
          {pct}&nbsp;%
        </output>
      </div>
      <div className="cue-vol-row">
        <button type="button" className="vol-step" aria-label={`${name}: tichšie o 10 %`} onClick={() => set(Math.max(0, pct - 10))}>
          −
        </button>
        <div className="vol-track" style={{ "--vol": pct / max } as CSSProperties}>
          <i className="vol-fill" aria-hidden="true" />
          <i className="vol-mark" aria-hidden="true" />
          <input
            id={input}
            type="range"
            min={0}
            max={max}
            step={1}
            value={pct}
            aria-valuetext={`${pct} %`}
            onChange={(e) => set(Number(e.target.value))}
          />
        </div>
        <button type="button" className="vol-step" aria-label={`${name}: hlasnejšie o 10 %`} onClick={() => set(Math.min(max, pct + 10))}>
          +
        </button>
        <button type="button" className="vol-step cue-vol-play" aria-label={`Prehrať: ${name}`} onClick={() => previewCue(id)}>
          ▶
        </button>
      </div>
      <CueFadeEdit id={id} name={name} />
    </div>
  );
}

/** Global per-sound volume, one slider per sound slot, 0–200 %. Applied before the master volume. Admin only. */
export function CueVolumes() {
  const [, bump] = useState(0);
  useEffect(() => subscribeVolume(() => bump((n) => n + 1)), []);
  useEffect(() => () => stopCuePreview(), []);
  const changed = SOUND_CUES.filter(
    (cue) => !cue.head && (Math.round(getCueLevel(cue.id) * 100) !== 100 || !isDefaultFade(getCueFade(cue.id))),
  ).length;
  return (
    <details className="cue-vols" onToggle={(e) => !(e.currentTarget as HTMLDetailsElement).open && stopCuePreview()}>
      <summary>
        <span>Hlasitosť jednotlivých zvukov</span>
        {changed ? <em className="cue-vols-badge">{changed === 1 ? "1 upravený" : changed < 5 ? `${changed} upravené` : `${changed} upravených`}</em> : null}
      </summary>
      <div className="cue-vols-body">
        <p className="vol-note cue-vols-note">
          Každý zvuk zvlášť, 0–200 %. Násobí sa s Hlasitosťou hore (50 % × 200 % = 100 %). Platí pre všetkých hráčov po uložení.
        </p>
        <p className="vol-note cue-vols-note">
          Max. dĺžka (s): dlhší zvuk sa po nej plynulo stíši a utne (prázdne = vypnuté, hrá celý). Fade out (0–{FADE_MS_MAX} ms):
          plynulé stíšenie na konci zvuku (aj bez Max. dĺžky), pri orezaní aj keď hra zvuk preruší skôr (ďalší spin).
        </p>
        <button type="button" className="cue-vols-reset" disabled={!changed} onClick={() => resetCueLevels()}>
          Resetovať všetko na 100&nbsp;%
        </button>
        {SOUND_CUES.map((cue) =>
          cue.head ? (
            <p className="cue-vols-group" key={cue.id}>
              {cue.name}
            </p>
          ) : (
            <CueVolume key={cue.id} id={cue.id} name={cue.name} />
          ),
        )}
      </div>
    </details>
  );
}

/** Admin: save the sliders for every player, or throw the unsaved moves away. */
function VolumeSave({ password }: { password: string }) {
  const [, bump] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => subscribeVolume(() => bump((n) => n + 1)), []);
  // Leaving Settings without saving: back to what everybody hears.
  useEffect(
    () => () => {
      revertVolumes();
      revertFades();
    },
    [],
  );
  const volDirty = volumesDirty();
  const fadeDirty = fadesDirty();
  const dirty = volDirty || fadeDirty;
  const save = async () => {
    setBusy(true);
    const err = volDirty ? await saveVolumes(password) : null;
    const fade = !err && fadeDirty ? await saveFades(password) : { error: null, localOnly: false };
    setBusy(false);
    if (err || fade.error) setMsg({ ok: false, text: (err || fade.error) as string });
    else if (fade.localOnly)
      setMsg({
        ok: true,
        text: `${volDirty ? "Hlasitosť uložená pre všetkých. " : ""}Orezanie a fade zatiaľ len na tomto zariadení (server ešte nemá tabuľku sfx_fade).`,
      });
    else setMsg({ ok: true, text: "Uložené. Platí pre všetkých hráčov." });
  };
  return (
    <div className="vol-save">
      <p className="vol-note">
        {dirty
          ? "Neuložené zmeny počuješ len ty."
          : fadesSource() === "local"
            ? "Hlasitosti platia pre všetkých. Orezanie a fade sú zatiaľ len na tomto zariadení."
            : "Hlasitosti, orezanie a fade platia pre všetkých hráčov."}
      </p>
      <div className="vol-save-row">
        <button type="button" className="sound-reset" disabled={busy || !dirty} onClick={() => void save()}>
          {busy ? "…" : "ULOŽIŤ PRE VŠETKÝCH"}
        </button>
        <button
          type="button"
          className="cue-vols-reset"
          disabled={busy || !dirty}
          onClick={() => {
            revertVolumes();
            revertFades();
            setMsg(null);
          }}
        >
          Zahodiť zmeny
        </button>
      </div>
      {msg ? <p className={msg.ok ? "sound-note" : "sound-err"}>{msg.text}</p> : null}
    </div>
  );
}

export function Settings({
  open,
  onClose,
  playerId = "",
}: {
  open: boolean;
  onClose: () => void;
  playerId?: string;
}) {
  const [pass, setPass] = useState("");
  const [gate, setGate] = useState("");
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState(() => isStatsBackupEnabled());
  const [zboxHelp, setZboxHelp] = useState(() => !zboxHelpOff());
  const [kolesoHelp, setKolesoHelp] = useState(() => !kolesoHelpOff());
  const [kolesoEnv, setKolesoEnv] = useState(() => kolesoEnvelopes());
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  useEffect(() => {
    if (!open) return;
    setZboxHelp(!zboxHelpOff());
    setKolesoHelp(!kolesoHelpOff());
    setKolesoEnv(kolesoEnvelopes());
  }, [open]);
  useEffect(() => {
    if (open) return;
    setPass("");
    setGate("");
    setBusy(false);
  }, [open]);
  if (!open) return null;
  const enter = async () => {
    setBusy(true);
    const result = await adminOk(pass);
    setBusy(false);
    if (result === "ok") setGate(pass);
    else setGate(result === "denied" ? "bad" : "down");
  };
  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <div className="modal-card" role="dialog" aria-labelledby="set-title" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2 id="set-title">Nastavenia</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Zavrieť">
            ×
          </button>
        </header>
        <div className="settings-privacy">
          <AddToHome place="menu" />
          <p className="sound-note">
            Osobné štatistiky sú doživotné (prežijú EXEKÚCIU) a predvolene len na tomto zariadení.
            Cloudová záloha je vypnutá, kým ju nezapneš. Ukladajú sa herné udalosti a časy — nie IP, poloha ani nick.
          </p>
          <label className="st-toggle" style={{ display: "flex", gap: 10, alignItems: "center", margin: "8px 0" }}>
            <input
              type="checkbox"
              checked={backup}
              onChange={() => {
                const next = !backup;
                setBackup(next);
                setStatsBackupEnabled(next);
                if (!next && playerId) void statsDrop(playerId).catch(() => {});
              }}
            />
            <span>Zálohovať štatistiky (cloud)</span>
          </label>
          <label className="st-toggle" style={{ display: "flex", gap: 10, alignItems: "center", margin: "8px 0" }}>
            <input
              type="checkbox"
              checked={zboxHelp}
              onChange={() => {
                const next = !zboxHelp;
                setZboxHelp(next);
                setZboxHelpOff(!next);
              }}
            />
            <span>Vysvetlenie Ž-BOXu (pravidlá na začiatku a tipy v prvých kolách)</span>
          </label>
          <label className="st-toggle" style={{ display: "flex", gap: 10, alignItems: "center", margin: "8px 0" }}>
            <input
              type="checkbox"
              checked={kolesoHelp}
              onChange={() => {
                const next = !kolesoHelp;
                setKolesoHelp(next);
                setKolesoHelpOff(!next);
              }}
            />
            <span>Vysvetlenie KOLESA NEŠŤASTIA (pravidlá na začiatku a tipy v prvých točeniach)</span>
          </label>
          <label className="st-toggle" style={{ display: "flex", gap: 10, alignItems: "center", margin: "8px 0" }}>
            <input
              type="checkbox"
              checked={kolesoEnv}
              onChange={() => {
                const next = !kolesoEnv;
                setKolesoEnv(next);
                setKolesoEnvelopes(next);
              }}
            />
            <span>KOLESO: obálky s písmenom (ťukneš si sám; vypnuté = písmeno vyberie Jožo Pročkár, výhra je rovnaká)</span>
          </label>
          <button
            type="button"
            className="sound-reset"
            onClick={() => {
              if (!confirm("Vymazať lokálne štatistiky?")) return;
              clearStats();
            }}
          >
            Vymazať lokálne štatistiky
          </button>
        </div>
        {gate && gate !== "bad" && gate !== "down" ? (
          <>
            <VolumeControl />
            <CueVolumes />
            <VolumeSave password={gate} />
            <SoundSheet password={gate} />
            <ContractNames password={gate} />
          </>
        ) : (
          <form
            className="settings-gate"
            onSubmit={(e) => {
              e.preventDefault();
              void enter();
            }}
          >
            <p className="sound-note">Vstup len s heslom. Zmeny (aj hlasitosť zvukov) platia pre všetkých hráčov.</p>
            <input
              className="sound-pass"
              type="password"
              placeholder="Heslo admina"
              autoComplete="off"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
            />
            {gate === "bad" ? <p className="sound-err">Zlé heslo.</p> : null}
            {gate === "down" ? <p className="sound-err">Heslo sa nepodarilo overiť.</p> : null}
            <button type="submit" className="sound-reset" disabled={busy || !pass.trim()}>
              {busy ? "…" : "VSTÚPIŤ"}
            </button>
          </form>
        )}
        <BuildTag />
      </div>
    </div>
  );
}
