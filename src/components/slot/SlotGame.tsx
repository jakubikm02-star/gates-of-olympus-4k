import { Volume2, VolumeX, Info, RefreshCw, Menu } from "lucide-react";
import { BUY_COST_X, START_BALANCE, BETS } from "@/lib/slot/symbols";
import { formatMoney } from "@/lib/slot/format";
import { useSlotGame } from "@/hooks/use-slot-game";
import { SlotGrid } from "./Grid";
import { Paytable } from "./Paytable";
import { CountUp } from "./CountUp";

const AUTO_OPTS = [10, 25, 50, 100] as const;

const BANNER_COPY: Record<string, string> = {
  max: "MAX WIN 5000×",
  epic: "MEGA!",
  mega: "SUPER!",
  big: "NICE!",
  fs: "GRATULUJEME!",
  win: "WIN",
};

export function SlotGame() {
  const g = useSlotGame();
  const spinning = g.phase === "spinning" || g.phase === "landing";
  const winLinePrefix =
    g.displayWin > 0
      ? "VÝHRA "
      : spinning
        ? "ŤUKNI A ZASTAV VALCE!"
        : g.busy
          ? g.message || "GOOD LUCK!"
          : "GOOD LUCK!";

  return (
    <div
      className={`stage ${g.inFs ? "in-fs" : ""} ${g.throwBolt ? "is-bolt" : ""} ${g.shake ? "is-shake" : ""} ${g.anticipate ? "is-anti" : ""}`}
    >
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
              <span className={`ante-switch ${g.ante ? "on" : ""}`}>{g.ante ? "ON" : "OFF"}</span>
            </button>
            <ol className="win-log" aria-label="História výhier">
              {(g.spinTape.length ? g.spinTape : g.winLog.slice(-5).map((row) => ({ label: `${row.count}×`, amount: row.amount }))).map((row, i) => (
                <li key={`${row.amount}-${i}`}>
                  <span>
                    {row.label} <b>{row.amount}</b>
                  </span>
                </li>
              ))}
            </ol>
          </aside>

          <section className="board-wrap">
            {g.inFs && (
              <div className="fs-hero" aria-live="polite">
                <div className={`wing-mult ${g.flies.length ? "is-feed" : ""}`}>
                  <span>TOTAL MULTIPLIER</span>
                  <b>{g.globalMult || 0}X</b>
                </div>
                <div className="fs-left">
                  FREE SPINS LEFT
                  <strong>{g.fsLeft}</strong>
                </div>
              </div>
            )}
            <div className="top-ticker">
              {g.spinWin > 0 ? (
                <>
                  VÝHRA Z FUNKCIE TUMBLE
                  <strong>
                    <CountUp value={g.spinWin} />
                    {g.seqMult > 1 ? ` ×${g.seqMult}` : ""}
                  </strong>
                </>
              ) : (
                g.topLine
              )}
            </div>
            <div className="board-stage">
            <SlotGrid
              grid={g.grid}
              winMask={g.winMask}
              spinning={g.phase === "spinning"}
              landing={g.phase === "landing"}
              popping={g.phase === "pop"}
              stoppedCols={g.stoppedCols}
              anticipate={g.anticipate}
              activatingMult={g.activatingMult}
              struckUids={g.struckUids}
              strike={g.strike}
              expiredUids={g.expiredUids}
              clusterPay={g.clusterPay}
              reduced={false}
              onTap={spinning ? g.stopReels : undefined}
            />
            {g.flies.map((f) => (
              <span
                key={f.key}
                className="fly-orb"
                style={{ left: `${((f.c + 0.5) / 6) * 100}%`, top: `${((f.r + 0.5) / 5) * 100}%` }}
              >
                {f.mult}X
              </span>
            ))}
            </div>
          </section>

          <aside className="zeus-col" aria-hidden="true">
            <img
              src="/art/zeus.png"
              alt=""
              className={`zeus ${g.throwBolt ? "throw" : ""} ${g.anticipate ? "anti" : ""}`}
            />
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
                KREDIT <b>{formatMoney(g.balance)}</b>
              </p>
              <p>
                STÁVKA <b>{formatMoney(g.stake)}</b>
              </p>
            </div>
          </div>

          <div className="win-stack">
            <p className={`win-line ${g.displayWin > 0 ? "has-win" : ""}`}>
              {g.displayWin > 0 ? (
                <>
                  VÝHRA <CountUp value={g.displayWin} />
                </>
              ) : (
                winLinePrefix
              )}
            </p>
            {g.payHint && (
              <p className="pay-hint">
                <img src={g.payHint.src} alt="" />
                {g.payHint.count}× VYPLÁCA {g.payHint.amount}
              </p>
            )}
          </div>

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
              className={`spin-btn ${g.busy ? "is-busy" : ""} ${spinning ? "is-stop" : ""}`}
              onClick={() => void g.spin()}
              disabled={!g.started || g.inFs || (g.busy && !spinning)}
              aria-label={spinning ? "Zastaviť valce" : "Točiť"}
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
                  <p className="auto-hint">stop: FS · 20× · 50% kredit</p>
                </div>
              </details>
            )}
          </div>
        </footer>

        <div className="extra-row">
          <button
            type="button"
            className={`chip-btn ${g.quick ? "on" : ""}`}
            onClick={() => {
              g.setQuick(!g.quick);
              if (!g.quick) g.setTurbo(false);
            }}
          >
            QUICK
          </button>
          <button
            type="button"
            className={`chip-btn ${g.turbo ? "on" : ""}`}
            onClick={() => {
              g.setTurbo(!g.turbo);
              if (!g.turbo) g.setQuick(false);
            }}
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
            <span className="banner-wings" aria-hidden="true" />
            <span className="banner-kicker">{BANNER_COPY[g.banner] ?? "WIN"}</span>
            {g.banner === "fs" ? (
              <strong>15 FREE SPINS</strong>
            ) : (
              <strong>
                <CountUp value={g.bannerAmount} />
              </strong>
            )}
            {g.banner === "max" && <em>FEATURE TERMINATED</em>}
            <em>ťukni pre pokračovanie</em>
          </div>
        </div>
      )}

      <Paytable open={g.paytableOpen} onClose={() => g.setPaytableOpen(false)} bet={g.bet} />
    </div>
  );
}
