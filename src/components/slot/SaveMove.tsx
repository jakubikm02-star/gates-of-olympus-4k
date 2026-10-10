import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight, ExternalLink, Lock, X } from "lucide-react";
import { readLocalSave, type PlayerSave } from "@/lib/slot/player-save";
import { saveGlance } from "@/lib/slot/save-port";
import {
  MOVE_HASH_KEY,
  createSource,
  createTarget,
  decideImport,
  hasProgress,
  hereRole,
  moveOrigins,
  newNonce,
  nonceFromHash,
  primaryLabel,
  primaryUrl,
  readMoved,
  sayHello,
  type MovePack,
  type SourceSession,
  type TargetSession,
} from "@/lib/slot/save-move";
import {
  PULL_EVENT,
  PUSH_EVENT,
  isStandalone,
  markMoved,
  movedSnapshot,
  openNewLink,
  openOldBridge,
  packHere,
  requestPull,
  requestPush,
  storeImport,
  subscribeMoved,
} from "@/lib/slot/save-move-client";
import "./save-move.css";

const HELLO_WAIT_MS = 12_000;

function useRole() {
  const [role, setRole] = useState<ReturnType<typeof hereRole>>(null);
  useEffect(() => setRole(hereRole()), []);
  return role;
}

/**
 * The save as it was before the game's own boot effects ran. Child effects run before the parent's,
 * and the game hook briefly writes a default save while it boots, so a later read can look empty.
 */
function useBootSave() {
  const ref = useRef<PlayerSave | null>(null);
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    ref.current = readLocalSave();
  }, []);
  return ref;
}

/** Local save for an import decision: the boot snapshot when the live copy is the game's transient default. */
function stableLocal(boot: PlayerSave | null): PlayerSave | null {
  const now = readLocalSave();
  if (hasProgress(now)) return now;
  return hasProgress(boot) ? boot : now;
}

/** Old link: the moved marker, live. Null on the server and everywhere else. */
export function useMovedHere(): string | null {
  return useSyncExternalStore(subscribeMoved, movedSnapshot, () => null);
}

function when(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString("sk-SK", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ------------------------------------------------------------------ old link → new link (flow B)

type PushState =
  | { k: "idle" }
  | { k: "wait" }
  | { k: "done" }
  | { k: "fail"; why: string };

function usePush(playerId: string) {
  const [state, setState] = useState<PushState>({ k: "idle" });
  const sess = useRef<SourceSession | null>(null);
  const tab = useRef<Window | null>(null);
  const timer = useRef(0);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const s = sess.current;
      if (!s) return;
      const out = s.handle(ev);
      if (out === "peer") {
        window.clearTimeout(timer.current);
        if (!s.offer()) {
          sess.current = null;
          setState({ k: "fail", why: "Na tomto linku nie je uložená hra." });
        }
      } else if (out === "acked") {
        sess.current = null;
        setState({ k: "done" });
      } else if (out === "cancel") {
        sess.current = null;
        setState({ k: "fail", why: "Prenos na novom linku zrušený. Tu sa nič nezmenilo." });
      }
    };
    window.addEventListener("message", onMsg);
    return () => {
      window.removeEventListener("message", onMsg);
      window.clearTimeout(timer.current);
    };
  }, []);

  /** Call from the click handler. */
  const start = useCallback(() => {
    const nonce = newNonce();
    const win = openNewLink(nonce);
    if (!win) {
      setState({ k: "fail", why: "Prehliadač nové okno nepustil. Povoľ okná pre tento link, alebo použi EXPORT a IMPORT." });
      return;
    }
    tab.current = win;
    sess.current = createSource({
      peer: win,
      nonce,
      origins: moveOrigins(),
      pack: () => packHere(playerId),
      onAck: (ack) => markMoved(ack.playerId, ack.updatedAt),
    });
    setState({ k: "wait" });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (!sess.current || sess.current.sent) return;
      sess.current = null;
      setState({
        k: "fail",
        why: `Nový link sa neozval. ${isStandalone() ? "Z aplikácie na ploche to často nejde. " : ""}Otvor ${primaryLabel()} v prehliadači alebo použi EXPORT a IMPORT v Nastaveniach → Uloženie.`,
      });
    }, HELLO_WAIT_MS);
  }, [playerId]);

  return { state, start, reset: () => setState({ k: "idle" }) };
}

function MoveDialog({ busy, playerId, onClose }: { busy: boolean; playerId: string; onClose: () => void }) {
  const { state, start } = usePush(playerId);
  const [save] = useState<PlayerSave | null>(() => readLocalSave());
  return (
    <div className="modal-back sm-back" role="presentation" onClick={state.k === "wait" ? undefined : onClose}>
      <div className="modal-card sm-card" role="dialog" aria-labelledby="sm-move-title" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2 id="sm-move-title">Presunúť hru</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Zavrieť">
            ×
          </button>
        </header>
        <p className="sm-lead">
          Nový link hry je <b>{primaryLabel()}</b>. Presunieme tam kredit, hodnosť, RP, lístok, rozohratú hru, prezývku a štatistiky.
          Tvoj hráč (ID) ostáva rovnaký, rebríček ťa pozná.
        </p>
        {save ? <p className="sm-glance">{saveGlance(save)}</p> : <p className="sm-glance">Na tomto linku ešte nie je uložená hra.</p>}
        <p className="sm-note">
          <Lock size={13} aria-hidden="true" /> Po presune sa hra na tomto starom linku zamkne (len na čítanie), aby sa nedala hrať dvakrát.
        </p>
        {state.k === "fail" ? <p className="sound-err sm-err">{state.why}</p> : null}
        {state.k === "done" ? <p className="sm-ok">Hotovo. Hraj na {primaryLabel()}.</p> : null}
        <div className="sm-actions">
          {save ? (
            <button
              type="button"
              className="sound-reset sm-go"
              disabled={busy || state.k === "wait" || state.k === "done"}
              onClick={start}
            >
              {state.k === "wait" ? "PRENÁŠAM…" : busy ? "POČKAJ, KÝM DOBEHNE HRA" : "PRESUNÚŤ A OTVORIŤ NOVÝ LINK"}
            </button>
          ) : (
            <a className="sound-reset sm-go" href={primaryUrl()}>
              OTVORIŤ {primaryLabel().toUpperCase()}
            </a>
          )}
          <button type="button" className="save-secondary" onClick={onClose}>
            NESKÔR
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Old link only: banner "Nový link" on the intro, a small pill in the game, and the move dialog.
 * Lives as long as the game so the move session survives starting the game.
 */
export function OldLinkLayer({ started, busy, playerId }: { started: boolean; busy: boolean; playerId: string }) {
  const role = useRole();
  const [open, setOpen] = useState(false);
  const [pill, setPill] = useState(true);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(PUSH_EVENT, on);
    return () => window.removeEventListener(PUSH_EVENT, on);
  }, []);
  // In game the pill only reminds for a moment; the link stays in Settings and Pravidlá.
  useEffect(() => {
    if (!started) return;
    const t = window.setTimeout(() => setPill(false), 15_000);
    return () => window.clearTimeout(t);
  }, [started]);
  if (role !== "old") return null;
  return (
    <>
      {!started ? (
        <div className="sm-banner" role="status">
          <span className="sm-banner-txt">
            <small>NOVÝ LINK</small>
            <b>{primaryLabel()}</b>
          </span>
          <button type="button" className="sm-banner-go" onClick={() => setOpen(true)}>
            PRESUNÚŤ HRU <ArrowRight size={15} strokeWidth={2.6} aria-hidden="true" />
          </button>
        </div>
      ) : pill ? (
        <div className="sm-pill" role="status">
          <button type="button" className="sm-pill-go" onClick={() => setOpen(true)}>
            Nový link: <b>{primaryLabel()}</b>
          </button>
          <button type="button" className="sm-pill-x" onClick={() => setPill(false)} aria-label="Skryť">
            <X size={14} />
          </button>
        </div>
      ) : null}
      {open ? <MoveDialog busy={busy} playerId={playerId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Old link after the move: read-only. The game is not mounted, nothing writes the save. */
export function MovedScreen() {
  const raw = useMovedHere();
  const mark = readMoved({ getItem: () => raw, setItem: () => {} });
  const [save] = useState<PlayerSave | null>(() => readLocalSave());
  const { state, start } = usePush(save?.playerId ?? "");
  const standalone = typeof window !== "undefined" && isStandalone();
  return (
    <div className="sm-moved">
      <div className="sm-moved-card">
        <span className="sm-kicker">PORTS of PARKIZMUS</span>
        <h1>Hra sa presunula</h1>
        <p className="sm-lead">
          Nový link: <b>{primaryLabel()}</b>
        </p>
        <a className="sound-reset sm-go" href={primaryUrl()}>
          HRAŤ NA {primaryLabel().toUpperCase()} <ExternalLink size={15} aria-hidden="true" />
        </a>
        <p className="sm-note">
          <Lock size={13} aria-hidden="true" /> Toto je starý link. Uloženie tu ostáva len na čítanie{mark?.at ? `, presunuté ${when(mark.at)}` : ""}.
          {save ? ` ${saveGlance(save)}` : ""}
        </p>
        <div className="sm-pwa">
          <b>Máš hru na ploche?</b>
          <p>
            Ikona zo starého linku ostáva na starom linku. Otvor {primaryLabel()} v prehliadači, na úvode stlač PRIDAŤ NA PLOCHU
            a starú ikonu zmaž.{standalone ? " Si práve v starej aplikácii." : ""}
          </p>
        </div>
        <details className="sm-again">
          <summary>Nový link hru nemá?</summary>
          <p>Ak si na novom linku vymazal dáta prehliadača, prenes túto zamknutú kópiu znova. Novšiu hru toho istého hráča to neprepíše.</p>
          {state.k === "fail" ? <p className="sound-err sm-err">{state.why}</p> : null}
          {state.k === "done" ? <p className="sm-ok">Prenesené.</p> : null}
          <button type="button" className="save-secondary" disabled={!save || state.k === "wait"} onClick={start}>
            {state.k === "wait" ? "PRENÁŠAM…" : "PRENIESŤ ZNOVA"}
          </button>
        </details>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ new link ← old link (flows A and B)

type PullState =
  | { k: "idle" }
  | { k: "wait"; flow: "popup" | "tab" }
  | { k: "ask"; incoming: PlayerSave; local: PlayerSave }
  | { k: "done"; same: boolean }
  | { k: "fail"; why: string };

/** New link only: receives a save from the old link, both from its popup and from a tab it opened. */
export function MoveTargetLayer({ busy }: { busy: boolean }) {
  const boot = useBootSave();
  const role = useRole();
  const [state, setState] = useState<PullState>({ k: "idle" });
  const sess = useRef<TargetSession | null>(null);
  const popup = useRef<Window | null>(null);
  const timer = useRef(0);
  const poll = useRef(0);

  const stop = useCallback(() => {
    window.clearTimeout(timer.current);
    window.clearInterval(poll.current);
  }, []);

  const finish = useCallback(
    (pack: MovePack, local: PlayerSave | null) => {
      const s = sess.current;
      if (!s) return;
      storeImport(pack, hasProgress(local));
      s.ack();
      sess.current = null;
      stop();
      setState({ k: "done", same: false });
      window.setTimeout(() => window.location.replace("/"), 700);
    },
    [stop],
  );

  const onOffer = useCallback(
    (pack: MovePack) => {
      const s = sess.current;
      if (!s) return;
      const local = stableLocal(boot.current);
      const d = decideImport(local, pack.save);
      if (d === "take") finish(pack, local);
      else if (d === "keep") {
        // Same player, this copy is already newer (the earlier automatic copy). Lock the old one.
        s.ack();
        sess.current = null;
        stop();
        setState({ k: "done", same: true });
      } else if (local) setState({ k: "ask", incoming: pack.save, local });
    },
    [finish, stop, boot],
  );

  useEffect(() => {
    if (role !== "new") return;
    const onMsg = (ev: MessageEvent) => {
      const s = sess.current;
      if (!s) return;
      const out = s.handle(ev);
      if (out === "hello") {
        window.clearTimeout(timer.current);
      } else if (out === "offer" && s.offer) {
        onOffer(s.offer);
      } else if (s.done && !s.offer) {
        sess.current = null;
        stop();
        setState({ k: "fail", why: "Prenos na starom linku zrušený." });
      }
    };
    window.addEventListener("message", onMsg);

    // Flow B: this tab was opened by PRESUNÚŤ HRU on the old link.
    const nonce = nonceFromHash(window.location.hash, MOVE_HASH_KEY);
    if (nonce) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      const opener = window.opener as Window | null;
      if (opener) {
        sess.current = createTarget({ peer: opener, nonce, origins: moveOrigins() });
        setState({ k: "wait", flow: "tab" });
        sayHello(opener, nonce, moveOrigins().old);
        timer.current = window.setTimeout(() => {
          if (sess.current && !sess.current.offer) {
            sess.current = null;
            setState({ k: "fail", why: "Starý link sa neozval. Skús PRESUNÚŤ HRU znova, alebo EXPORT a IMPORT." });
          }
        }, HELLO_WAIT_MS);
      } else {
        setState({ k: "fail", why: "Starý link sa nedá zastihnúť. Na starom linku stlač PRESUNÚŤ HRU znova." });
      }
    }

    // Flow A: PRENIESŤ HRU ZO STARÉHO LINKU (boot screen, settings).
    const onPull = () => {
      const n = newNonce();
      const win = openOldBridge(n);
      if (!win) {
        setState({ k: "fail", why: "Prehliadač nové okno nepustil. Povoľ okná alebo otvor starý link a stlač PRESUNÚŤ HRU." });
        return;
      }
      popup.current = win;
      sess.current = createTarget({ peer: win, nonce: n, origins: moveOrigins() });
      setState({ k: "wait", flow: "popup" });
      stop();
      // The player may take their time in the popup; closing it ends the session.
      poll.current = window.setInterval(() => {
        if (!popup.current?.closed) return;
        window.clearInterval(poll.current);
        if (sess.current && !sess.current.offer) {
          sess.current = null;
          setState({ k: "idle" });
        }
      }, 800);
    };
    window.addEventListener(PULL_EVENT, onPull);
    return () => {
      window.removeEventListener("message", onMsg);
      window.removeEventListener(PULL_EVENT, onPull);
      stop();
    };
  }, [role, onOffer, stop]);

  if (role !== "new" || state.k === "idle") return null;
  const close = () => {
    sess.current?.cancel();
    sess.current = null;
    stop();
    setState({ k: "idle" });
  };
  return (
    <div className="modal-back sm-back" role="presentation">
      <div className="modal-card sm-card" role="dialog" aria-labelledby="sm-pull-title">
        <header className="modal-head">
          <h2 id="sm-pull-title">Prenos zo starého linku</h2>
          {state.k === "done" && !state.same ? null : (
            <button type="button" className="icon-btn" onClick={close} aria-label="Zavrieť">
              ×
            </button>
          )}
        </header>
        {state.k === "wait" ? (
          <p className="sm-lead">
            {state.flow === "popup"
              ? "V okne starého linku skontroluj hru a stlač PRENIESŤ."
              : "Preberám hru zo starého linku…"}
          </p>
        ) : null}
        {state.k === "ask" ? (
          <>
            <p className="sm-lead">Na tomto linku už máš inú hru. Ktorú chceš hrať ďalej?</p>
            <p className="sm-glance">Tu: {saveGlance(state.local)}</p>
            <p className="sm-glance">Zo starého linku: {saveGlance(state.incoming)}</p>
            <div className="sm-actions">
              <button
                type="button"
                className="sound-reset sm-go"
                disabled={busy}
                onClick={() => {
                  const pack = sess.current?.offer;
                  if (pack) finish(pack, state.local);
                }}
              >
                {busy ? "POČKAJ, KÝM DOBEHNE HRA" : "HRAŤ HRU ZO STARÉHO LINKU"}
              </button>
              <button type="button" className="save-secondary" onClick={close}>
                NECHAŤ TÚTO (NIČ SA NEPRESUNIE)
              </button>
            </div>
          </>
        ) : null}
        {state.k === "done" ? (
          <p className="sm-ok">
            {state.same ? "Hra tu už je a je novšia. Starý link je teraz len na čítanie." : "Prenesené. Načítavam tvoju hru…"}
          </p>
        ) : null}
        {state.k === "fail" ? <p className="sound-err sm-err">{state.why}</p> : null}
        {state.k === "done" && state.same ? (
          <button type="button" className="save-secondary" onClick={close}>
            OK
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** "Preniesť hru zo starého linku" — new link only. */
export function PullOldButton({ className = "save-secondary", label = "PRENIESŤ HRU ZO STARÉHO LINKU" }: { className?: string; label?: string }) {
  const role = useRole();
  if (role !== "new") return null;
  return (
    <button type="button" className={className} onClick={requestPull}>
      {label}
    </button>
  );
}

/** Intro card on the new link while it has no progress yet. */
export function BootPullCard() {
  const role = useRole();
  const [show, setShow] = useState(false);
  const first = useBootSave();
  useEffect(() => {
    if (role === "new") setShow(!hasProgress(first.current) && !hasProgress(readLocalSave()));
  }, [role]);
  if (role !== "new" || !show) return null;
  const old = moveOrigins().old.replace(/^https?:\/\//, "");
  return (
    <button type="button" className="bs-pull" onClick={requestPull}>
      <small>Hral si na {old}?</small>
      <b>PRENIESŤ HRU ZO STARÉHO LINKU</b>
    </button>
  );
}

/** Settings → Uloženie: the right move action for this link. */
export function MovePanel() {
  const role = useRole();
  if (role === "new") {
    return (
      <div className="sm-panel">
        <p className="sound-note">
          Hral si na starom linku {moveOrigins().old.replace(/^https?:\/\//, "")}? Otvorí sa okno starého linku, skontroluješ hru a potvrdíš.
          Starý link sa potom zamkne, aby sa nedalo hrať dvakrát.
        </p>
        <PullOldButton />
      </div>
    );
  }
  if (role === "old") {
    return (
      <div className="sm-panel">
        <p className="sound-note">Toto je starý link. Hra má nový link {primaryLabel()}. Presuň sa tam aj s progresom.</p>
        <button type="button" className="sound-reset sm-go" onClick={requestPush}>
          PRESUNÚŤ HRU NA {primaryLabel().toUpperCase()}
        </button>
      </div>
    );
  }
  return null;
}

/** "parkizmus.vercel.app" under the logo and in footers. */
export function PrimaryLink({ className = "" }: { className?: string }) {
  const role = useRole();
  if (role !== "old") return <span className={`sm-link ${className}`}>{primaryLabel()}</span>;
  return (
    <a className={`sm-link ${className}`} href={primaryUrl()}>
      {primaryLabel()}
    </a>
  );
}

// ------------------------------------------------------------------ /prenos on the old link (flow A popup)

type BridgeState =
  | { k: "boot" }
  | { k: "wrong"; why: string }
  | { k: "confirm" }
  | { k: "sent" }
  | { k: "done" }
  | { k: "cancel" };

export function MoveBridgePage() {
  const [state, setState] = useState<BridgeState>({ k: "boot" });
  const [save, setSave] = useState<PlayerSave | null>(null);
  const [moved, setMoved] = useState(false);
  const sess = useRef<SourceSession | null>(null);

  useEffect(() => {
    const o = moveOrigins();
    if (hereRole(o) !== "old") {
      setState({ k: "wrong", why: `Táto stránka slúži len na prenos zo starého linku na ${primaryLabel(o)}.` });
      return;
    }
    const nonce = nonceFromHash(window.location.hash, "n");
    window.history.replaceState(null, "", window.location.pathname);
    const opener = window.opener as Window | null;
    if (!nonce || !opener) {
      setState({ k: "wrong", why: `Toto okno otvor tlačidlom PRENIESŤ HRU ZO STARÉHO LINKU na ${primaryLabel(o)}.` });
      return;
    }
    setSave(readLocalSave());
    setMoved(Boolean(movedSnapshot()));
    const s = createSource({
      peer: opener,
      nonce,
      origins: o,
      pack: () => packHere(),
      onAck: (ack) => markMoved(ack.playerId, ack.updatedAt),
    });
    sess.current = s;
    const onMsg = (ev: MessageEvent) => {
      const out = s.handle(ev);
      if (out === "peer") setState({ k: "confirm" });
      else if (out === "acked") {
        setState({ k: "done" });
        window.setTimeout(() => window.close(), 1500);
      } else if (out === "cancel") setState({ k: "cancel" });
    };
    window.addEventListener("message", onMsg);
    // Dropped by the browser unless the opener really is the new link.
    sayHello(opener, nonce, o.fresh);
    const t = window.setTimeout(() => {
      setState((st) => (st.k === "boot" ? { k: "wrong", why: `Spojenie s ${primaryLabel(o)} sa nepodarilo. Zavri okno a skús to znova.` } : st));
    }, HELLO_WAIT_MS);
    return () => {
      window.removeEventListener("message", onMsg);
      window.clearTimeout(t);
    };
  }, []);

  const send = () => {
    if (sess.current?.offer()) setState({ k: "sent" });
    else setState({ k: "wrong", why: "Na tomto linku nie je uložená hra." });
  };
  const cancel = () => {
    sess.current?.cancel();
    setState({ k: "cancel" });
    window.setTimeout(() => window.close(), 400);
  };

  return (
    <div className="sm-moved sm-bridge">
      <div className="sm-moved-card">
        <span className="sm-kicker">STARÝ LINK · {moveOrigins().old.replace(/^https?:\/\//, "")}</span>
        <h1>Preniesť hru</h1>
        {state.k === "boot" ? <p className="sm-lead">Spájam sa s {primaryLabel()}…</p> : null}
        {state.k === "wrong" ? <p className="sound-err sm-err">{state.why}</p> : null}
        {state.k === "confirm" ? (
          save ? (
            <>
              <p className="sm-lead">
                Presunúť túto hru na <b>{primaryLabel()}</b>?
              </p>
              <p className="sm-glance">{saveGlance(save)}</p>
              <p className="sm-note">
                <Lock size={13} aria-hidden="true" />{" "}
                {moved
                  ? "Hra už raz bola presunutá. Prenesie sa znova táto zamknutá kópia; novšiu hru toho istého hráča neprepíše."
                  : "Starý link sa potom zamkne (len na čítanie), aby sa nedalo hrať dvakrát."}
              </p>
              <div className="sm-actions">
                <button type="button" className="sound-reset sm-go" onClick={send}>
                  PRENIESŤ
                </button>
                <button type="button" className="save-secondary" onClick={cancel}>
                  ZRUŠIŤ
                </button>
              </div>
            </>
          ) : (
            <p className="sound-err sm-err">Na starom linku v tomto prehliadači nie je uložená hra. Ak si hral v aplikácii na ploche, použi tam EXPORT.</p>
          )
        ) : null}
        {state.k === "sent" ? <p className="sm-lead">Odosielam…</p> : null}
        {state.k === "done" ? <p className="sm-ok">Hotovo. Hra je na {primaryLabel()}. Okno sa zavrie.</p> : null}
        {state.k === "cancel" ? <p className="sm-lead">Zrušené. Nič sa nezmenilo.</p> : null}
      </div>
    </div>
  );
}
