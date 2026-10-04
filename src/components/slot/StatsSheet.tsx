import { useEffect, useMemo, useState } from "react";
import { RankFrame } from "./RankFrame";
import { formatMoney } from "@/lib/slot/format";
import { PAY_SYMBOLS, type PayId } from "@/lib/slot/symbols";
import { recipeSentence } from "@/lib/slot/win-recipe";
import { standing, RANKS } from "@/lib/slot/ranks";
import {
  STATS_TAB_KEY,
  cget,
  formatBratislava,
  formatDuration,
  pct,
  rate,
  type PlayerStats,
  PAY_IDS,
  FLOORS,
  TIERS,
  RANK_IDS,
  clearStats,
  isStatsBackupEnabled,
  setStatsBackupEnabled,
} from "@/lib/slot/stats";
import { statsDrop } from "@/lib/slot/stats-api";
import "./stats-sheet.css";

const TABS = [
  { id: "main", label: "Hlavné" },
  { id: "wins", label: "Výhry" },
  { id: "syms", label: "Symboly" },
  { id: "bonus", label: "Bonusy" },
  { id: "zasah", label: "Zásah" },
  { id: "tickets", label: "Tikety" },
  { id: "net", label: "Sieť & Versus" },
  { id: "rank", label: "Rank" },
  { id: "records", label: "Rekordy" },
  { id: "time", label: "Čas" },
  { id: "firsts", label: "Prvenstvá" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function Row({
  name,
  value,
  bar,
  onClick,
  tip,
}: {
  name: string;
  value: string;
  bar?: number | null;
  onClick?: () => void;
  tip?: string;
}) {
  return (
    <button
      type="button"
      className={`st-row ${onClick ? "is-tap" : ""}`}
      onClick={onClick}
      disabled={!onClick}
      title={tip}
    >
      <span className="st-name">{name}</span>
      <span className="st-val">{value}</span>
      {bar != null && bar >= 0 ? (
        <i className="st-bar" aria-hidden="true">
          <b style={{ width: `${Math.min(100, Math.max(0, bar * 100))}%` }} />
        </i>
      ) : null}
    </button>
  );
}

function Sec({ title }: { title: string }) {
  return <h3 className="st-sec">{title}</h3>;
}

function money(n: number): string {
  if (!(n > 0)) return "—";
  return `${formatMoney(n)} €`;
}

function num(n: number): string {
  if (!(n > 0)) return "—";
  return Math.round(n).toLocaleString("sk-SK");
}

function xVal(n: number): string {
  if (!(n > 0)) return "—";
  return `${n >= 100 ? Math.round(n) : n.toFixed(2)}×`;
}

function payName(id: PayId): string {
  return PAY_SYMBOLS.find((s) => s.id === id)?.name ?? id;
}

interface Props {
  open: boolean;
  onClose: () => void;
  stats: PlayerStats;
  nick: string;
  rp: number;
  balance: number;
  winStreak: number;
  playerId: string;
  onStatsChange: (s: PlayerStats) => void;
}

export function StatsSheet({
  open,
  onClose,
  stats,
  nick,
  rp,
  balance,
  winStreak,
  playerId,
  onStatsChange,
}: Props) {
  const [tab, setTab] = useState<TabId>(() => {
    if (typeof localStorage === "undefined") return "main";
    const t = localStorage.getItem(STATS_TAB_KEY);
    return TABS.some((x) => x.id === t) ? (t as TabId) : "main";
  });
  const [expand, setExpand] = useState<string | null>(null);
  const [backup, setBackup] = useState(() => isStatsBackupEnabled());
  const stand = standing(rp);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (typeof localStorage !== "undefined") localStorage.setItem(STATS_TAB_KEY, tab);
  }, [tab]);

  const s = stats;
  const spins = cget(s, "spins");
  const paid = cget(s, "paid");
  const wagered = cget(s, "wagered");
  const ticketStake = cget(s, "ticket.stake");
  const net = paid - wagered - ticketStake;
  const rtp = rate(paid, wagered);
  const winSpins = cget(s, "win.spins");
  const dead = cget(s, "dead");
  const hit = rate(winSpins, winSpins + dead);
  const playMs = cget(s, "playMs");
  const sessions = cget(s, "session");

  const taxPaid = cget(s, "tax.paid");
  const taxSaved = cget(s, "saved.tax");
  const taxBal = taxSaved - taxPaid;

  const body = useMemo(() => {
    if (tab === "main") {
      return (
        <>
          <Sec title="PREHĽAD" />
          <Row name="Odohrané spiny" value={num(spins)} />
          <Row name="Free spiny 4KA TV" value={num(cget(s, "fs.played"))} />
          <Row name="Spiny s ANTE" value={num(cget(s, "ante.spins"))} />
          <Row name="Celkovo vsadené" value={money(wagered)} />
          <Row name="Celkovo vyhrané" value={money(paid)} />
          <Row name="Čistý výsledok" value={`${net >= 0 ? "+" : "−"}${formatMoney(Math.abs(net))} €`} />
          <Row name="RTP osobné" value={rtp == null ? "—" : `${(rtp * 100).toFixed(1)} %`} bar={rtp} />
          <Row name="Výherné spiny" value={num(winSpins)} />
          <Row name="Mŕtve spiny" value={num(dead)} />
          <Row name="Hit rate" value={pct(winSpins, winSpins + dead)} bar={hit} />
          <Row name="Priemerná stávka" value={spins > 0 ? money(wagered / spins) : "—"} />
          <Row name="Aktuálny kredit" value={money(balance)} />
          <Row name="Najvyšší kredit vôbec" value={money(s.hi["balance.max"] ?? 0)} />
          <Row name="Exekúcie (bankroty)" value={num(cget(s, "bust"))} />
          <Row name="KLIENTI" value={num(cget(s, "klienti"))} />
          <Row name="Auto-spiny" value={num(cget(s, "auto"))} />
          <Row
            name="Turbo / Quick podiel"
            value={`${pct(cget(s, "turbo"), spins)} / ${pct(cget(s, "quick"), spins)}`}
          />
          <Row name="Zastavené valce" value={num(cget(s, "stop"))} />
        </>
      );
    }
    if (tab === "wins") {
      return (
        <>
          <Sec title="VÝHRY" />
          <Row name="Výhry < 1×" value={num(cget(s, "win.lt1"))} />
          <Row name="Výhry 1–5×" value={num(cget(s, "win.1-5"))} />
          <Row name="Výhry 5–20×" value={num(cget(s, "win.5-20"))} />
          <Row name="BIG WIN" value={num(cget(s, "win.big"))} />
          <Row name="MEGA WIN" value={num(cget(s, "win.mega"))} />
          <Row name="EPIC WIN" value={num(cget(s, "win.epic"))} />
          <Row name="MASÍVNA VÝHRA" value={num(cget(s, "win.massive"))} />
          <Row name="MAX WIN 5000×" value={num(cget(s, "win.max"))} />
          <Row name="Clustery celkovo" value={num(cget(s, "cluster"))} />
          <Row name="Cluster tumble celkovo" value={num(cget(s, "tumble"))} />
          <Row name="Spiny s 2+ tumble" value={num(cget(s, "chain"))} />
          <Row name="Výhry s plechovkou" value={num(cget(s, "orb.win"))} />
          <Row name="Výhra z plechoviek navyše" value={money(cget(s, "orb.extra"))} />
          <Row name="Takmer výhra (7/8)" value={num(cget(s, "near"))} />
          <Row name="Napätie (2+ scattere)" value={`${num(cget(s, "anti"))} · 4KA TV ${num(cget(s, "anti.fs") + cget(s, "anti.2.fs") + cget(s, "anti.3.fs"))}`} />
          <Row name="Napätie 2 (5.–9. bez bonusu)" value={`${num(cget(s, "anti.2"))} · 4KA TV ${num(cget(s, "anti.2.fs"))}`} />
          <Row name="Napätie 3 (10.+ bez bonusu)" value={`${num(cget(s, "anti.3"))} · 4KA TV ${num(cget(s, "anti.3.fs"))}`} />
          <Row name="Cashback mŕtvych spinov" value={money(cget(s, "cashback"))} />
          <Row name="Rank drop (postup)" value={money(cget(s, "rank.drip"))} />
          <Row name="Séria výhier — aktuálna" value={num(winStreak)} />
          <Row name="Hold série použitý" value={num(cget(s, "hold"))} />
          <Row name="Výplaty v duelovom escrow" value={money(cget(s, "escrow"))} />
        </>
      );
    }
    if (tab === "syms") {
      return (
        <>
          <Sec title="SYMBOLY" />
          <div className="st-sym-grid">
            {PAY_IDS.map((id) => {
              const cells = cget(s, `sym.${id}.cells`);
              const wins = cget(s, `sym.${id}.wins`);
              const hi12 = cget(s, `sym.${id}.12`);
              const jogger = id === "dacia";
              return (
                <div key={id} className={`st-sym ${jogger ? "is-jogger" : ""}`}>
                  <img src={PAY_SYMBOLS.find((p) => p.id === id)?.src} alt="" />
                  <strong>{payName(id)}</strong>
                  <span>{num(wins)} výhier</span>
                  <span>{num(cells)} ks</span>
                  <span>12+ · {num(hi12)}</span>
                  {jogger ? <em>Sedem miest, nula hanby</em> : null}
                </div>
              );
            })}
          </div>
          <Row name="PDF 4K 5G 8+" value={num(cget(s, "pdf.8"))} />
          <Row
            name="Najčastejší výherný symbol"
            value={(() => {
              let best: PayId | null = null;
              let n = 0;
              for (const id of PAY_IDS) {
                const v = cget(s, `sym.${id}.wins`);
                if (v > n) {
                  n = v;
                  best = id;
                }
              }
              return best ? payName(best) : "—";
            })()}
          />
          <Row name="4KA TV scattery spolu" value={num(cget(s, "scatter"))} />
          <Row name="3 zo 4 scatterov" value={num(cget(s, "scatter.3"))} />
          <Row name="4 / 5 / 6 scatterov" value={`${num(cget(s, "scatter.4"))} / ${num(cget(s, "scatter.5"))} / ${num(cget(s, "scatter.6"))}`} />
          <Row name="Plechovky spadnuté" value={num(cget(s, "can.drop"))} />
          <Row name="Plechovky 2–5 / 6–15 / 20–50 / 100+" value={`${num(cget(s, "can.tier.2-5"))} / ${num(cget(s, "can.tier.6-15"))} / ${num(cget(s, "can.tier.20-50"))} / ${num(cget(s, "can.tier.100+"))}`} />
          <Row name="Plechovka 500×" value={num(cget(s, "can.500"))} />
          <Row name="Mŕtve plechovky" value={num(cget(s, "can.dead"))} />
          <Row name="Súčet SIGNÁLU" value={num(cget(s, "signal"))} />
          <Row name="Lístky na doske" value={num(cget(s, "park.land"))} />
          <Row
            name="Hrdzavý konektor"
            value={(() => {
              const total = PAY_IDS.reduce((a, id) => a + cget(s, `sym.${id}.cells`), 0);
              return pct(cget(s, "sym.rj45.cells"), total);
            })()}
          />
        </>
      );
    }
    if (tab === "bonus") {
      const fsStart = cget(s, "fs.start");
      const natural = cget(s, "fs.natural");
      const bought = cget(s, "fs.bought");
      return (
        <>
          <Sec title="4KA TV & KONTROLA" />
          <Row name="4KA TV spustené prirodzene" value={num(natural)} />
          <Row name="4KA TV z ANTE" value={num(cget(s, "fs.ante"))} />
          <Row name="4KA TV kúpené" value={num(bought)} />
          <Row name="4KA TV v ZÁSAHU (×2)" value={`${num(cget(s, "fs.zasah"))} · ${money(cget(s, "fs.zasah.paid"))}`} />
          <Row name="Minuté na kúpy" value={money(cget(s, "buy.spent"))} />
          <Row
            name="Návratnosť kúpy"
            value={pct(cget(s, "buy.return"), cget(s, "buy.spent"))}
            bar={rate(cget(s, "buy.return"), cget(s, "buy.spent"))}
          />
          <Row name="Kúpy v zisku" value={num(cget(s, "buy.profit"))} />
          <Row name="Retriggery" value={num(cget(s, "retrigger"))} />
          <Row name="Pridané free spiny" value={num(cget(s, "fs.extra"))} />
          <Row name="Výhra zo 4KA TV spolu" value={money(cget(s, "fs.paid"))} />
          <Row
            name="Priemer na 4KA TV (×)"
            value={
              fsStart > 0 && wagered > 0
                ? xVal(cget(s, "fs.paid") / fsStart / Math.max(0.01, wagered / Math.max(1, spins)))
                : "—"
            }
          />
          <Row name="Prázdne 4KA TV" value={num(cget(s, "fs.empty"))} />
          <Row name="Spiny medzi 4KA TV — priemer" value={natural + cget(s, "fs.ante") > 0 ? (spins / (natural + cget(s, "fs.ante"))).toFixed(1) : "—"} />
          <Row name="Sucho od 4KA TV" value={num(s.run.fsDry)} />
          <Row name="Prerušené 4KA TV (obnova)" value={num(cget(s, "fs.resume"))} />
          <Row name="KONTROLA spustená" value={num(cget(s, "pick.start"))} />
          <Row name="KONTROLA — lístky odkryté" value={num(cget(s, "pick.safes"))} />
          <Row name="ODŤAH" value={num(cget(s, "odtah"))} />
          <Row name="Zaplatil si všetko parkovné" value={num(cget(s, "pick.clear"))} />
          <Row name="KONTROLA — výhra spolu" value={money(cget(s, "pick.paid"))} />
          <Row name="Pokuty chytené" value={num(cget(s, "fine"))} />
          <Row name="KOLESO NEŠŤASTIA spustené" value={num(cget(s, "koleso.start"))} />
          <Row name="KOLESO — tajnička vylúštená" value={num(cget(s, "koleso.solved"))} />
          <Row name="KOLESO — BANKROT" value={num(cget(s, "koleso.bankrot"))} />
          <Row name="KOLESO — výhra spolu" value={money(cget(s, "koleso.paid"))} />
        </>
      );
    }
    if (tab === "zasah") {
      const esc = cget(s, "escape");
      const unik = cget(s, "unik");
      const neu = cget(s, "neutral");
      return (
        <>
          <div className={`st-tax-hero ${taxBal >= 0 ? "is-plus" : "is-minus"}`}>
            <span>Daňová bilancia</span>
            <strong>
              {taxBal >= 0 ? "+" : "−"}
              {formatMoney(Math.abs(taxBal))} €
            </strong>
            <em>Finančná správa · pečať</em>
          </div>
          <Sec title="ZÁSAH" />
          <Row name="ZÁSAHY spustené" value={num(cget(s, "chase.start"))} />
          <Row name="Spiny v ZÁSAHU" value={num(cget(s, "chase.spins"))} />
          <Row name="ÚTEK (BEZ DANE)" value={num(esc)} />
          <Row name="DAŇOVÝ ÚNIK chytený" value={num(unik)} />
          <Row name="Unikol si len tak-tak" value={num(neu)} />
          <Row name="ZÁSAH zrušený" value={num(cget(s, "void"))} />
          <Row name="Úspešnosť útekov" value={pct(esc, esc + unik + neu)} bar={rate(esc, esc + unik + neu)} />
          <Row name="HACK okná" value={`${num(cget(s, "hack.total"))} · hit ${num(cget(s, "hack.hit"))} / FS ${num(cget(s, "hack.fs"))} / miss ${num(cget(s, "hack.miss"))}`} />
          <Row name="Lock-on hity" value={num(cget(s, "lock"))} />
          <Row name="Strikes od Finančnej správy" value={num(cget(s, "strike"))} />
          <Row name="Tep 2/3" value={num(cget(s, "tep"))} />
          <Row name="Najdlhší útek pred FS" value={num(s.hi["chase.escapeSpins"] ?? 0)} />
          <Row name="Séria bez daňového úniku" value={num(s.hi["chase.noUnik"] ?? 0)} />
          <Row name="Útek na prvý pokus" value={num(cget(s, "escape.early"))} />
          <Row name="Bonus zablokovaný" value={num(cget(s, "blocked"))} />
          <Row name="Zaplatené dane" value={money(taxPaid)} />
          <Row name="Ušetrené na daniach" value={money(taxSaved)} />
          <Row name="Spiny pod daňovým úradom" value={num(cget(s, "dan.spins"))} />
          <Row name="Spiny BEZ DANE" value={num(cget(s, "bez.spins"))} />
          <Row name="4KA TV pod modom" value={num(cget(s, "mod.fs"))} />
          <Row name="Hlásenie naplnené" value={num(cget(s, "heat"))} />
        </>
      );
    }
    if (tab === "tickets") {
      const ok = cget(s, "job.ok");
      const fail = cget(s, "job.fail");
      return (
        <>
          <Sec title="TIKETY" />
          <div className="st-floors">
            {FLOORS.map((f) => {
              const label = f === "lacna" ? "LACNÁ" : f === "stred" ? "STRED" : "DRAHÁ";
              const okN = cget(s, `job.floor.${f}.ok`);
              const takeN = cget(s, `job.floor.${f}`);
              return (
                <div key={f} className="st-floor st-lcd">
                  <span>{label}</span>
                  <strong>{okN}/{takeN}</strong>
                  <em>splnené / prijaté</em>
                </div>
              );
            })}
          </div>
          <Row name="Tikety prijaté" value={num(cget(s, "job.take"))} />
          <Row name="OTRS (mystery)" value={num(cget(s, "otrs"))} />
          <Row name="Dual tikety" value={num(cget(s, "dual"))} />
          <Row name="Splnené tikety" value={num(ok)} />
          <Row name="Prepadnuté tikety" value={num(fail)} />
          <Row name="Dôvod: čas / 4KA TV / stávka" value={`${num(cget(s, "fail.clock"))} / ${num(cget(s, "fail.parknet"))} / ${num(cget(s, "fail.bet"))}`} />
          <Row name="Úspešnosť tiketov" value={pct(ok, ok + fail)} bar={rate(ok, ok + fail)} />
          <Row name="Stávky tiketov spolu" value={money(ticketStake)} />
          <Row name="Výplaty tiketov spolu" value={money(cget(s, "ticket.paid"))} />
          <Row name="Zisk z tiketov" value={money(cget(s, "ticket.profit"))} />
          <Row name="SIEŤ splnená" value={num(cget(s, "siet"))} />
          <Row name="Tiket na poslednom spine" value={num(cget(s, "job.lastSpin"))} />
          <Row name="Najrýchlejší tiket" value={s.lo["job.fastest"] != null ? `${Math.round((s.lo["job.fastest"] ?? 0) * 100)} % limitu` : "—"} />
          <Row name="Odpísané náklady" value={money(cget(s, "cash.kind"))} />
          <Row name="Najdrahšie parkovné" value={money(s.hi["ticket.failStake"] ?? 0)} />
        </>
      );
    }
    if (tab === "net") {
      return (
        <>
          <Sec title="JACKPOTY & VERSUS" />
          {TIERS.map((t) => (
            <Row key={t} name={`Lístky ${t === "ulica" ? "1" : t === "okres" ? "2" : t === "kraj" ? "3" : "4"}-FTTB`} value={num(cget(s, `jp.${t}`))} />
          ))}
          <Row name="Jackpot výplaty spolu" value={money(cget(s, "jp.paid"))} />
          <Row name="Lístok odložený na koniec 4KA TV" value={num(cget(s, "jp.stash"))} />
          <Row name="Podiel z cudzieho 4-FTTB" value={money(cget(s, "credit.split"))} />
          <Row name="Najväčší pool pri výhre" value={money(s.hi["jp.pool"] ?? 0)} />
          <Row name="VERSUS hry odohrané" value={num(cget(s, "duel.play"))} />
          <Row name="Vyhrané / prehrané / remízy" value={`${num(cget(s, "duel.win"))} / ${num(cget(s, "duel.loss"))} / ${num(cget(s, "duel.draw"))}`} />
          <Row name="Vzdania (ja / súperi)" value={`${num(cget(s, "duel.forfeit.me"))} / ${num(cget(s, "duel.forfeit.peer"))}`} />
          <Row name="Bank z VERSUS" value={money(cget(s, "duel.pot"))} />
          <Row name="Kaucia zaplatená" value={`${money(cget(s, "duel.dep.paid"))} (${num(cget(s, "duel.dep.paid.n"))}×)`} />
          <Row name="Kaucia vrátená" value={`${money(cget(s, "duel.dep.returned"))} (${num(cget(s, "duel.dep.returned.n"))}×)`} />
          <Row name="Kaucia prepadnutá" value={`${money(cget(s, "duel.dep.burned"))} (${num(cget(s, "duel.dep.burned.n"))}×)`} />
          <Row name="Prepadnuté ťahy (20 s)" value={num(cget(s, "blank"))} />
        </>
      );
    }
    if (tab === "rank") {
      return (
        <>
          <Sec title="RANK" />
          <Row name="Aktuálny rank" value={`${stand.name}${stand.roman ? ` ${stand.roman}` : ""}`} />
          <Row name="Sezónne maximum" value={`${standing(s.hi["balance.max"] ? rp : rp).name}`} />
          <div className="st-ladder">
            {RANK_IDS.map((id) => {
              const r = RANKS.find((x) => x.id === id);
              const ts = s.first[`league.${id}`];
              return (
                <div key={id} className={`st-lad rk-${id}`}>
                  <RankFrame id={id} division={1} size={28} still dim={!ts} />
                  <strong>{r?.name ?? id}</strong>
                  <span>{ts ? formatBratislava(ts) : "—"}</span>
                </div>
              );
            })}
          </div>
          <Row name="RP získané spolu" value={num(cget(s, "rp.gain"))} />
          <Row name="RP stratené spolu" value={num(cget(s, "rp.loss"))} />
          <Row name="Postupy / Pády" value={`${num(cget(s, "up"))} / ${num(cget(s, "down"))}`} />
          <Row name="Štít zachránil" value={num(cget(s, "shield"))} />
          <Row name="Týždenné dropy" value={num(cget(s, "week"))} />
          <Row name="Najväčší zisk RP naraz" value={num(s.hi["rp.maxGain"] ?? 0)} />
          <Row name="Najväčšia strata RP naraz" value={num(s.hi["rp.maxLoss"] ?? 0)} />
          <Row name="RP stratené exekúciou" value={num(cget(s, "rp.bust"))} />
          <Row
            name="Rozpis RP"
            value={`Σ${num(cget(s, "parts.fromSum"))} · ×${num(cget(s, "parts.fromMult"))} · sér${num(cget(s, "parts.fromStreak"))} · tum${num(cget(s, "parts.fromTumble"))} · ban${num(cget(s, "parts.fromBanner"))} · bon${num(cget(s, "parts.fromBonus"))}`}
          />
        </>
      );
    }
    if (tab === "records") {
      const recRow = (key: string, name: string, val: string) => {
        const recipe = s.rec[key];
        const open = expand === key;
        return (
          <div key={key}>
            <Row
              name={name}
              value={val}
              onClick={recipe ? () => setExpand(open ? null : key) : undefined}
              tip={recipe ? "Ťukni pre recept" : undefined}
            />
            {open && recipe ? (
              <p className="st-recipe">{recipeSentence(recipe, payName)}</p>
            ) : null}
          </div>
        );
      };
      return (
        <>
          <Sec title="REKORDY" />
          {recRow("win.cash", "Najväčšia výhra (€)", money(s.hi["win.cash"] ?? 0))}
          {recRow("win.x", "Najvyšší násobok (×)", xVal(s.hi["win.x"] ?? 0))}
          <Row name="Najlepší base spin" value={money(s.hi["win.base"] ?? 0)} />
          {recRow("fs.best", "Najlepšia 4KA TV", money(s.hi["fs.best"] ?? 0))}
          {recRow("buy.best", "Najlepšia kúpa (× ceny)", xVal(s.hi["buy.best"] ?? 0))}
          <Row name="Najvyšší SIGNÁL v 4KA TV" value={num(s.hi["fs.peak"] ?? 0)} />
          <Row name="Najviac tumble v spine" value={num(s.hi["tumbles.max"] ?? 0)} />
          <Row name="Najviac plechoviek v spine" value={num(s.hi["can.maxSpin"] ?? 0)} />
          <Row name="Najvyšší súčet plechoviek" value={num(s.hi["can.sumMax"] ?? 0)} />
          <Row name="Najviac clusterov v spine" value={num(s.hi["cluster.maxSpin"] ?? 0)} />
          <Row name="Najväčší cluster" value={num(s.hi["cluster.biggest"] ?? 0)} />
          <Row name="Najdlhšia séria výhier" value={num(s.hi["streak.max"] ?? winStreak)} />
          <Row name="Najdlhšie sucho" value={num(s.hi["dead.streak"] ?? 0)} />
          <Row name="Najviac retriggerov v jednej 4KA TV" value={num(s.hi["fs.retriggerMax"] ?? 0)} />
          <Row name="Najdlhšia 4KA TV" value={num(s.hi["fs.playedMax"] ?? 0)} />
          <Row name="Najlepšia KONTROLA" value={money(s.hi["pick.best"] ?? 0)} />
          <Row name="Najlepšie KOLESO" value={money(s.hi["koleso.best"] ?? 0)} />
          <Row name="Najväčšia daň naraz" value={money(s.hi["tax.max"] ?? 0)} />
          <Row name="Najväčší jackpot" value={money(s.hi["jp.best"] ?? 0)} />
          <Row name="Najvyšší tiket" value={money(s.hi["ticket.best"] ?? 0)} />
          <Row name="Najvyššia stávka" value={money(s.hi["bet.max"] ?? 0)} />
          <Row name="Najnižší kredit pred záchranou" value={money(s.lo["balance.low"] ?? 0)} />
        </>
      );
    }
    if (tab === "time") {
      const maxH = Math.max(1, ...s.hours);
      const maxD = Math.max(1, ...s.weekdays);
      const days = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];
      return (
        <>
          <Sec title="ČAS" />
          <Row name="Čas hrania" value={formatDuration(playMs)} />
          <Row name="Sedenia" value={num(sessions)} />
          <Row name="Najdlhšie sedenie" value={formatDuration(s.hi["session.max"] ?? 0)} />
          <Row name="Priemerné sedenie" value={sessions > 0 ? formatDuration(playMs / sessions) : "—"} />
          <Row name="Dni hrania" value={num(cget(s, "day.count"))} />
          <Row name="Séria dní" value={num(s.hi["day.streak"] ?? 0)} />
          <Row name="Prvá hra" value={formatBratislava(s.first["play.first"] ?? s.since)} />
          <Row name="Posledná hra" value={formatBratislava(s.first["play.last"] ?? s.updatedAt)} />
          <Row name="Čas v 4KA TV" value={formatDuration(cget(s, "fsMs"))} />
          <Row name="Čas v ZÁSAHU" value={formatDuration(cget(s, "chaseMs"))} />
          <Row name="Spiny za hodinu" value={playMs > 0 ? (spins / (playMs / 3_600_000)).toFixed(1) : "—"} />
          <Row name="Hrané ako aplikácia (PWA)" value={num(cget(s, "pwa"))} />
          <Row name="Aktualizácie hry" value={num(cget(s, "build"))} />
          <Sec title="HEATMAPA · HODINA × DEŇ" />
          <div className="st-heat" role="img" aria-label="Heatmapa spinov">
            <div className="st-heat-days">
              {days.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="st-heat-grid">
              {Array.from({ length: 24 }, (_, h) =>
                s.weekdays.map((_, di) => {
                  // approximate: shade by hour weight × weekday weight
                  const v = ((s.hours[h] ?? 0) / maxH) * 0.6 + ((s.weekdays[di] ?? 0) / maxD) * 0.4;
                  const cell = (s.hours[h] ?? 0) > 0 && (s.weekdays[di] ?? 0) > 0 ? v : 0;
                  return <i key={`${h}-${di}`} style={{ opacity: 0.12 + cell * 0.88 }} title={`${days[di]} ${h}:00`} />;
                }),
              )}
            </div>
            <div className="st-heat-hours">
              {[0, 6, 12, 18, 23].map((h) => (
                <span key={h}>{h}</span>
              ))}
            </div>
          </div>
        </>
      );
    }
    // firsts + curiosities
    const firsts: { k: string; name: string }[] = [
      { k: "win.first", name: "Prvá výhra" },
      { k: "win.big", name: "Prvý BIG WIN" },
      { k: "win.mega", name: "Prvý MEGA WIN" },
      { k: "win.epic", name: "Prvý EPIC WIN" },
      { k: "win.massive", name: "Prvá MASÍVNA VÝHRA" },
      { k: "win.max", name: "Prvý MAX WIN" },
      { k: "fs.first", name: "Prvá 4KA TV" },
      { k: "fs.buy", name: "Prvá kúpa" },
      { k: "retrigger", name: "Prvý retrigger" },
      { k: "pick.clear", name: "Prvá KONTROLA vyčistená" },
      { k: "koleso.solved", name: "Prvá tajnička vylúštená" },
      { k: "escape", name: "Prvý ÚTEK" },
      { k: "unik", name: "Prvý DAŇOVÝ ÚNIK" },
      { k: "job.ok", name: "Prvý splnený tiket" },
      { k: "otrs.ok", name: "Prvý OTRS" },
      { k: "jp.ulica", name: "Prvý 1-FTTB" },
      { k: "jp.okres", name: "Prvý 2-FTTB" },
      { k: "jp.kraj", name: "Prvý 3-FTTB" },
      { k: "jp.stat", name: "Prvý 4-FTTB" },
      { k: "bust", name: "Prvá exekúcia" },
      { k: "duel.win", name: "Prvá vyhraná VERSUS hra" },
      { k: "can.500", name: "Prvá plechovka 500×" },
      { k: "pdf.12", name: "Prvé PDF 12+" },
    ];
    const timeline = firsts
      .map((f) => ({ ...f, ts: s.first[f.k] }))
      .filter((f) => f.ts)
      .sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
    const odtah = cget(s, "odtah");
    const fines = cget(s, "fine");
    const vodic = odtah + fines;
    const vodicTitle = vodic >= 50 ? "Vodič roka" : vodic >= 20 ? "Šofér na skúšku" : vodic >= 5 ? "Parkuje na oko" : "—";
    return (
      <>
        <Sec title="ČASOVÁ OS" />
        <ol className="st-timeline">
          {timeline.length === 0 ? <li className="st-empty">Zatiaľ žiadne prvenstvá — toč ďalej.</li> : null}
          {timeline.map((f) => (
            <li key={f.k}>
              <time>{formatBratislava(f.ts!)}</time>
              <span>{f.name}</span>
            </li>
          ))}
        </ol>
        <Sec title="KURIOZITY" />
        <Row name="Stlmenia zvuku" value={num(cget(s, "mute"))} />
        <Row name="Preskočené bannery" value={num(cget(s, "skip"))} />
        <Row name="Zníženie stávky z núdze" value={num(cget(s, "betDown"))} />
        <Row name="Ante vypnuté z núdze" value={num(cget(s, "anteOff"))} />
        <Row name="Nedostatok kreditu" value={num(cget(s, "skipCredit"))} />
        <Row name="Otvorená tabuľka výplat" value={num(cget(s, "paytable"))} />
        <Row name="Vodič roka" value={vodicTitle === "—" ? "—" : `${vodicTitle} · ${vodic}`} />
      </>
    );
  }, [tab, s, spins, paid, wagered, ticketStake, net, rtp, winSpins, dead, hit, balance, winStreak, playMs, sessions, taxPaid, taxSaved, taxBal, stand, expand, rp]);

  if (!open) return null;

  const toggleBackup = async () => {
    const next = !backup;
    setBackup(next);
    setStatsBackupEnabled(next);
    if (!next && playerId) {
      try {
        await statsDrop(playerId);
      } catch {
        /* ignore */
      }
    }
  };

  const wipe = () => {
    if (!confirm("Naozaj vymazať lokálne štatistiky? Cloudová záloha (ak bola) sa týmto nemení.")) return;
    const empty = clearStats();
    onStatsChange(empty);
  };

  return (
    <div className="modal-back st-back" onClick={onClose} role="presentation">
      <div
        className="modal-card fb-sheet st-sheet"
        role="dialog"
        aria-labelledby="st-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head fb-head st-head">
          <div className="st-head-main">
            <h2 id="st-title">ŠTATISTIKY</h2>
            <span className="st-nick">{nick || "BEZ NICKU"}</span>
            <span className="st-rank rf-slot" aria-hidden="true">
              <RankFrame id={stand.id} division={stand.division} size={28} />
            </span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Zavrieť">
            ×
          </button>
        </header>
        <p className="st-sub">
          od {formatBratislava(s.since)} · {formatDuration(playMs)} · demo kredit
        </p>
        <nav className="st-tabs" aria-label="Kategórie štatistík">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? "is-on" : ""}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="st-body">{body}</div>
        <footer className="st-foot">
          <label className="st-toggle">
            <input type="checkbox" checked={backup} onChange={() => void toggleBackup()} />
            <span>Zálohovať štatistiky (cloud)</span>
          </label>
          <button type="button" className="st-clear" onClick={wipe}>
            Vymazať štatistiky
          </button>
          <p className="st-privacy">
            Štatistiky sú doživotné a prežijú EXEKÚCIU. Ukladajú sa lokálne; cloudová záloha je vypnutá, kým ju nezapneš.
            Žiadna IP ani poloha. Demo kredit — hraj zodpovedne.
          </p>
        </footer>
      </div>
    </div>
  );
}

