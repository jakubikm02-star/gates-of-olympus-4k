import { useEffect, useRef, useState } from "react";
import { cueSrc, isCustomCue, replaceCue, resetCue, resetCues, subscribeSfx, unlockAudio } from "@/lib/slot/audio";
import { TICKETS, type TicketId } from "@/lib/slot/symbols";
import {
  adminOk,
  renameTicket,
  subscribeTicketNames,
  ticketLabel,
  TICKET_KEYS,
} from "@/lib/slot/ticket-names";

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

const TONES: Record<TicketId, string> = {
  ulica: "Sivý",
  okres: "Modrý",
  kraj: "Fialový",
  stat: "Zlatý",
};

function SoundSheet({ password }: { password: string }) {
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
    const msg = await replaceCue(id, file, password);
    setErr(msg ?? "Uložené. Počujú to všetci hráči.");
  };
  const drop = async (id: string) => {
    stop();
    const msg = await resetCue(id, password);
    setErr(msg ?? "Tento zvuk je späť pôvodný pre všetkých.");
  };
  return (
    <div className="sound-sheet is-open">
      <p className="sound-note">Zmena zvuku ide do jadra. Platí pre všetkých hráčov. Reset pri jednom vráti len ten.</p>
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
          void resetCues(password).then((msg) => setErr(msg ?? "Pôvodné zvuky sú späť pre všetkých."));
        }}
      >
        Pôvodné zvuky
      </button>
    </div>
  );
}

function TicketNames({ password }: { password: string }) {
  const [draft, setDraft] = useState<Record<TicketId, string>>(() => {
    const map = {} as Record<TicketId, string>;
    for (const id of TICKET_KEYS) map[id] = ticketLabel(id);
    return map;
  });
  const [err, setErr] = useState("");
  useEffect(() => subscribeTicketNames(() => {
    setDraft(() => {
      const map = {} as Record<TicketId, string>;
      for (const id of TICKET_KEYS) map[id] = ticketLabel(id);
      return map;
    });
  }), []);
  const save = async (id: TicketId) => {
    const msg = await renameTicket(id, draft[id] ?? "", password);
    setErr(msg ?? `${TONES[id]} tiket sa volá ${ticketLabel(id)}. Vidia to všetci.`);
  };
  return (
    <div className="ticket-names">
      <p className="sound-note">Názvy tiketov na valcoch a v potoch. Najviac 16 znakov.</p>
      {err ? <p className="sound-err">{err}</p> : null}
      {TICKET_KEYS.map((id) => (
        <form
          key={id}
          className="ticket-name-row"
          onSubmit={(e) => {
            e.preventDefault();
            void save(id);
          }}
        >
          <img src={TICKETS[id].src} alt="" />
          <span style={{ color: TICKETS[id].ink }}>{TONES[id]}</span>
          <input
            value={draft[id] ?? ""}
            maxLength={16}
            onChange={(e) => setDraft((d) => ({ ...d, [id]: e.target.value }))}
            aria-label={`Názov ${TONES[id]}`}
          />
          <button type="submit">Uložiť</button>
        </form>
      ))}
    </div>
  );
}

export function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [pass, setPass] = useState("");
  const [gate, setGate] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
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
        {gate && gate !== "bad" && gate !== "down" ? (
          <>
            <SoundSheet password={gate} />
            <TicketNames password={gate} />
          </>
        ) : (
          <form
            className="settings-gate"
            onSubmit={(e) => {
              e.preventDefault();
              void enter();
            }}
          >
            <p className="sound-note">Vstup len s heslom. Zmeny platia pre všetkých hráčov.</p>
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
      </div>
    </div>
  );
}
