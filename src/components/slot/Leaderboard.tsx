import { useEffect, useState } from "react";
import { fetchBoard, type BoardRow } from "@/lib/slot/board-api";
import { formatMoney } from "@/lib/slot/format";

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
          <h2>Prezývka</h2>
        </header>
        <p className="modal-lead">
          Môžeš si dať gamblerskú prezývku a pretekať sa s ostatnými. Rebríček je za dnes a celkovo, z
          pretočeného, výhier a max win. Meno platí len v tomto prehliadači.
        </p>
        <input
          className="sound-pass"
          value={name}
          maxLength={16}
          placeholder="Prezývka"
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
        />
        {err ? <p className="sound-err">{err}</p> : null}
        <div className="nick-actions">
          <button type="submit" className="sound-reset" disabled={busy || name.trim().length < 2}>
            {busy ? "…" : "PRETEKAŤ"}
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
  onClose,
  onSave,
}: {
  open: boolean;
  nick: string;
  onClose: () => void;
  onSave: (name: string) => Promise<string | null>;
}) {
  const [scope, setScope] = useState<"today" | "all">("today");
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [err, setErr] = useState("");
  const [name, setName] = useState(nick);
  const [nickErr, setNickErr] = useState("");
  useEffect(() => setName(nick), [nick]);
  useEffect(() => {
    if (!open) return;
    let stop = false;
    setErr("");
    void fetchBoard(scope)
      .then((list) => {
        if (!stop) setRows(list);
      })
      .catch(() => {
        if (!stop) setErr("Rebríček sa nepodarilo načítať.");
      });
    return () => {
      stop = true;
    };
  }, [open, scope, nick]);
  if (!open) return null;
  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <div className="modal-card" role="dialog" aria-labelledby="board-title" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2 id="board-title">Rebríček</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Zavrieť">
            ×
          </button>
        </header>
        <form
          className="nick-line"
          onSubmit={(e) => {
            e.preventDefault();
            void onSave(name).then((msg) => setNickErr(msg ?? ""));
          }}
        >
          <input value={name} maxLength={16} placeholder="Tvoja prezývka" onChange={(e) => setName(e.target.value)} />
          <button type="submit">Uložiť</button>
        </form>
        {nickErr ? <p className="sound-err">{nickErr}</p> : null}
        <p className="sound-note">Meno je len v tomto prehliadači. Štatistiky sú z dnešného obratu: pretočené, výhry, max.</p>
        <div className="board-tabs">
          <button type="button" className={scope === "today" ? "on" : ""} onClick={() => setScope("today")}>
            DNES
          </button>
          <button type="button" className={scope === "all" ? "on" : ""} onClick={() => setScope("all")}>
            CELKOVO
          </button>
        </div>
        {err ? <p className="sound-err">{err}</p> : null}
        <div className="board-list">
          {rows.length === 0 && !err ? <p className="sound-note">Zatiaľ tu nikto nie je.</p> : null}
          {rows.map((row, i) => (
            <div className={`board-row ${row.nick === nick ? "is-me" : ""}`} key={`${row.nick}-${i}`}>
              <b>{i + 1}</b>
              <span>{row.nick}</span>
              <em>
                {formatMoney(row.wagered)}
                <small>pretočené</small>
              </em>
              <em>
                {formatMoney(row.paid)}
                <small>výhry</small>
              </em>
              <em>
                {formatMoney(row.best)}
                <small>{row.how || "max"}</small>
              </em>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
