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
import { cleanRoomCode, duelSummary } from "@/lib/slot/duel-setup";

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
  /** Saved leaderboard nick: the default name in the setup (empty = none saved). */
  nick?: string;
  /** This player's ante multiplier (rank perk): the stake shown in the summary when ANTE is on. */
  anteMul?: number;
}

/** No heartbeat from the peer for this long while it still owes spins: the peer is out. */
const PEER_SILENT_MS = 90_000;
/** Room polls failing this long mid-duel: the network/room is at fault (a later timeout refunds the kaucia). */
const ROOM_NET_FAIL_MS = 30_000;
/** Consecutive "room not found" polls mid-duel before the duel is aborted as a room failure. */
const ROOM_GONE_POLLS = 3;

function modeLabel(need: number): string {
  return `${need} TOČENÍ`;
}

/** Min. credit per seat: stakes reserve (1.2 x bet x spins) + kaucia (DUEL_DEPOSIT_MULT x bet). */
function seatCost(need: number, bet: number): number {
  return duelEntryCost({ bet, need }).perSeat;
}

/** Kaucia rules, one line each: shown behind the (i) button instead of a wall of small print. */
const DEPOSIT_RULES = [
  `Kaucia = ${DUEL_DEPOSIT_MULT}× stávka na točenie, platí každý hráč.`,
  "Vráti sa po dohraní (aj pri remíze), keď súper odíde, alebo keď zlyhá hra / spojenie.",
  "Prepadne, keď odídeš, dáš VZDAŤ alebo prestaneš hrať (neaktivita).",
  "Min. kredit = rezerva na stávky (1,2× stávka × točenia) + kaucia.",
  "V dueli je zamknutá stávka, Ante aj Buy. KONTROLA ani ZÁSAH sa nespúšťajú.",
];

/** (i) button + popover with the kaucia rules. */
function DepositInfo({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="duel-info">
      <button
        type="button"
        className={`duel-info-btn ${open ? "is-open" : ""}`}
        aria-expanded={open}
        aria-controls={id}
        aria-label="Pravidlá kaucie"
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>
      {open ? (
        <span className="duel-info-pop" id={id} role="note" onClick={() => setOpen(false)}>
          <b>Kaucia</b>
          {DEPOSIT_RULES.map((r) => (
            <span key={r}>{r}</span>
          ))}
        </span>
      ) : null}
    </span>
  );
}

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
        <p className={`duel-status ${err ? "is-err" : ""}`}>
          {err || status} <DepositInfo id="duel-lobby-info" />
        </p>
        <div className={`duel-actions ${link.role === "host" ? "" : "is-guest"}`}>
          {link.role === "host" ? (
            <button type="button" className="chip-btn gold duel-go" disabled={!guest} onClick={launch}>
              {guest ? "ŠTART" : "ČAKÁM SÚPERA…"}
            </button>
          ) : null}
          <button type="button" className="chip-btn duel-leave" onClick={leave}>
            ODÍSŤ · kaucia späť
          </button>
        </div>
      </div>
    </div>
  );
}

/** Stake presets offered under the stepper (all are BETS values); only the affordable ones show. */
const STAKE_PRESETS = [1, 5, 20, 100, 500, 1000] as const;

function nearestBetIndex(value: number): number {
  return BETS.reduce((best, v, idx) => (Math.abs(v - value) < Math.abs(BETS[best] - value) ? idx : best), 0);
}

function stepBet(value: number, dir: -1 | 1): number {
  const i = nearestBetIndex(value);
  return BETS[Math.min(BETS.length - 1, Math.max(0, i + dir))] ?? value;
}

function Seg<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { v: T; label: string; sub?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="duel-seg2" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          className={value === o.v ? "is-on" : ""}
          onClick={() => onChange(o.v)}
        >
          <b>{o.label}</b>
          {o.sub ? <small>{o.sub}</small> : null}
        </button>
      ))}
    </div>
  );
}

type JoinState =
  | { kind: "idle" }
  | { kind: "loading"; code: string }
  | { kind: "error"; code: string; msg: string }
  | { kind: "ok"; snap: DuelSnap };

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
  nick = "",
  anteMul = 1,
}: Props) {
  const [a, setA] = useState(nick || "HRÁČ 1");
  const [b, setB] = useState("HRÁČ 2");
  const nameTouched = useRef(false);
  const [need, setNeed] = useState(10);
  const [anteOn, setAnteOn] = useState(false);
  const [tab, setTab] = useState<"create" | "join">("create");
  const [where, setWhere] = useState<"online" | "hotseat">("online");
  const [code, setCode] = useState("");
  const [stake, setStake] = useState(bet);
  const [join, setJoin] = useState<JoinState>({ kind: "idle" });
  const lookupId = useRef(0);
  const [block, setBlock] = useState("");
  useEffect(() => {
    if (!open) {
      setJoin({ kind: "idle" });
      setBlock("");
    }
  }, [open]);
  useEffect(() => {
    setStake(bet);
  }, [bet]);
  // The saved leaderboard nick is the default name, until the player edits the field.
  useEffect(() => {
    if (nick && !nameTouched.current) setA(nick);
  }, [nick, open]);

  const lookup = (raw: string) => {
    const room = cleanRoomCode(raw);
    if (room.length < 4) return;
    const id = ++lookupId.current;
    setJoin({ kind: "loading", code: room });
    void (async () => {
      try {
        const snap = await duelPoll(room);
        if (id !== lookupId.current) return;
        if (snap.phase !== "wait") {
          setJoin({ kind: "error", code: room, msg: "Tento duel už beží." });
          return;
        }
        setJoin({ kind: "ok", snap });
      } catch (e) {
        if (id !== lookupId.current) return;
        setJoin({ kind: "error", code: room, msg: e instanceof Error ? e.message : "Kód neexistuje" });
      }
    })();
  };

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

  const seats: 1 | 2 = where === "hotseat" ? 2 : 1;
  const sum = duelSummary({ bet: stake, need, ante: anteOn, anteMul, seats });
  const createShort = credit < sum.minCredit;
  const presets = STAKE_PRESETS.filter((v) => seatCost(need, v) * seats <= credit);
  const maxed = nearestBetIndex(stake) >= BETS.length - 1;
  const minned = nearestBetIndex(stake) <= 0;

  const invite = join.kind === "ok" ? join.snap : null;
  const inviteSum = invite ? duelSummary({ bet: invite.bet, need: invite.need, ante: invite.ante, anteMul, seats: 1 }) : null;
  const joinShort = inviteSum ? credit < inviteSum.minCredit : false;
  const codeOk = code.length === 4;

  const editName = (v: string) => {
    nameTouched.current = true;
    setA(v);
  };
  const nameInput = (label: string, value: string, set: (v: string) => void, id: string) => (
    <label className="duel-in" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        value={value}
        onChange={(e) => set(e.target.value)}
        maxLength={16}
        autoComplete="nickname"
        autoCapitalize="characters"
        spellCheck={false}
        enterKeyHint="done"
      />
    </label>
  );

  let cta: { label: string; disabled: boolean; run: () => void };
  if (tab === "create") {
    cta =
      where === "online"
        ? { label: "VYTVORIŤ DUEL", disabled: createShort, run: () => setBlock(onHost("spins", a, stake, need, anteOn)) }
        : { label: "ZAČAŤ PRI STOLE", disabled: createShort, run: () => setBlock(onStart("spins", a, b, stake, need, anteOn)) };
  } else if (invite) {
    cta = {
      label: "PRIPOJIŤ SA",
      disabled: joinShort,
      run: () => setBlock(onJoin(invite.mode, a, invite.code, invite.bet, invite.need, invite.ante)),
    };
  } else {
    cta = {
      label: join.kind === "loading" ? "HĽADÁM DUEL…" : "PRIPOJIŤ SA",
      disabled: !codeOk || join.kind === "loading",
      run: () => lookup(code),
    };
  }

  const note =
    block ||
    (tab === "create" && createShort ? `Málo kreditu · treba ${formatMoney(sum.minCredit)}` : "") ||
    (tab === "join" && joinShort && inviteSum ? `Málo kreditu · treba ${formatMoney(inviteSum.minCredit)}` : "");

  return (
    <div className="modal-back duel-setup-back" onClick={onClose} role="presentation">
      <div
        className="modal-card spend-card duel-card duel-setup"
        role="dialog"
        aria-labelledby="duel-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="duel-setup-head">
          <div>
            <h2 id="duel-title">DUEL</h2>
            <p>Rovnaká stávka aj točenia · víťaz berie výhry oboch</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Zavrieť">
            ×
          </button>
        </header>
        <div className="duel-tabs2" role="tablist" aria-label="Duel">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "create"}
            className={tab === "create" ? "is-on" : ""}
            onClick={() => {
              setTab("create");
              setBlock("");
            }}
          >
            Vytvoriť duel
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "join"}
            className={tab === "join" ? "is-on" : ""}
            onClick={() => {
              setTab("join");
              setBlock("");
            }}
          >
            Pripojiť sa
          </button>
        </div>

        <div className="duel-setup-body">
          {tab === "create" ? (
            <>
              <section className="duel-sec">
                <h3>Kde hráte</h3>
                <Seg
                  label="Kde hráte"
                  value={where}
                  onChange={(v) => {
                    setWhere(v);
                    setBlock("");
                  }}
                  options={[
                    { v: "online", label: "Na diaľku", sub: "pošleš kód" },
                    { v: "hotseat", label: "Pri stole", sub: "1 telefón" },
                  ]}
                />
              </section>
              <section className="duel-sec">
                <h3>Točenia na hráča</h3>
                <Seg
                  label="Točenia"
                  value={need}
                  onChange={setNeed}
                  options={[
                    { v: 5, label: "5" },
                    { v: 10, label: "10" },
                    { v: 20, label: "20" },
                  ]}
                />
              </section>
              <section className="duel-sec">
                <h3>Stávka na točenie</h3>
                <div className="duel-stake">
                  <button type="button" disabled={minned} onClick={() => setStake(stepBet(stake, -1))} aria-label="Nižšia stávka">
                    −
                  </button>
                  <b aria-live="polite">{formatMoney(stake)}</b>
                  <button type="button" disabled={maxed} onClick={() => setStake(stepBet(stake, 1))} aria-label="Vyššia stávka">
                    +
                  </button>
                </div>
                {presets.length > 1 ? (
                  <div className="duel-presets">
                    {presets.map((v) => (
                      <button key={v} type="button" className={stake === v ? "is-on" : ""} onClick={() => setStake(v)}>
                        {v >= 1000 ? `${v / 1000}K` : v}
                      </button>
                    ))}
                  </div>
                ) : null}
              </section>
              <button
                type="button"
                role="switch"
                aria-checked={anteOn}
                className={`duel-ante ${anteOn ? "is-on" : ""}`}
                onClick={() => setAnteOn((v) => !v)}
              >
                <span>
                  <b>ANTE pre oboch</b>
                  <small>
                    stávka {anteMul.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}× · 4KA TV častejšie · súper hrá rovnako
                  </small>
                </span>
                <i aria-hidden="true">{anteOn ? "ON" : "OFF"}</i>
              </button>
              <section className="duel-sec">
                {where === "online" ? (
                  nameInput("Tvoje meno", a, editName, "duel-name")
                ) : (
                  <div className="duel-names">
                    {nameInput("Hráč 1", a, editName, "duel-name")}
                    {nameInput("Hráč 2", b, setB, "duel-name-2")}
                  </div>
                )}
              </section>
            </>
          ) : (
            <>
              <section className="duel-sec">
                <label className="duel-in duel-code-in" htmlFor="duel-code">
                  <span>Kód od kamoša</span>
                  <input
                    id="duel-code"
                    value={code}
                    onChange={(e) => {
                      const next = cleanRoomCode(e.target.value);
                      setCode(next);
                      setBlock("");
                      lookupId.current += 1;
                      if (next.length === 4) lookup(next);
                      else setJoin({ kind: "idle" });
                    }}
                    placeholder="A7K2"
                    inputMode="text"
                    autoCapitalize="characters"
                    autoComplete="one-time-code"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="go"
                    aria-describedby="duel-code-hint"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !cta.disabled) cta.run();
                    }}
                  />
                </label>
                <p className={`duel-hint ${join.kind === "error" ? "is-err" : ""}`} id="duel-code-hint">
                  {join.kind === "error"
                    ? join.msg
                    : join.kind === "loading"
                      ? "Hľadám duel…"
                      : invite
                        ? ""
                        : "4 znaky, ktoré ti poslal hosť. Pozvánka sa ukáže hneď."}
                </p>
              </section>
              {invite && inviteSum ? (
                <section className="duel-invite" aria-live="polite">
                  <p className="duel-invite-from">
                    <small>Pozýva ťa</small>
                    <b>{invite.hostName}</b>
                  </p>
                  <dl>
                    <div>
                      <dt>Točenia</dt>
                      <dd>{invite.need}</dd>
                    </div>
                    <div>
                      <dt>Stávka</dt>
                      <dd>{formatMoney(invite.bet)}</dd>
                    </div>
                    <div>
                      <dt>Ante</dt>
                      <dd>{invite.ante ? "ÁNO" : "NIE"}</dd>
                    </div>
                  </dl>
                </section>
              ) : null}
              <section className="duel-sec">{nameInput("Tvoje meno", a, editName, "duel-name-join")}</section>
            </>
          )}
        </div>

        <footer className="duel-setup-foot">
          {tab === "create" || inviteSum ? (
            <div className="duel-sum">
              <span>
                Spolu <b>{formatMoney((tab === "create" ? sum : inviteSum!).total)}</b>
                <small>
                  stávky {formatMoney((tab === "create" ? sum : inviteSum!).stakes)} + kaucia{" "}
                  {formatMoney((tab === "create" ? sum : inviteSum!).deposit)}
                  {tab === "create" && seats === 2 ? " · za oboch" : ""}
                </small>
              </span>
              <span className="duel-sum-min">
                <small>min. kredit</small>
                <b>{formatMoney((tab === "create" ? sum : inviteSum!).minCredit)}</b>
              </span>
              <DepositInfo id="duel-setup-info" />
            </div>
          ) : null}
          {note ? <p className="duel-note">{note}</p> : null}
          <button type="button" className="duel-cta" disabled={cta.disabled} onClick={cta.run}>
            {cta.label}
          </button>
        </footer>
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
