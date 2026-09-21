import { useEffect, useRef, useState } from "react";
import { useP2PRoom } from "@/lib/multiplayer";
import { formatMoney } from "@/lib/slot/format";
import {
  duelLeft,
  duelMineDone,
  duelWinner,
  rtcRoom,
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

type Wire =
  | { t: "hello"; name: string }
  | { t: "go"; mode: DuelMode; bet: number; hostName: string; guestName: string }
  | { t: "tick"; have: number; score: number };

export function DuelLink({
  link,
  duel,
  bet,
  onPeerName,
  onGo,
  onTick,
}: {
  link: DuelLink;
  duel: Duel | null;
  bet: number;
  onPeerName: (name: string) => void;
  onGo: (peerName: string, bet: number, mode: DuelMode) => void;
  onTick: (have: number, score: number) => void;
}) {
  const p2p = useP2PRoom({ room: rtcRoom(link.room), name: link.name });
  const live = p2p.peers.some((p) => p.connectionState === "connected");
  const failed = p2p.peers.some((p) => p.connectionState === "failed" || p.candidateType === "relay");
  const peerName = p2p.peers[0]?.name || "";
  const started = useRef(false);
  const lastHave = useRef(-1);

  useEffect(() => {
    if (peerName) onPeerName(peerName);
  }, [peerName, onPeerName]);

  useEffect(
    () =>
      p2p.onMessage((_from, data) => {
        const msg = data as Wire;
        if (!msg || typeof msg !== "object" || !("t" in msg)) return;
        if (msg.t === "hello" && msg.name) onPeerName(msg.name);
        if (msg.t === "go" && !started.current) {
          started.current = true;
          const peer = link.role === "guest" ? msg.hostName : msg.guestName;
          onGo(peer, msg.bet, msg.mode);
        }
        if (msg.t === "tick") onTick(msg.have, msg.score);
      }),
    [p2p.onMessage, onPeerName, onGo, onTick, link.role],
  );

  useEffect(() => {
    if (!live || duel) return;
    p2p.send({ t: "hello", name: link.name } satisfies Wire);
  }, [live, duel, p2p, link.name]);

  useEffect(() => {
    if (!duel || duel.kind !== "online") return;
    const have = duel.seats[duel.you].have;
    const score = duel.seats[duel.you].score;
    if (have <= lastHave.current) return;
    lastHave.current = have;
    p2p.send({ t: "tick", have, score } satisfies Wire);
  }, [duel, p2p]);

  const launch = () => {
    if (!live || started.current || link.role !== "host") return;
    started.current = true;
    const guestName = peerName || "HRÁČ 2";
    const payload: Wire = { t: "go", mode: link.mode, bet, hostName: link.name, guestName };
    p2p.send(payload);
    onGo(guestName, bet, link.mode);
  };

  if (duel) return null;

  return (
    <div className="modal-back" role="presentation">
      <div className="modal-card spend-card" role="dialog" aria-labelledby="duel-title">
        <header className="modal-head">
          <h2 id="duel-title">{link.role === "host" ? "KÓD DUELU" : "PRIPOJUJEM"}</h2>
        </header>
        <p className="duel-code" aria-label="Kód miestnosti">
          {link.room}
        </p>
        <p className="modal-lead">
          {p2p.joined
            ? live
              ? `${peerName || "súper"} je v miestnosti.`
              : "Čakám na spojenie. Druhý hráč zadá ten istý kód."
            : "Pálim relé…"}
          {failed ? " Ak to visí, skús hotspot — niektoré siete WebRTC nepustia." : ""}
        </p>
        {link.role === "host" ? (
          <button type="button" className="chip-btn gold" disabled={!live} onClick={launch}>
            ŠTART
          </button>
        ) : (
          <p className="modal-lead">Čakám, kým hosť stlačí ŠTART.</p>
        )}
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
        <div className="spend-jobs">
          <button type="button" className={`spend-job ${mode === "spins" ? "stred" : "lacna"}`} onClick={() => setMode("spins")}>
            <em>10 TOČENÍ</em>
            <span>Rovnaká stávka, vyšší súčet výhier.</span>
          </button>
          <button type="button" className={`spend-job ${mode === "live" ? "draha" : "lacna"}`} onClick={() => setMode("live")}>
            <em>1× LIVE</em>
            <span>Každý kúpi PARKNET. Väčší bonus vyhráva.</span>
          </button>
        </div>
        {tab === "hotseat" ? (
          <>
            <p className="modal-lead">Dvaja na jednom zariadení. Po desiatich točeniach predáš telefón.</p>
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
              Hosť vytvorí kód, hosť na druhom telefóne ho zadá. Točíte naraz. Súper vidí tvoje skóre. Pre kamošov
              — každý hlási svoje točenia.
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
            <button type="button" className="chip-btn" disabled={code.replace(/[^A-Z0-9]/g, "").length < 4} onClick={() => onJoin(mode, a, code)}>
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
