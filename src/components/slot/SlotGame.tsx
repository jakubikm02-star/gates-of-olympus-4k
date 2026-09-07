import { Volume2, VolumeX, Info, RefreshCw, Menu } from "lucide-react";
import { BUY_COST_X, START_BALANCE, BETS } from "@/lib/slot/symbols";
import { formatMoney } from "@/lib/slot/format";
import { useSlotGame } from "@/hooks/use-slot-game";
import { SlotGrid } from "./Grid";
import { Paytable } from "./Paytable";

const AUTO_OPTS = [10, 25, 50, 100] as const;

export function SlotGame() {
  const g = useSlotGame();
  const winLine =
    g.displayWin > 0
      ? `WIN ${formatMoney(g.displayWin)}`
      : g.busy
        ? g.message
        : "Klikni TOČIŤ — 8+ kdekoľvek vyhráva";

  return (
    <div className={`stage ${g.inFs ? "in-fs" : ""} ${g.throwBolt ? "is-bolt" : ""} ${g.shake ? "is-shake" : ""}`}>
      <div className="stage-bg" />
      <div className="stage-glow" />

      {!g.started && (
        <div className="boot">
          <img src="/art/zeus.png" alt="" className="boot-zeus" />
          <div className="boot-card">
            <div className="logo-plate">
              <span className="logo-kicker">GATES of</span>
              <span className="logo-main">OLYMPUS</span>
              <span className="logo-sub">4K 5G ULTRA MAX PRO</span>
            </div>
            <p className="boot-max">WIN UP TO 5000× BET</p>
            <p className="boot-copy">
              6×5 pole, tumble, násobiče a voľné točenia. Demo v prehliadači — žiadne vklady.
            </p>
            <button type="button" className="cta" onClick={g.start}>
              HRAŤ
            </button>
          </div>
        </div>
      )}

      <div className="table">
        <div className="logo-plate compact">
          <span className="logo-kicker">GATES of</span>
          <span className="logo-main">OLYMPUS</span>
          <span className="logo-sub">4K 5G ULTRA MAX PRO</span>
        </div>

        <div className="arena">
          <aside className="side-left">
            <button
              type="button"
              className="parchment buy"
              onClick={() => void g.buyBonus()}
              disabled={!g.canBuy}
            >
              <em>KÚPIŤ FREE SPINS</em>
              <strong>{formatMoney(g.bet * BUY_COST_X)}</strong>
            </button>
            <button
              type="button"
              className={`parchment ante ${g.ante ? "on" : ""}`}
              onClick={() => g.setAnte(!g.ante)}
              disabled={g.busy}
            >
              <em>ANTE BET</em>
              <strong>1.25×</strong>
              <span className={`ante-switch ${g.ante ? "on" : ""}`}>
                {g.ante ? "ON" : "OFF"}
              </span>
            </button>
            {g.inFs && (
              <div className="fs-meter">
                <div className="wing-mult">
                  <span>TOTAL MULTIPLIER</span>
                  <b>{g.globalMult || g.seqMult || 0}X</b>
                </div>
                <div className="fs-left">
                  FREE SPINS LEFT
                  <strong>{g.fsLeft}</strong>
                </div>
              </div>
            )}
          </aside>

          <section className="board-wrap">
            {g.spinWin > 0 && (
              <div className="tumble-win">
                TUMBLE WIN
                <strong>{formatMoney(g.spinWin)}</strong>
              </div>
            )}
            <SlotGrid
              grid={g.grid}
              winMask={g.winMask}
              spinning={g.phase === "spinning"}
              landing={g.phase === "landing"}
              popping={g.phase === "pop"}
              reduced={false}
            />
          </section>

          <aside className="zeus-col" aria-hidden="true">
            <img src="/art/zeus.png" alt="" className={`zeus ${g.throwBolt ? "throw" : ""}`} />
            {g.throwBolt && <span className="bolt" />}
          </aside>
        </div>

        <footer className="bottom-hud">
          <div className="hud-left">
            <button
              type="button"
              className="icon-btn"
              onClick={() => g.setPaytableOpen(true)}
              aria-label="Tabuľka"
            >
              <Info size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={g.toggleMute}
              aria-label={g.muted ? "Zapnúť zvuk" : "Stlmiť"}
            >
              {g.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <div className="credit-stack">
              <p>
                CREDIT <b>{formatMoney(g.balance)}</b>
              </p>
              <p>
                BET <b>{formatMoney(g.stake)}</b>
              </p>
            </div>
          </div>

          <p className={`win-line ${g.displayWin > 0 ? "has-win" : ""}`}>{winLine}</p>

          <div className="hud-right">
            <button
              type="button"
              className="round-btn"
              onClick={() => g.changeBet(-1)}
              disabled={g.busy || g.betIndex <= 0}
              aria-label="Znížiť stávku"
            >
              −
            </button>
            <button
              type="button"
              className={`spin-btn ${g.busy ? "is-busy" : ""}`}
              onClick={() => void g.spin()}
              disabled={!g.started || g.busy || g.inFs}
              aria-label="Točiť"
            >
              <RefreshCw size={34} strokeWidth={2.6} />
            </button>
            <button
              type="button"
              className="round-btn"
              onClick={() => g.changeBet(1)}
              disabled={g.busy || g.betIndex >= BETS.length - 1}
              aria-label="Zvýšiť stávku"
            >
              +
            </button>
            {g.autoOn ? (
              <button type="button" className="auto-pill on" onClick={g.stopAuto}>
                STOP {g.autoLeft}
              </button>
            ) : (
              <details className="auto-menu">
                <summary>
                  <Menu size={12} /> AUTO
                </summary>
                <div>
                  {AUTO_OPTS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={g.busy || !g.started}
                      onClick={() => g.startAuto(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </details>
            )}
          </div>
        </footer>

        <div className="extra-row">
          <button
            type="button"
            className={`chip-btn ${g.turbo ? "on" : ""}`}
            onClick={() => g.setTurbo(!g.turbo)}
          >
            TURBO
          </button>
          {g.balance < g.stake && (
            <button type="button" className="chip-btn gold" onClick={g.refill}>
              +{START_BALANCE} kredit
            </button>
          )}
        </div>
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
