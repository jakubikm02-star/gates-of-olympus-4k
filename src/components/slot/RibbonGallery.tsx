/**
 * Ribbony: every ribbon in one grid (BF4 Awards → Ribbons). Lazy chunk, opened by
 * openRibbonGallery() from any ribbon in the game. Counts are the current player's own lifetime
 * tally on this phone (ribbon-tally.ts); a ribbon never earned is a black silhouette with "???",
 * and its hláška stays hidden until it is earned.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { TIER_LABEL } from "@/lib/slot/ribbons";
import {
  closeRibbonGallery,
  earnedKinds,
  galleryTiles,
  openRibbonGallery,
  showRibbonGrid,
  subscribeTally,
  tallyServerSnapshot,
  tallySnapshot,
} from "@/lib/slot/ribbon-tally";
import { RibbonBadge } from "./RibbonBadge";
import "./ribbon-gallery.css";

const BRA_DATE = new Intl.DateTimeFormat("sk-SK", {
  timeZone: "Europe/Bratislava",
  day: "numeric",
  month: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function lastText(at: number): string {
  try {
    return at > 0 ? BRA_DATE.format(new Date(at)) : "";
  } catch {
    return "";
  }
}

export default function RibbonGallery({ id }: { id: string }) {
  const tally = useSyncExternalStore(subscribeTally, tallySnapshot, tallyServerSnapshot);
  const tiles = useMemo(() => galleryTiles(tally), [tally]);
  const got = earnedKinds(tally);
  const total = tiles.length;
  const tile = id ? tiles.find((t) => t.def.id === id) ?? null : null;
  const closeRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const lastId = useRef("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (id) showRibbonGrid();
      else closeRibbonGallery();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [id]);

  useEffect(() => {
    if (id) {
      lastId.current = id;
      closeRef.current?.focus({ preventScroll: true });
      return;
    }
    // Back from a detail: keep the tile that was open in view.
    const back = lastId.current;
    if (!back) return;
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-rib="${back}"]`);
    el?.scrollIntoView({ block: "nearest" });
    el?.focus({ preventScroll: true });
  }, [id]);

  return (
    <div className="rg-back" role="presentation" onClick={closeRibbonGallery}>
      <div className="rg-card" role="dialog" aria-modal="true" aria-labelledby="rg-title" onClick={(e) => e.stopPropagation()}>
        <header className="rg-head">
          <h2 id="rg-title">RIBBONY</h2>
          <span className="rg-count">
            Získané: <b>{got}</b> / {total}
          </span>
          <button ref={closeRef} type="button" className="icon-btn rg-x" onClick={closeRibbonGallery} aria-label="Zavrieť">
            ×
          </button>
        </header>
        <div className="rg-grid" ref={gridRef} aria-hidden={tile ? true : undefined}>
          {tiles.map((t) => (
            <button
              key={t.def.id}
              type="button"
              data-rib={t.def.id}
              className={`rg-tile is-${t.def.tier}${t.earned ? "" : " is-locked"}`}
              onClick={() => openRibbonGallery(t.def.id)}
              aria-label={t.earned ? `${t.def.name}, získané ${t.n}×` : "Nezískaný ribbon"}
            >
              <span className="rg-art">
                <RibbonBadge id={t.def.id} size={48} locked={!t.earned} />
              </span>
              <span className="rg-name">{t.earned ? t.def.name : "???"}</span>
              {t.earned ? <span className="rg-n">×{t.n}</span> : null}
            </button>
          ))}
        </div>
        <p className="rg-note">Počty sú z tohto telefónu. Každý ribbon sa dá získať raz za deň.</p>
        {tile ? (
          <section className={`rg-detail is-${tile.def.tier}${tile.earned ? "" : " is-locked"}`} aria-label="Detail ribbonu">
            <button type="button" className="rg-backbtn" onClick={showRibbonGrid}>
              ← Všetky ribbony
            </button>
            <div className="rg-detail-body">
              <div className="rg-big">
                <RibbonBadge id={tile.def.id} size={144} big locked={!tile.earned} />
              </div>
              <div className="rg-copy">
                {tile.earned ? <em className="rg-tier">{TIER_LABEL[tile.def.tier]}</em> : null}
                <strong className="rg-title">{tile.earned ? tile.def.name : "???"}</strong>
                {tile.earned ? (
                  <p className="rg-line">{tile.def.line}</p>
                ) : (
                  <p className="rg-line is-hidden">??? Hláška sa ukáže, keď tento ribbon získaš.</p>
                )}
                <dl className="rg-stats">
                  <div>
                    <dt>Získané</dt>
                    <dd>{tile.n}×</dd>
                  </div>
                  {tile.earned && lastText(tile.last) ? (
                    <div>
                      <dt>Naposledy</dt>
                      <dd>{lastText(tile.last)}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

