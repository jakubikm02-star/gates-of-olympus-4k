import { useCallback, useEffect, useRef, useState } from "react";
import {
  EGO_REPORT_EVERY,
  egoAdminVisible,
  egoAttention,
  egoBanner,
  egoStripLine,
  egoDeltaTone,
  egoFee,
  egoLeft,
  egoWeekEnd,
  egoLiveBoard,
  egoLiveScore,
  egoMissing,
  egoSnapshot,
  fmtRp,
  EGO_ADMIN_DEVICE_KEY,
  EGO_ADMIN_TOKEN_KEY,
  EGO_FLOOR,
  type EgoSeen,
  type EgoState,
} from "@/lib/slot/smrtega";
import { egoClaim, egoCurrent, egoJoin, egoReport, egoSecret, sha256Hex, type EgoProgress } from "@/lib/slot/smrtega-api";
import { serverNow, syncServerClock } from "@/lib/slot/server-day";
import "./smrtega.css";

const SEEN_KEY = "parkizmus-ego-seen";

function readEgoSeen(): EgoSeen | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<EgoSeen>;
    const prize = o.prize;
    const prizeOk = prize == null || prize === "pending" || prize === "awarded" || prize === "revoked" || prize === "expired";
    if (typeof o.weekStart !== "number" || !prizeOk) return null;
    return {
      weekStart: o.weekStart,
      place: typeof o.place === "number" ? o.place : 0,
      score: typeof o.score === "number" ? o.score : 0,
      prize: prize ?? null,
    };
  } catch {
    return null;
  }
}

export interface EgoGame {
  deviceId: string;
  nick: string;
  rp: number;
  rankTick: number;
  egoProgress: () => EgoProgress;
  egoPay: (fee: number) => void;
}

/** Event state, polling (5 min + focus) and progress reports (every 5 RP changes + tab hidden). */
export function useSmrtEga(g: EgoGame) {
  const [state, setState] = useState<EgoState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [now, setNow] = useState(() => serverNow());
  const [seen, setSeen] = useState<EgoSeen | null>(null);
  const ticks = useRef(0);
  /** RP the current server score was computed from. Week null until the next snapshot stamps it. */
  const anchor = useRef<{ rp: number; week: number | null } | null>(null);
  const refreshGen = useRef(0);
  const reportGen = useRef(0);
  const gRef = useRef(g);
  gRef.current = g;
  const stateRef = useRef(state);
  stateRef.current = state;
  const joined = Boolean(state?.me?.joined);
  const joinedRef = useRef(joined);
  joinedRef.current = joined;

  const refresh = useCallback(async () => {
    const id = gRef.current.deviceId;
    if (!id) return;
    const rpAtAsk = gRef.current.rp;
    const gen = ++refreshGen.current;
    void syncServerClock();
    try {
      const next = await egoCurrent(id);
      if (gen !== refreshGen.current) return;
      setState(next);
      const a = anchor.current;
      if (!next.me?.joined) anchor.current = null;
      else if (!a || (a.week != null && a.week !== next.weekStart)) anchor.current = { rp: rpAtAsk, week: next.weekStart };
      else if (a.week == null) anchor.current = { rp: a.rp, week: next.weekStart };
    } catch {
      // offline: keep the last state
    }
  }, []);

  const sendReport = useCallback(() => {
    const cur = gRef.current;
    if (!cur.deviceId) return;
    const gen = ++reportGen.current;
    const p = cur.egoProgress();
    void egoReport(cur.deviceId, p)
      .then(() => {
        if (gen !== reportGen.current) return;
        anchor.current = { rp: p.rp, week: stateRef.current?.weekStart ?? anchor.current?.week ?? null };
        return refresh();
      })
      .catch(() => {});
  }, [refresh]);

  const ack = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    const next = egoSnapshot(s);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(next));
    } catch {
      // private mode: the badge stays until the next look in this tab
    }
    setSeen(next);
  }, []);

  useEffect(() => {
    setSeen(readEgoSeen());
    void refresh();
    const t = window.setInterval(() => void refresh(), 5 * 60_000);
    const c = window.setInterval(() => setNow(serverNow()), 30_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
      else if (joinedRef.current) sendReport();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(t);
      window.clearInterval(c);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh, sendReport, g.deviceId]);

  useEffect(() => {
    if (!joinedRef.current || !g.rankTick) return;
    ticks.current += 1;
    if (ticks.current % EGO_REPORT_EVERY !== 0) return;
    sendReport();
  }, [g.rankTick, sendReport]);

  const join = useCallback(async () => {
    const cur = gRef.current;
    if (busy || !cur.deviceId) return;
    setBusy(true);
    setErr("");
    try {
      const secret = egoSecret();
      if (!secret) throw new Error("storage");
      const progress = cur.egoProgress();
      const res = await egoJoin(cur.deviceId, cur.nick || "Niekto", progress, await sha256Hex(secret));
      if (res.ok) {
        cur.egoPay(res.fee);
        anchor.current = { rp: progress.rp - res.fee, week: stateRef.current?.weekStart ?? null };
      } else setErr(res.error === "joined" ? "Tento týždeň už hráš." : res.error === "rank" ? "Vstup je iba pre NEKONEČNO." : "Vstup sa nepodaril.");
      await refresh();
    } catch {
      setErr("Bez spojenia so serverom. Skús znova.");
    } finally {
      setBusy(false);
    }
  }, [busy, refresh]);

  const live = state?.me?.joined
    ? egoLiveBoard(state.top, state.me, egoLiveScore(state.me.score, g.rp, anchor.current?.rp ?? null), g.nick)
    : null;

  return {
    state,
    busy,
    err,
    join,
    refresh,
    now,
    ack,
    live,
    attention: egoAttention(state, g.rp, now, seen),
    text: egoBanner(state, g.rp, now, live, false),
    strip: egoStripLine(state, g.rp, now, live),
  };
}

/** Top event line. Two equal segments so the crawl moves by exactly half and never stacks on itself. */
export function EgoStrip({ line, onOpen }: { line: string; onOpen: () => void }) {
  return (
    <button type="button" className="ego-strip" onClick={onOpen} aria-label={line}>
      <span className="ego-clip">
        <span className="ego-track">
          <span className="ego-seg">{line}</span>
          <span className="ego-seg" aria-hidden="true">
            {line}
          </span>
        </span>
      </span>
    </button>
  );
}

function RpNum({ n }: { n: number }) {
  return <strong className={`ego-delta is-${egoDeltaTone(n)}`}>{fmtRp(n)}</strong>;
}

function Rack() {
  return (
    <svg className="ego-rack" viewBox="0 0 640 118" aria-hidden="true">
      <defs>
        <linearGradient id="egoBayGlow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1496ff" stopOpacity="0" />
          <stop offset="0.45" stopColor="#b9ecff" />
          <stop offset="1" stopColor="#1496ff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="egoBayFace" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1c2c3c" />
          <stop offset="1" stopColor="#0a121a" />
        </linearGradient>
      </defs>
      <rect x="6" y="10" width="628" height="98" fill="#070d14" stroke="#23445f" />
      <rect x="6" y="10" width="628" height="3" fill="url(#egoBayGlow)" />
      <rect x="18" y="22" width="470" height="28" fill="url(#egoBayFace)" stroke="#2c516c" />
      <rect x="18" y="62" width="470" height="34" fill="url(#egoBayFace)" stroke="#2c516c" />
      {Array.from({ length: 14 }, (_, i) => (
        <rect key={i} x={32 + i * 28} y="30" width="16" height="12" fill="#0b1620" stroke="#3d6d8c" strokeWidth="0.6" />
      ))}
      {[48, 92, 136, 180, 360, 404].map((x) => (
        <circle key={x} cx={x} cy="54" r="2.2" fill="#7fd4ff" />
      ))}
      <circle cx="448" cy="54" r="2.2" fill="#e6c15a" />
      <path d="M70 50 C110 78, 150 28, 210 70" fill="none" stroke="#c5d0da" strokeWidth="1.6" />
      <path d="M210 70 C250 96, 280 40, 330 74" fill="none" stroke="#9aa8b5" strokeWidth="1.4" />
      <path d="M120 50 C150 88, 200 92, 250 58" fill="none" stroke="#e6c15a" strokeWidth="1.2" />
      <path d="M300 50 C340 20, 390 86, 450 46" fill="none" stroke="#d5dee6" strokeWidth="1.5" />
      <rect x="508" y="22" width="110" height="74" fill="#0c1620" stroke="#2c516c" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x="522" y={32 + i * 12} width="82" height="6" fill="#10202c" stroke="#3d6d8c" strokeWidth="0.5" />
      ))}
      <circle cx="592" cy="35" r="2" fill="#7fd4ff" />
      <circle cx="600" cy="35" r="2" fill="#1496ff" />
    </svg>
  );
}

export function SmrtEgaCard({
  ego,
  rp,
  deviceId,
}: {
  ego: ReturnType<typeof useSmrtEga>;
  rp: number;
  deviceId: string;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [codeErr, setCodeErr] = useState("");
  const [ask, setAsk] = useState(false);
  const [adminDevice, setAdminDevice] = useState(false);
  useEffect(() => {
    if (ego.state) ego.ack();
  }, [ego.state, ego.ack]);
  useEffect(() => {
    try {
      const token = localStorage.getItem(EGO_ADMIN_TOKEN_KEY);
      const remembered = localStorage.getItem(EGO_ADMIN_DEVICE_KEY) === "1";
      if (ego.state?.me?.admin) localStorage.setItem(EGO_ADMIN_DEVICE_KEY, "1");
      setAdminDevice(egoAdminVisible(Boolean(ego.state?.me?.admin), token, remembered || Boolean(ego.state?.me?.admin)));
    } catch {
      setAdminDevice(Boolean(ego.state?.me?.admin));
    }
  }, [ego.state?.me?.admin]);
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
  const rows = (s?.me?.joined && ego.live ? ego.live.top : s?.top) ?? [];
  const myPlace = ego.live?.place ?? s?.me?.place;
  const myScore = ego.live?.score ?? s?.me?.score;
  return (
    <section className="ego-card" aria-label="SMRŤ EGA">
      <i className="ego-tick is-tl" aria-hidden="true" />
      <i className="ego-tick is-tr" aria-hidden="true" />
      <i className="ego-tick is-bl" aria-hidden="true" />
      <i className="ego-tick is-br" aria-hidden="true" />
      <Rack />
      <header className="ego-brand">
        <p className="ego-kicker">TÝŽDENNÝ EVENT</p>
        <h3 className="ego-word">SMRŤ EGA</h3>
        <p className="ego-spread">NEKONEČNO</p>
        <p className="ego-product">4KA TV XL</p>
      </header>
      <p className="ego-clock">
        <span>KONČÍ O</span>
        <strong>{egoLeft((s?.weekEnd ?? egoWeekEnd(ego.now)) - ego.now)}</strong>
      </p>
      {adminDevice ? (
        <a className="ego-admin" href="/smrtega-admin">
          ADMIN
        </a>
      ) : null}
      <p className="ego-status">{ego.text}</p>

      {prize ? (
        <div className={`ego-prize is-${prize.status}`}>
          <b>TVOJ 4KA TV XL KĽÚČ</b>
          {prize.status === "pending" && (
            <p>KÓD SA PRIPRAVUJE. Martin práve odpája staré zariadenie. Odpočet 28 dní sa spustí až pri doručení.</p>
          )}
          {prize.status === "revoked" && <p>Kód bol zneplatnený správcom.</p>}
          {prize.status === "awarded" && (
            <>
              {code ? <div className="ego-code">{code}</div> : (
                <button type="button" className="ego-join" onClick={() => void reveal()}>
                  ODKRYŤ KĽÚČ
                </button>
              )}
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

      <h4>PODMIENKY</h4>
      <ul className="ego-rules">
        <li>Výhra: párovací kľúč 4KA TV XL s archívom, platí 28 dní od doručenia. Doručí sa sám v pondelok 01:00.</li>
        <li>Vstupné 2,5 % tvojich RP (min 500, max 2 500). Strhne sa hneď a prepadá.</li>
        <li>Skóre = čisté RP za týždeň: zisky aj straty od vstupu, vstupné sa ráta. RP z firmy sa rátajú rovnako, bez boostov.</li>
        <li>Martin hrá bez nároku na cenu. Keď je 1., vyhrá najlepší pod ním.</li>
      </ul>

      {s?.me?.joined ? (
        <p className="ego-stand">
          Si {myPlace}. · <RpNum n={myScore ?? 0} /> RP{s.me.admin ? " · BEZ NÁROKU NA CENU" : ""}
          <small className="ego-fee">vrátane vstupného {fmtRp(-s.me.fee)} RP</small>
        </p>
      ) : rp < EGO_FLOOR ? (
        <p className="ego-stand is-lock">Od NEKONEČNA. Chýba ti {miss} RP.</p>
      ) : !ask ? (
        <button type="button" className="ego-join" disabled={ego.busy || miss > 0 || !deviceId} onClick={() => setAsk(true)}>
          {miss > 0 ? `NA VSTUPNÉ CHÝBA ${miss} RP` : `ZAPLATIŤ SMRŤ EGA · −${fee} RP`}
        </button>
      ) : (
        <div className="ego-ask">
          <p>Naozaj zaplatiť {fee} RP? Vstupné sa nevracia.</p>
          <button type="button" className="ego-join" disabled={ego.busy} onClick={() => void ego.join().then(() => setAsk(false))}>
            ÁNO, ZAPLATIŤ
          </button>
          <button type="button" className="ego-join is-ghost" onClick={() => setAsk(false)}>
            NIE
          </button>
        </div>
      )}
      {ego.err ? <p className="ego-err">{ego.err}</p> : null}

      <h4>PORADIE · {s?.players ?? 0}</h4>
      <ol className="ego-board">
        {rows.map((t, i) => (
          <li key={`${t.nick}-${i}`} className={`${t.admin ? "is-admin" : ""}${"mine" in t && t.mine ? " is-mine" : ""}`}>
            <b>{i + 1}</b>
            <span>{t.nick}</span>
            {t.admin ? <em>BEZ NÁROKU</em> : null}
            <RpNum n={t.score} />
          </li>
        ))}
        {!rows.length ? <li className="is-empty">Zatiaľ nikto. Buď prvý.</li> : null}
      </ol>
      {s?.lastWinner ? (
        <p className="ego-last">
          Posledný výherca: {s.lastWinner.nick} (<RpNum n={s.lastWinner.score} /> RP)
        </p>
      ) : null}
    </section>
  );
}
