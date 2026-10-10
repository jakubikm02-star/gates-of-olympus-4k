import { useEffect, useRef, useState } from "react";
import { flushMirrorPush, scheduleMirrorPush } from "@/lib/slot/mirror-cloud";
import { readLocalSave, writeLocalSave, type PlayerSave } from "@/lib/slot/player-save";
import {
  SAVE_PORT_FILE,
  dismissNotice,
  packSave,
  saveForExport,
  saveGlance,
  unpackSave,
} from "@/lib/slot/save-port";

function Guide() {
  return (
    <>
      <p className="sound-note">
        Nový odkaz je parkizmus.vercel.app. Starý odkaz ostáva. Kredit, hodnosť, lístok a rozohratá hra sa prenášajú samy,
        keď druhý odkaz otvoríš v prehliadači. Nainštalovaná aplikácia sa nepresúva. Štatistiky a prezývka ostávajú na zariadení.
      </p>
      <ol className="save-steps">
        <li>Na zariadení, kde máš progres, stlač EXPORT. Kód sa skopíruje a stiahne sa súbor.</li>
        <li>Na druhom odkaze otvor ozubené koliesko, záložku Uloženie, a stlač IMPORT.</li>
        <li>Vlož kód alebo vyber súbor a potvrď výmenu. Hra sa obnoví a toto uloženie sa stane aktuálnym.</li>
      </ol>
    </>
  );
}

export function SavePortPanel({ busy, playerId }: { busy: boolean; playerId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const [bad, setBad] = useState(false);
  const [code, setCode] = useState("");
  const [importing, setImporting] = useState(false);
  const [paste, setPaste] = useState("");
  const [pending, setPending] = useState<PlayerSave | null>(null);
  const [here, setHere] = useState("");

  const note = (text: string, fail = false) => {
    setMsg(text);
    setBad(fail);
  };

  const exportSave = async () => {
    const save = saveForExport(playerId);
    if (!save) {
      note("Na tomto zariadení ešte nie je uloženie.", true);
      return;
    }
    const text = packSave(save);
    setCode(text);
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      copied = false;
    }
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = SAVE_PORT_FILE;
    a.click();
    URL.revokeObjectURL(url);
    note(copied ? "Kód je v schránke a súbor sa stiahol." : "Súbor sa stiahol. Schránka nešla, kód je v poli. Podrž ho a skopíruj.");
  };

  const stage = (text: string) => {
    const res = unpackSave(text);
    if (!res.ok) {
      setPending(null);
      note(res.error, true);
      return;
    }
    setPending(res.save);
    setHere(saveGlance(readLocalSave() ?? res.save));
    note("");
  };

  const confirm = () => {
    if (!pending) return;
    if (busy) {
      note("Počkaj, kým dobehne točenie alebo VERSUS.", true);
      return;
    }
    const stamped = { ...pending, updatedAt: Date.now() };
    writeLocalSave(stamped);
    scheduleMirrorPush(stamped);
    flushMirrorPush();
    window.location.reload();
  };

  return (
    <div className="save-port">
      <Guide />
      <div className="save-actions">
        <button type="button" className="sound-reset" onClick={() => void exportSave()}>
          EXPORT
        </button>
        <button
          type="button"
          className="save-secondary"
          onClick={() => {
            setImporting((v) => !v);
            setPending(null);
            note("");
          }}
        >
          IMPORT
        </button>
      </div>
      {code ? (
        <textarea className="save-code" readOnly value={code} aria-label="Kód uloženia" onFocus={(e) => e.currentTarget.select()} />
      ) : null}
      {importing ? (
        <>
          <textarea
            className="save-code"
            value={paste}
            placeholder="Sem vlož kód z EXPORTU"
            aria-label="Kód na import"
            onChange={(e) => {
              setPaste(e.target.value);
              setPending(null);
            }}
          />
          <div className="save-actions">
            <button type="button" className="save-secondary" onClick={() => fileRef.current?.click()}>
              SÚBOR
            </button>
            <button type="button" className="sound-reset" disabled={!paste.trim()} onClick={() => stage(paste)}>
              NÁHĽAD
            </button>
          </div>
          <input
            ref={fileRef}
            className="save-file"
            type="file"
            accept=".txt,.json,text/plain"
            aria-label="Súbor uloženia"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (file.size > 80_000) {
                note("Súbor je priveľký. Toto nie je uloženie hry.", true);
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                const text = typeof reader.result === "string" ? reader.result : "";
                setPaste(text);
                stage(text);
              };
              reader.readAsText(file);
            }}
          />
          {pending ? (
            <div className="save-glance">
              <p>Teraz: {here}</p>
              <p>Nahráš: {saveGlance(pending)}</p>
              <button type="button" className="sound-reset" onClick={confirm}>
                POTVRDIŤ VÝMENU
              </button>
            </div>
          ) : null}
        </>
      ) : null}
      {msg ? <p className={bad ? "sound-err" : "sound-note"}>{msg}</p> : null}
    </div>
  );
}

export function SaveNotice({
  open,
  busy,
  playerId,
  onClose,
}: {
  open: boolean;
  busy: boolean;
  playerId: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      dismissNotice();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const close = () => {
    dismissNotice();
    onClose();
  };
  return (
    <div className="modal-back" onClick={close} role="presentation">
      <div
        className="modal-card"
        role="dialog"
        aria-labelledby="save-notice-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2 id="save-notice-title">Prenos uloženia</h2>
          <button type="button" className="icon-btn" onClick={close} aria-label="Zavrieť">
            ×
          </button>
        </header>
        <SavePortPanel busy={busy} playerId={playerId} />
        <button type="button" className="save-secondary save-dismiss" onClick={close}>
          ROZUMIEM
        </button>
      </div>
    </div>
  );
}
