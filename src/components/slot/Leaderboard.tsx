import { useEffect, useState } from "react";
import { fetchBoard, publicId, type BoardRow } from "@/lib/slot/board-api";
import { canSrc, PAY_SYMBOLS, SCATTER, TICKETS, type PayId } from "@/lib/slot/symbols";
import { cascadeWord, recipeSentence, type WinRecipe } from "@/lib/slot/win-recipe";

/* ---------- 7-segment LED ---------- */

const SEGS: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abged",
  "3": "abgcd",
  "4": "fgbc",
  "5": "afgcd",
  "6": "afgedc",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
  "-": "g",
  " ": "",
};

const T = 2.3;
function hSeg(x1: number, x2: number, y: number): string {
  const h = T / 2;
  return `${x1 + h},${y} ${x1 + T},${y - h} ${x2 - T},${y - h} ${x2 - h},${y} ${x2 - T},${y + h} ${x1 + T},${y + h}`;
}
function vSeg(x: number, y1: number, y2: number): string {
  const h = T / 2;
  return `${x},${y1 + h} ${x + h},${y1 + T} ${x + h},${y2 - T} ${x},${y2 - h} ${x - h},${y2 - T} ${x - h},${y1 + T}`;
}
const SEG_PTS: Record<string, string> = {
  a: hSeg(2.4, 11.6, 2),
  g: hSeg(2.4, 11.6, 12),
  d: hSeg(2.4, 11.6, 22),
  f: vSeg(2, 2.4, 11.6),
  b: vSeg(12, 2.4, 11.6),
  e: vSeg(2, 12.4, 21.6),
  c: vSeg(12, 12.4, 21.6),
};
const DIGIT_W = 15;
const GAP_W = 5;

/** Splits "1 334 550" / "25,59" into glyphs; "," is the lit decimal point of the digit before it. */
function glyphs(text: string): { ch: string; dp: boolean; gap: boolean }[] {
  const out: { ch: string; dp: boolean; gap: boolean }[] = [];
  for (const ch of text) {
    if (ch === "," || ch === ".") {
      if (out.length) out[out.length - 1].dp = true;
    } else if (ch === "\u2009") {
      out.push({ ch: "", dp: false, gap: true });
    } else out.push({ ch, dp: false, gap: false });
  }
  return out;
}

/** Fixed window like a price board: 7 digits + 2 group gaps; unused places stay as dark "8"s. */
const WINDOW_W = 7 * DIGIT_W + 2 * GAP_W;

export function SegLed({ text, label, size = "lg" }: { text: string; label?: string; size?: "lg" | "sm" }) {
  const gl = glyphs(text);
  const contentW = gl.reduce((w, g) => w + (g.gap ? GAP_W : DIGIT_W), 0);
  const total = Math.max(WINDOW_W, contentW);
  const lead = Math.floor((total - contentW) / DIGIT_W);
  const pad = Array.from({ length: lead }, () => ({ ch: " ", dp: false, gap: false }));
  let x = total - contentW - lead * DIGIT_W;
  const parts = [...pad, ...gl].map((g, i) => {
    const at = x;
    x += g.gap ? GAP_W : DIGIT_W;
    if (g.gap) return null;
    const on = SEGS[g.ch] ?? "";
    return (
      <g key={i} transform={`translate(${at} 0) skewX(-7) translate(1.6 0)`}>
        {Object.entries(SEG_PTS).map(([k, pts]) => (
          <polygon key={k} points={pts} className={on.includes(k) ? "seg-on" : "seg-off"} />
        ))}
        <circle cx={14} cy={22} r={1.25} className={g.dp ? "seg-on" : "seg-off"} />
      </g>
    );
  });
  return (
    <svg
      className={`seg seg-${size}`}
      viewBox={`-1 -1 ${total + 2} 26`}
      style={{ aspectRatio: `${total + 2} / 26` }}
      role="img"
      aria-label={label ?? text}
    >
      {parts}
    </svg>
  );
}

const THIN = "\u2009";
/** Price-board style: small wins keep 2 decimals like fuel (25,59), big ones are grouped (1 334 550). */
function ledText(n: number): string {
  const v = Math.max(0, n);
  if (v < 1000 && Math.round(v * 100) % 100 !== 0) return v.toFixed(2).replace(".", ",");
  const s = String(Math.round(v));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
}

function plain(n: number): string {
  return Math.round(n).toLocaleString("sk-SK");
}

function stakeText(n: number): string {
  return n.toLocaleString("sk-SK", { maximumFractionDigits: 2 });
}

/* ---------- recipe strip ---------- */

const PAY_BY_ID = new Map(PAY_SYMBOLS.map((s) => [s.id, s]));
const payLabel = (id: PayId) => PAY_BY_ID.get(id)?.name ?? id;

const MODE_LABEL: Record<WinRecipe["mode"], string> = {
  base: "ZÁKLAD",
  fs: "4KA TV",
  buy: "KÚPA",
  zasah: "ZÁSAH",
  duel: "DUEL",
  ticket: "LÍSTOK",
};

function ModeIcon({ mode }: { mode: WinRecipe["mode"] }) {
  // Small inline glyphs, drawn here so they match the board ink.
  if (mode === "base")
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <rect x="2" y="4" width="16" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M7.3 4v12M12.7 4v12" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  if (mode === "buy")
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M2.5 4h2.6l2 8.6h8.4l1.8-6H6.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx="8.4" cy="15.8" r="1.4" fill="currentColor" />
        <circle cx="14.2" cy="15.8" r="1.4" fill="currentColor" />
      </svg>
    );
  if (mode === "zasah")
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="10" cy="10" r="2.2" fill="currentColor" />
        <path d="M10 1.5v4M10 14.5v4M1.5 10h4M14.5 10h4" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  if (mode === "duel")
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M3 3l9 9M17 3l-9 9M5.5 14.5l-2 2M14.5 14.5l2 2M4 11l5 5M16 11l-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 6.5 10 3l7 3.5v7L10 17l-7-3.5z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 7v6M7 10h6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function Icon({ src, alt, badge, title }: { src: string; alt: string; badge?: string; title?: string }) {
  return (
    <span className="fb-ico" title={title ?? alt}>
      <img src={src} alt={alt} loading="lazy" draggable={false} />
      {badge ? <b>{badge}</b> : null}
    </span>
  );
}

function Can({ value }: { value: number }) {
  return (
    <span className="fb-ico fb-can" title={`Plechovka ${value}×`}>
      <img src={canSrc(value)} alt={`plechovka ${value}×`} loading="lazy" draggable={false} />
      <b>{value}×</b>
    </span>
  );
}

/** Falling block onto a settled row: reads as "symbols dropping in", not as a download arrow. */
function CascadeIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M8.2 1.2v2.2M11.8 1.2v2.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
      <rect x="6.5" y="5" width="7" height="5.6" rx="1.4" fill="currentColor" />
      <rect x="1.8" y="12.6" width="7" height="5.6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11.2" y="12.6" width="7" height="5.6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function CascadeChip({ n }: { n: number }) {
  const word = cascadeWord(n);
  return (
    <span className="fb-chip is-cascade" title={`${n} ${word} (Cluster tumble)`}>
      <CascadeIcon />
      <b>{n}</b>
      {" "}
      {word.toUpperCase()}
    </span>
  );
}

export function RecipeStrip({ recipe }: { recipe: WinRecipe | null }) {
  if (!recipe) {
    return (
      <div className="fb-recipe is-empty" aria-label="Spôsob výhry nie je zaznamenaný">
        <span className="fb-mode is-unknown">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M7.6 7.6a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.6v.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="10" cy="14.6" r="1" fill="currentColor" />
          </svg>
          bez záznamu
        </span>
        <small>Detail sa ukladá až od novej verzie.</small>
      </div>
    );
  }
  const r = recipe;
  const showFs = r.mode === "fs" || r.mode === "buy";
  return (
    <div className="fb-recipe" aria-label={recipeSentence(r, payLabel)}>
      <span className={`fb-mode is-${r.mode}`}>
        <ModeIcon mode={r.mode} />
        {MODE_LABEL[r.mode]}
        {r.ante ? <i>ANTE</i> : null}
      </span>
      {r.mode === "ticket" && r.ticket ? (
        <>
          <span className="fb-ico fb-ticket" title={`Parkovací lístok ${TICKETS[r.ticket].name} (jackpot)`}>
            <img src={TICKETS[r.ticket].src} alt={`lístok ${TICKETS[r.ticket].name}`} loading="lazy" draggable={false} />
          </span>
          <span className="fb-chip">
            <b>{TICKETS[r.ticket].name}</b> jackpot
          </span>
        </>
      ) : null}
      {r.scatters ? <Icon src={SCATTER.src} alt={`${r.scatters}× ${SCATTER.name}`} badge={`${r.scatters}×`} title={`${r.scatters}× ${SCATTER.name}`} /> : null}
      {showFs && r.spins ? (
        <span className="fb-chip" title="odohrané točenia 4KA TV">
          <b>{r.spins}</b> FS{r.extra ? <em>+{r.extra}</em> : null}
        </span>
      ) : null}
      {r.pays.map((p) => (
        <Icon
          key={p.id}
          src={PAY_BY_ID.get(p.id)?.src ?? ""}
          alt={payLabel(p.id)}
          badge={r.legacy ? undefined : `${p.n}×`}
          title={r.legacy ? payLabel(p.id) : `${p.n}× ${payLabel(p.id)}`}
        />
      ))}
      {r.cans?.slice(0, showFs ? 3 : 4).map((c, i) => <Can key={`${c}-${i}`} value={c} />)}
      {r.cans && r.cans.length > (showFs ? 3 : 4) ? <span className="fb-chip is-more">+{r.cans.length - (showFs ? 3 : 4)}</span> : null}
      {r.mult ? (
        <span className="fb-chip is-mult" title={showFs ? "celkový násobič na konci 4KA TV" : "násobič výhry"}>
          {showFs ? "Σ" : "×"} <b>{r.mult}×</b>
        </span>
      ) : null}
      {r.tumbles ? <CascadeChip n={r.tumbles} /> : null}
      {r.vs ? (
        <span className="fb-chip">
          <b>{plain(r.vs[0])}</b>:<b>{plain(r.vs[1])}</b>
        </span>
      ) : null}
      {r.mod ? <span className={`fb-chip ${r.mod > 1 ? "is-bonus" : "is-tax"}`}>{r.mod > 1 ? `BONUS ${r.mod}×` : `DAŇ ${r.mod}×`}</span> : null}
      {r.legacy ? (
        <span className="fb-chip is-legacy" title="Prečítané zo starého textového zápisu: bez počtov symbolov a plechoviek">
          starý zápis
        </span>
      ) : null}
    </div>
  );
}

/* ---------- board ---------- */

function Grade({ row, rank, mine }: { row: BoardRow; rank: number; mine: boolean }) {
  const rawX = row.stake > 0 && row.best > 0 ? row.best / row.stake : 0;
  // A slot round tops out at 5000x (x1.23 bonus). Above that the stored stake is wrong — old clients saved
  // a stale bet for base-game wins — so don't print a fake multiple.
  const pool = row.recipe?.mode === "ticket" || row.recipe?.mode === "duel";
  const badStake = rawX > 6200 && !pool;
  const x = badStake ? 0 : rawX;
  return (
    <li className={`fb-row ${mine ? "is-me" : ""} ${rank <= 3 ? `is-top is-top${rank}` : ""}`}>
      <div className="fb-grade">
        <span className="fb-rank" aria-label={`${rank}. miesto`}>
          {rank}
        </span>
        <span className="fb-nick">{row.nick}</span>
        {mine ? <em className="fb-me">TY</em> : null}
      </div>
      <div className="fb-price">
        <SegLed text={row.best > 0 ? ledText(row.best) : "-"} label={`Najväčšia výhra ${plain(row.best)}`} />
        <span className="fb-unit">kredit</span>
      </div>
      <RecipeStrip recipe={row.best > 0 ? row.recipe : null} />
      <dl className="fb-meta">
        <div title={badStake ? "Starý záznam: stávka sa pri tejto výhre uložila chybne" : "Stávka na spin, pri ktorom padla najväčšia výhra"}>
          <dt>stávka</dt>
          <dd>{badStake ? "?" : row.stake > 0 ? stakeText(row.stake) : "—"}</dd>
        </div>
        <div title="Najväčšia výhra delená stávkou">
          <dt>× stávky</dt>
          <dd>{x > 0 ? `${x >= 100 ? plain(x) : x.toFixed(1).replace(".", ",")}×` : "—"}</dd>
        </div>
        <div title="Koľko kreditu hráč spolu stavil">
          <dt>stavené</dt>
          <dd>{plain(row.wagered)}</dd>
        </div>
        <div title="Koľko kreditu hráč spolu vyhral">
          <dt>vyhrané</dt>
          <dd>{plain(row.paid)}</dd>
        </div>
      </dl>
    </li>
  );
}

export function PriceBoard({
  rows,
  scope,
  onScope,
  isMine,
  note,
  sample,
}: {
  rows: BoardRow[];
  scope: "today" | "all";
  onScope: (s: "today" | "all") => void;
  isMine: (row: BoardRow) => boolean;
  note?: string;
  sample?: boolean;
}) {
  return (
    <div className="fb-pylon">
      <div className="fb-cap">
        <span className="fb-mark" aria-hidden="true">
          <i />
        </span>
        <div className="fb-title">
          <strong>CENNÍK VÝHIER</strong>
          <span>Ports of Parkizmus · najväčšia výhra</span>
        </div>
      </div>
      {sample ? <p className="fb-sample">UKÁŽKA · vymyslené vzorové dáta, nie skutočná tabuľa</p> : null}
      <div className="fb-tabs" role="tablist" aria-label="Obdobie">
        <button type="button" role="tab" aria-selected={scope === "today"} className={scope === "today" ? "on" : ""} onClick={() => onScope("today")}>
          DNES
        </button>
        <button type="button" role="tab" aria-selected={scope === "all"} className={scope === "all" ? "on" : ""} onClick={() => onScope("all")}>
          CELKOVO
        </button>
      </div>
      {note ? <p className="fb-note">{note}</p> : null}
      <ol className="fb-list">
        {rows.map((row, i) => (
          <Grade key={row.id || row.nick} row={row} rank={i + 1} mine={isMine(row)} />
        ))}
      </ol>
      <details className="fb-legend">
        <summary>AKO ČÍTAŤ RIADOK</summary>
        <ul>
          <li>
            <Icon src={PAY_SYMBOLS[8].src} alt="symbol" badge="12×" />
            <span>symbol, ktorý platil · koľko kusov naraz</span>
          </li>
          <li>
            <Can value={50} />
            <span>plechovka = násobič, ktorý padol s výhrou</span>
          </li>
          <li>
            <span className="fb-chip is-mult">
              Σ <b>64×</b>
            </span>
            <span>celkový násobič na konci 4KA TV</span>
          </li>
          <li>
            <Icon src={SCATTER.src} alt={SCATTER.name} badge="4×" />
            <span>4KA TV, ktoré otvorili točenia</span>
          </li>
          <li>
            <span className="fb-chip">
              <b>20</b> FS<em>+5</em>
            </span>
            <span>odohrané točenia 4KA TV · z toho navyše</span>
          </li>
          <li>
            <CascadeChip n={3} />
            <span>koľkokrát symboly dopadli znova (kaskády) · pri 4KA TV súčet za všetky točenia</span>
          </li>
          <li>
            <span className="fb-mode is-zasah">
              <ModeIcon mode="zasah" />
              ZÁSAH
            </span>
            <span>výhra počas ZÁSAHU (bonus 1,15×)</span>
          </li>
          <li>
            <span className="fb-mode is-buy">
              <ModeIcon mode="buy" />
              KÚPA
            </span>
            <span>4KA TV kúpená tlačidlom KÚPIŤ</span>
          </li>
          <li>
            <span className="fb-meta-key">stávka · × stávky</span>
            <span>stávka pri výhre a koľkonásobok to bol</span>
          </li>
        </ul>
      </details>
      <p className="fb-foot">Spôsob výhry hlási hra z tvojho zariadenia. Server kontroluje rozsahy, nie samotný spin.</p>
    </div>
  );
}

export function NickAsk({
  onSave,
  onSkip,
}: {
  onSave: (name: string) => Promise<string | null>;
  onSkip: () => void;
}) {
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="modal-back" role="presentation">
      <form
        className="modal-card nick-ask"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void onSave(name).then((msg) => {
            setBusy(false);
            setErr(msg ?? "");
          });
        }}
      >
        <header className="modal-head">
          <h2>Meno na tomto mobile</h2>
        </header>
        <p className="modal-lead">2 až 12 znakov. Čísla ostanú na tomto zariadení. Dva mobily s rovnakým menom sú dva riadky.</p>
        <input
          className="sound-pass"
          value={name}
          maxLength={12}
          placeholder="Meno na tomto mobile"
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
        />
        {err ? <p className="sound-err">{err}</p> : null}
        <div className="nick-actions">
          <button type="submit" className="sound-reset" disabled={busy || name.trim().length < 2}>
            {busy ? "…" : "ULOŽIŤ"}
          </button>
          <button type="button" className="sound-one" onClick={onSkip}>
            Neskôr
          </button>
        </div>
      </form>
    </div>
  );
}

export function Leaderboard({
  open,
  nick,
  deviceId,
  onClose,
  onSave,
}: {
  open: boolean;
  nick: string;
  deviceId: string;
  onClose: () => void;
  onSave: (name: string) => Promise<string | null>;
}) {
  const [scope, setScope] = useState<"today" | "all">("today");
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [err, setErr] = useState("");
  const [name, setName] = useState(nick);
  const [nickErr, setNickErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [pub, setPub] = useState("");
  useEffect(() => setName(nick), [nick]);
  useEffect(() => {
    let stop = false;
    void publicId(deviceId)
      .then((h) => {
        if (!stop) setPub(h);
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [deviceId]);
  useEffect(() => {
    if (!open || !nick) return;
    let stop = false;
    setErr("");
    void fetchBoard(scope)
      .then((list) => {
        if (!stop) setRows(list);
      })
      .catch(() => {
        if (!stop) setErr("Tabuľu sa nepodarilo načítať.");
      });
    return () => {
      stop = true;
    };
  }, [open, scope, nick]);
  if (!open) return null;
  const isMine = (row: BoardRow) => Boolean(deviceId) && (row.id === deviceId || (Boolean(pub) && row.id === pub));
  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <div className="modal-card fb-sheet" role="dialog" aria-labelledby="board-title" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head fb-head">
          <h2 id="board-title">Tabuľa</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Zavrieť">
            ×
          </button>
        </header>
        <form
          className="nick-line"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            void onSave(name).then((msg) => {
              setBusy(false);
              setNickErr(msg ?? "");
            });
          }}
        >
          <label>
            Meno na tomto mobile
            <input value={name} maxLength={12} placeholder="2–12 znakov" onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit" disabled={busy || name.trim().length < 2}>
            {nick ? "Premenovať" : "Uložiť"}
          </button>
        </form>
        {nickErr ? <p className="sound-err">{nickErr}</p> : null}
        {!nick ? <p className="sound-note">Najprv meno. Potom uvidíš dnešné tabule.</p> : null}
        {err ? <p className="sound-err">{err}</p> : null}
        {nick ? (
          <PriceBoard
            rows={rows}
            scope={scope}
            onScope={setScope}
            isMine={isMine}
            note={rows.length === 0 && !err ? "Zatiaľ tu nikto nie je." : undefined}
          />
        ) : null}
      </div>
    </div>
  );
}
