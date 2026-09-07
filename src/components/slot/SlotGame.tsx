import { Volume2, VolumeX, Info, Zap } from "lucide-react";
import { BUY_COST_X, START_BALANCE, BETS } from "@/lib/slot/symbols";
import { formatMoney } from "@/lib/slot/format";
import { useSlotGame } from "@/hooks/use-slot-game";
import { SlotGrid } from "./Grid";
import { Paytable } from "./Paytable";

const AUTO_OPTS = [10, 25, 50, 100] as const;

export function SlotGame() {
  const g = useSlotGame();

  return (
    <div className={`stage ${g.inFs ? "in-fs" : ""} ${g.throwBolt ? "is-bolt" : ""}`}>
      <div className="stage-bg" />
      <div className="vignette" />

      {!g.started && (
        <div className="boot">
          <div className="boot-card">
            <p className="eyebrow">Pragmatic-style remake</p>
            <h1 className="title">
              GATES OF
              <span>OLYMPUS</span>
            </h1>
            <p className="subtitle">4K 5G ULTRA MAX PRO</p>
            <p className="boot-copy">
              6×5 pole, scatter výplaty, tumble, násobiče a voľné točenia. Iba zábava v
              prehliadači — žiadne vklady, žiadne výbery.
            </p>
            <button type="button" className="cta" onClick={g.start}>
              Hrať
            </button>
          </div>
        </div>
      )}

      <div className="layout">
        <header className="topbar">
          <div className="brand">
            <span className="brand-kicker">GATES OF OLYMPUS</span>
            <span className="brand-sub">4K 5G ULTRA MAX PRO</span>
          </div>
          <div className="top-actions">
            <button
              type="button"
              className="icon-btn"
              onClick={() => g.setPaytableOpen(true)}
              aria-label="Tabuľka"
            >
              <Info size={18} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={g.toggleMute}
              aria-label={g.muted ? "Zapnúť zvuk" : "Stlmiť"}
            >
              {g.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          </div>
        </header>

        <div className="playfield">
          <aside className="zeus-col" aria-hidden="true">
            <img src="/art/zeus.png" alt="" className={`zeus ${g.throwBolt ? "throw" : ""}`} />
            {g.throwBolt && <span className="bolt" />}
          </aside>

          <section className="board-wrap">
            <div className="fs-chip" hidden={!g.inFs}>
              <Zap size={14} />
              FS {g.fsLeft}/{g.fsTotal}
              {g.globalMult > 0 && <em>Σ {g.globalMult}×</em>}
            </div>
            <SlotGrid
              grid={g.grid}
              winMask={g.winMask}
              spinning={g.phase === "spinning"}
              reduced={false}
            />
            <p className="ticker">{g.message}</p>
          </section>
        </div>

        <div className="hud">
          <div className="stat">
            <span>Zostatok</span>
            <strong>{formatMoney(g.balance)}</strong>
          </div>
          <div className="stat win">
            <span>Výhra</span>
            <strong>{formatMoney(g.displayWin)}</strong>
          </div>
          <div className="stat">
            <span>Stávka {g.ante ? "ANTE" : ""}</span>
            <strong>{formatMoney(g.stake)}</strong>
          </div>
        </div>

        <div className="controls">
          <div className="bet-wrap">
            <button
              type="button"
              className="round-btn"
              onClick={() => g.changeBet(-1)}
              disabled={g.busy || g.betIndex <= 0}
              aria-label="Znížiť stávku"
            >
              −
            </button>
            <div className="bet-readout">
              <span>STÁVKA</span>
              {formatMoney(g.bet)}
            </div>
            <button
              type="button"
              className="round-btn"
              onClick={() => g.changeBet(1)}
              disabled={g.busy || g.betIndex >= BETS.length - 1}
              aria-label="Zvýšiť stávku"
            >
              +
            </button>
          </div>

          <button
            type="button"
            className={`spin-btn ${g.busy ? "is-busy" : ""}`}
            onClick={() => void g.spin()}
            disabled={!g.started || g.busy || g.inFs}
          >
            {g.inFs ? "FS" : "TOČIŤ"}
          </button>

          <div className="side-btns">
            <button
              type="button"
              className={`chip-btn ${g.turbo ? "on" : ""}`}
              onClick={() => g.setTurbo(!g.turbo)}
            >
              Turbo
            </button>
            <button
              type="button"
              className={`chip-btn ${g.ante ? "on" : ""}`}
              onClick={() => g.setAnte(!g.ante)}
              disabled={g.busy}
            >
              Ante 1.25×
            </button>
            <button
              type="button"
              className="chip-btn gold"
              onClick={() => void g.buyBonus()}
              disabled={!g.canBuy}
            >
              Bonus {BUY_COST_X}×
            </button>
          </div>
        </div>

        <div className="auto-row">
          {g.autoOn ? (
            <button type="button" className="chip-btn on" onClick={g.stopAuto}>
              Stop auto ({g.autoLeft})
            </button>
          ) : (
            AUTO_OPTS.map((n) => (
              <button
                key={n}
                type="button"
                className="chip-btn"
                disabled={g.busy || !g.started}
                onClick={() => g.startAuto(n)}
              >
                Auto {n}
              </button>
            ))
          )}
          {g.balance < g.stake && (
            <button type="button" className="chip-btn gold" onClick={g.refill}>
              +{START_BALANCE} kredit
            </button>
          )}
        </div>

        <p className="legal">
          Demo automat pre zábavu. Najlepšia výhra v relácii {formatMoney(g.bestWin)}. Medzerník
          točí.
        </p>
      </div>

      {g.banner && (
        <div className="banner" onClick={g.closeBanner} role="presentation">
          <div className={`banner-card ${g.banner}`}>
            <span className="banner-kicker">
              {g.banner === "max"
                ? "MAX WIN"
                : g.banner === "epic"
                  ? "EPIC WIN"
                  : g.banner === "mega"
                    ? "MEGA WIN"
                    : g.banner === "big"
                      ? "BIG WIN"
                      : "WIN"}
            </span>
            <strong>{formatMoney(g.bannerAmount)}</strong>
            <em>ťukni pre pokračovanie</em>
          </div>
        </div>
      )}

      <Paytable open={g.paytableOpen} onClose={() => g.setPaytableOpen(false)} bet={g.bet} />
    </div>
  );
}
