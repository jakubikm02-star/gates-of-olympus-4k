import { useEffect, useState, useSyncExternalStore } from "react";
import { peerRibbon, peerStamp, subscribePeers } from "@/lib/slot/ribbon-peers";
import { watchPeerRibbons } from "@/lib/slot/ribbon-api";
import {
  TIER_LABEL,
  TIER_STRIPES,
  latestRibbon,
  ribbonById,
  type RibbonIcon,
} from "@/lib/slot/ribbons";
import {
  bindRibbonPlayer,
  dismissRibbonToast,
  latestRibbonId,
  ribbonServerSnapshot,
  ribbonSnapshot,
  setRibbonTurbo,
  subscribeRibbons,
  toastSnapshot,
} from "@/lib/slot/ribbon-store";
import "./ribbons.css";

function Glyph({ icon }: { icon: RibbonIcon }) {
  const p = { fill: "none", stroke: "#1a1208", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (icon) {
    case "skull":
      return (
        <g {...p}>
          <circle cx="16" cy="14" r="4.2" />
          <path d="M14.2 13.6 h.2 M17.6 13.6 h.2 M16 15.4 v1.2 M13.4 20.2 h5.2" />
        </g>
      );
    case "moon":
      return <path {...p} d="M18 11.5 a4.5 4.5 0 1 1 -4 -4 a3.6 3.6 0 0 0 4 4 z" />;
    case "flame":
      return <path {...p} d="M16 10 c1.5 2 3 2.6 3 5 a3 3 0 0 1 -6 0 c0 -1.4.8-2.4 1.4-3.2" />;
    case "drop":
      return <path {...p} d="M16 10.5 c2.4 3 4 4.4 4 6.4 a4 4 0 0 1 -8 0 c0 -2 1.6-3.4 4-6.4 z" />;
    case "wheel":
      return (
        <g {...p}>
          <circle cx="16" cy="15" r="4" />
          <path d="M16 11 v8 M12 15 h8 M13.2 12.2 l5.6 5.6 M18.8 12.2 l-5.6 5.6" />
        </g>
      );
    case "box":
      return (
        <g {...p}>
          <path d="M11 13.5 l5-2.2 5 2.2 v5.2 l-5 2.2 -5-2.2 z" />
          <path d="M11 13.5 l5 2.2 5-2.2 M16 15.7 v5.2" />
        </g>
      );
    case "crown":
      return <path {...p} d="M11 18.5 l1.2-6 3.8 3.2 3.8-3.2 1.2 6 z" />;
    case "bolt":
      return <path {...p} d="M17.4 10.5 l-4.2 5 h3 l-1.2 4.6 4.4-5.4 h-3 z" />;
    case "eye":
      return (
        <g {...p}>
          <path d="M10.5 15 q5.5-4.5 11 0 q-5.5 4.5-11 0 z" />
          <circle cx="16" cy="15" r="1.4" />
        </g>
      );
    case "ban":
      return (
        <g {...p}>
          <circle cx="16" cy="15" r="4.2" />
          <path d="M13.2 17.8 l5.6-5.6" />
        </g>
      );
    case "coins":
      return (
        <g {...p}>
          <ellipse cx="16" cy="13.2" rx="4.2" ry="1.8" />
          <path d="M11.8 13.2 v3.2 a4.2 1.8 0 0 0 8.4 0 v-3.2" />
        </g>
      );
    case "ticket":
      return <path {...p} d="M11 12.5 h10 v2.2 a1.3 1.3 0 0 0 0 2.2 v2.2 h-10 v-2.2 a1.3 1.3 0 0 0 0-2.2 z" />;
    default:
      return null;
  }
}

/** Static ribbon art (public/ribbons, Vercel static). Bump RIBBON_ART_V when the files change. */
export const RIBBON_ART_V = 1;
export function ribbonArtUrl(id: string, big = false): string {
  return `/ribbons/${id}${big ? "" : "-small"}.webp?v=${RIBBON_ART_V}`;
}

function RibbonSvg({ id, size }: { id: string; size: number }) {
  const def = ribbonById(id);
  if (!def) return null;
  const [a, b, c] = TIER_STRIPES[def.tier];
  const h = Math.round(size * 1.15);
  return (
    <svg width={size} height={h} viewBox="0 0 32 36" aria-hidden="true">
      <path d="M8 2 h16 v16 l-8 4 -8-4 z" fill={a} />
      <path d="M8 8 h16 v3.2 H8 z" fill={b} />
      <path d="M8 13 h16 v2.4 H8 z" fill={c} />
      <path d="M9 18 h5 l-2.5 8 z" fill={b} />
      <path d="M18 18 h5 l-2.5 8 z" fill={b} />
      <Glyph icon={def.icon} />
    </svg>
  );
}

/**
 * Ribbon emblem. `size` is the height in CSS px of the 16:9 art (the old SVG used it as width;
 * the SVG fallback keeps that). `big` loads the 1024×576 art: only for large spots, never in a list
 * that renders on startup. The image is lazy, has fixed width/height (no layout shift), and falls
 * back to the stripe SVG if the file fails to load.
 */
export function RibbonBadge({ id, size = 22, latest = false, big = false }: { id: string; size?: number; latest?: boolean; big?: boolean }) {
  const def = ribbonById(id);
  const src = ribbonArtUrl(id, big);
  const [failedSrc, setFailedSrc] = useState("");
  const failed = failedSrc === src;
  if (!def) return null;
  const h = Math.round(size);
  const w = Math.round((h * 16) / 9);
  return (
    <span
      className={`rib is-${def.tier}${latest ? " is-latest" : ""}${failed ? "" : " is-art"}`}
      title={`${def.name} — ${def.line}`}
      aria-label={`${def.name}. ${def.line}`}
    >
      {failed ? (
        <RibbonSvg id={def.id} size={Math.round(h / 1.15)} />
      ) : (
        <img
          src={src}
          width={w}
          height={h}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedSrc(src)}
        />
      )}
    </span>
  );
}

/** Own latest ribbon, or another player's, next to a name. */
export function RibbonSlot({
  playerId,
  nick,
  mine = false,
  size = 16,
}: {
  playerId?: string;
  nick?: string;
  mine?: boolean;
  size?: number;
}) {
  const local = useSyncExternalStore(subscribeRibbons, latestRibbonId, () => "");
  useSyncExternalStore(subscribePeers, peerStamp, () => 0);
  const id = mine ? local : peerRibbon({ id: playerId, nick });
  if (!id) return null;
  return <RibbonBadge id={id} size={size} />;
}

/** Ribbon emblem plus its full title, as a line under a name. Nothing when the player has none today. */
export function RibbonTag({
  playerId,
  nick,
  mine = false,
  size = 14,
}: {
  playerId?: string;
  nick?: string;
  mine?: boolean;
  size?: number;
}) {
  const local = useSyncExternalStore(subscribeRibbons, latestRibbonId, () => "");
  useSyncExternalStore(subscribePeers, peerStamp, () => 0);
  const id = mine ? local : peerRibbon({ id: playerId, nick });
  const def = id ? ribbonById(id) : null;
  if (!def) return null;
  return (
    <span className={`rib-tag is-${def.tier}`}>
      <RibbonBadge id={def.id} size={size} />
      <span className="rib-tag-name">{def.name}</span>
    </span>
  );
}

const BRA_TIME = new Intl.DateTimeFormat("sk-SK", { timeZone: "Europe/Bratislava", hour: "2-digit", minute: "2-digit" });

function earnedTime(at: number): string {
  try {
    return at > 0 ? BRA_TIME.format(new Date(at)) : "";
  } catch {
    return "";
  }
}

export function RibbonToday() {
  const log = useSyncExternalStore(subscribeRibbons, ribbonSnapshot, ribbonServerSnapshot);
  const latest = latestRibbon(log);
  const def = latest ? ribbonById(latest.id) : null;
  const rest = def ? log.earned.slice(0, -1) : log.earned;
  return (
    <section className="rib-today" aria-label="Dnešné ribbony">
      <header>
        <b>DNEŠNÉ RIBBONY</b>
        <span>{log.earned.length}</span>
      </header>
      {def && latest ? (
        <article className="rib-latest">
          <RibbonBadge id={latest.id} size={40} latest big />
          <div>
            <em>NAJNOVŠÍ · {TIER_LABEL[def.tier]}</em>
            <strong>{def.name}</strong>
            <p>{def.line}</p>
          </div>
        </article>
      ) : (
        <p className="rib-empty">Dnes ešte nič. Niečo sprav a ostane ti to do polnoci.</p>
      )}
      {log.earned.length ? (
        <details className="rib-all">
          <summary>
            <span>Dnešné tituly ({log.earned.length})</span>
            <i aria-hidden="true">▾</i>
          </summary>
          <ol className="rib-all-list">
            {log.earned
              .slice()
              .reverse()
              .map((e, i) => {
                const r = ribbonById(e.id);
                if (!r) return null;
                const time = earnedTime(e.at);
                return (
                  <li key={e.id} className={`rib-all-item is-${r.tier}${i === 0 ? " is-newest" : ""}`}>
                    <RibbonBadge id={e.id} size={54} big />
                    <div className="rib-all-copy">
                      <div className="rib-all-meta">
                        {i === 0 ? <em>NAJNOVŠÍ</em> : null}
                        <span>{TIER_LABEL[r.tier]}</span>
                        {time ? <time dateTime={new Date(e.at).toISOString()}>{time}</time> : null}
                      </div>
                      <strong>{r.name}</strong>
                      <p>{r.line}</p>
                    </div>
                  </li>
                );
              })}
          </ol>
        </details>
      ) : null}
      {rest.length ? (
        <ul className="rib-rest">
          {rest.map((e) => {
            const r = ribbonById(e.id);
            if (!r) return null;
            return (
              <li key={e.id} className="rib-chip" title={r.line}>
                <RibbonBadge id={e.id} size={18} />
                <b>{r.name}</b>
                <i>{TIER_LABEL[r.tier]}</i>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

export function RibbonToast({ turbo }: { turbo: boolean }) {
  const toast = useSyncExternalStore(subscribeRibbons, toastSnapshot, () => null);
  useEffect(() => {
    setRibbonTurbo(turbo);
  }, [turbo]);
  useEffect(() => {
    if (!toast) return;
    const ms = turbo ? 900 : 2400;
    const id = window.setTimeout(() => dismissRibbonToast(false), ms);
    return () => window.clearTimeout(id);
  }, [toast, turbo]);
  if (!toast) return null;
  const def = ribbonById(toast.id);
  if (!def) return null;
  return (
    <div className={`rib-toast${turbo ? " is-turbo" : ""}`} role="status">
      <RibbonBadge id={def.id} size={40} latest />
      <span className="rib-toast-copy">
        <strong>{def.name}</strong>
        <p>{def.line}</p>
      </span>
      <button type="button" className="rib-skip" onClick={() => dismissRibbonToast(true)}>
        PRESKOČIŤ
      </button>
    </div>
  );
}

export function RibbonBind({ id, nick }: { id: string; nick: string }) {
  useEffect(() => {
    bindRibbonPlayer(id, nick);
  }, [id, nick]);
  return null;
}

export function RibbonWatch() {
  useEffect(() => watchPeerRibbons(), []);
  return null;
}
