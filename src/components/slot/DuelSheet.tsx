import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/slot/format";
import { duelCreate, duelForfeitIf, duelJoin, duelLeave, duelPoll, duelStart, duelTick, type DuelSnap } from "@/lib/slot/duel-api";
import {
  canDuelSpin,
  duelCreditDelta,
  duelPot,
  duelView,
  duelWinner,
  peerFrozen,
  type Duel,
  type DuelLink,
  type DuelMode,
} from "@/lib/slot/duel";
import { BETS } from "@/lib/slot/symbols";
import { DUEL_DEPOSIT_MULT, depositAmount, duelEntryCost, type DepositSettlement } from "@/lib/slot/duel-deposit";

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
  /** Last kaucia settlement (shown on the result card). */
  depositNote?: DepositSettlement | null;
}

/** No heartbeat from the peer for this long while it still owes spins: the peer is out. */
const PEER_SILENT_MS = 90_000;
/** Room polls failing this long mid-duel: the network/room is at fault (a later timeout refunds the kaucia). */
const ROOM_NET_FAIL_MS = 30_000;
/** Consecutive "room not found" polls mid-duel before the duel is aborted as a room failure. */
const ROOM_GONE_POLLS = 3;

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

/** Min. credit per seat: stakes reserve (1.2 x bet x spins) + kaucia (DUEL_DEPOSIT_MULT x bet). */
function seatCost(need: number, bet: number): number {
  return duelEntryCost({ bet, need }).perSeat;
}

const DEPOSIT_RULE = `Kaucia ${DUEL_DEPOSIT_MULT}× stávka: po dohraní (aj remíza) sa vráti, pri odchode / VZDAŤ / neaktivite prepadne. Chyba hry alebo odchod súpera = vrátená.`;

/** Seat colours, the same in lobby, panel and result: seat 0 (host / HRÁČ 1) gold, seat 1 (guest / HRÁČ 2) cyan. */
export const SEAT_CLASS = ["p1", "p2"] as const;

/** One dot per spin: filled = played, ring = the spin this seat is on now. */
export function DuelPips({ have, need, live }: { have: number; need: number; live?: boolean }) {
  const n = Math.max(1, Math.min(20, need));
  const k = Math.max(0, Math.min(n, have));
  return (
    <span className={`duel-pips ${n > 10 ? "is-dense" : ""}`} aria-label={`${k} z ${n} točení`}>
      {Array.from({ length: n }, (_, i) => (
        <i key={i} className={i < k ? "on" : i === k && live ? "now" : ""} />
      ))}
    </span>
  );
}

export function DuelSeatRow({
  seat,
  name,
  have,
  need,
  score,
  you,
  live,
  status,
  win,
}: {
  seat: 0 | 1;
  name: string;
  have: number;
  need: number;
  /** null = not known yet (empty lobby seat). */
  score: number | null;
  you?: boolean;
  /** This seat is on its turn (ring on the next dot). */
  live?: boolean;
  status?: string;
  win?: boolean;
}) {
  return (
    <div className={`duel-seat ${SEAT_CLASS[seat]} ${you ? "is-you" : ""} ${win ? "is-win" : ""}`}>
      <span className="duel-seat-name">
        <i className="duel-chip" aria-hidden="true" />
        <span className="duel-seat-label">{name || "…"}</span>
        {you ? <small className="duel-you">TY</small> : null}
        {win ? <small className="duel-crown">VÍŤAZ</small> : null}
      </span>
      <span className="duel-seat-track">
        <DuelPips have={have} need={need} live={live} />
        <span className="duel-seat-count">
          {Math.min(have, need)}/{need}
        </span>
      </span>
      <b className="duel-seat-score">{score == null ? "—" : formatMoney(score)}</b>
      {status ? <em className={`duel-seat-status ${status === "4KA TV / TOČÍ" ? "is-busy" : ""}`}>{status}</em> : null}
    </div>
  );
}

function depositLine(st: DepositSettlement | null | undefined): string {
  if (!st) return "";
  if (st.burned > 0 && st.refund > 0) return `Kaucia: prepadlo ${formatMoney(st.burned)} · vrátené ${formatMoney(st.refund)}`;
  if (st.burned > 0) return `Kaucia prepadla: ${formatMoney(st.burned)}`;
  return `Kaucia vrátená: ${formatMoney(st.refund)}`;
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
  onRoomFail,
  inFs,
  peerName = "",
}: {
  link: DuelLink;
  duel: Duel | null;
  bet: number;
  /** This seat is busy (spin, 4KA TV, banner, KONTROLA): sent as the `net` heartbeat flag. */
  inFs: boolean;
  onPeerName: (name: string) => void;
  onGo: (peerName: string, bet: number, mode: DuelMode, need: number, ante: boolean) => void;
  onTick: (have: number, score: number) => void;
  onForfeit: (who: 0 | 1) => void;
  onPeerNet: (net: boolean) => void;
  onEnd: () => void;
  /** Room vanished mid-duel / polls+writes failing / both seats were away: the game's fault (kaucia back). */
  onRoomFail?: (kind: "gone" | "net" | "both") => void;
  /** Opponent name as far as known (host name for a guest). */
  peerName?: string;
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
  const onRoomFailRef = useRef(onRoomFail);
  const goneRun = useRef(0);
  const lastOk = useRef(0);
  const netFlagged = useRef(false);
  const tickOk = useRef(0);
  onRoomFailRef.current = onRoomFail;
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
          // This client itself was away (JS paused in the background) for longer than the silent limit.
          const awayMe = lastOk.current > 0 && Date.now() - lastOk.current > PEER_SILENT_MS;
          lastOk.current = Date.now();
          goneRun.current = 0;
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
            // The no-progress clock restarts on every peer spin and stays at zero while the peer is busy
            // (spin, 4KA TV, a banner still open): modal time never counts toward the 90 s.
            if (theirs !== peerHave.current || peerNet) {
              peerHave.current = theirs;
              peerAt.current = Date.now();
            }
            const lastBeat = peerSeen > playSince.current ? peerSeen : playSince.current;
            const seenAge = playSince.current ? Date.now() - lastBeat : 0;
            // 90 s (was 45 s): a phone that locks or switches apps for a moment pauses JS and the heartbeat.
            const silent = snap.phase === "play" && theirs < snap.need && seenAge > PEER_SILENT_MS;
            const frozen =
              snap.phase === "play" &&
              peerFrozen({ now: Date.now(), idleSince: peerAt.current, peerBusy: peerNet, mine, theirs, need: snap.need });
            if (silent && awayMe && !gaveUp.current) {
              // Both seats dropped: nobody claims the bank. The host removes the room so the guest's
              // client aborts too ("room gone"); each seat keeps its own stack and gets its kaucia back.
              gaveUp.current = true;
              if (link.role === "host") void duelLeave(link.room, "host");
              onRoomFailRef.current?.("both");
              return;
            }
            if ((silent || frozen) && !gaveUp.current) {
              const who: 0 | 1 = link.role === "host" ? 1 : 0;
              gaveUp.current = true;
              // Only a forfeit this client actually wrote (peer still short of its spins) is settled locally.
              void duelForfeitIf(link.room, link.role === "host" ? "guest" : "host", snap.need, "peer")
                .then((ok) => {
                  if (stop) return;
                  if (ok) onForfeitRef.current(who);
                  else gaveUp.current = false;
                })
                .catch(() => {
                  gaveUp.current = false;
                });
            }
            onTickRef.current(theirs, theirScore);
          }
        } catch (e) {
          if (stop) return;
          const msg = e instanceof Error ? e.message : "spojenie padlo";
          if (started.current && !gaveUp.current) {
            if (msg.includes("neexistuje")) {
              goneRun.current += 1;
              if (goneRun.current >= ROOM_GONE_POLLS) onRoomFailRef.current?.("gone");
            } else if (!netFlagged.current && lastOk.current > 0 && Date.now() - lastOk.current > ROOM_NET_FAIL_MS) {
              netFlagged.current = true;
              onRoomFailRef.current?.("net");
            }
          }
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
    if (!duel || duel.kind !== "online") return;
    if (duel.phase !== "play" && duel.phase !== "done") return;
    const send = () => {
      const have = duel.seats[duel.you].have;
      const score = Math.max(0, +(duel.seats[duel.you].score - (duel.held || 0)).toFixed(2));
      lastHave.current = have;
      void duelTick(link.room, link.role, have, score, {
        name: link.name,
        ante: Boolean(link.ante),
        net: inFsRef.current,
      })
        .then(() => {
          tickOk.current = Date.now();
        })
        .catch(() => {
          // Heartbeat writes failing for a long time mid-duel: the room/network is at fault.
          if (duel.phase !== "play" || netFlagged.current) return;
          if (tickOk.current > 0 && Date.now() - tickOk.current > ROOM_NET_FAIL_MS) {
            netFlagged.current = true;
            onRoomFailRef.current?.("net");
          }
        });
    };
    if (tickOk.current === 0) tickOk.current = Date.now();
    send();
    if (duel.phase !== "play") return;
    const id = window.setInterval(send, 1500);
    // Back from the background: beat at once instead of waiting for the next interval.
    const onShow = () => {
      if (document.visibilityState === "visible") send();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
    };
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

  const need = link.need || 10;
  const stake = link.bet || bet;
  const hostName = link.role === "host" ? link.name : peerName || "HOSŤ";
  const guestName = link.role === "guest" ? link.name : guest;
  return (
    <div className="modal-back" role="presentation">
      <div className="modal-card spend-card duel-card duel-lobby" role="dialog" aria-labelledby="duel-title">
        <header className="modal-head">
          <h2 id="duel-title">{link.role === "host" ? "DUEL · LOBBY" : "DUEL · PRIPÁJAM"}</h2>
          <button type="button" className="icon-btn" onClick={leave} aria-label="Odísť">
            ×
          </button>
        </header>
        <p className="duel-kicker">KÓD MIESTNOSTI · ťukni pre kopírovanie</p>
        <button type="button" className="duel-code" onClick={copy} aria-label="Skopírovať kód">
          {link.room}
        </button>
        <div className="duel-seats">
          <DuelSeatRow seat={0} name={hostName} have={0} need={need} score={null} you={link.role === "host"} status={link.role === "host" ? "PRIPRAVENÝ" : "HOSŤ"} />
          <DuelSeatRow
            seat={1}
            name={guestName || "čaká sa…"}
            have={0}
            need={need}
            score={null}
            you={link.role === "guest"}
            status={guestName ? "PRIPRAVENÝ" : "VOĽNÉ"}
          />
        </div>
        <dl className="duel-facts">
          <div>
            <dt>Režim</dt>
            <dd>{modeLabel(need)}</dd>
          </div>
          <div>
            <dt>Stávka</dt>
            <dd>
              {formatMoney(stake)}
              {link.ante ? " · ANTE" : ""}
            </dd>
          </div>
          <div className="is-deposit">
            <dt>Kaucia</dt>
            <dd>{formatMoney(depositAmount(stake))}</dd>
          </div>
          <div>
            <dt>Min. kredit</dt>
            <dd>{formatMoney(seatCost(need, stake))}</dd>
          </div>
        </dl>
        <p className={`duel-status ${err ? "is-err" : ""}`}>{err || status}</p>
        <p className="duel-rule">{DEPOSIT_RULE}</p>
        <div className="duel-actions">
          {link.role === "host" ? (
            <button type="button" className="chip-btn gold duel-go" disabled={!guest} onClick={launch}>
              {guest ? "ŠTART" : "ČAKÁM SÚPERA…"}
            </button>
          ) : (
            <span className="duel-status">Čakám na ŠTART od hosťa.</span>
          )}
          <button type="button" className="chip-btn duel-leave" onClick={leave}>
            ODÍSŤ · kaucia späť
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
  depositNote,
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
    const gain = duel.kind === "hotseat" ? duelPot(duel) : duelCreditDelta(duel, duel.you);
    const w = duel.aborted ? null : duel.forfeit != null ? (duel.forfeit === 0 ? 1 : 0) : duelWinner(duel);
    const title = duel.aborted ? "ZRUŠENÝ" : duel.forfeit != null ? "VZDANIE" : w === null ? "REMÍZA" : "DUEL";
    const dep = depositLine(depositNote);
    const verdict =
      duel.aborted
        ? "Hra zlyhala · každý si necháva svoju výhru"
        : w === null
          ? "Remíza · každý si necháva svoju výhru"
          : duel.kind === "online"
            ? w === duel.you
              ? "VYHRAL SI · berieš bank"
              : "PREHRAL SI · bank berie súper"
            : `${duel.seats[w].name} berie bank`;
    return (
      <div className="modal-back" role="presentation">
        <div className={`modal-card spend-card duel-card duel-slam ${w === null ? "" : `win-${SEAT_CLASS[w]}`}`} role="dialog" aria-labelledby="duel-title">
          <header className="modal-head">
            <h2 id="duel-title">{title}</h2>
          </header>
          <p className="duel-verdict">{verdict}</p>
          <div className="duel-seats">
            {([0, 1] as const).map((i) => (
              <DuelSeatRow
                key={i}
                seat={i}
                name={duel.seats[i].name}
                have={duel.seats[i].have}
                need={duel.need}
                score={duel.seats[i].score}
                you={duel.kind === "online" && duel.you === i}
                win={w === i}
                status={duel.forfeit === i ? "VZDAL" : undefined}
              />
            ))}
          </div>
          <p className="duel-take">{gain > 0 ? `+${formatMoney(gain)}` : "0,00"}</p>
          {dep ? <p className={`duel-deposit-note ${depositNote && depositNote.burned > 0 ? "is-burn" : ""}`}>{dep}</p> : null}
          <button type="button" className="chip-btn gold duel-go" onClick={onEnd}>
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
        className="modal-card spend-card duel-card duel-setup"
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
        <p className="duel-kicker">Dvaja hráči, rovnaká stávka, rovnaký počet točení. Víťaz berie výhry oboch.</p>
        <div className="duel-tabs duel-seg">
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
            <dl className="duel-facts">
              <div>
                <dt>Točenia</dt>
                <dd>
                  <DuelPips have={0} need={invite.need} />
                </dd>
              </div>
              <div className="is-deposit">
                <dt>Kaucia</dt>
                <dd>{formatMoney(depositAmount(invite.bet))}</dd>
              </div>
              <div>
                <dt>Min. kredit</dt>
                <dd>{formatMoney(seatCost(invite.need, invite.bet))}</dd>
              </div>
            </dl>
            <p className="duel-rule">{DEPOSIT_RULE}</p>
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
            <div className="duel-tabs duel-seg">
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
            <dl className="duel-facts">
              <div>
                <dt>Točenia</dt>
                <dd>
                  <DuelPips have={0} need={need} />
                </dd>
              </div>
              <div className="is-deposit">
                <dt>Kaucia</dt>
                <dd>
                  {formatMoney(depositAmount(stake))}
                  {tab === "hotseat" ? ` × 2 = ${formatMoney(depositAmount(stake) * 2)}` : ""}
                </dd>
              </div>
              <div>
                <dt>Min. kredit</dt>
                <dd>{formatMoney(seatCost(need, stake) * (tab === "hotseat" ? 2 : 1))}</dd>
              </div>
            </dl>
            <p className="duel-rule">
              Stávky + kaucia. Rovnaká stávka aj Ante, Buy je v dueli zamknutý. {DEPOSIT_RULE}
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
                {credit >= seatCost(need, stake) && credit < seatCost(need, stake) * 2 ? (
                  <p className="spend-active is-late">Pri stole točia obaja z jedného kreditu · min. {formatMoney(seatCost(need, stake) * 2)}</p>
                ) : null}
                <button
                  type="button"
                  className="chip-btn gold duel-go"
                  disabled={credit < seatCost(need, stake) * 2}
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

export function DuelBar({
  duel,
  onForfeit,
  canFold = true,
  deposit = 0,
  variant = "bar",
}: {
  duel: Duel;
  onForfeit?: () => void;
  canFold?: boolean;
  /** Kaucia still held for this duel (0 = none / settled). */
  deposit?: number;
  /** bar = above the board (phones), card = side column (desktop, away from the jackpot strip). */
  variant?: "bar" | "card";
}) {
  const view = duelView(duel);
  const online = duel.kind === "online";
  const me: 0 | 1 = online ? duel.you : duel.turn;
  const peer: 0 | 1 = me === 0 ? 1 : 0;
  const wait = view.waiting || (online && !canDuelSpin(duel) && duel.phase === "play");
  const left = Math.max(0, duel.need - duel.seats[me].have);
  // Scores as each seat should see them: online my own last spin stays hidden until the peer reaches it.
  const shown = (i: 0 | 1) => (online ? (i === duel.you ? view.mine : view.peer) : duel.seats[i].score);
  const statusOf = (i: 0 | 1): string | undefined => {
    if (duel.seats[i].have >= duel.need) return "HOTOVO";
    if (online) {
      if (i === duel.you) return wait ? "ČAKÁŠ" : "NA ŤAHU";
      return duel.peerNet ? "4KA TV / TOČÍ" : "TOČÍ";
    }
    return i === duel.turn ? "NA ŤAHU" : "ČAKÁ";
  };
  const fold =
    onForfeit && duel.phase === "play" ? (
      <button
        type="button"
        className="duel-fold"
        onClick={onForfeit}
        disabled={!canFold}
        title={canFold ? (deposit > 0 ? "Vzdaním kaucia prepadne" : undefined) : "VZDAŤ až po dotočení"}
      >
        VZDAŤ{variant === "card" && deposit > 0 ? " · kaucia prepadne" : ""}
      </button>
    ) : null;
  return (
    <div className={`duel-bar duel-panel is-${variant} ${wait ? "is-wait" : ""}`} aria-live="polite">
      <div className="duel-panel-head">
        <span className="duel-panel-title">DUEL</span>
        <span className="duel-panel-left">{wait ? "HOTOVO · ČAKÁ SA NA SÚPERA" : `ZOSTÁVA ${left}/${duel.need}`}</span>
        {deposit > 0 ? <span className="duel-panel-deposit">KAUCIA {formatMoney(deposit)}</span> : null}
        {variant === "bar" ? fold : null}
      </div>
      <div className="duel-seats">
        {([0, 1] as const).map((i) => (
          <DuelSeatRow
            key={i}
            seat={i}
            name={duel.seats[i].name}
            have={duel.seats[i].have}
            need={duel.need}
            score={shown(i)}
            you={online && i === duel.you}
            live={duel.phase === "play" && duel.seats[i].have < duel.need && (online ? i !== duel.you || !wait : i === duel.turn)}
            status={statusOf(i)}
          />
        ))}
      </div>
      {variant === "card" ? fold : null}
      <span className="duel-sr">
        {duel.seats[me].name} {formatMoney(shown(me))} vs {duel.seats[peer].name} {formatMoney(shown(peer))}
      </span>
    </div>
  );
}
