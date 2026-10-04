import type { ReactNode } from "react";
import { BarChart3, Check, ChevronRight, Play, Siren, Sparkles, Swords, Ticket } from "lucide-react";
import type { Standing } from "@/lib/slot/ranks";
import { WIN_POP_X } from "@/lib/slot/symbols";
import { POOL_ELIGIBLE_BET } from "@/lib/slot/jackpot";
import { RankFrame } from "./RankFrame";

/**
 * Intro / loading screen. Only art the game already preloads (garage, scatter, ticket)
 * plus a hole-fixed Paas hero webp (~49 kB), one 400 B svg and lucide glyphs.
 * Layout is pure CSS (boot-screen.css): stacked on phones, hero + side panel from 821 px.
 */

interface Feat {
  id: string;
  title: string;
  sub: string;
  icon: ReactNode;
}

const FEATS: readonly Feat[] = [
  { id: "tv", title: "4KA TV", sub: "Voľné točenia od 15 FS", icon: <img src="/symbols/tv4ka.png" alt="" decoding="async" /> },
  { id: "zasah", title: "ZÁSAH", sub: "Finančná správa ide po tebe", icon: <Siren size={20} strokeWidth={2.2} /> },
  { id: "kontrola", title: "KONTROLA", sub: "Bonus bar · KONTROLA, Ž-BOX, KOLESO", icon: <img src="/symbols/park.svg" alt="" decoding="async" /> },
  { id: "jp", title: "JACKPOTY", sub: `4 poty FTTB cez lístok · od stávky ${POOL_ELIGIBLE_BET}`, icon: <img src="/symbols/fttb-stat.png?v=fttb3" alt="" decoding="async" /> },
  { id: "tikety", title: "TIKETY", sub: "Úlohy pri akomkoľvek kredite", icon: <Ticket size={20} strokeWidth={2.2} /> },
  { id: "duel", title: "DUEL", sub: "1 v 1 pri stole aj online · víťaz berie oboje", icon: <Swords size={20} strokeWidth={2.2} /> },
  { id: "massive", title: "MASÍVNA VÝHRA", sub: `Ceremónia od ${WIN_POP_X.massive}× stávky`, icon: <Sparkles size={20} strokeWidth={2.2} /> },
  { id: "stats", title: "ŠTATISTIKY", sub: "Celá tvoja história hry", icon: <BarChart3 size={20} strokeWidth={2.2} /> },
];

interface Props {
  ready: boolean;
  pct: number;
  booting: boolean;
  rank: Standing;
  onStart: () => void;
  onRank: () => void;
}

export function BootScreen({ ready, pct, booting, rank, onStart, onRank }: Props) {
  const shown = ready ? 100 : Math.max(0, Math.min(100, Math.round(pct)));
  const label = `${rank.name}${rank.roman ? ` ${rank.roman}` : ""}`;
  const into = rank.need > 0 ? Math.min(100, (rank.into / rank.need) * 100) : 100;
  return (
    <div className={`bs ${ready ? "is-ready" : ""}`}>
      <div className="bs-bg" aria-hidden="true" />
      <div className="bs-light" aria-hidden="true" />
      <div className="bs-hero" aria-hidden="true">
        <i className="bs-halo" />
        <img src="/art/paas-hero.webp" alt="" className="bs-paas" fetchPriority="high" decoding="async" />
        <i className="bs-floor" />
        <img src="/symbols/can-t4.webp" alt="" className="bs-prop p-can" decoding="async" />
        <img src="/symbols/tv4ka.png" alt="" className="bs-prop p-tv" decoding="async" />
        <img src="/symbols/fttb-stat.png?v=fttb3" alt="" className="bs-prop p-jp" decoding="async" />
      </div>

      <section className="bs-panel" aria-label="Ports of Parkizmus">
        <header className="bs-brand">
          <span className="bs-kicker">
            <i />
            PORTS <em>of</em>
            <i />
          </span>
          <h1 className="bs-logo" data-text="PARKIZMUS">
            <span>PARKIZMUS</span>
          </h1>
          <span className="bs-tag">6×5 · TUMBLE · NÁSOBIČE AŽ 500×</span>
        </header>

        <div className="bs-max">
          <span className="bs-max-k">VÝHRA AŽ</span>
          <b data-text="5 000×">5 000×</b>
          <span className="bs-max-k">STÁVKY</span>
        </div>

        <ul className="bs-feats">
          {FEATS.map((f) => (
            <li key={f.id} className={`bs-feat f-${f.id}`}>
              <span className="bs-ico">{f.icon}</span>
              <span className="bs-ft">
                <b>{f.title}</b>
                <small>{f.sub}</small>
              </span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="bs-rank"
          onClick={onRank}
          aria-label={`Liga 4ky · ${label}`}
          style={{ ["--rk" as string]: rank.color }}
        >
          <span className="bs-rank-ico">
            <RankFrame id={rank.id} division={rank.division} size={30} scale={1.5} />
          </span>
          <span className="bs-rank-txt">
            <small>LIGA 4KY · TVOJ RANK</small>
            <b>{label}</b>
            <i className="bs-rank-bar" aria-hidden="true">
              <i style={{ width: `${into}%` }} />
            </i>
          </span>
          <span className="bs-rank-rp">
            <b>{rank.rp.toLocaleString("sk-SK")}</b>
            <small>RP</small>
          </span>
          <ChevronRight className="bs-rank-go" size={18} strokeWidth={2.4} aria-hidden="true" />
        </button>

        <div className="bs-load" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={shown} aria-label="Načítanie hry">
          <div className="bs-load-row">
            <span>{ready ? <><Check size={13} strokeWidth={3} /> PRIPRAVENÉ</> : "NAČÍTAVAM GARÁŽ"}</span>
            <b>{shown} %</b>
          </div>
          <div className="bs-track">
            <i style={{ width: `${shown}%` }} />
          </div>
        </div>

        <button type="button" className="cta bs-cta" disabled={!ready || booting} onClick={onStart}>
          <span>{booting ? "ZVUK…" : "HRAŤ"}</span>
          {booting ? null : <Play size={18} strokeWidth={0} fill="currentColor" aria-hidden="true" />}
        </button>

        <p className="bs-fine">Demo · bez vkladov · kredit, liga a štatistiky ostávajú v tomto prehliadači</p>
      </section>
    </div>
  );
}
