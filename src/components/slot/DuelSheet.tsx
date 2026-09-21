import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/slot/format";
import { openDuelPeer, type DuelPipe, type DuelWire } from "@/lib/slot/duel-peer";
import {
  duelLeft,
  duelMineDone,
  duelPot,
  duelWinner,
  type Duel,
  type DuelLink,
  type DuelMode,
} from "@/lib/slot/duel";

interface Props {
  open: boolean;
  duel: Duel | null;
  link: DuelLink | null;
  peerName: string;
  bet: number;
  onClose: () => void;
  onStart: (mode: DuelMode, a: string, b: string) => void;
  onHost: (mode: DuelMode, name: string) => void;
  onJoin: (mode: DuelMode, name: string, code: string) => void;
  onSwap: () => void;
  onEnd: () => void;
}

export function DuelLink({
  link,
  duel,
  bet,
  onPeerName,
  onGo,
  onTick,
  onEnd,
}: {
  link: DuelLink;
  duel: Duel | null;
  bet: number;
  onPeerName: (name: string) => void;
  onGo: (peerName: string, bet: number, mode: DuelMode) => void;
  onTick: (have: number, score: number) => void;
  onEnd: () => void;
}) {
  const [status, setStatus] = useState("Pálim spojenie…");
  const [guest, setGuest] = useState("");
  const [live, setLive] = useState(false);
  const [err, setErr] = useState("");
  const started = useRef(false);
  const lastHave = useRef(-1);
  const pipe = useRef<DuelPipe | null>(null);
  const onPeerNameRef = useRef(onPeerName);
  const onGoRef = useRef(onGo);
  const onTickRef = useRef(onTick);
  onPeerNameRef.current = onPeerName;
  onGoRef.current = onGo;
  onTickRef.current = onTick;

  useEffect(() => {
    let stop = false;
    void (async () => {
      try {
        const next = await openDuelPeer({
          room: link.room,
          role: link.role,
          name: link.name,
          onPeer: (name) => {
            if (stop) return;
            setGuest(name);
            onPeerNameRef.current(name);
            setStatus(`${name} je v miestnosti.`);
          },
          onLive: (on) => {
            if (stop) return;
            setLive(on);
            if (on) setErr("");
            setStatus(on ? "Spojenie živé." : "Čakám na spojenie…");
          },
          onErr: (msg) => {
            if (!stop) setErr(msg);
          },
          onMsg: (msg: DuelWire) => {
            if (stop) return;
            if (msg.t === "go" && !started.current) {
              started.current = true;
              const peer = link.role === "guest" ? msg.hostName : msg.guestName;
              onGoRef.current(peer || "SÚPER", msg.bet, msg.mode);
            }
            if (msg.t === "tick") onTickRef.current(msg.have, msg.score);
          },
        });
        if (stop) {
          next.close();
          return;
        }
        pipe.current = next;
        setStatus(link.role === "host" ? "Kód je živý. Pošli ho kamošovi." : "Hľadám hosťa…");
      } catch (e) {
        if (!stop) setErr(e instanceof Error ? e.message : "Spojenie zlyhalo");
      }
    })();
    return () => {
      stop = true;
      pipe.current?.close();
      pipe.current = null;
    };
  }, [link.room, link.role, link.name]);

  useEffect(() => {
    if (!duel || duel.kind !== "online") return;
    const have = duel.seats[duel.you].have;
    const score = duel.seats[duel.you].score;
    if (have <= lastHave.current) return;
    lastHave.current = have;
    pipe.current?.send({ t: "tick", have, score });
  }, [duel]);

  const launch = () => {
    if (started.current || link.role !== "host" || !live) return;
    started.current = true;
    const guestName = guest || "HRÁČ 2";
    const payload: DuelWire = { t: "go", mode: link.mode, bet, hostName: link.name, guestName };
    pipe.current?.send(payload);
    onGo(guestName, bet, link.mode);
  };

  const leave = () => {
    pipe.current?.close();
    onEnd();
  };

  const copy = () => {
    void navigator.clipboard?.writeText(link.room).catch(() => {});
  };

  if (duel) return null;

  return (
    <div className="modal-back" role="presentation">
      <div className="modal-card spend-card duel-card" role="dialog" aria-labelledby="duel-title">
        <header className="modal-head">
          <h2 id="duel-title">{link.role === "host" ? "KÓD DUELU" : "PRIPOJUJEM"}</h2>
          <button type="button" className="icon-btn" onClick={leave} aria-label="Odísť">
            ×
          </button>
        </header>
        <button type="button" className="duel-code" onClick={copy} aria-label="Skopírovať kód">
          {link.room}
        </button>
        <p className="modal-lead">
          {err || status}
          {guest ? ` · súper: ${guest}` : ""}
        </p>
        <div className="duel-tabs">
          {link.role === "host" ? (
            <button type="button" className="chip-btn gold" disabled={!live} onClick={launch}>
              {live ? "ŠTART" : "ČAKÁM SÚPERA"}
            </button>
          ) : (
            <span className="modal-lead">Čakám na ŠTART od hosťa.</span>
          )}
          <button type="button" className="chip-btn" onClick={leave}>
            ODÍSŤ
          </button>
        </div>
      </div>
    </div>
  );
}

export function DuelSheet({
  open,
  duel,
  link,
  onClose,
  onStart,
  onHost,
  onJoin,
  onSwap,
  onEnd,
}: Props) {
  const [a, setA] = useState("HRÁČ 1");
  const [b, setB] = useState("HRÁČ 2");
  const [mode, setMode] = useState<DuelMode>("spins");
  const [tab, setTab] = useState<"hotseat" | "online">("hotseat");
  const [code, setCode] = useState("");

  if (duel?.phase === "swap") {
    return (
      <div className="modal-back" role="presentation">
        <div className="modal-card spend-card" role="dialog" aria-labelledby="duel-title">
          <header className="modal-head">
            <h2 id="duel-title">PREDÁŠ TELEFÓN</h2>
          </header>
          <p className="modal-lead">
            {duel.seats[0].name} má {formatMoney(duel.seats[0].score)}. Teraz točí {duel.seats[1].name} — rovnaká
            stávka {formatMoney(duel.bet)}.
          </p>
          <button type="button" className="chip-btn gold" onClick={onSwap}>
            HRAJ {duel.seats[1].name}
          </button>
        </div>
      </div>
    );
  }

  if (duel?.phase === "done") {
    const w = duelWinner(duel);
    const pot = duelPot(duel);
    const title = w === null ? "REMÍZA" : `VYHRAL ${duel.seats[w].name}`;
    return (
      <div className="modal-back" role="presentation">
        <div className="modal-card spend-card" role="dialog" aria-labelledby="duel-title">
          <header className="modal-head">
            <h2 id="duel-title">{title}</h2>
          </header>
          <p className="modal-lead">
            {duel.seats[0].name} {formatMoney(duel.seats[0].score)} · {duel.seats[1].name}{" "}
            {formatMoney(duel.seats[1].score)}
          </p>
          <p className="modal-lead">
            {w === null
              ? "Každý si necháva svoju výhru."
              : `Víťaz berie výhry oboch · BANK ${formatMoney(pot)}`}
          </p>
          <button type="button" className="chip-btn gold" onClick={onEnd}>
            HOTOVO
          </button>
        </div>
      </div>
    );
  }

  if (link || !open) return null;
  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <div
        className="modal-card spend-card"
        role="dialog"
        aria-labelledby="duel-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2 id="duel-title">DUEL</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Zavrieť">
            ×
          </button>
        </header>
        <div className="duel-tabs">
          <button type="button" className={`chip-btn ${tab === "hotseat" ? "gold" : ""}`} onClick={() => setTab("hotseat")}>
            PRI STOLE
          </button>
          <button type="button" className={`chip-btn ${tab === "online" ? "gold" : ""}`} onClick={() => setTab("online")}>
            NA DIAĽKU
          </button>
        </div>
        <div className="duel-modes">
          <button type="button" className={`spend-job ${mode === "spins" ? "stred" : "lacna"}`} onClick={() => setMode("spins")}>
            <em>10 TOČENÍ</em>
            <span>Vyšší súčet berie bank oboch.</span>
          </button>
          <button type="button" className={`spend-job ${mode === "live" ? "draha" : "lacna"}`} onClick={() => setMode("live")}>
            <em>1× LIVE</em>
            <span>Každý kúpi PARKNET.</span>
          </button>
        </div>
        {tab === "hotseat" ? (
          <>
            <p className="modal-lead">Dvaja na jednom zariadení. Po desiatich točeniach predáš telefón. Víťaz berie bank oboch.</p>
            <label className="duel-field">
              Hráč 1
              <input value={a} onChange={(e) => setA(e.target.value)} maxLength={16} />
            </label>
            <label className="duel-field">
              Hráč 2
              <input value={b} onChange={(e) => setB(e.target.value)} maxLength={16} />
            </label>
            <button type="button" className="chip-btn gold" onClick={() => onStart(mode, a, b)}>
              ZAČNI PRI STOLE
            </button>
          </>
        ) : (
          <>
            <p className="modal-lead">
              Vytvor kód, na druhom telefóne ho zadaj. Víťaz berie výhry oboch.
            </p>
            <label className="duel-field">
              Tvoje meno
              <input value={a} onChange={(e) => setA(e.target.value)} maxLength={16} />
            </label>
            <button type="button" className="chip-btn gold" onClick={() => onHost(mode, a)}>
              VYTVORIŤ KÓD
            </button>
            <label className="duel-field">
              Kód od kamoša
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={4}
                placeholder="A7K2"
              />
            </label>
            <button
              type="button"
              className="chip-btn"
              disabled={code.replace(/[^A-Z0-9]/g, "").length < 4}
              onClick={() => onJoin(mode, a, code)}
            >
              PRIPOJIŤ
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function DuelBar({ duel }: { duel: Duel }) {
  const left = duelLeft(duel);
  const me = duel.kind === "online" ? duel.seats[duel.you] : duel.seats[duel.turn];
  const wait = duel.kind === "online" && duelMineDone(duel) && duel.phase === "play";
  return (
    <div className="duel-bar" aria-live="polite">
      <span className={duel.kind === "online" ? (duel.you === 0 ? "on" : "") : duel.turn === 0 ? "on" : ""}>
        {duel.seats[0].name}
        <b>{formatMoney(duel.seats[0].score)}</b>
      </span>
      <em>
        VS · {wait ? "čakám súpera" : me.name} · ešte {left}
      </em>
      <span className={duel.kind === "online" ? (duel.you === 1 ? "on" : "") : duel.turn === 1 ? "on" : ""}>
        {duel.seats[1].name}
        <b>{formatMoney(duel.seats[1].score)}</b>
      </span>
    </div>
  );
}
