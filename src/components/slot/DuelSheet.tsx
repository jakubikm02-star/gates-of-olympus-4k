import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/slot/format";
import { duelCreate, duelJoin, duelLeave, duelPoll, duelStart, duelTick, type DuelSnap } from "@/lib/slot/duel-api";
import {
  duelLeft,
  duelMineDone,
  duelPot,
  duelWinner,
  type Duel,
  type DuelLink,
  type DuelMode,
} from "@/lib/slot/duel";
import { BETS, BUY_COST_X } from "@/lib/slot/symbols";

interface Props {
  open: boolean;
  duel: Duel | null;
  link: DuelLink | null;
  peerName: string;
  bet: number;
  credit: number;
  onClose: () => void;
  onStart: (mode: DuelMode, a: string, b: string, bet: number) => void;
  onHost: (mode: DuelMode, name: string, bet: number) => void;
  onJoin: (mode: DuelMode, name: string, code: string, bet: number) => void;
  onSwap: () => void;
  onEnd: () => void;
}

function stepBet(value: number, dir: -1 | 1): number {
  const i = BETS.reduce((best, v, idx) => (Math.abs(v - value) < Math.abs(BETS[best] - value) ? idx : best), 0);
  return BETS[Math.min(BETS.length - 1, Math.max(0, i + dir))] ?? value;
}

function BetPick({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <label className="duel-field">
      Stávka na točenie
      <span className="duel-bet">
        <button type="button" className="chip-btn" onClick={() => onChange(stepBet(value, -1))}>
          −
        </button>
        <b>{formatMoney(value)}</b>
        <button type="button" className="chip-btn" onClick={() => onChange(stepBet(value, 1))}>
          +
        </button>
      </span>
    </label>
  );
}

function modeLabel(mode: DuelMode): string {
  return mode === "live" ? "1× PARKNET" : "10 TOČENÍ";
}

function seatCost(mode: DuelMode, bet: number): number {
  return mode === "live" ? +(bet * BUY_COST_X).toFixed(2) : +(bet * 10).toFixed(2);
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
    const boot = async () => {
      try {
        if (link.role === "host") {
          await duelCreate({ code: link.room, name: link.name, mode: link.mode, bet: link.bet || bet });
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
            if (link.role === "host") onPeerNameRef.current(snap.guestName);
          }
          if (link.role === "host" && snap.guestName && snap.phase === "wait" && !started.current) {
            void duelStart(link.room)
              .then((go) => {
                if (stop || started.current) return;
                started.current = true;
                onGoRef.current(go.guestName || snap.guestName, go.bet, go.mode);
              })
              .catch(() => {});
          }
          if (snap.phase === "play" || snap.phase === "done") {
            if (!started.current) {
              started.current = true;
              const peer = link.role === "host" ? snap.guestName : snap.hostName;
              onGoRef.current(peer || "SÚPER", snap.bet, snap.mode);
            }
            if (link.role === "host") onTickRef.current(snap.guestHave, snap.guestScore);
            else onTickRef.current(snap.hostHave, snap.hostScore);
          }
        } catch (e) {
          if (stop) return;
          const msg = e instanceof Error ? e.message : "spojenie padlo";
          if (msg.includes("neexistuje") && started.current) setErr("Súper odišiel.");
          else if (!started.current) setErr(msg);
        }
      })();
    }, 400);

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
        <p className="modal-lead">
          {modeLabel(link.mode)} · stávka {formatMoney(link.bet || bet)} · každý platí zo svojho kreditu
        </p>
        <div className="duel-tabs">
          {link.role === "host" ? (
            <button type="button" className="chip-btn gold" disabled={!guest} onClick={launch}>
              {guest ? "ŠTART" : "ČAKÁM SÚPERA"}
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
  credit,
  bet,
}: Props) {
  const [a, setA] = useState("HRÁČ 1");
  const [b, setB] = useState("HRÁČ 2");
  const [mode, setMode] = useState<DuelMode>("spins");
  const [tab, setTab] = useState<"hotseat" | "online">("hotseat");
  const [code, setCode] = useState("");
  const [stake, setStake] = useState(bet);
  const [invite, setInvite] = useState<DuelSnap | null>(null);
  const [peekErr, setPeekErr] = useState("");
  useEffect(() => {
    if (!open) {
      setInvite(null);
      setPeekErr("");
    }
  }, [open]);
  useEffect(() => {
    setStake(bet);
  }, [bet]);

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
        {invite ? (
          <>
            <p className="modal-lead">POZVÁNKA OD {invite.hostName}</p>
            <div className="otrs-note">
              <em>{modeLabel(invite.mode)}</em>
              <span>Stávka {formatMoney(invite.bet)} na točenie. Každý platí zo svojho kreditu.</span>
              <strong>
                {invite.mode === "live"
                  ? `Kúpa PARKNET ${formatMoney(seatCost(invite.mode, invite.bet))}`
                  : `10 točení · cca ${formatMoney(seatCost(invite.mode, invite.bet))} z banku`}
              </strong>
              <b>Víťaz berie výhry oboch.</b>
            </div>
            {credit < invite.bet ? (
              <p className="spend-active is-late">Málo kreditu na túto stávku.</p>
            ) : null}
            <div className="duel-tabs">
              <button
                type="button"
                className="chip-btn gold"
                disabled={credit < invite.bet}
                onClick={() => onJoin(invite.mode, a, invite.code, invite.bet)}
              >
                PRIJAŤ
              </button>
              <button
                type="button"
                className="chip-btn"
                onClick={() => {
                  setInvite(null);
                  setPeekErr("");
                }}
              >
                ODMIETNUŤ
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="duel-modes">
              <button type="button" className={`spend-job ${mode === "spins" ? "stred" : "lacna"}`} onClick={() => setMode("spins")}>
                <em>10 TOČENÍ</em>
                <span>Vyšší súčet berie bank oboch.</span>
              </button>
              <button type="button" className={`spend-job ${mode === "live" ? "draha" : "lacna"}`} onClick={() => setMode("live")}>
                <em>1× LIVE</em>
                <span>Každý kúpi PARKNET zo svojho.</span>
              </button>
            </div>
            <BetPick value={stake} onChange={setStake} />
            <p className="modal-lead">Každý platí zo svojho kreditu. Stávka sa zamkne pred štartom.</p>
            {tab === "hotseat" ? (
              <>
                <label className="duel-field">
                  Hráč 1
                  <input value={a} onChange={(e) => setA(e.target.value)} maxLength={16} />
                </label>
                <label className="duel-field">
                  Hráč 2
                  <input value={b} onChange={(e) => setB(e.target.value)} maxLength={16} />
                </label>
                <button type="button" className="chip-btn gold" onClick={() => onStart(mode, a, b, stake)}>
                  ZAČNI PRI STOLE
                </button>
              </>
            ) : (
              <>
                <label className="duel-field">
                  Tvoje meno
                  <input value={a} onChange={(e) => setA(e.target.value)} maxLength={16} />
                </label>
                <button type="button" className="chip-btn gold" onClick={() => onHost(mode, a, stake)}>
                  VYTVORIŤ KÓD
                </button>
                <label className="duel-field">
                  Kód od kamoša
                  <input
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.toUpperCase());
                      setInvite(null);
                      setPeekErr("");
                    }}
                    maxLength={4}
                    placeholder="A7K2"
                  />
                </label>
                <button
                  type="button"
                  className="chip-btn"
                  disabled={code.replace(/[^A-Z0-9]/g, "").length < 4}
                  onClick={() => {
                    void (async () => {
                      try {
                        const snap = await duelPoll(code.replace(/[^A-Z0-9]/g, "").toUpperCase());
                        if (snap.phase !== "wait") {
                          setPeekErr("Už beží.");
                          return;
                        }
                        setInvite(snap);
                        setPeekErr("");
                      } catch (e) {
                        setPeekErr(e instanceof Error ? e.message : "Kód neexistuje");
                      }
                    })();
                  }}
                >
                  POZRIEŤ POZVÁNKU
                </button>
                {peekErr ? <p className="spend-active is-late">{peekErr}</p> : null}
              </>
            )}
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
  const live = duel.kind === "online";
  return (
    <div className="duel-bar" aria-live="polite">
      <span className={live || duel.turn === 0 ? "on" : ""}>
        {duel.seats[0].name}
        <b>{formatMoney(duel.seats[0].score)}</b>
        {live ? ` ${duel.seats[0].have}/${duel.need}` : ""}
      </span>
      <em>
        VS · {wait ? "čakám súpera" : live ? "TOČÍTE NARAZ" : me.name} · {formatMoney(duel.bet)}
        {live ? "" : ` · ešte ${left}`}
      </em>
      <span className={live || duel.turn === 1 ? "on" : ""}>
        {duel.seats[1].name}
        <b>{formatMoney(duel.seats[1].score)}</b>
        {live ? ` ${duel.seats[1].have}/${duel.need}` : ""}
      </span>
    </div>
  );
}
