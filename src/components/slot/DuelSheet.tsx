import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/slot/format";
import { duelCreate, duelJoin, duelLeave, duelPoll, duelStart, duelTick } from "@/lib/slot/duel-api";
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
  const [status, setStatus] = useState("Pálim miestnosť…");
  const [guest, setGuest] = useState("");
  const [err, setErr] = useState("");
  const started = useRef(false);
  const lastHave = useRef(-1);
  const onPeerNameRef = useRef(onPeerName);
  const onGoRef = useRef(onGo);
  const onTickRef = useRef(onTick);
  onPeerNameRef.current = onPeerName;
  onGoRef.current = onGo;
  onTickRef.current = onTick;

  useEffect(() => {
    let stop = false;
    const role = link.role;
    const boot = async () => {
      try {
        if (role === "host") {
          await duelCreate({ code: link.room, name: link.name, mode: link.mode, bet });
          if (!stop) setStatus("Kód je živý. Pošli ho kamošovi.");
        } else {
          const snap = await duelJoin(link.room, link.name);
          if (!stop) {
            onPeerNameRef.current(snap.hostName);
            setStatus("Si v miestnosti. Čakám na ŠTART.");
          }
        }
      } catch (e) {
        if (!stop) setErr(e instanceof Error ? e.message : "Spojenie zlyhalo");
      }
    };
    void boot();

    const tick = window.setInterval(() => {
      void (async () => {
        try {
          const snap = await duelPoll(link.room);
          if (stop) return;
          setErr("");
          if (snap.guestName) {
            setGuest(snap.guestName);
            if (role === "host") onPeerNameRef.current(snap.guestName);
          }
          if (snap.phase === "play" || snap.phase === "done") {
            if (!started.current) {
              started.current = true;
              const peer = role === "host" ? snap.guestName : snap.hostName;
              onGoRef.current(peer || "SÚPER", snap.bet, snap.mode);
            }
            if (role === "host") onTickRef.current(snap.guestHave, snap.guestScore);
            else onTickRef.current(snap.hostHave, snap.hostScore);
          }
        } catch (e) {
          if (stop) return;
          const msg = e instanceof Error ? e.message : "spojenie padlo";
          if (msg.includes("neexistuje") && started.current) setErr("Súper odišiel.");
          else if (!started.current) setErr(msg);
        }
      })();
    }, 700);

    return () => {
      stop = true;
      window.clearInterval(tick);
    };
  }, [link.room, link.role, link.name, link.mode, bet]);

  useEffect(() => {
    if (!duel || duel.kind !== "online") return;
    const have = duel.seats[duel.you].have;
    const score = duel.seats[duel.you].score;
    if (have <= lastHave.current) return;
    lastHave.current = have;
    void duelTick(link.room, link.role, have, score).catch(() => {});
  }, [duel, link.room, link.role]);

  const launch = () => {
    if (started.current || link.role !== "host" || !guest) return;
    void (async () => {
      try {
        const snap = await duelStart(link.room);
        started.current = true;
        onGo(snap.guestName || guest, snap.bet, snap.mode);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Štart zlyhal");
      }
    })();
  };

  const leave = () => {
    void duelLeave(link.room, link.role);
    onEnd();
  };

  if (duel) return null;

  return (
    <div className="modal-back" role="presentation">
      <div className="modal-card spend-card" role="dialog" aria-labelledby="duel-title">
        <header className="modal-head">
          <h2 id="duel-title">{link.role === "host" ? "KÓD DUELU" : "PRIPOJUJEM"}</h2>
          <button type="button" className="icon-btn" onClick={leave} aria-label="Odísť">
            ×
          </button>
        </header>
        <p className="duel-code" aria-label="Kód miestnosti">
          {link.room}
        </p>
        <p className="modal-lead">
          {err || status}
          {guest ? ` · súper: ${guest}` : ""}
        </p>
        <div className="duel-tabs">
          {link.role === "host" ? (
            <button type="button" className="chip-btn gold" disabled={!guest} onClick={launch}>
              {guest ? "ŠTART" : "ČAKÁM SÚPERA"}
            </button>
          ) : (
            <span className="modal-lead">Čakám, kým hosť stlačí ŠTART.</span>
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
        <div className="spend-jobs">
          <button type="button" className={`spend-job ${mode === "spins" ? "stred" : "lacna"}`} onClick={() => setMode("spins")}>
            <em>10 TOČENÍ</em>
            <span>Rovnaká stávka, vyšší súčet berie výhry oboch.</span>
          </button>
          <button type="button" className={`spend-job ${mode === "live" ? "draha" : "lacna"}`} onClick={() => setMode("live")}>
            <em>1× LIVE</em>
            <span>Každý kúpi PARKNET. Väčší bonus vyhráva.</span>
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
              Vytvor kód a pošli ho. Na druhom telefóne ho zadaj. Točíte naraz. Kto vytočí viac, berie výhry oboch.
              Prehrávajúci o svoje výhry príde. ŠTART ide, keď súper vojde. Kedykoľvek môžeš odísť.
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
