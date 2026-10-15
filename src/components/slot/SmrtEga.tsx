import { useCallback, useEffect, useRef, useState } from "react";
import { EGO_REPORT_EVERY, egoBanner, egoFee, egoLeft, egoMissing, fmtRp, EGO_FLOOR, type EgoState } from "@/lib/slot/smrtega";
import { egoClaim, egoCurrent, egoJoin, egoReport, egoSecret, sha256Hex, type EgoProgress } from "@/lib/slot/smrtega-api";
import { serverNow, syncServerClock } from "@/lib/slot/server-day";
import "./smrtega.css";

export interface EgoGame {
  deviceId: string;
  nick: string;
  rp: number;
  rankTick: number;
  egoProgress: () => EgoProgress;
  egoPay: (fee: number) => void;
}

/** Event state, polling (5 min + focus) and progress reports (every 20 RP changes + tab hidden). */
export function useSmrtEga(g: EgoGame) {
  const [state, setState] = useState<EgoState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [now, setNow] = useState(() => serverNow());
  const ticks = useRef(0);
  const gRef = useRef(g);
  gRef.current = g;
  const joined = Boolean(state?.me?.joined);
  const joinedRef = useRef(joined);
  joinedRef.current = joined;

  const refresh = useCallback(async () => {
    const id = gRef.current.deviceId;
    if (!id) return;
    void syncServerClock();
    try {
      setState(await egoCurrent(id));
    } catch {
      // offline: keep the last state
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 5 * 60_000);
    const c = window.setInterval(() => setNow(serverNow()), 30_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
      else if (joinedRef.current && gRef.current.deviceId) void egoReport(gRef.current.deviceId, gRef.current.egoProgress()).catch(() => {});
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(t);
      window.clearInterval(c);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh, g.deviceId]);

  useEffect(() => {
    if (!joinedRef.current || !g.rankTick) return;
    ticks.current += 1;
    if (ticks.current % EGO_REPORT_EVERY !== 0) return;
    void egoReport(gRef.current.deviceId, gRef.current.egoProgress())
      .then(refresh)
      .catch(() => {});
  }, [g.rankTick, refresh]);

  const join = useCallback(async () => {
    const cur = gRef.current;
    if (busy || !cur.deviceId) return;
    setBusy(true);
    setErr("");
    try {
      const secret = egoSecret();
      if (!secret) throw new Error("storage");
      const res = await egoJoin(cur.deviceId, cur.nick || "Niekto", cur.egoProgress(), await sha256Hex(secret));
      if (res.ok) cur.egoPay(res.fee);
      else setErr(res.error === "joined" ? "Tento týždeň už hráš." : res.error === "rank" ? "Vstup je iba pre NEKONEČNO." : "Vstup sa nepodaril.");
      await refresh();
    } catch {
      setErr("Bez spojenia so serverom. Skús znova.");
    } finally {
      setBusy(false);
    }
  }, [busy, refresh]);

  return { state, busy, err, join, refresh, now, text: egoBanner(state, g.rp, now) };
}

export function SmrtEgaSheet({
  open,
  onClose,
  ego,
  rp,
  deviceId,
}: {
  open: boolean;
  onClose: () => void;
  ego: ReturnType<typeof useSmrtEga>;
  rp: number;
  deviceId: string;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [codeErr, setCodeErr] = useState("");
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    if (!open) {
      setCode(null);
      setAsk(false);
    }
  }, [open]);
  if (!open) return null;
  const s = ego.state;
  const fee = egoFee(rp);
  const miss = egoMissing(rp);
  const prize = s?.prize;
  const reveal = async () => {
    setCodeErr("");
    try {
      const r = await egoClaim(deviceId, egoSecret());
      if (r.code) setCode(r.code);
      else setCodeErr(r.error === "secret" ? "Kľúč sa dá vyzdvihnúť iba na zariadení, ktoré sa prihlásilo." : "Kľúč teraz nie je k dispozícii.");
    } catch {
      setCodeErr("Bez spojenia so serverom.");
    }
  };
  return (
    <div className="ego-back" role="dialog" aria-label="SMRŤ EGA" onClick={onClose}>
      <div className="ego-sheet" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ego-x" onClick={onClose} aria-label="Zavrieť">
          ×
        </button>
        <h2 className="ego-logo">SMRŤ EGA</h2>
        <p className="ego-sub">
          Týždenný event · iba NEKONEČNO · pondelok 01:00 → pondelok 01:00
          {s ? ` · končí o ${egoLeft(s.weekEnd - ego.now)}` : ""}
        </p>

        {prize ? (
          <div className={`ego-prize is-${prize.status}`}>
            <b>TVOJ 4KA TV XL KĽÚČ</b>
            {prize.status === "pending" && (
              <p>KÓD SA PRIPRAVUJE. Martin práve odpája staré zariadenie. Odpočet 28 dní sa spustí až pri doručení.</p>
            )}
            {prize.status === "revoked" && <p>Kód bol zneplatnený správcom.</p>}
            {prize.status === "awarded" && (
              <>
                {code ? <div className="ego-code">{code}</div> : <button type="button" className="ego-btn" onClick={() => void reveal()}>ODKRYŤ KĽÚČ</button>}
                {prize.expiresAt ? <p>Platí ešte {egoLeft(prize.expiresAt - ego.now)}.</p> : null}
                {codeErr ? <p className="ego-err">{codeErr}</p> : null}
                <details>
                  <summary>Ako kľúč použiť</summary>
                  <p><b>Smart TV (Samsung / LG):</b> v obchode s aplikáciami nainštaluj 4KA TV, spusti ju a na autorizačnej obrazovke zadaj kľúč ovládačom → Odoslať.</p>
                  <p><b>Android TV / Google TV / Apple TV:</b> Google Play alebo App Store → 4KA TV → prihlásenie párovacím kľúčom.</p>
                  <p><b>Set-top box 4ky:</b> na autorizačnej obrazovke zadaj kľúč ovládačom.</p>
                  <p><b>Mobil:</b> na mobile sa 4KA TV prihlasuje menom a heslom. Výhra platí pre televízor alebo TV box.</p>
                  <p>Kľúč je na jedno zariadenie. Keď nejde, napíš Martinovi.</p>
                </details>
              </>
            )}
          </div>
        ) : null}

        <ul className="ego-rules">
          <li>Výhra: párovací kľúč 4KA TV XL s archívom, platí 28 dní od doručenia. Doručí sa sám v pondelok 01:00.</li>
          <li>Vstupné 2,5 % tvojich RP (min 500, max 2 500). Strhne sa hneď a prepadá.</li>
          <li>Skóre = čisté RP za týždeň: zisky aj straty od vstupu, vstupné sa ráta. RP z firmy sa rátajú rovnako, bez boostov.</li>
          <li>Martin hrá bez nároku na cenu. Keď je 1., vyhrá najlepší pod ním.</li>
        </ul>

        {s?.me?.joined ? (
          <p className="ego-me">
            Si {s.me.place}. · {fmtRp(s.me.score)} RP{s.me.admin ? " · BEZ NÁROKU NA CENU" : ""}
          </p>
        ) : rp < EGO_FLOOR ? (
          <p className="ego-me">Od NEKONEČNA. Chýba ti {miss} RP.</p>
        ) : !ask ? (
          <button type="button" className="ego-btn is-join" disabled={ego.busy || miss > 0 || !deviceId} onClick={() => setAsk(true)}>
            {miss > 0 ? `NA VSTUPNÉ CHÝBA ${miss} RP` : `ZAPLATIŤ SMRŤ EGA · −${fee} RP`}
          </button>
        ) : (
          <div className="ego-ask">
            <p>Naozaj zaplatiť {fee} RP? Vstupné sa nevracia.</p>
            <button type="button" className="ego-btn is-join" disabled={ego.busy} onClick={() => void ego.join().then(() => setAsk(false))}>
              ÁNO, ZAPLATIŤ
            </button>
            <button type="button" className="ego-btn is-ghost" onClick={() => setAsk(false)}>
              NIE
            </button>
          </div>
        )}
        {ego.err ? <p className="ego-err">{ego.err}</p> : null}

        <h3>Rebríček ({s?.players ?? 0})</h3>
        <ol className="ego-top">
          {(s?.top ?? []).map((t, i) => (
            <li key={i} className={t.admin ? "is-admin" : ""}>
              <span>{t.nick}</span>
              {t.admin ? <em>BEZ NÁROKU</em> : null}
              <b>{fmtRp(t.score)}</b>
            </li>
          ))}
          {!s?.top?.length ? <li className="is-empty">Zatiaľ nikto. Buď prvý.</li> : null}
        </ol>
        {s?.lastWinner ? (
          <p className="ego-last">
            Posledný výherca: {s.lastWinner.nick} ({fmtRp(s.lastWinner.score)} RP)
          </p>
        ) : null}
      </div>
    </div>
  );
}
