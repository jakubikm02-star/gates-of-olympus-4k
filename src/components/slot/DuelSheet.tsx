import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/slot/format";
import { duelCreate, duelForfeit, duelJoin, duelLeave, duelPoll, duelStart, duelTick, type DuelSnap } from "@/lib/slot/duel-api";
import {
  canDuelSpin,
  duelCreditDelta,
  duelPot,
  duelView,
  duelWinner,
  type Duel,
  type DuelLink,
  type DuelMode,
} from "@/lib/slot/duel";
import { BETS } from "@/lib/slot/symbols";

interface Props {
  open: boolean;
  duel: Duel | null;
  link: DuelLink | null;
  peerName: string;
  bet: number;
  credit: number;
  onClose: () => void;
  onStart: (mode: DuelMode, a: string, b: string, bet: number, need: number, ante: boolean) => string;
  onHost: (mode: DuelMode, name: string, bet: number, need: number, ante: boolean) => string;
  onJoin: (mode: DuelMode, name: string, code: string, bet: number, need: number, ante: boolean) => string;
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

function modeLabel(need: number): string {
  return `${need} TOČENÍ`;
}

function seatCost(need: number, bet: number): number {
  return +(bet * need * 1.2).toFixed(2);
}

export function DuelLink({
  link,
  duel,
  bet,
  onPeerName,
  onGo,
  onTick,
  onForfeit,
  onPeerNet,
  onEnd,
  inFs,
}: {
  link: DuelLink;
  duel: Duel | null;
  bet: number;
  inFs: boolean;
  onPeerName: (name: string) => void;
  onGo: (peerName: string, bet: number, mode: DuelMode, need: number, ante: boolean) => void;
  onTick: (have: number, score: number) => void;
  onForfeit: (who: 0 | 1) => void;
  onPeerNet: (net: boolean) => void;
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
  const onForfeitRef = useRef(onForfeit);
  const onPeerNetRef = useRef(onPeerNet);
  const peerAt = useRef(0);
  const peerHave = useRef(-1);
  const playSince = useRef(0);
  const gaveUp = useRef(false);
  const inFsRef = useRef(inFs);
  onPeerNameRef.current = onPeerName;
  onGoRef.current = onGo;
  onTickRef.current = onTick;
  onForfeitRef.current = onForfeit;
  onPeerNetRef.current = onPeerNet;
  inFsRef.current = inFs;

  useEffect(() => {
    let stop = false;
    let ready = false;
    const boot = async () => {
      try {
        if (link.role === "host") {
          await duelCreate({
            code: link.room,
            name: link.name,
            mode: link.mode,
            bet: link.bet || bet,
            need: link.need || 10,
            ante: link.ante,
          });
          if (stop) return;
          ready = true;
          setErr("");
          setStatus("Kód je živý. Pošli ho kamošovi.");
        } else {
          const snap = await duelJoin(link.room, link.name);
          if (stop) return;
          ready = true;
          onPeerNameRef.current(snap.hostName);
          setErr("");
          setStatus("Si v miestnosti. Čakám na ŠTART.");
        }
      } catch (e) {
        if (!stop) setErr(e instanceof Error ? e.message : "Spojenie zlyhalo");
      }
    };
    void boot();

    const tick = window.setInterval(() => {
      if (!ready) return;
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
                onGoRef.current(go.guestName || snap.guestName, go.bet, go.mode, go.need, go.ante);
              })
              .catch(() => {});
          }
          if (snap.forfeit != null && !gaveUp.current) {
            gaveUp.current = true;
            const theirs = link.role === "host" ? snap.guestHave : snap.hostHave;
            const theirScore = link.role === "host" ? snap.guestScore : snap.hostScore;
            onTickRef.current(theirs, theirScore);
            onForfeitRef.current(snap.forfeit);
            return;
          }
          if (snap.phase === "play" || snap.phase === "done") {
            if (!started.current) {
              started.current = true;
              const peer = link.role === "host" ? snap.guestName : snap.hostName;
              onGoRef.current(peer || "SÚPER", snap.bet, snap.mode, snap.need, snap.ante);
            }
            const theirs = link.role === "host" ? snap.guestHave : snap.hostHave;
            const theirScore = link.role === "host" ? snap.guestScore : snap.hostScore;
            const mine = link.role === "host" ? snap.hostHave : snap.guestHave;
            const peerNet = link.role === "host" ? snap.guestNet : snap.hostNet;
            const peerSeen = link.role === "host" ? snap.guestSeen : snap.hostSeen;
            onPeerNetRef.current(peerNet);
            if (snap.phase === "play" && playSince.current === 0) playSince.current = Date.now();
            if (theirs !== peerHave.current) {
              peerHave.current = theirs;
              peerAt.current = Date.now();
            }
            const lastBeat = peerSeen > playSince.current ? peerSeen : playSince.current;
            const seenAge = playSince.current ? Date.now() - lastBeat : 0;
            const silent = snap.phase === "play" && seenAge > 45_000;
            const frozen =
              snap.phase === "play" &&
              !peerNet &&
              mine > theirs &&
              peerAt.current > 0 &&
              Date.now() - peerAt.current > 90_000;
            if ((silent || frozen) && !gaveUp.current) {
              const who: 0 | 1 = link.role === "host" ? 1 : 0;
              void duelForfeit(link.room, link.role === "host" ? "guest" : "host").catch(() => {});
              gaveUp.current = true;
              onForfeitRef.current(who);
            }
            onTickRef.current(theirs, theirScore);
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
  }, [link.room, link.role, link.name, link.mode, link.bet, link.need, link.ante, bet]);

  useEffect(() => {
    if (!duel || duel.kind !== "online" || duel.phase !== "play") return;
    const send = () => {
      const have = duel.seats[duel.you].have;
      const score = Math.max(0, +(duel.seats[duel.you].score - (duel.held || 0)).toFixed(2));
      lastHave.current = have;
      void duelTick(link.room, link.role, have, score, {
        name: link.name,
        ante: Boolean(link.ante),
        net: inFsRef.current,
      }).catch(() => {});
    };
    send();
    const id = window.setInterval(send, 4000);
    return () => window.clearInterval(id);
  }, [duel, link.room, link.role, link.name, link.ante]);

  const launch = () => {
    if (started.current || link.role !== "host" || !guest) return;
    void (async () => {
      try {
        const snap = await duelStart(link.room);
        started.current = true;
        onGo(snap.guestName || guest, snap.bet, snap.mode, snap.need, snap.ante);
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
          {modeLabel(link.need || 10)} · stávka {formatMoney(link.bet || bet)}
          {link.ante ? " · ANTE" : ""} · min. kredit {formatMoney(seatCost(link.need || 10, link.bet || bet))}
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
  const [need, setNeed] = useState(10);
  const [anteOn, setAnteOn] = useState(false);
  const [tab, setTab] = useState<"hotseat" | "online">("hotseat");
  const [code, setCode] = useState("");
  const [stake, setStake] = useState(bet);
  const [invite, setInvite] = useState<DuelSnap | null>(null);
  const [peekErr, setPeekErr] = useState("");
  const [block, setBlock] = useState("");
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
    const view = duelView(duel);
    const gain = duel.kind === "hotseat" ? duelPot(duel) : duelCreditDelta(duel, duel.you);
    const title = duel.forfeit != null ? "VZDANIE" : duelWinner(duel) === null ? "REMÍZA" : "DUEL";
    return (
      <div className="modal-back" role="presentation">
        <div className="modal-card spend-card duel-slam" role="dialog" aria-labelledby="duel-title">
          <header className="modal-head">
            <h2 id="duel-title">{title}</h2>
          </header>
          <p className="duel-vs">
            {formatMoney(view.mine)} vs {formatMoney(view.peer)}
          </p>
          <p className="duel-take">{gain > 0 ? `+${formatMoney(gain)}` : "0,00"}</p>
          <button type="button" className="chip-btn gold" onClick={onEnd}>
            PORT
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
              <em>{modeLabel(invite.need)}</em>
              <span>
                Stávka {formatMoney(invite.bet)} na točenie{invite.ante ? " · ANTE" : ""}. Každý platí zo svojho kreditu.
              </span>
              <strong>
                {invite.need} točení · min. kredit {formatMoney(seatCost(invite.need, invite.bet))}
              </strong>
              <b>Víťaz berie výhry oboch. Remíza vracia každému jeho výhru.</b>
            </div>
            {credit < seatCost(invite.need, invite.bet) ? (
              <p className="spend-active is-late">Málo kreditu na tento duel.</p>
            ) : null}
            <div className="duel-tabs">
              <button
                type="button"
                className="chip-btn gold duel-go"
                disabled={credit < seatCost(invite.need, invite.bet)}
                onClick={() => setBlock(onJoin(invite.mode, a, invite.code, invite.bet, invite.need, invite.ante))}
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
            <div className="duel-tabs">
              {[5, 10, 20].map((n) => (
                <button key={n} type="button" className={`chip-btn ${need === n ? "gold" : ""}`} onClick={() => setNeed(n)}>
                  {n} SPINOV
                </button>
              ))}
            </div>
            <BetPick value={stake} onChange={setStake} />
            <button type="button" className={`chip-btn ${anteOn ? "gold" : ""}`} onClick={() => setAnteOn((v) => !v)}>
              ANTE {anteOn ? "ON" : "OFF"}
            </button>
            <p className="modal-lead">
              Rovnaká stávka aj Ante. Min. kredit {formatMoney(seatCost(need, stake))}. Buy je v dueli zamknutý.
            </p>
            {credit < seatCost(need, stake) ? <p className="spend-active is-late">Málo kreditu.</p> : null}
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
                <button
                  type="button"
                  className="chip-btn gold duel-go"
                  disabled={credit < seatCost(need, stake)}
                  onClick={() => setBlock(onStart("spins", a, b, stake, need, anteOn))}
                >
                  ZAČNI PRI STOLE
                </button>
              </>
            ) : (
              <>
                <label className="duel-field">
                  Tvoje meno
                  <input value={a} onChange={(e) => setA(e.target.value)} maxLength={16} />
                </label>
                <button
                  type="button"
                  className="chip-btn gold duel-go"
                  disabled={credit < seatCost(need, stake)}
                  onClick={() => setBlock(onHost("spins", a, stake, need, anteOn))}
                >
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
            {block ? <p className="spend-active is-late">{block}</p> : null}
          </>
        )}
      </div>
    </div>
  );
}

export function DuelBar({ duel, onForfeit }: { duel: Duel; onForfeit?: () => void }) {
  const view = duelView(duel);
  const wait = view.waiting || (duel.kind === "online" && !canDuelSpin(duel) && duel.phase === "play");
  const nextPeer = Math.min(duel.need, duel.seats[duel.you === 0 ? 1 : 0].have);
  const caption = wait
    ? `HOTOVO · SÚPER ${nextPeer}/${duel.need}`
    : `SPIN ${view.k} / ${duel.need}`;
  return (
    <div className={`duel-bar ${wait ? "is-wait" : ""}`} aria-live="polite">
      <span className="duel-me">
        TY <b>{formatMoney(view.mine)}</b>
      </span>
      <em>
        <i className="duel-dots" aria-hidden="true">
          {Array.from({ length: Math.min(20, duel.need) }, (_, i) => (
            <b key={i} className={i < view.k ? "on" : ""} />
          ))}
        </i>
        {caption}
        {onForfeit && duel.phase === "play" ? (
          <button type="button" className="duel-fold" onClick={onForfeit}>
            VZDAŤ
          </button>
        ) : null}
      </em>
      <span className="duel-them">
        SÚPER <b>{formatMoney(view.peer)}</b>
      </span>
    </div>
  );
}
