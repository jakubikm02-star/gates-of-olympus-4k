import { useRef, type PointerEvent } from "react";
import { Volume2, VolumeX, Info, RefreshCw, Menu } from "lucide-react";
import { START_BALANCE, BETS } from "@/lib/slot/symbols";
import { formatMoney } from "@/lib/slot/format";
import { isTierHot, TIER_BY_ID } from "@/lib/slot/jackpot";
import { jobClock, jobLeft } from "@/lib/slot/spend";
import { useSlotGame } from "@/hooks/use-slot-game";
import { SlotGrid } from "./Grid";
import { Paytable } from "./Paytable";
import { PickBonus } from "./PickBonus";
import { CountUp } from "./CountUp";
import { RankBadge } from "./RankBadge";
import { RankPanel } from "./RankPanel";
import { RankToast } from "./RankToast";
import { SpendSheet } from "./SpendSheet";

const AUTO_OPTS = [10, 25, 50, 100] as const;

const BANNER_COPY: Record<string, string> = {
  max: "MAX WIN 5000×",
  epic: "SUPER MEGA WIN",
  mega: "MEGA WIN",
  big: "BIG WIN",
  fs: "GRATULUJEME · 15 VOLNÝCH TOČENÍ",
  fsTotal: "SIEŤ SPADLA",
  pool: "JACKPOT",
  win: "WIN",
};

type Game = ReturnType<typeof useSlotGame>;

function HoldSpin({
  g,
  spinning,
  className,
  label,
}: {
  g: Game;
  spinning: boolean;
  className: string;
  label?: string;
}) {
  const timer = useRef(0);
  const held = useRef(false);

  const down = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (!g.started || g.inFs || g.buyAsk) return;
    if (g.busy) {
      return;
    }
    held.current = false;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      held.current = true;
      g.setTurbo(true);
      void g.spin();
    }, 420);
  };

  const up = () => {
    window.clearTimeout(timer.current);
    timer.current = 0;
    if (!g.started || g.inFs || g.buyAsk) return;
    if (held.current) return;
    if (g.busy) return;
    void g.spin();
  };

  return (
    <button
      type="button"
      className={className}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      disabled={!g.started || g.inFs || g.busy || g.buyAsk}
      aria-label={label ?? "Točiť"}
    >
      <RefreshCw size={34} strokeWidth={2.6} />
    </button>
  );
}

export function SlotGame() {
  const g = useSlotGame();
  const spinning = g.phase === "spinning" || g.phase === "landing";
  const resolving =
    spinning ||
    g.phase === "eval" ||
    g.phase === "win" ||
    g.phase === "pop" ||
    g.phase === "tumble" ||
    g.phase === "mult" ||
    g.phase === "big" ||
    g.phase === "max" ||
    Boolean(g.banner) ||
    Boolean(g.jpHit) ||
    g.ticketLock;
  const winLine =
    g.inFs
      ? "PARKNET LIVE"
      : spinning && g.displayWin <= 0 && !g.payHint
        ? g.message === "TOČÍ SA..."
          ? "TOČÍ SA..."
          : "GOOD LUCK!"
        : g.displayWin > 0 || g.payHint
          ? null
          : "";

  return (
    <div
      className={`stage ${g.started ? "is-on" : "is-boot"} ${g.inFs ? "in-fs" : ""} ${g.throwBolt ? "is-bolt" : ""} ${g.shake ? "is-shake" : ""} ${g.anticipate ? "is-anti" : ""} ${resolving ? "is-resolving" : ""} ${g.ticketLock || g.jpHit ? "is-ticket" : ""} ${g.winTier ? `win-tier-${g.winTier}` : ""}`}
    >
      <div className="stage-bg" />
      <div className="stage-glow" />
      <div className="park-lines" aria-hidden="true" />

      {!g.started && (
        <div className="boot">
          <img src="/art/ramp.png" alt="" className="boot-ramp" />
          <div className="boot-card">
            <div className="logo-plate">
              <span className="logo-kicker">PORTS of</span>
              <span className="logo-main">PARKIZMUS</span>
              <span className="logo-sub">ZÓNA · LÍSTOK · RAMPA · POKUTA</span>
            </div>
            <p className="boot-max">WIN UP TO 5000× BET</p>
            <p className="boot-copy">
              6×5 pole v nočnej garáži. Rampa púšťa násobiče, platené parkovné, pokuta za mŕtvy spin.
              Kredit, pity a liga sa ukladajú v tomto prehliadači.
            </p>
            <div className="boot-rank">
              <span className="boot-rank-kicker">LIGA 4KY</span>
              <RankBadge stand={g.rank} streak={g.winStreak} parts={g.rankParts} perkTitle={g.perk.title} onOpen={() => g.setRankOpen(true)} />
            </div>
            <button type="button" className="cta" onClick={g.start}>
              HRAŤ
            </button>
          </div>
        </div>
      )}

      <div className="table">
        <div className="table-head">
          <RankBadge
            stand={g.rank}
            delta={g.rankDelta}
            streak={g.winStreak}
            parts={g.rankParts}
            perkTitle={g.perk.title}
            flash={g.rankFlash}
            tick={g.rankTick}
            onOpen={() => g.setRankOpen(true)}
          />
          <div className="head-center">
            <div className="logo-plate compact">
              <span className="logo-kicker">{g.inFs ? "PARKNET" : "PORTS of"}</span>
              <span className="logo-main">{g.inFs ? "LIVE" : "PARKIZMUS"}</span>
              <span className="logo-sub">{g.inFs ? "SIGNÁL · 4tv · SIEŤ" : "ZÓNA · LÍSTOK · RAMPA · POKUTA"}</span>
            </div>
            <p className="ls-max">WIN UP TO 5000× BET</p>
          </div>
          <div className="head-end">
            <div
              className={`jp-stack ${g.jpHit ? "is-hit" : ""} ${g.poolEligible ? "is-live" : "is-feed"}`}
              aria-label="Park jackpoty"
            >
              {(["stat", "kraj", "okres", "ulica"] as const).map((id) => {
                const t = g.pots[id];
                const def = TIER_BY_ID[id];
                return (
                  <div
                    key={id}
                    className={`jp-row ${id} ${isTierHot(def, t.pool) ? "is-hot" : ""} ${g.jpHit?.id === id ? "is-win" : ""}`}
                  >
                    <span>{def.name}</span>
                    <b>
                      <CountUp value={t.pool} meter />
                    </b>
                  </div>
                );
              })}
              <em>
                {g.jpHit
                  ? `${g.jpHit.name} · ${formatMoney(g.jpHit.payout)}`
                  : g.poolEligible
                    ? "LÍSTOK · 4 POTY"
                    : "LEN 100+ BET"}
              </em>
            </div>
            </div>
          </div>

        <div className="arena">
          <aside className="side-left">
            <button
              type="button"
              className="parchment buy"
              onClick={() => void g.buyBonus()}
              disabled={!g.canBuy}
            >
              <em>KÚPIŤ PARKNET</em>
              <strong>{formatMoney(g.bet * g.buyX)}</strong>
            </button>
            <button
              type="button"
              className={`parchment ante ${g.ante ? "on" : ""}`}
              onClick={() => g.setAnte(!g.ante)}
              disabled={g.busy}
            >
              <em>ANTE BET</em>
              <strong>{g.perk.anteMul.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}×</strong>
              {g.ante ? <span className="ante-pool">4tv ×2</span> : null}
              <span className={`ante-switch ${g.ante ? "on" : ""}`}>{g.ante ? "ON" : "OFF"}</span>
            </button>
            <ol className="win-log" aria-label="História výhier">
              {(() => {
                const rows = g.spinTape.length
                  ? g.spinTape
                  : g.winLog.slice(-5).map((row) => ({ label: `${row.count}×`, amount: row.amount }));
                if (!rows.length) {
                  return (
                    <li>
                      <span>ČAKÁM LÍSTOK</span>
                    </li>
                  );
                }
                return rows.map((row, i) => (
                  <li key={`${row.amount}-${i}`}>
                    <span>
                      {row.label} <b>{row.amount}</b>
                    </span>
                  </li>
                ));
              })()}
            </ol>
          </aside>

          <section className="board-wrap">
            <div className="board-stage">
            <div className="board-stage-inner">
            <div className="board-meter">
              {g.inFs ? (
                <div className="fs-hero" aria-live="polite">
                  <div className={`wing-mult ${g.flies.length ? "is-feed" : ""}`}>
                    <span>SIGNÁL</span>
                    <b>{g.globalMult || 0}×</b>
                  </div>
                  <div className="fs-left">
                    PARKNET
                    <strong>
                      {g.fsLeft}/{g.fsTotal || 15}
                    </strong>
                  </div>
                </div>
              ) : (
                <div className={`pity-bar ${g.pityDelta ? "is-feed" : ""} ${g.pity >= g.pityGoal ? "is-hot" : ""}`}>
                  <span className="pity-kicker">KONTROLA</span>
                  <span className="pity-stake">{formatMoney(g.bet)}</span>
                  <span className="pity-name">PITY</span>
                  <div
                    className="pity-track"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={g.pityGoal}
                    aria-valuenow={Math.min(g.pityGoal, g.pity)}
                    aria-label={`Pity meter kontroly pre stávku ${formatMoney(g.bet)}`}
                  >
                    <i style={{ ["--pity" as string]: `${Math.min(100, (g.pity / g.pityGoal) * 100)}%` }} />
                  </div>
                  <b>
                    {Math.min(g.pityGoal, g.pity)}/{g.pityGoal}
                  </b>
                  {g.pityDelta > 0 && <em className="pity-plus">+{g.pityDelta}</em>}
                </div>
              )}
            </div>
            <div className="top-ticker">
              {g.spinWin > 0 ? (
                <>
                  TUMBLE
                  <strong>
                    <CountUp value={g.seqMult > 1 && g.baseWin > 0 ? g.baseWin : g.spinWin} />
                    {g.seqMult > 1 ? <em className="ticker-x"> ×{g.seqMult}</em> : null}
                  </strong>
                </>
              ) : (
                g.topLine
              )}
            </div>
            <div className="reel-host">
            <SlotGrid
              grid={g.grid}
              holdGrid={g.holdGrid}
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
              fast={g.reelFast}
              spinPace={g.spinPace ?? undefined}
              spinStrips={g.spinStrips}
              ticketLock={g.ticketLock}
            />
            {g.flies.map((f) => (
              <span
                key={f.key}
                className="fly-orb"
                style={{ left: `${((f.c + 0.5) / 6) * 100}%`, top: `${((f.r + 0.5) / 5) * 100}%` }}
              >
                <img src="/symbols/can.png" alt="" />
                {f.mult}X
              </span>
            ))}
            </div>
            <div className="board-job">
              {g.job && !g.inFs && (
                <div className={`job-chip ${g.jobToast ? "is-hot" : ""} ${jobLeft(g.job) <= 5 ? "is-late" : ""}`}>
                  <span>{g.job.title}</span>
                  <b>
                    {g.job.have}/{g.job.need}
                  </b>
                  <em>
                    {jobClock(g.job)}
                    {g.job.lockBet ? ` · ${formatMoney(g.job.lockBet)}` : ""}
                  </em>
                </div>
              )}
            </div>
            </div>
            </div>
          </section>

          <aside className="ramp-col" aria-hidden="false">
            <span className={`led-sign ${g.inFs || g.seqMult > 1 || g.flies.length ? "is-multi" : ""}`}>
              {g.inFs || g.seqMult > 1 || g.flies.length ? (
                <>
                  SIGNÁL <b>{Math.max(0, g.globalMult || (g.inFs ? 0 : g.seqMult))}×</b>
                </>
              ) : (
                <>
                  POOL <b>{formatMoney(g.pots.stat.pool)}</b>
                </>
              )}
            </span>
            <img
              src="/art/ramp.png"
              alt=""
              className={`ramp ${g.throwBolt ? "throw" : ""} ${g.anticipate ? "anti" : ""}`}
            />
            {g.throwBolt && <span className="bolt" />}
            <div className="ls-spin">
              <HoldSpin g={g} spinning={spinning} className={`spin-btn ls-hold ${g.busy ? "is-busy" : ""} ${g.turbo ? "is-turbo" : ""}`} label={g.turbo ? "Turbo točenie" : "Točiť · drž pre turbo"} />
              <span>{g.turbo ? "TURBO" : "DRŽ PRE TURBO"}</span>
            </div>
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
                KREDIT <b><CountUp value={g.balance} meter /></b>
              </p>
              <p>
                STÁVKA <b>{formatMoney(g.stake)}</b>
                {g.job ? <em className="bet-lock"> ZÁKAZKA</em> : null}
              </p>
            </div>
          </div>

          <div className="win-stack">
            <p className={`win-line ${g.displayWin > 0 ? "has-win" : ""}`}>
              {g.displayWin > 0 ? (
                <>
                  VÝHRA <CountUp value={g.displayWin} />
                </>
              ) : g.payHint ? (
                "VÝHRA"
              ) : (
                winLine
              )}
            </p>
            {g.payHint && (
              <p className="pay-hint">
                <img src={g.payHint.src} alt="" />
                {g.payHint.count}× {g.payHint.name} = {g.payHint.amount}
              </p>
            )}
          </div>

          <div className="hud-right">
            <button
              type="button"
              className="round-btn"
              onClick={() => g.changeBet(-1)}
              disabled={g.busy || Boolean(g.job) || g.betIndex <= 0}
              aria-label={g.job ? "Stávka zamknutá do konca zákazky" : "Znížiť stávku"}
            >
              −
            </button>
            <button
              type="button"
              className={`spin-btn hud-spin ${g.busy ? "is-busy" : ""} ${g.turbo ? "is-turbo" : ""}`}
              onClick={() => void g.spin()}
              disabled={!g.started || g.inFs || g.busy || g.buyAsk}
              aria-label="Točiť"
            >
              <RefreshCw size={34} strokeWidth={2.6} />
            </button>
            <button
              type="button"
              className="round-btn"
              onClick={() => g.changeBet(1)}
              disabled={g.busy || Boolean(g.job) || g.betIndex >= BETS.length - 1}
              aria-label={g.job ? "Stávka zamknutá do konca zákazky" : "Zvýšiť stávku"}
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
                  <p className="auto-hint">stop: FS · 20× · 50% kredit. Po FS sa nespúšťa.</p>
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
          {g.surplus && !g.inFs && (
            <button type="button" className="chip-btn gold" onClick={g.openSpend} disabled={g.busy}>
              ZÁKAZKY
            </button>
          )}
          {g.autoReason && !g.autoOn && <span className="auto-stop">{g.autoReason}</span>}
          {g.balance < g.stake && (
            <button type="button" className="chip-btn gold" onClick={g.refill}>
              BANKROT +{START_BALANCE}
              {g.reloadHit ? ` · ${g.reloadHit} RP` : ""}
            </button>
          )}
        </div>
      </div>

      {g.pickOpen && (
        <PickBonus
          tiles={g.pickTiles}
          revealed={g.pickRevealed}
          ended={g.pickEnded}
          totalX={g.pickTotalX}
          bet={g.bet}
          killId={g.pickKillId}
          picks={g.pickPicks}
          onPick={g.revealPick}
          onDone={g.finishPick}
        />
      )}

      {g.buyAsk && (
        <div className="buy-ask" role="dialog" aria-label="Kúpiť free spins">
          <p>KÚPIŤ PARKNET LIVE</p>
          <strong>{formatMoney(g.bet * g.buyX)}</strong>
          <div className="buy-ask-btns">
            <button type="button" className="buy-x" onClick={g.cancelBuy} aria-label="Zrušiť">
              ✕
            </button>
            <button type="button" className="buy-ok" onClick={() => void g.confirmBuy()} aria-label="Potvrdiť">
              ✓
            </button>
          </div>
        </div>
      )}

      {g.banner && (
        <div className="banner" onClick={g.closeBanner} role="presentation">
          <div className={`banner-card ${g.banner}`} role="dialog" aria-label="Výhra">
            <header className="wb-title">
              <span className="wb-ico" aria-hidden="true" />
              <span className="wb-title-text">WinBox — New Terminal [admin@parkizmus]</span>
              <span className="wb-winbtns" aria-hidden="true">
                <i className="wb-min" />
                <i className="wb-max" />
                <i className="wb-x" />
              </span>
            </header>
            <nav className="wb-menu" aria-hidden="true">
              <span>File</span>
              <span>New Terminal</span>
              <span>IP</span>
              <span>System</span>
              <span>Help</span>
            </nav>
            <div className="wb-term">
              <p className="wb-line dim">
                [admin@parkizmus] {'>'}{" "}
                {g.banner === "fsTotal"
                  ? "/log print fs-summary"
                  : g.banner === "pool"
                    ? "/log print jackpot"
                    : "/system script run win.rsc"}
              </p>
              {g.banner !== "fsTotal" && <p className="wb-line dim">  status: running…</p>}
              <p className="wb-kicker">{BANNER_COPY[g.banner] ?? "WIN"}</p>
              {g.banner === "fs" ? (
                <p className="wb-amt">free-spins: 15</p>
              ) : g.banner === "fsTotal" ? (
                <table className="wb-table">
                  <tbody>
                    <tr>
                      <td>free-spins</td>
                      <td>{g.bannerMeta?.spins ?? 15}</td>
                    </tr>
                    <tr>
                      <td>retrigger</td>
                      <td>+{g.bannerMeta?.extra ?? 0}</td>
                    </tr>
                    <tr>
                      <td>peak-mult</td>
                      <td>{g.bannerMeta?.peakMult ?? 0}X</td>
                    </tr>
                    {g.bannerMeta?.terminated && (
                      <tr className="err">
                        <td>status</td>
                        <td>FEATURE TERMINATED</td>
                      </tr>
                    )}
                    <tr className="total">
                      <td>TOTAL WIN</td>
                      <td>
                        <CountUp value={g.bannerAmount} />
                      </td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <p className="wb-amt">
                  credit-out: <CountUp value={g.bannerAmount} />
                </p>
              )}
              {g.banner === "max" && <p className="wb-err">status: FEATURE TERMINATED</p>}
              {g.banner !== "max" && g.banner !== "fs" && g.banner !== "fsTotal" && (
                <p className="wb-line dim">status: ok</p>
              )}
              <p className="wb-line">
                [admin@parkizmus] {'>'} <span className="wb-hint">ťukni sem — okno ostane kým neklikneš</span>
                <span className="wb-caret" aria-hidden="true" />
              </p>
            </div>
            <footer className="wb-status">
              <span>connected</span>
              <span>192.168.88.1</span>
              <span>ether1</span>
              <span>8291</span>
            </footer>
          </div>
        </div>
      )}

      <Paytable open={g.paytableOpen} onClose={() => g.setPaytableOpen(false)} bet={g.bet} />
      <SpendSheet
        open={g.spendOpen}
        onClose={() => g.setSpendOpen(false)}
        credit={g.balance}
        job={g.job}
        offer={g.jobOffer}
        onJob={g.takeJob}
      />
      {g.jpHit && (
        <div className="ticket-banner" aria-live="assertive">
          <strong>
            {g.jpHit.name} · {formatMoney(g.jpHit.payout)}
          </strong>
        </div>
      )}
      {g.jobToast && !g.jpHit && (
        <div className="job-toast" aria-live="polite">
          {g.jobToast}
        </div>
      )}
      <RankPanel
        open={g.rankOpen}
        onClose={() => g.setRankOpen(false)}
        stand={g.rank}
        peak={g.rankPeak}
        shield={g.rankShield}
        streak={g.winStreak}
        weekDue={g.weekDue}
        weekTarget={g.weekTarget}
      />
      <RankToast flash={g.rankFlash} onDone={g.clearRankFlash} />
    </div>
  );
}
