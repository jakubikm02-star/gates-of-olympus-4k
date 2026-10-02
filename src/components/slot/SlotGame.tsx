import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { Volume2, VolumeX, Info, RefreshCw, Menu, Settings as SettingsIcon, Trophy } from "lucide-react";
import { START_BALANCE, BETS, PAY_SYMBOLS, FS_SYMBOL, canSrc, canTier } from "@/lib/slot/symbols";
import { fsSymName, fsSymSrc, type FsSymId } from "@/lib/slot/zasah";
import { FsReveal } from "./FsReveal";
import { formatMoney } from "@/lib/slot/format";
import { isTierHot, TIER_BY_ID } from "@/lib/slot/jackpot";
import { jobClock, jobMeter, jobProgress, jobShownGoal, sayCluster, type JobCard } from "@/lib/slot/spend";
import { rankPeekIds } from "@/lib/slot/pick-bonus";
import { useSlotGame } from "@/hooks/use-slot-game";
import { useShell } from "@/hooks/use-shell";
import { SlotGrid } from "./Grid";
import { CanValue } from "./Can";
import { Paytable } from "./Paytable";
import { PickBonus } from "./PickBonus";
import { CountUp } from "./CountUp";
import { RankBadge } from "./RankBadge";
import { MachineFrame } from "./MachineFrame";
import { RankPanel } from "./RankPanel";
import { RankToast } from "./RankToast";
import { SpendSheet } from "./SpendSheet";
import { BonusIcon, BonusNote, BonusPill, LegCounters, TicketGoals } from "./TicketBonus";
import { ticketBonus } from "@/lib/slot/ticket-bonus";
import { DuelSheet, DuelBar, DuelLink } from "./DuelSheet";
import { Settings } from "./Settings";
import { Leaderboard, NickAsk } from "./Leaderboard";
import { HEAT_MAX } from "@/lib/slot/heat";
import { subscribeTicketNames, ticketLabel } from "@/lib/slot/ticket-names";

const AUTO_OPTS = [10, 25, 50, 100] as const;

function boltPath(x0: number, y0: number, x1: number, y1: number): string {
  const n = 8;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  let d = `M ${x0.toFixed(1)} ${y0.toFixed(1)}`;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const amp = i === n ? 0 : (i % 2 === 0 ? 18 : -18) * (0.45 + 0.55 * (1 - t));
    const x = x0 + dx * t + px * amp;
    const y = y0 + dy * t + py * amp;
    d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

function HandBolt({ strike }: { strike: { r: number; c: number } | null }) {
  const [shot, setShot] = useState<{ d: string; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    if (!strike) {
      setShot(null);
      return;
    }
    const stage = document.querySelector(".stage");
    const pose = document.querySelector(".park-pose.on");
    const cell = document.querySelector(`.reel-window .cell[data-rc="${strike.r}-${strike.c}"]`);
    if (!stage || !pose || !cell) return;
    const sr = stage.getBoundingClientRect();
    const pr = pose.getBoundingClientRect();
    const cr = cell.getBoundingClientRect();
    const scale = Math.min(pr.width / 900, pr.height / 936);
    const drawnW = 900 * scale;
    const drawnH = 936 * scale;
    const ox = (pr.width - drawnW) / 2;
    const oy = pr.height - drawnH;
    const hx = pr.left + ox + 0.631 * drawnW;
    const hy = pr.top + oy + 0.247 * drawnH;
    setShot({
      w: sr.width,
      h: sr.height,
      d: boltPath(hx - sr.left, hy - sr.top, cr.left + cr.width / 2 - sr.left, cr.top + cr.height / 2 - sr.top),
    });
  }, [strike]);
  if (!shot) return null;
  return (
    <svg className="god-bolt" viewBox={`0 0 ${shot.w} ${shot.h}`} preserveAspectRatio="none" aria-hidden="true">
      <path className="is-glow" d={shot.d} pathLength={1} />
      <path className="is-core" d={shot.d} pathLength={1} />
    </svg>
  );
}

const BANNER_COPY: Record<string, string> = {
  max: "MAX WIN 5000×",
  epic: "SUPER MEGA WIN",
  mega: "MEGA WIN",
  big: "BIG WIN",
  fs: "4KA TV",
  fsTotal: "4KA TV SKONČILA",
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
    if (!g.started || g.buyAsk) return;
    if (g.busy || !g.canSpin) {
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
    if (!g.started || g.buyAsk) return;
    if (held.current) return;
    if (g.busy || !g.canSpin) return;
    void g.spin();
  };

  return (
    <button
      type="button"
      className={className}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      disabled={!g.canSpin}
      aria-label={label ?? "Točiť"}
    >
      <RefreshCw size={34} strokeWidth={2.6} />
    </button>
  );
}

/** Chase HUD: which symbol is Finančná správa this round. */
function FsChip({ sym, full }: { sym: FsSymId; full?: boolean }) {
  const name = fsSymName(sym);
  return (
    <span className={`chase-fs${sym === "scatter" ? " is-blocked" : ""}${full ? " is-full" : ""}`} aria-label={`Finančná správa: ${name}`} title={`FS = ${name}`}>
      <img src={fsSymSrc(sym)} alt="" />
      <i aria-hidden="true" />
      <img src={FS_SYMBOL.src} alt="" />
      {full ? <em>{sym === "scatter" ? "FS · BONUS STOP" : `FS = ${name}`}</em> : <em>FS</em>}
    </span>
  );
}

export function SlotGame() {
  const g = useSlotGame();
  const shell = useShell();
  const [reducedMotion, setReducedMotion] = useState(false);
  const [deskOpen, setDeskOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [jobOpen, setJobOpen] = useState(false);
  const [, names] = useState(0);
  useEffect(() => subscribeTicketNames(() => names((n) => n + 1)), []);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  const spinning = g.phase === "spinning" || g.phase === "landing";
  const god = g.throwBolt ? "bolt" : g.anticipate ? "anti" : spinning ? "run" : g.inFs || g.winTier || g.displayWin > 0 ? "win" : "idle";
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
      ? "4KA TV"
      : spinning && g.displayWin <= 0 && !g.payHint
        ? g.message === "TOČÍ SA..."
          ? "TOČÍ SA..."
          : "GOOD LUCK!"
        : g.displayWin > 0 || g.payHint
          ? null
          : "GOOD LUCK";
  const liveJob = g.job;
  const seal = liveJob ? null : g.ticketSeal;

  return (
    <div
      className={`stage shell-${shell} rk-${g.rank.id} ${g.rankFlash?.event === "up" ? "is-rank-up" : ""} ${g.started ? "is-on" : "is-boot"} ${g.inFs ? "in-fs" : ""} ${g.chase ? "in-chase" : ""} ${g.chase?.tension === "danger" ? "chase-danger" : ""} ${g.chase?.tension === "close" ? "chase-close" : ""} ${g.throwBolt ? "is-bolt" : ""} ${g.shake ? "is-shake" : ""} ${g.anticipate ? "is-anti" : ""} ${resolving ? "is-resolving" : ""} ${g.ticketLock || g.jpHit ? "is-ticket" : ""} ${g.duel && g.duel.phase === "play" && !g.busy && !g.canSpin ? "is-duel-wait" : ""} ${g.winTier ? `win-tier-${g.winTier}` : ""} ${g.exekucia ? "is-exekucia" : ""}`}
    >
      {g.stale ? (
        <div className="release-lock" role="alertdialog" aria-label="Nová verzia">
          <div>
            <b>NOVÁ VERZIA</b>
            <span>Táto hra už neplatí. Načítavam posledný deploy.</span>
            <button type="button" onClick={() => window.location.reload()}>
              OBNOVIŤ
            </button>
          </div>
        </div>
      ) : null}
      <div className="stage-glow" />
      <div className="park-lines" aria-hidden="true" />
      {g.strike ? <HandBolt key={`${g.strike.r}-${g.strike.c}`} strike={g.strike} /> : null}

      {!g.started && (
        <div className={`boot ${g.bootReady ? "is-ready" : ""}`}>
          <img src="/art/paas-idle.png?v=3" alt="" className="boot-ramp" />
          <div className="boot-card">
            <div className="logo-plate">
              <span className="logo-kicker">PORTS of</span>
              <span className="logo-main">PARKIZMUS</span>
              <span className="logo-sub">ZÓNA · LÍSTOK · RAMPA · POKUTA</span>
            </div>
            <p className="boot-max">
              WIN UP TO <b>5000×</b>
            </p>
            <p className="boot-copy">6×5 v nočnej garáži. Násobiče, parkovné a liga ostanú v tomto prehliadači.</p>
            <div className="boot-rank">
              <span className="boot-rank-kicker">LIGA 4KY</span>
              <RankBadge stand={g.rank} streak={g.winStreak} parts={g.rankParts} perkTitle={g.perk.title} onOpen={() => g.setRankOpen(true)} />
            </div>
            <p className="boot-pct">{g.bootReady ? "PRIPRAVENÉ" : `NAČÍTAVAM ${g.bootPct}%`}</p>
            <div className="boot-load" aria-hidden="true">
              <i style={{ width: `${g.bootReady ? 100 : g.bootPct}%` }} />
            </div>
            <button type="button" className="cta" disabled={!g.bootReady || g.booting} onClick={() => void g.start()}>
              {g.booting ? "ZVUK…" : "HRAŤ"}
            </button>
          </div>
        </div>
      )}

      <div className="table">
        <div className="table-head">
          <RankBadge stand={g.rank} perkTitle={g.perk.title} plain onOpen={() => g.setRankOpen(true)} />
          <div className="head-center">
            <div className="logo-plate compact">
              <span className="logo-kicker">{g.inFs ? "4KA" : "PORTS of"}</span>
              <span className="logo-main">{g.inFs ? "TV" : "PARKIZMUS"}</span>
            </div>
          </div>
          <div className="head-end">
            <button
              type="button"
              className={`jp-stack is-strip ${g.jpHit ? "is-hit" : ""} ${g.poolEligible ? "is-live" : "is-feed"}`}
              aria-label="Park jackpoty · dnešný desk"
              onClick={() => setDeskOpen(true)}
            >
              <span className="jp-mark">{g.inFs ? "4KA TV" : "PARKIZMUS"}</span>
              {(["stat", "kraj", "okres", "ulica"] as const).map((id) => {
                const t = g.pots[id];
                const def = TIER_BY_ID[id];
                return (
                  <div
                    key={id}
                    className={`jp-row ${id} ${isTierHot(def, t.pool) ? "is-hot" : ""} ${g.jpHit?.id === id ? "is-win" : ""}`}
                  >
                    <span>{ticketLabel(id)}</span>
                    <b>
                      <CountUp
                        value={g.jpHit?.id === id && g.jpHit.poolBefore > 0 ? g.jpHit.poolBefore : t.pool}
                        meter
                      />
                    </b>
                  </div>
                );
              })}
              {g.jpHit ? (
                <em>
                  {ticketLabel(g.jpHit.id)} · {Math.round((g.jpHit.share || 1) * 100)} % = {formatMoney(g.jpHit.payout)}
                </em>
              ) : g.poolEligible ? null : (
                <em>100+</em>
              )}
            </button>
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
              <em>KÚPIŤ 4KA TV</em>
              <strong>{formatMoney(g.bet * g.buyX)}</strong>
            </button>
            <button
              type="button"
              className={`parchment ante ${g.ante ? "on" : ""}`}
              onClick={() => g.setAnte(!g.ante)}
              disabled={!g.canAnteOff || (Boolean(g.chase) && !g.ante)}
            >
              <em>ANTE BET</em>
              <strong>{g.perk.anteMul.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}×</strong>
              {g.ante ? <span className="ante-pool">4KA TV ×2</span> : null}
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
            {g.duel && g.duel.phase === "play" ? <DuelBar duel={g.duel} onForfeit={g.foldDuel} /> : null}
            <div className="board-stage">
            <div className="board-stage-inner">
            <div className="board-meter">
              {g.inFs ? (
                <div className="fs-hero" aria-live="polite">
                  <div className={`wing-mult ${g.flies.length ? "is-feed" : ""}`}>
                    <span>Mbps</span>
                    <b>{g.globalMult || 0}×</b>
                  </div>
                  <div className="fs-left">
                    4KA TV
                    <strong>
                      {g.fsLeft}/{g.fsTotal || 15}
                    </strong>
                  </div>
                  <div className={`fs-heat ${g.chase ? "is-chase" : ""}`} aria-label={g.chase ? `Zásah ${Math.min(g.chase.total, g.chase.spin + 1)} z ${g.chase.total}` : `Hlásenie ${g.heat}`}>
                    <span>{g.chase ? "ZÁSAH" : "HLÁSENIE"}</span>
                    <i
                      style={{
                        ["--heat" as string]: `${g.chase ? Math.min(100, (g.chase.spin / g.chase.total) * 100) : Math.min(100, (g.heat / HEAT_MAX) * 100)}%`,
                      }}
                    />
                    <b>
                      {g.chase ? `SPIN ${Math.min(g.chase.total, g.chase.spin + 1)}/${g.chase.total}` : `${g.heat}/${HEAT_MAX}`}
                    </b>
                  </div>
                </div>
              ) : (
                <div className="meter-split">
                  <div className={`pity-bar ${g.pityDelta ? "is-feed" : ""} ${g.pity >= g.pityGoal ? "is-hot" : ""} ${g.pity <= 0 ? "is-quiet" : ""}`}>
                    <span className="pity-kicker">KONTROLA</span>
                    <div
                      className="pity-track"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={g.pityGoal}
                      aria-valuenow={Math.min(g.pityGoal, g.pity)}
                      aria-label="Kontrola"
                    >
                      <i style={{ ["--pity" as string]: `${Math.min(100, (g.pity / g.pityGoal) * 100)}%` }} />
                    </div>
                    <b>
                      {Math.min(g.pityGoal, g.pity)}/{g.pityGoal}
                    </b>
                  </div>
                  <div className={`heat-bar ${g.chase ? "is-chase" : ""} ${g.heat >= HEAT_MAX ? "is-hot" : ""}`}>
                    <span className="heat-kicker">{g.chase ? "ZÁSAH" : "HLÁSENIE"}</span>
                    <div className="heat-segs" aria-hidden="true">
                      <i
                        style={{
                          ["--heat" as string]: `${g.chase ? Math.min(100, (g.chase.spin / g.chase.total) * 100) : Math.min(100, (g.heat / HEAT_MAX) * 100)}%`,
                        }}
                      />
                    </div>
                    <b>{g.chase ? `SPIN ${Math.min(g.chase.total, g.chase.spin + 1)}/${g.chase.total}` : `${g.heat}/${HEAT_MAX}`}</b>
                  </div>
                </div>
              )}
            </div>
            <div className={`top-ticker ${g.chase ? "is-chase" : ""} ${g.chase || g.spinWin > 0 ? "has-win" : g.topLine && !g.topLine.startsWith("SYMBOLY PLATIA") ? "" : "is-idle"}`}>
              {g.chase ? (
                <>
                  <span className="chase-desk">
                    ZÁSAH · CIEĽ
                    <strong>{PAY_SYMBOLS.find((s) => s.id === g.chase?.target)?.name ?? "…"}</strong>
                  </span>
                  <span className="chase-mini">
                    {(() => {
                      const chase = g.chase;
                      if (!chase) return null;
                      const target = PAY_SYMBOLS.find((s) => s.id === chase.target);
                      return (
                        <>
                          {target ? <img src={target.src} alt="" /> : <strong>CIEĽ</strong>}
                          <em className="chase-goal">{target?.name ?? "CIEĽ"}</em>
                          <em>HACK {chase.hits}/4</em>
                          <span className="chase-pins">
                            {Array.from({ length: 4 }, (_, i) => (
                              <i key={`h${i}`} className={i < chase.hits ? "is-hit" : ""} />
                            ))}
                          </span>
                          <em>FS {chase.strikes}/3</em>
                          <span className="chase-pins is-fs">
                            {Array.from({ length: 3 }, (_, i) => (
                              <i key={`f${i}`} className={i < chase.strikes ? "is-fs" : ""} />
                            ))}
                          </span>
                          {chase.fsSym ? <FsChip sym={chase.fsSym} /> : null}
                          <b>
                            SPIN {Math.min(chase.total, chase.spin + 1)}/{chase.total}
                          </b>
                        </>
                      );
                    })()}
                  </span>
                </>
              ) : g.spinWin > 0 ? (
                <>
                  TUMBLE
                  <strong>
                    <CountUp value={g.seqMult > 1 && g.baseWin > 0 ? g.baseWin : g.spinWin} />
                    {g.seqMult > 1 ? <em className="ticker-x"> ×{g.seqMult}</em> : null}
                  </strong>
                </>
              ) : g.topLine && !g.topLine.startsWith("SYMBOLY PLATIA") ? (
                g.topLine
              ) : null}
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
              expiredUids={g.expiredUids}
              clusterPay={g.clusterPay}
              reduced={reducedMotion}
              fast={g.reelFast}
              turbo={g.turbo}
              quick={g.quick}
              spinPace={g.spinPace ?? undefined}
              spinStrips={g.spinStrips}
              ticketLock={g.ticketLock}
              hackWindows={g.windows}
              activeWindow={g.chase?.activeWindow}
              windowPhase={g.chase?.phase}
              chaseTarget={g.chase?.target}
              fsSym={g.chase?.fsSym ?? null}
              frame={<MachineFrame id={g.rank.id} division={g.rank.division} />}
            />
            {g.flies.map((f) => (
              <span
                key={f.key}
                className={`fly-orb can-t${canTier(f.mult)}`}
                style={{ left: `${((f.c + 0.5) / 6) * 100}%`, top: `${((f.r + 0.5) / 5) * 100}%` }}
              >
                <img src={canSrc(f.mult)} alt="" />
                <CanValue mult={f.mult} />
              </span>
            ))}
            <RankToast flash={resolving || g.inFs ? null : g.rankFlash} />
            </div>
            <div className={`board-job ${liveJob || seal ? "has-job" : ""} ${seal ? `is-seal is-${seal.verdict}` : ""}`}>
              {(liveJob || seal) && (
                <JobCardCompact
                  job={liveJob ?? seal!.job}
                  seal={seal?.verdict ?? null}
                  inFs={g.inFs}
                  onOpen={() => setJobOpen(true)}
                  ante={g.ante}
                  canBuy={g.canBuy}
                  canAnte={g.canAnteOff && !g.chase}
                  onBuy={() => void g.buyBonus()}
                  onAnte={() => g.setAnte(true)}
                />
              )}
            </div>
            </div>
            </div>
          </section>

          <aside className="ramp-col" aria-hidden="false">
            <span className={`led-sign ${g.inFs || g.seqMult > 1 || g.flies.length ? "is-multi" : ""}`}>
              {g.inFs || g.seqMult > 1 || g.flies.length ? (
                <>
                  Mbps <b>{Math.max(0, g.globalMult || (g.inFs ? 0 : g.seqMult))}×</b>
                </>
              ) : (
                <>
                  POOL <b>{formatMoney(g.pots.stat.pool)}</b>
                </>
              )}
            </span>
            <div className={`park-god is-${god}`} aria-hidden="true">
            <img
              src="/art/paas-idle.png?v=3"
              alt=""
              className={`park-pose ${god === "idle" ? "on" : ""}`}
            />
            <img
              src="/art/paas-run.png?v=3"
              alt=""
              className={`park-pose is-flip ${god === "run" ? "on" : ""}`}
            />
            <img
              src="/art/paas-anti.png?v=4"
              alt=""
              className={`park-pose ${god === "anti" ? "on" : ""}`}
            />
            <img
              src="/art/paas-bolt.png?v=4"
              alt=""
              className={`park-pose ${god === "bolt" ? "on" : ""}`}
            />
            <img
              src="/art/paas-win.png?v=4"
              alt=""
              className={`park-pose ${god === "win" ? "on" : ""}`}
            />
            <i className="paas-aura" />
            </div>
            <div className="ls-spin">
              <HoldSpin g={g} spinning={spinning} className={`spin-btn ls-hold ${g.busy ? "is-busy" : ""} ${!g.canSpin && g.duel ? "is-locked" : ""} ${g.turbo ? "is-turbo" : ""}`} label={g.turbo ? "Turbo točenie" : "Točiť · drž pre turbo"} />
              <span>{g.turbo ? "TURBO" : "DRŽ PRE TURBO"}</span>
            </div>
          </aside>
        </div>

        <footer className="bottom-hud">
          <div className="hud-left">
            <div className="hud-icons">
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
              className="icon-btn is-gear"
              onClick={() => setSettingsOpen(true)}
              aria-label="Nastavenia"
            >
              <SettingsIcon size={15} />
            </button>
            <button
              type="button"
              className="icon-btn is-gear"
              onClick={() => setBoardOpen(true)}
              aria-label="Rebríček"
            >
              <Trophy size={15} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={g.toggleMute}
              aria-label={g.muted ? "Zapnúť zvuk" : "Stlmiť"}
            >
              {g.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            </div>
            <div className="credit-stack">
              <p>
                KREDIT <b><CountUp value={g.balance} meter /></b>
              </p>
              <p>
                STÁVKA <b>{formatMoney(g.stake)}</b>
                {g.job ? <em className="bet-lock"> TIKET</em> : null}
              </p>
            </div>
          </div>

          <div className="win-stack">
            <p className={`win-line ${g.displayWin > 0 ? "has-win" : ""}`}>
              {g.displayWin > 0 ? (
                <>
                  VÝHRA <CountUp value={g.displayWin} glide={Boolean(g.taxFly)} ms={g.taxFly ? 850 : undefined} />
                  {g.taxFly ? (
                    <em key={g.taxKey} className={`tax-fly ${g.taxFly.kind === "danUrad" ? "is-tax" : "is-free"}`}>
                      {g.taxFly.kind === "danUrad" ? "−23 % daňový úrad" : "+23 % bez dane"}
                      <small>
                        {g.taxFly.delta < 0 ? "−" : "+"}
                        {formatMoney(Math.abs(g.taxFly.delta))}
                      </small>
                    </em>
                  ) : null}
                </>
              ) : g.payHint ? (
                "VÝHRA"
              ) : (
                winLine
              )}
            </p>
            <p className={`pay-hint ${g.payHint ? "" : "is-idle"}`} aria-hidden={!g.payHint}>
              {g.payHint ? (
                <>
                  <img src={g.payHint.src} alt="" />
                  {g.payHint.count}× {g.payHint.name} = {g.payHint.amount}
                </>
              ) : (
                "\u00a0"
              )}
            </p>
          </div>

          <div className="hud-right">
            <button
              type="button"
              className="round-btn"
              onClick={() => g.changeBet(-1)}
              disabled={!g.canLowerBet}
              aria-label={g.job || g.duel || g.duelLink ? "Stávka zamknutá" : "Znížiť stávku"}
            >
              −
            </button>
            <button
              type="button"
              className={`spin-btn hud-spin ${g.busy ? "is-busy" : ""} ${!g.canSpin && g.duel ? "is-locked" : ""} ${g.turbo ? "is-turbo" : ""}`}
              onClick={() => void g.spin()}
              disabled={!g.canSpin}
              aria-label="Točiť"
            >
              <RefreshCw size={34} strokeWidth={2.6} />
            </button>
            <button
              type="button"
              className="round-btn"
              onClick={() => g.changeBet(1)}
              disabled={g.busy || g.inFs || Boolean(g.job) || Boolean(g.duel) || Boolean(g.duelLink) || Boolean(g.chase) || g.betIndex >= BETS.length - 1}
              aria-label={g.job || g.duel || g.duelLink ? "Stávka zamknutá" : "Zvýšiť stávku"}
            >
              +
            </button>
            {g.autoOn ? (
              <button type="button" className="auto-pill on" onClick={g.stopAuto}>
                STOP {g.autoLeft}
              </button>
            ) : (
              <details className={`auto-menu${g.chase ? " is-locked" : ""}`}>
                <summary>
                  <Menu size={12} /> AUTO
                </summary>
                <div>
                  {AUTO_OPTS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={g.busy || !g.started || Boolean(g.chase)}
                      onClick={() => g.startAuto(n)}
                    >
                      {n}
                    </button>
                  ))}
                  <p className="auto-hint">
                    {g.autoHalt ? "STOP: FS · BIG WIN · 50% kredit. Banner ostane." : "Bez zastávky do konca AUTO."}
                  </p>
                  <button
                    type="button"
                    className={g.autoHalt ? "on" : ""}
                    onClick={() => g.setAutoHalt(!g.autoHalt)}
                  >
                    BIG WIN STOP {g.autoHalt ? "ON" : "OFF"}
                  </button>
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
          {g.surplus && !g.inFs && !g.duel && (
            <button type="button" className="chip-btn gold" onClick={g.openSpend} disabled={g.busy}>
              TIKETY
            </button>
          )}
          {g.started && !g.inFs && !g.duel && !g.duelLink && (
            <button
              type="button"
              className="chip-btn"
              onClick={() => g.setDuelOpen(true)}
              disabled={g.busy}
            >
              DUEL
            </button>
          )}
          {g.autoReason && !g.autoOn && !g.duel && <span className="auto-stop">{g.autoReason}</span>}
          {g.canBust && (
            <button type="button" className="chip-btn gold" onClick={g.askBust}>
              EXEKÚCIA
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
          cleared={g.pickClear}
          peekIds={
            g.duel && g.duel.phase !== "done" ? [] : rankPeekIds(g.pickTiles, g.perk.peekCap, g.perk.peekCount)
          }
          onPick={g.revealPick}
          onDone={g.finishPick}
        />
      )}

      {g.bustAsk && (
        <div className="buy-ask bust-ask" role="dialog" aria-label="Exekúcia">
          <p>EXEKÚCIA</p>
          <strong>Rank sa vráti na KREDIT IV</strong>
          <span>RP, štít, séria, hlásenie a daň zmiznú. Klienti, štatistiky, tikety a sezónne maximum ostanú.</span>
          <em>Kredit {formatMoney(START_BALANCE)}</em>
          <div className="buy-ask-btns">
            <button type="button" className="buy-x" onClick={g.cancelBust} aria-label="Zrušiť">
              ✕
            </button>
            <button type="button" className="buy-ok" onClick={g.confirmBust} aria-label="Potvrdiť exekúciu">
              ✓
            </button>
          </div>
        </div>
      )}
      {g.exekucia && (
        <button type="button" className="exekucia" onClick={g.dismissExekucia} aria-label="Zavrieť exekúciu">
          <span className="exekucia-card">
            <p>EXEKÚCIA</p>
            <b className="ex-from">{g.exekucia.from}</b>
            <b className="ex-to">KREDIT IV</b>
            {g.exekucia.infinite ? <em>BOL SOM NEKONEČNO</em> : <em>sezóna {g.exekucia.peak}</em>}
            <span>kredit {formatMoney(START_BALANCE)}</span>
          </span>
        </button>
      )}
      {g.buyAsk && (
        <div className="buy-ask" role="dialog" aria-label="Kúpiť 4KA TV">
          <p>KÚPIŤ 4KA TV</p>
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

      {g.chase ? (
        <aside className={`chase-ticket ${g.chase.tension === "close" ? "is-close" : ""}`} aria-live="assertive">
          <span>ZÁSAH</span>
          {(() => {
            const chase = g.chase;
            if (!chase) return null;
            const target = PAY_SYMBOLS.find((s) => s.id === chase.target);
            return (
              <>
                {target ? (
                  <img className={`chase-target ${chase.tension === "close" ? "is-close" : ""}`} src={target.src} alt={target.name} />
                ) : (
                  <strong>CIEĽ</strong>
                )}
                <em>{target?.name ?? "losuje sa"}</em>
                <div className="chase-pins" aria-label={`HACK ${chase.hits}/4`}>
                  <em>HACK {chase.hits}/4</em>
                  {Array.from({ length: 4 }, (_, i) => (
                    <i key={`h${i}`} className={i < chase.hits ? "is-hit" : ""} />
                  ))}
                </div>
                <div className="chase-pins is-fs" aria-label={`FS ${chase.strikes}/3`}>
                  <em>FS {chase.strikes}/3</em>
                  {Array.from({ length: 3 }, (_, i) => (
                    <i key={`f${i}`} className={i < chase.strikes ? "is-fs" : ""} />
                  ))}
                </div>
                {chase.fsSym ? <FsChip sym={chase.fsSym} full /> : null}
                <b>
                  SPIN {Math.min(chase.total, chase.spin + 1)}/{chase.total}
                </b>
              </>
            );
          })()}
        </aside>
      ) : null}
      {g.chaseMod ? (
        <div className={`mod-badge ${g.chaseMod.kind === "bezDane" ? "is-free" : "is-tax"}`}>
          {g.chaseMod.kind === "bezDane" ? "BEZ DANE" : "DAŇOVÝ ÚRAD"} · {g.chaseMod.left}
        </div>
      ) : null}
      {jobOpen && (liveJob || seal) ? (
        <JobSheet
          job={liveJob ?? seal!.job}
          seal={seal?.verdict ?? null}
          inFs={g.inFs}
          onClose={() => setJobOpen(false)}
          ante={g.ante}
          buyCost={+(g.bet * g.buyX).toFixed(2)}
          canBuy={g.canBuy}
          canAnte={g.canAnteOff && !g.chase}
          onBuy={() => {
            setJobOpen(false);
            void g.buyBonus();
          }}
          onAnte={() => g.setAnte(true)}
        />
      ) : null}
      {g.fsReveal ? <FsReveal key={g.fsReveal.key} sym={g.fsReveal.sym} onClose={g.dismissFsReveal} /> : null}
      {g.chaseCard ? (
        <div className={`chase-end is-${g.chaseCard.outcome}`} role="dialog" aria-label={g.chaseCard.line}>
          <p>{g.chaseCard.outcome === "escape" ? "UNIKOL SI" : g.chaseCard.outcome === "unik" ? "DAŇOVÝ ÚNIK" : "TAK-TAK"}</p>
          <strong>{g.chaseCard.line}</strong>
          <b>
            {g.chaseCard.rp > 0 ? "+" : ""}
            {g.chaseCard.rp} RP
          </b>
          <button type="button" className="chase-ok" onClick={g.dismissChaseCard}>
            OK
          </button>
        </div>
      ) : null}
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
              <p className="wb-kicker">
                {g.banner === "fs"
                  ? `GRATULUJEME · ${g.bannerAmount || 15} VOLNÝCH TOČENÍ`
                  : (BANNER_COPY[g.banner] ?? "WIN")}
              </p>
              {g.banner === "fs" ? (
                <p className="wb-amt">free-spins: {g.bannerAmount || 15}</p>
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
                        <td>4KA TV UKONČENÁ</td>
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
              {g.banner === "max" && <p className="wb-err">status: 4KA TV UKONČENÁ</p>}
              {g.banner !== "max" && g.banner !== "fs" && g.banner !== "fsTotal" && (
                <p className="wb-line dim">status: ok</p>
              )}
              <p className="wb-line">
                [admin@parkizmus] {'>'}{" "}
                <span className="wb-hint">
                  {g.banner === "fsTotal" ? "ťukni — 4KA TV ostane, kým neklikneš" : "ťukni sem"}
                </span>
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

      {deskOpen && (
        <div className="modal-back" onClick={() => setDeskOpen(false)} role="presentation">
          <div className="atm-desk atm-modal" role="dialog" aria-label="Dnešný counter automatu" onClick={(e) => e.stopPropagation()}>
            <header>
              <span>PARK BANK</span>
              <b>DNES</b>
            </header>
            <p className="atm-kicker">COUNTER AUTOMATU · VŠETCI HRÁČI</p>
            <dl>
              <div>
                <dt>PRETOČENÉ</dt>
                <dd>
                  <CountUp value={g.desk.wagered} meter />
                </dd>
                <dd className="atm-me">
                  TY <CountUp value={g.mine.wagered} meter />
                </dd>
              </div>
              <div>
                <dt>VÝHRY</dt>
                <dd>
                  <CountUp value={g.desk.paid} meter />
                </dd>
                <dd className="atm-me">
                  TY <CountUp value={g.mine.paid} meter />
                </dd>
              </div>
              <div>
                <dt>MAX</dt>
                <dd>
                  <CountUp value={g.desk.best} meter />
                </dd>
                <dd className="atm-me">
                  TY <CountUp value={g.mine.best} meter />
                </dd>
              </div>
            </dl>
            <p className="atm-kicker atm-ticket-kicker">TIKETY · LEN TY · MIMO OBRATU</p>
            <dl className="atm-tickets">
              <div>
                <dt>VYHRANÉ</dt>
                <dd>
                  <CountUp value={g.mine.ticketWon} meter />
                </dd>
                <dd className="atm-me">zisk · výhra − vklad</dd>
              </div>
              <div>
                <dt>PREHRANÉ</dt>
                <dd className="is-loss">
                  <CountUp value={g.mine.ticketLost} meter />
                </dd>
                <dd className="atm-me">stávka zlyhaného</dd>
              </div>
            </dl>
            <button type="button" className="chip-btn" onClick={() => setDeskOpen(false)}>
              ZAVRIEŤ
            </button>
          </div>
        </div>
      )}

      <Paytable open={g.paytableOpen} onClose={() => g.setPaytableOpen(false)} bet={g.bet} desk={g.desk} mine={g.mine} />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Leaderboard open={boardOpen} nick={g.nick} deviceId={g.deviceId} onClose={() => setBoardOpen(false)} onSave={g.setNickName} />
      {g.nickAsk ? <NickAsk onSave={g.setNickName} onSkip={g.dismissNick} /> : null}
      <SpendSheet
        open={g.spendOpen}
        onClose={() => g.setSpendOpen(false)}
        credit={g.balance}
        job={g.job}
        daily={g.daily}
        offer={g.jobOffer}
        onJob={g.takeJob}
        buyX={g.buyX}
      />
      <DuelSheet
        open={g.duelOpen}
        duel={g.duel}
        link={g.duelLink}
        peerName={g.duelPeer}
        bet={g.bet}
        credit={g.balance}
        onClose={() => g.setDuelOpen(false)}
        onStart={g.beginDuel}
        onHost={g.hostDuel}
        onJoin={g.joinDuel}
        onSwap={g.swapDuel}
        onEnd={g.endDuel}
      />
      {g.duelLink ? (
        <DuelLink
          key={g.duelLink.room + g.duelLink.role}
          link={g.duelLink}
          duel={g.duel}
          bet={g.bet}
          onPeerName={g.setDuelPeer}
          onGo={g.beginOnline}
          onTick={g.applyRemoteTick}
          onForfeit={g.noteForfeit}
          onPeerNet={g.notePeerNet}
          onEnd={g.endDuel}
          inFs={g.inFs}
        />
      ) : null}
      {g.jpHit && (
        <div className="ticket-banner" aria-live="assertive">
          <strong>
            <b>{ticketLabel(g.jpHit.id)}</b>
            {g.jpHit.poolBefore > 0 ? <em>{formatMoney(g.jpHit.poolBefore)}</em> : null}
            <span>
              tvoj podiel {Math.round((g.jpHit.share || 1) * 100)} % = {formatMoney(g.jpHit.payout)}
            </span>
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
    </div>
  );
}

function sayGoal(text: string): string {
  return text
    .replaceAll("pádov dokopy", "Cluster tumble dokopy")
    .replaceAll("pádmi dokopy", "Cluster tumble dokopy")
    .replaceAll("klastrami", "cluster");
}

function jobGoalLines(job: JobCard): string[] {
  return sayGoal(jobShownGoal(job)).split(" + ");
}

/** Fixed-height ticket strip under the reels. Long goals never wrap; tap opens the sheet. */
function JobCardCompact({
  job,
  seal,
  inFs,
  onOpen,
  ante,
  canBuy,
  canAnte,
  onBuy,
  onAnte,
}: {
  job: JobCard;
  seal: "ok" | "fail" | null;
  inFs: boolean;
  onOpen: () => void;
  ante: boolean;
  canBuy: boolean;
  canAnte: boolean;
  onBuy: () => void;
  onAnte: () => void;
}) {
  const left = job.limit - job.spun;
  const pct = Math.round(jobProgress(job) * 100);
  const goal = jobGoalLines(job).join(" + ");
  const bonus = ticketBonus(job);
  const flag = Boolean(bonus.need) && !seal;
  // CTA only between spins outside 4KA TV. Buy opens the usual confirmation; ante is the same switch as the side panel.
  const cta = !flag || inFs ? null : bonus.cta === "buy" ? "buy" : bonus.cta === "ante" ? (ante ? "ante-on" : "ante") : null;
  const live = inFs && (bonus.need === "fs" || bonus.need === "buy");
  return (
    <>
      <button
        type="button"
        className={`job-chip is-compact ${!seal && left <= 5 && !(flag && bonus.split) ? "is-late" : ""} ${seal ? "is-sealed" : ""} ${flag ? `has-bonus is-${bonus.need}` : ""} ${flag && bonus.dual ? "is-dual" : ""} ${flag && bonus.split ? "is-split" : ""} ${cta ? "has-cta" : ""}`}
        onClick={onOpen}
        aria-label={`Tiket: ${goal}. ${flag ? `${bonus.badge}. ` : ""}${jobMeter(job)}. ${jobClock(job, inFs)}. Ťukni pre detail.`}
      >
        <span className="jc-row">
          {flag ? (
            <BonusPill info={bonus} live={live} />
          ) : (
            <span className="job-kicker">{seal ? (seal === "ok" ? "ÚSPEŠNÝ" : "NEÚSPEŠNÝ") : "TIKET"}</span>
          )}
          <span className="jc-goal">{goal}</span>
          <span className="jc-more" aria-hidden="true">▴</span>
        </span>
        <span className="jc-row">
          {flag && bonus.dual ? (
            <LegCounters info={bonus} compact />
          ) : (
            <>
              <span className="jc-bar" aria-hidden="true">
                <i style={{ transform: `scaleX(${pct / 100})` }} />
              </span>
              <b className="jc-meter">{jobMeter(job)}</b>
            </>
          )}
          {flag && bonus.split ? null : (
            <em className="jc-clock">{flag && bonus.dual ? jobClock(job, inFs).replace(/^ešte /, "") : jobClock(job, inFs)}</em>
          )}
        </span>
      </button>
      {cta === "buy" ? (
        <button type="button" className="jc-cta is-buy" onClick={onBuy} disabled={!canBuy} aria-label="Kúpiť 4KA TV (s potvrdením)">
          <BonusIcon need="buy" size={14} />
          <span>KÚPIŤ</span>
        </button>
      ) : cta === "ante" ? (
        <button type="button" className="jc-cta is-ante" onClick={onAnte} disabled={!canAnte} aria-label="Zapnúť ANTE">
          <BonusIcon need="ante" size={14} />
          <span>ANTE</span>
        </button>
      ) : cta === "ante-on" ? (
        <span className="jc-cta is-ante is-on" aria-label="ANTE zapnuté">
          <BonusIcon need="ante" size={14} />
          <span>ON</span>
        </span>
      ) : null}
    </>
  );
}

function JobSheet({
  job,
  seal,
  inFs,
  onClose,
  ante,
  buyCost,
  canBuy,
  canAnte,
  onBuy,
  onAnte,
}: {
  job: JobCard;
  seal: "ok" | "fail" | null;
  inFs: boolean;
  onClose: () => void;
  ante: boolean;
  buyCost: number;
  canBuy: boolean;
  canAnte: boolean;
  onBuy: () => void;
  onAnte: () => void;
}) {
  const bonus = ticketBonus(job);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const pct = Math.round(jobProgress(job) * 100);
  const two = bonus.legs.length > 1;
  return (
    <div className="job-sheet-scrim" onClick={onClose}>
      <div className="job-sheet" role="dialog" aria-label="Detail tiketu" onClick={(e) => e.stopPropagation()}>
        <span className="job-sheet-grip" aria-hidden="true" />
        <p className="job-kicker">{seal ? (seal === "ok" ? "ÚSPEŠNÝ TIKET" : "NEÚSPEŠNÝ TIKET") : `TIKET · ${sayCluster(job.title)}`}</p>
        {two ? null : jobGoalLines(job).map((line, i) => <strong key={i}>{line}</strong>)}
        {!seal && bonus.need ? (
          <BonusNote info={bonus} buyCost={buyCost} rows={!two}>
            {inFs ? null : (
              <span className="tb-actions">
                {bonus.cta === "buy" ? (
                  <button type="button" className="tb-btn is-buy" onClick={onBuy} disabled={!canBuy}>
                    <BonusIcon need="buy" size={15} /> KÚPIŤ 4KA TV · {formatMoney(buyCost)}
                  </button>
                ) : null}
                {bonus.need === "trigger" || bonus.need === "fs" ? (
                  <button type="button" className={`tb-btn is-ante ${ante ? "is-on" : ""}`} onClick={onAnte} disabled={ante || !canAnte}>
                    <BonusIcon need="ante" size={15} /> {ante ? "ANTE ZAPNUTÉ" : "ZAPNÚŤ ANTE · 4KA TV ×2"}
                  </button>
                ) : null}
              </span>
            )}
          </BonusNote>
        ) : null}
        {two ? (
          <TicketGoals info={bonus} say={sayGoal} />
        ) : (
          <span className="jc-bar is-big" aria-hidden="true">
            <i style={{ transform: `scaleX(${pct / 100})` }} />
          </span>
        )}
        <dl>
          <dt>Stav</dt>
          <dd>{two ? `hotové ${bonus.legs.filter((l) => l.done).length} z ${bonus.legs.length}` : jobMeter(job)}</dd>
          <dt>Čas</dt>
          <dd>{jobClock(job, inFs)}</dd>
          <dt>Vklad → výplata</dt>
          <dd>
            {formatMoney(job.stake)} → {formatMoney(job.payout)}
          </dd>
        </dl>
        <button type="button" className="job-sheet-ok" onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  );
}
