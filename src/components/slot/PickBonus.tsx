import { useState } from "react";
import { Clock, Receipt, ChevronLeft, CircleCheck, MapPin, Search, Ticket, User, Info } from "lucide-react";
import type { PickTile } from "@/lib/slot/pick-bonus";

const PIN_POS: { x: number; y: number }[] = [
  { x: 18, y: 20 },
  { x: 50, y: 12 },
  { x: 82, y: 24 },
  { x: 22, y: 44 },
  { x: 54, y: 50 },
  { x: 84, y: 40 },
  { x: 16, y: 70 },
  { x: 48, y: 76 },
  { x: 80, y: 64 },
  { x: 28, y: 96 },
  { x: 60, y: 92 },
  { x: 88, y: 86 },
];

function eur(n: number): string {
  return `${n.toFixed(2).replace(".", ",")}€`;
}

interface Props {
  tiles: PickTile[];
  revealed: boolean[];
  ended: boolean;
  totalX: number;
  bet: number;
  killId: number | null;
  picks: number;
  onPick: (id: number) => void;
  onDone: () => void;
}

export function PickBonus({ tiles, revealed, ended, totalX, bet, killId, picks, onPick, onDone }: Props) {
  const [tab, setTab] = useState<"map" | "tickets">("map");
  const cash = +(totalX * bet).toFixed(2);
  const left = tiles.filter((t) => !revealed[t.id]).length;
  const tickets = tiles.filter((t) => revealed[t.id] && t.payX > 0);

  if (ended) {
    return (
      <div className="pk-back" role="dialog" aria-label="Ukončenie parkovania">
        <div className="pk-app is-end">
          <header className="pk-nav">
            <span>Ukončenie parkovania</span>
          </header>
          <div className="pk-scroll">
            <article className="pk-receipt">
              <div className="pk-hero">
                <span className="pk-rings" aria-hidden="true" />
                <CircleCheck size={56} strokeWidth={1.5} />
              </div>
              <div className="pk-thanks">
                <h2>Ďakujeme, že s nami parkujete.</h2>
                <ul className="pk-rows">
                  <li>
                    <Clock size={20} strokeWidth={1.7} />
                    <div>
                      <span>Trvanie parkovania do</span>
                      <b>
                        {picks} státí
                        {killId !== null ? " (odťah)" : ""}
                      </b>
                    </div>
                  </li>
                  <li>
                    <Receipt size={20} strokeWidth={1.7} />
                    <div>
                      <span>Zahŕňa servisný poplatok</span>
                      <b>
                        {eur(cash)} <i className="pk-info" aria-hidden="true">i</i>
                      </b>
                    </div>
                  </li>
                </ul>
              </div>
            </article>
            {tickets.length > 0 && (
              <section className="pk-month">
                <header>
                  <b>Lístky z kontroly</b>
                  <span>{tickets.length}</span>
                </header>
                <ol className="pk-hist">
                  {tickets.map((t) => (
                    <li key={t.id}>
                      <em>{eur(+(t.payX * bet).toFixed(2))}</em>
                      <div>
                        <b>{t.zone}</b>
                        <span>
                          {t.note} · {t.title}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
          <div className="pk-actions">
            <button type="button" className="pk-outline" onClick={onDone}>
              SPÄŤ NA AUTOMAT
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pk-back" role="dialog" aria-label="Parkoviská">
      <div className="pk-app">
        {tab === "tickets" ? (
          <>
            <header className="pk-nav">
              <button type="button" className="pk-backbtn" onClick={() => setTab("map")} aria-label="Späť na mapu">
                <ChevronLeft size={22} strokeWidth={1.8} />
              </button>
              <span>História lístkov</span>
            </header>
            <div className="pk-scroll pk-hist-view">
              <p className="pk-hist-lead">Zoznam lístkov z tejto kontroly</p>
              {tickets.length === 0 ? (
                <p className="pk-empty">Zatiaľ žiadny lístok. Ťukni pin na mape.</p>
              ) : (
                <ol className="pk-hist">
                  {tickets.map((t) => (
                    <li key={t.id}>
                      <em>{eur(+(t.payX * bet).toFixed(2))}</em>
                      <div>
                        <b>{t.zone}</b>
                        <span>
                          {t.note} · AA · SLOT
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        ) : (
          <div className="pk-map">
            <img src="/art/city-map.jpg" alt="" className="pk-map-img" />
            <div className="pk-search">
              <label className="pk-search-field">
                <Search size={16} strokeWidth={2} />
                <span>Adresa, parkovisko</span>
              </label>
              <span className="pk-dur">8 hod</span>
              <span className="pk-filter" aria-hidden="true">
                <Info size={16} />
              </span>
            </div>
            <div className="pk-pins">
            {tiles.map((tile) => {
              const pos = PIN_POS[tile.id] ?? { x: 50, y: 50 };
              const open = revealed[tile.id];
              const killer = tile.id === killId;
              return (
                <button
                  key={tile.id}
                  type="button"
                  className={`pk-pin ${open ? `is-open is-${tile.kind}` : ""} ${killer ? "is-kill" : ""}`}
                  style={{ left: `${pos.x}%`, top: `${pos.y}%`, ["--i" as string]: String(tile.id) }}
                  disabled={open}
                  onClick={() => onPick(tile.id)}
                  aria-label={open ? `${tile.title} ${tile.zone}` : `Parkovisko ${tile.id + 1}`}
                >
                  <i className="pk-pin-badge">$</i>
                  {open ? (
                    tile.payX > 0 ? (
                      <b>{eur(+(tile.payX * bet).toFixed(2))}</b>
                    ) : (
                      <b>ODŤAH</b>
                    )
                  ) : (
                    <b>€</b>
                  )}
                </button>
              );
            })}
            </div>
            <div className="pk-near">
              <MapPin size={18} strokeWidth={2.2} />
              Blízke parkoviská: {Math.max(0, left)}
            </div>
          </div>
        )}
        <nav className="pk-tabs" aria-label="Navigácia">
          <button type="button" className={tab === "map" ? "is-on" : ""} onClick={() => setTab("map")}>
            <MapPin size={20} strokeWidth={2} />
            Parkoviská
          </button>
          <button type="button" className={tab === "tickets" ? "is-on" : ""} onClick={() => setTab("tickets")}>
            <Ticket size={20} strokeWidth={2} />
            Parkovacie lístky
          </button>
          <span className="pk-tab-off">
            <User size={20} strokeWidth={2} />
            Profil
          </span>
        </nav>
      </div>
    </div>
  );
}
