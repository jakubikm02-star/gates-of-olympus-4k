import { useEffect, useState } from "react";
import { fetchBoard, type BoardRow } from "@/lib/slot/board-api";

function led(n: number): string {
  return Math.round(n).toLocaleString("sk-SK");
}

function Pump({ row, mine }: { row: BoardRow; mine: boolean }) {
  const chips = row.how.split(" · ").map((s) => s.trim()).filter(Boolean).slice(0, 4);
  return (
    <article className={`pump ${mine ? "is-me" : ""}`}>
      <div className="pump-disk" aria-hidden="true">
        <i />
        <i />
      </div>
      <div className="pump-face">
        <div className="pump-row">
          <div className="pump-code">
            <b>MAX</b>
            {row.best > 0 ? <small>ST {led(row.stake)}</small> : <small>ST —</small>}
          </div>
          <div className="pump-led">{led(row.best)}</div>
        </div>
        <div className="pump-row">
          <div className="pump-code">
            <b>TOČ</b>
          </div>
          <div className="pump-led">{led(row.wagered)}</div>
        </div>
        <div className="pump-row">
          <div className="pump-code">
            <b>WIN</b>
          </div>
          <div className="pump-led">{led(row.paid)}</div>
        </div>
        <div className="pump-foot">
          <span className="pump-name">{row.nick}</span>
          {mine ? <em>TY</em> : null}
        </div>
        {chips.length ? (
          <p className="pump-how">
            {chips.map((chip) => (
              <span key={chip}>{chip}</span>
            ))}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export function NickAsk({
  onSave,
  onSkip,
}: {
  onSave: (name: string) => Promise<string | null>;
  onSkip: () => void;
}) {
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="modal-back" role="presentation">
      <form
        className="modal-card nick-ask"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void onSave(name).then((msg) => {
            setBusy(false);
            setErr(msg ?? "");
          });
        }}
      >
        <header className="modal-head">
          <h2>Meno na tomto mobile</h2>
        </header>
        <p className="modal-lead">2 až 12 znakov. Čísla ostanú na tomto zariadení. Dva mobily s rovnakým menom sú dva riadky.</p>
        <input
          className="sound-pass"
          value={name}
          maxLength={12}
          placeholder="Meno na tomto mobile"
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
        />
        {err ? <p className="sound-err">{err}</p> : null}
        <div className="nick-actions">
          <button type="submit" className="sound-reset" disabled={busy || name.trim().length < 2}>
            {busy ? "…" : "ULOŽIŤ"}
          </button>
          <button type="button" className="sound-one" onClick={onSkip}>
            Neskôr
          </button>
        </div>
      </form>
    </div>
  );
}

export function Leaderboard({
  open,
  nick,
  deviceId,
  onClose,
  onSave,
}: {
  open: boolean;
  nick: string;
  deviceId: string;
  onClose: () => void;
  onSave: (name: string) => Promise<string | null>;
}) {
  const [scope, setScope] = useState<"today" | "all">("today");
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [err, setErr] = useState("");
  const [name, setName] = useState(nick);
  const [nickErr, setNickErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(nick), [nick]);
  useEffect(() => {
    if (!open || !nick) return;
    let stop = false;
    setErr("");
    void fetchBoard(scope)
      .then((list) => {
        if (!stop) setRows(list);
      })
      .catch(() => {
        if (!stop) setErr("Tabuľu sa nepodarilo načítať.");
      });
    return () => {
      stop = true;
    };
  }, [open, scope, nick]);
  if (!open) return null;
  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <div className="modal-card pump-sheet" role="dialog" aria-labelledby="board-title" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2 id="board-title">Tabuľa</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Zavrieť">
            ×
          </button>
        </header>
        <form
          className="nick-line"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            void onSave(name).then((msg) => {
              setBusy(false);
              setNickErr(msg ?? "");
            });
          }}
        >
          <label>
            Meno na tomto mobile
            <input value={name} maxLength={12} placeholder="2–12 znakov" onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit" disabled={busy || name.trim().length < 2}>
            {nick ? "Premenovať" : "Uložiť"}
          </button>
        </form>
        {nickErr ? <p className="sound-err">{nickErr}</p> : null}
        {!nick ? <p className="sound-note">Najprv meno. Potom uvidíš dnešné tabule.</p> : null}
        <div className="board-tabs pump-switch" role="tablist">
          <button type="button" className={scope === "today" ? "on" : ""} onClick={() => setScope("today")}>
            DNES
          </button>
          <button type="button" className={scope === "all" ? "on" : ""} onClick={() => setScope("all")}>
            ALL TIME
          </button>
        </div>
        {err ? <p className="sound-err">{err}</p> : null}
        {nick ? (
          <div className="pump-list">
            {rows.length === 0 && !err ? <p className="sound-note">Zatiaľ tu nikto nie je.</p> : null}
            {rows.map((row) => (
              <Pump key={row.id || row.nick} row={row} mine={Boolean(deviceId) && row.id === deviceId} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
