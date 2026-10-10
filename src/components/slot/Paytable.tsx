import { useEffect, useRef, useState, type ReactNode } from "react";
import { BarChart3, Gauge, Info, Settings as SettingsIcon, Siren, Sparkles, Swords, Ticket, Trophy, Volume2 } from "lucide-react";
import {
  ANTE_COST,
  BETS,
  BUY_COST_X,
  BUY_X_BY_FS,
  COLS,
  FS_EXTRA_PER_SCATTER,
  FS_RETRIGGER,
  FS_RETRIGGER_SCATTERS,
  FS_SYMBOL,
  FS_TRIGGER_SCATTERS,
  MATH_NOTE,
  MAX_WIN_X,
  ORB_TABLE,
  ORB_VALUES,
  PAY_SYMBOLS,
  ROWS,
  SCATTER,
  START_BALANCE,
  TICKETS,
  WIN_POP_X,
  canSrc,
  fsTriggerSpins,
} from "@/lib/slot/symbols";
import { formatMoney } from "@/lib/slot/format";
import { subscribeTicketNames, ticketLabel } from "@/lib/slot/ticket-names";
import type { DeskDay } from "@/lib/slot/desk-api";
import { HEAT_MAX } from "@/lib/slot/heat";
import { MUST_HIT_SPINS, POOL_ELIGIBLE_BET, TIERS } from "@/lib/slot/jackpot";
import { PICK_BAYS, PITY_GOAL, pityGain } from "@/lib/slot/pick-bonus";
import { BONUS_MODES } from "@/lib/slot/bonus-mode";
import { RANKS, RANK_PERKS, REBATE_CAP_BETS, REBATE_WINDOW, anteMulOf, buyDeadEquiv, fsSpinsOf } from "@/lib/slot/ranks";
import { ZASAH, ZASAH_FS_MUL } from "@/lib/slot/zasah";
import { ZBOX_VIP } from "@/lib/slot/zbox";
import { KOLESO_VIP } from "@/lib/slot/koleso";
import { DUEL_DEPOSIT_MULT } from "@/lib/slot/duel-deposit";
import { ZboxRules } from "./ZboxRules";
import { KolesoRules } from "./KolesoRules";
import {
  ACTIVE_MULT,
  DAILY_FLOOR,
  IDLE_MULT,
  RP_PROTECT_FLOOR,
  SUCHO_GRACE,
  SUCHO_MIN_ENTRY,
  TICKET_FAIL_SHARE,
  TICKET_RP_BASE,
  TICKET_RP_CAP,
  TYPE_MULT,
  leagueMult,
  spinGainMult,
  stakeFactor,
  ticketRp,
} from "@/lib/slot/rp-tickets";
import "./rp-ui.css";
import "./manual.css";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Section to jump to on open (e.g. "rp" from the SUCHO chip). */
  focus?: string | null;
  bet: number;
  desk?: DeskDay;
  mine?: DeskDay;
}

/** Slovak decimal comma for factors (1.13 → 1,13). */
const n = (v: number) => String(v).replace(".", ",");
const pct = (v: number, d = 0) => `${(v * 100).toFixed(d).replace(".", ",")} %`;

const SECTIONS: { id: string; chip: string; title: string; icon: ReactNode }[] = [
  { id: "zaklady", chip: "Základy", title: "Základy", icon: <Info size={15} /> },
  { id: "tabulka", chip: "Výherná tabuľka", title: "Výherná tabuľka", icon: <img src={PAY_SYMBOLS[PAY_SYMBOLS.length - 1].src} alt="" /> },
  { id: "symboly", chip: "Symboly", title: "Symboly", icon: <img src={canSrc(2)} alt="" /> },
  { id: "fs", chip: "4KA TV", title: "4KA TV · voľné točenia", icon: <img src={SCATTER.src} alt="" /> },
  { id: "zasah", chip: "ZÁSAH", title: "ZÁSAH", icon: <Siren size={15} /> },
  { id: "bar", chip: "Bonus bar: KONTROLA, Ž-BOX, KOLESO", title: "Bonus bar: KONTROLA, Ž-BOX a KOLESO NEŠŤASTIA", icon: <Gauge size={15} /> },
  { id: "jackpoty", chip: "Jackpoty", title: "Jackpoty", icon: <img src={TICKETS.stat.src} alt="" /> },
  { id: "tikety", chip: "Tikety", title: "Tikety", icon: <Ticket size={15} /> },
  { id: "ranky", chip: "Ranky", title: "Ranky", icon: <Trophy size={15} /> },
  { id: "rp", chip: "RP z tiketov", title: "RP z tiketov · SUCHO · denný pokles", icon: <Sparkles size={15} /> },
  { id: "duel", chip: "Versus", title: "Versus", icon: <Swords size={15} /> },
  { id: "nastavenia", chip: "Nastavenia a zvuky", title: "Nastavenia a zvuky", icon: <SettingsIcon size={15} /> },
];

function Sec({ id, children, lead }: { id: string; children: ReactNode; lead?: ReactNode }) {
  const s = SECTIONS.find((x) => x.id === id)!;
  return (
    <section id={`man-${id}`} className="man-sec" aria-labelledby={`man-h-${id}`}>
      <h3 id={`man-h-${id}`} className="man-h">
        <i aria-hidden="true">{s.icon}</i>
        {s.title}
      </h3>
      {lead ? <p className="man-lead">{lead}</p> : null}
      {children}
    </section>
  );
}

/** Two-column fact list: label → value. */
function Facts({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="man-facts">
      {rows.map(([k, v], i) => (
        <div key={i}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Mean can value and the 2–5 share, computed from the live table (never typed in). */
function canStats() {
  const tot = ORB_TABLE.reduce((s, o) => s + o.w, 0);
  const mean = ORB_TABLE.reduce((s, o) => s + o.value * o.w, 0) / tot;
  const low = ORB_TABLE.filter((o) => o.value <= 5).reduce((s, o) => s + o.w, 0) / tot;
  return { mean, low };
}

/**
 * Pravidlá: the game manual. Every number is read from the code it describes (symbols, ranks, zasah, zbox,
 * jackpot, pick-bonus, duel-deposit), so the text cannot drift from the game. Jump chips scroll inside the card.
 */
export function Paytable({ open, onClose, focus = null, bet, desk, mine }: Props) {
  const [, names] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [here, setHere] = useState("zaklady");
  useEffect(() => subscribeTicketNames(() => names((v) => v + 1)), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  // Active chip follows the scroll position.
  useEffect(() => {
    const card = cardRef.current;
    if (!open || !card) return;
    const onScroll = () => {
      const top = card.scrollTop + (navRef.current?.offsetHeight ?? 0) + 24;
      let cur = SECTIONS[0].id;
      for (const s of SECTIONS) {
        const el = card.querySelector<HTMLElement>(`#man-${s.id}`);
        if (el && el.offsetTop <= top) cur = s.id;
      }
      setHere(cur);
    };
    card.addEventListener("scroll", onScroll, { passive: true });
    return () => card.removeEventListener("scroll", onScroll);
  }, [open]);
  useEffect(() => {
    // Scroll only the chip row: scrollIntoView would also touch the card and cancel its smooth jump.
    const nav = navRef.current;
    const chip = nav?.querySelector<HTMLElement>(`[data-id="${here}"]`);
    if (nav && chip) nav.scrollTo({ left: chip.offsetLeft - (nav.clientWidth - chip.offsetWidth) / 2, behavior: "smooth" });
  }, [here]);

  useEffect(() => {
    if (!open || !focus) return;
    const t = window.setTimeout(() => {
      const card = cardRef.current;
      const el = card?.querySelector<HTMLElement>(`#man-${focus}`);
      if (!card || !el) return;
      card.scrollTo({ top: el.offsetTop - (navRef.current?.offsetHeight ?? 0) - 8 });
      setHere(focus);
    }, 60);
    return () => window.clearTimeout(t);
  }, [open, focus]);

  if (!open) return null;
  const go = (id: string) => {
    const card = cardRef.current;
    const el = card?.querySelector<HTMLElement>(`#man-${id}`);
    if (!card || !el) return;
    card.scrollTo({ top: el.offsetTop - (navRef.current?.offsetHeight ?? 0) - 8, behavior: "smooth" });
    setHere(id);
  };

  const cs = canStats();
  const fsBase = fsSpinsOf("kredit");
  const fsRanks = RANKS.filter((r) => fsSpinsOf(r.id) > fsBase).map((r) => `${r.name} ${fsSpinsOf(r.id)}`);
  const anteRank = RANKS.find((r) => anteMulOf(r.id) < ANTE_COST);
  const peekRanks = RANK_PERKS.filter((p) => p.peekCount > 0);
  const firstVip = RANKS.find((r) => (ZBOX_VIP[r.id] ?? []).length > 0);
  const modeShare = BONUS_MODES.filter((m) => m.weight > 0);
  const deadAdd = pityGain(0, true);
  const threeAdd = pityGain(3, false);
  const winSpins = (i: number) => ZASAH.WINDOWS.filter((w) => w === i).length;

  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <div ref={cardRef} className="modal-card man-card" role="dialog" aria-labelledby="pay-title" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2 id="pay-title">Pravidlá</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Zavrieť">
            ×
          </button>
        </header>
        <p className="modal-lead">
          Výhry pri stávke {formatMoney(bet)}. Demo — žiadne vklady, žiadne skutočné peniaze.
        </p>

        <nav ref={navRef} className="man-nav" aria-label="Obsah">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" data-id={s.id} className={`man-chip ${here === s.id ? "is-on" : ""}`} onClick={() => go(s.id)}>
              <i aria-hidden="true">{s.icon}</i>
              {s.chip}
            </button>
          ))}
        </nav>

        <Sec id="zaklady" lead={`Mriežka ${COLS} × ${ROWS}. Výhra je 8 a viac rovnakých symbolov kdekoľvek na mriežke, nemusia byť vedľa seba.`}>
          <ul className="man-list">
            <li>
              <b>Tumble:</b> výherné symboly zmiznú, nové spadnú zhora a reťaz pokračuje, kým je výhra. Plechovky, scatter aj lístok
              tumble prežijú.
            </li>
            <li>
              <b>Stávka:</b> od {formatMoney(BETS[0])} do {formatMoney(BETS[BETS.length - 1])}. Všetky výplaty sú násobky stávky.
            </li>
            <li>
              <b>Ante:</b> stojí {n(ANTE_COST)}× stávky{anteRank ? `, od ranku ${anteRank.name} ${anteMulOf(anteRank.id).toFixed(2).replace(".", ",")}×` : ""}. 4KA TV padá približne
              dvakrát častejšie (1 z {MATH_NOTE.bonusEvery} → 1 z {MATH_NOTE.anteBonusEvery} spinov), šancu lístka nemení.
            </li>
            <li>
              <b>Kúpa 4KA TV:</b> cena podľa počtu točení tvojho ranku: 15 točení {BUY_X_BY_FS[15]}×, 16 točení {BUY_X_BY_FS[16]}×, 17 točení {BUY_X_BY_FS[17]}× stávky. Každá kúpa vráti v priemere približne 100 % ceny. Ante sa na kúpu nevzťahuje (cena aj kúpená 4KA TV sú bez ante). Vo VERSUS je kúpa zamknutá.
            </li>
            <li>
              <b>Banery:</b> BIG WIN od {WIN_POP_X.big}× stávky, MEGA WIN od {WIN_POP_X.mega}×, SUPER MEGA WIN od {WIN_POP_X.epic}×, MASÍVNA VÝHRA od{" "}
              {WIN_POP_X.massive}×. MAX WIN {MAX_WIN_X}× je strop a ukončí 4KA TV.
            </li>
            <li>
              <b>EXEKÚCIA:</b> keď kredit klesne pod najnižšiu stávku ({formatMoney(BETS[0])}), tlačidlom EXEKÚCIA dobiješ kredit na{" "}
              {START_BALANCE.toLocaleString("sk-SK")}. Rank padne na KREDIT IV; RP, štít, séria, HLÁSENIE aj daňové obdobie sa vynulujú. Sezónne
              maximum, klienti, štatistiky a tikety ostanú.
            </li>
            <li>
              <b>Ukladanie:</b> kredit, bonus bar aj rank sa ukladajú v tomto prehliadači.
            </li>
          </ul>
          <details className="math-box">
            <summary>MATEMATIKA</summary>
            <p>
              Simulácia {MATH_NOTE.spins.toLocaleString("sk-SK")} platených spinov na engine hry, len základná hra a 4KA TV (bez bonus baru,
              ZÁSAHU, jackpotov a výhod ranku): RTP okolo {pct(MATH_NOTE.rtp, 1)}, výhra na {pct(MATH_NOTE.hit, 1)} spinov, 4KA TV 1 z{" "}
              {MATH_NOTE.bonusEvery} (s ante 1 z {MATH_NOTE.anteBonusEvery}). Kúpa za {BUY_COST_X}× (15 točení) vráti v priemere {pct(MATH_NOTE.buyEv)} ceny; 16 a 17 točení sú drahšie v rovnakom pomere. MAX WIN{" "}
              {MAX_WIN_X}×: {MATH_NOTE.maxEvery ? `približne 1 z ${MATH_NOTE.maxEvery}` : "v tejto vzorke ani raz"}. Demo s vysokou volatilitou, nie
              certifikované RTP.
            </p>
          </details>
        </Sec>

        <Sec id="tabulka" lead="Výplata podľa počtu rovnakých symbolov na mriežke: 8 až 9, 10 až 11, alebo 12 a viac.">
          <div className="pay-list">
            {[...PAY_SYMBOLS].reverse().map((s) => (
              <div key={s.id} className="pay-row">
                <img src={s.src} alt="" className="pay-ico" />
                <div>
                  <div className="pay-name">{s.name}</div>
                  <div className="man-pays">
                    <span>
                      <i>8–9</i>
                      {formatMoney(s.pays[0] * bet)}
                    </span>
                    <span>
                      <i>10–11</i>
                      {formatMoney(s.pays[1] * bet)}
                    </span>
                    <span>
                      <i>12+</i>
                      {formatMoney(s.pays[2] * bet)}
                    </span>
                  </div>
                  <div className="pay-quip">{s.quip}</div>
                </div>
              </div>
            ))}
          </div>
        </Sec>

        <Sec id="symboly">
          <div className="pay-list">
            <div className="pay-row">
              <img src={canSrc(2)} alt="" className="pay-ico" />
              <div>
                <div className="pay-name">Energy plechovka · násobič</div>
                <div className="pay-vals">
                  <span>{ORB_VALUES.map((v) => `${v}×`).join(" ")}</span>
                </div>
                <p className="man-p">
                  Hodí ju rampa, nepadá z valca. Plechovky sa sčítajú, nenásobia (50 + 100 = 150×, nie {"5\u00a0000×"}). Zapnú sa až na konci tumble
                  reťaze a len vtedy, keď bola výhra; bez výhry ostanú na mieste a nič nespravia. V základnej hre platí súčet plechoviek × celá
                  reťaz. Hodnoty 2–5× tvoria asi {pct(cs.low)} plechoviek, priemer je asi {n(+cs.mean.toFixed(1))}×.
                </p>
              </div>
            </div>
            <div className="pay-row">
              <img src={SCATTER.src} alt="" className="pay-ico" />
              <div>
                <div className="pay-name">{SCATTER.name} · scatter</div>
                <div className="man-pays">
                  {[4, 5, 6].map((c, i) => (
                    <span key={c}>
                      <i>{c === 6 ? "6+" : c}</i>
                      {formatMoney(SCATTER.pays[i] * bet)} + {fsTriggerSpins(c, fsBase)}{c === 6 ? "+" : ""} FS
                    </span>
                  ))}
                </div>
                <p className="man-p">
                  {FS_TRIGGER_SCATTERS} a viac kdekoľvek, aj počas tumble, spustí 4KA TV (pozri <a onClick={() => go("fs")}>4KA TV</a>).
                </p>
              </div>
            </div>
            <div className="pay-row">
              <img src={TICKETS.ulica.src} alt="" className="pay-ico" />
              <div>
                <div className="pay-name">LÍSTOK · kľúč k jackpotu</div>
                <div className="pay-vals">
                  <span>SIVÝ {ticketLabel("ulica")}</span>
                  <span>MODRÝ {ticketLabel("okres")}</span>
                  <span>FIALOVÝ {ticketLabel("kraj")}</span>
                  <span>ZLATÝ {ticketLabel("stat")}</span>
                </div>
                <p className="man-p">
                  Neráta sa do 8+ ani do násobiča, najviac 1 na spin. Len od stávky {POOL_ELIGIBLE_BET} (pozri <a onClick={() => go("jackpoty")}>Jackpoty</a>).
                </p>
              </div>
            </div>
            <div className="pay-row">
              <img src={FS_SYMBOL.src} alt="" className="pay-ico" />
              <div>
                <div className="pay-name">{FS_SYMBOL.name}</div>
                <p className="man-p">
                  Počas ZÁSAHU obsadí jeden symbol. Okno na ňom je zásah proti tebe (pozri <a onClick={() => go("zasah")}>ZÁSAH</a>).
                </p>
              </div>
            </div>
          </div>
        </Sec>

        <Sec id="fs" lead={`${FS_TRIGGER_SCATTERS} a viac scatterov ${SCATTER.name} kdekoľvek na mriežke, aj počas tumble.`}>
          <Facts
            rows={[
              [`${FS_TRIGGER_SCATTERS} scattery`, `${fsBase} voľných točení${fsRanks.length ? ` (rank ${fsRanks.join(", ")})` : ""}`],
              ["Každý ďalší scatter", `+${FS_EXTRA_PER_SCATTER} točenia (6 scatterov = ${fsTriggerSpins(6, fsBase)})`],
              [`${FS_RETRIGGER_SCATTERS}+ scattery vo 4KA TV`, `+${FS_RETRIGGER} točení`],
              ["Kúpa", `${BUY_X_BY_FS[15]}× / ${BUY_X_BY_FS[16]}× / ${BUY_X_BY_FS[17]}× stávky (15 / 16 / 17 točení)`],
              ["Strop", `MAX WIN ${MAX_WIN_X}× ukončí 4KA TV`],
            ]}
          />
          <ul className="man-list">
            <li>
              <b>Mbps (násobič 4KA TV):</b> plechovka na výhernom spine sa najprv pripočíta k Mbps (50 + 5 = 55) a výhra spinu sa vyplatí 55×.
              Výhra bez novej plechovky platí bez Mbps. Bez výhry plechovka nič nespraví.
            </li>
            <li>Scatter ostane na mriežke, kým 4KA TV nezačne. Keď naraz padne aj lístok, ceremónia jackpotu počká na koniec 4KA TV.</li>
            <li>
              4KA TV spustená spinom ZÁSAHU platí každú výhru ×{ZASAH_FS_MUL} (nie pri kúpe).
            </li>
          </ul>
        </Sec>

        <Sec id="zasah" lead={`HLÁSENIE plnia výhry (väčší násobok stávky = rýchlejšie, mŕtvy spin nič). Pri ${HEAT_MAX} začne na ďalšom platenom spine ZÁSAH.`}>
          <Facts
            rows={[
              ["Dĺžka", `${ZASAH.SPINS} spinov za bežnú stávku, výhry ×${n(ZASAH.BOOST)}`],
              ["Finančná správa", "na celý ZÁSAH obsadí jeden symbol (aj 4KA TV)"],
              ["Okná za spin", `1 (${winSpins(1)} spiny), 2 (${winSpins(2)} spiny), 3 (${winSpins(3)} spiny)`],
              ["HIT", `okno na cieľovom symbole, alebo ho okno zameria samo (${pct(ZASAH.LOCK_P, 1)})`],
              ["Zásah", "okno na symbole Finančnej správy"],
            ]}
          />
          <div className="man-outcomes">
            <div className="is-good">
              <b>UNIKOL SI</b>
              <span>
                {ZASAH.HITS} HITy · {ZASAH.MOD_SPINS} spinov BEZ DANE +{pct(ZASAH.ESCAPE_MUL - 1)} · +{ZASAH.RP.escape} RP
              </span>
            </div>
            <div className="is-bad">
              <b>DAŇOVÝ ÚNIK</b>
              <span>
                {ZASAH.STRIKES} zásahy · {ZASAH.MOD_SPINS} spinov −{pct(1 - ZASAH.UNIK_MUL)} · {ZASAH.RP.unik} RP
              </span>
            </div>
            <div>
              <b>TAK-TAK</b>
              <span>ani jedno do konca · +{ZASAH.RP.neutral} RP</span>
            </div>
          </div>
          <ul className="man-list">
            <li>Daňové obdobie (±23 %) platí na každú výplatu okrem spinov ZÁSAHU a VERSUS. Odpočítava sa na platených spinoch, vo 4KA TV aj pri kúpe.</li>
            <li>Počas ZÁSAHU stávku nezvýšiš, AUTO sa zastaví. Vo 4KA TV a vo VERSUS sa ZÁSAH nespustí.</li>
          </ul>
        </Sec>

        <Sec
          id="bar"
          lead={`Bonus bar má vlastný stav pre každú stávku (0 – ${PITY_GOAL}). Mŕtvy spin +${deadAdd}, ${FS_TRIGGER_SCATTERS - 1} scattery +${threeAdd} (${FS_TRIGGER_SCATTERS} spustia 4KA TV, bar nič). Výhry bar neplnia.`}
        >
          <ul className="man-list">
            <li>
              Plný bar hneď vylosuje režim {modeShare.map((m) => m.label).join(" alebo ")} (každý {modeShare.length === 3 ? "1/3" : `1/${modeShare.length}`}) a uloží ho; obnovenie stránky
              ho nezmení. Bar spadne na 0. Kúpiť sa nedá.
            </li>
            <li>Vo 4KA TV a vo VERSUS sa bar neplní. Bonus sa odohrá mimo 4KA TV a VERSUS a platí na stávku, na ktorej sa bar naplnil.</li>
            <li>Všetky {modeShare.length} režimy majú pre každý rank rovnakú priemernú výhru.</li>
          </ul>
          <h4 className="man-sub">
            <img src="/symbols/park.svg" alt="" /> KONTROLA · parkovné
          </h4>
          <p className="man-p">
            {PICK_BAYS} parkovacích miest, z toho 3 ODŤAHY. Ťukáš, kým nenarazíš na odťah. Za miesto: LÍSTOK 0,2–1×, ZÓNA 1,5×, POKUTA 2× alebo 5× stávky.
          </p>
          <Facts
            rows={peekRanks.map((p) => [
              RANKS.find((r) => r.id === p.id)?.name ?? p.id,
              p.peekCount > 1 ? `ukáže ${p.peekCount} ceny bezpečných miest (do ${n(p.peekCap)}×)` : `ukáže cenu 1 bezpečného miesta do ${n(p.peekCap)}×`,
            ])}
          />
          <h4 id="man-zbox" className="man-sub">
            <img src="/zbox/parcel.webp" alt="" /> Ž-BOX · Pakeťák
          </h4>
          <ZboxRules />
          {firstVip ? (
            <Facts
              rows={RANKS.filter((r) => (ZBOX_VIP[r.id] ?? []).length).map((r) => [
                r.name,
                `prioritná zásielka ${(ZBOX_VIP[r.id] ?? []).map((x) => `${n(x)}×`).join(" + ")}`,
              ])}
            />
          ) : null}
          <h4 id="man-koleso" className="man-sub">
            <img src="/koleso/hub.webp" alt="" /> KOLESO NEŠŤASTIA · s Petrom Marcipánom
          </h4>
          <KolesoRules />
          <Facts rows={RANKS.map((r) => [r.name, `Sponzorský šek +${n(KOLESO_VIP[r.id] ?? 0)}× stávky`])} />
          <p className="man-p">Všetky postavy (Peter Marcipán, Jožo Pročkár, Betka Frekvencová, Lukáš Adapter, JUDr. Zabavil, Daňová Danka, Kuriér Nezastihol) sú vymyslené paródie.</p>
        </Sec>

        <Sec id="jackpoty" lead={`Štyri spoločné poty pre všetkých hráčov. Padnú len cez LÍSTOK a len pri stávke od ${POOL_ELIGIBLE_BET} (kúpa 4KA TV sa ráta vždy).`}>
          <div className="man-pots">
            {TIERS.map((t) => (
              <div key={t.id} className={`is-${t.id}`}>
                <img src={TICKETS[t.id].src} alt="" />
                <b>{t.name}</b>
                <span>
                  {t.seed.toLocaleString("sk-SK")} → max {t.cap.toLocaleString("sk-SK")}
                </span>
                {t.winnerShare < 1 ? <em>výherca {pct(t.winnerShare)}</em> : null}
              </div>
            ))}
          </div>
          <ul className="man-list">
            <li>Lístok padne až po dokončení tumble, nikdy uprostred reťaze. Neráta sa do 8+ ani do násobiča.</li>
            <li>Každý pot má skrytý prah. Keď ho pot prekročí, musí padnúť do {MUST_HIT_SPINS} spinov. Po výhre začína znova od štartovej hodnoty.</li>
            <li>Lístok vo 4KA TV počká; ceremónia príde po jej konci.</li>
          </ul>
        </Sec>

        <Sec id="tikety" lead="Úlohy so vkladom: splníš cieľ v limite točení a tiket vyplatí výhru. Dajú sa brať pri akomkoľvek kredite, vklad sa riadi kreditom.">
          <ul className="man-list">
            <li>
              <b>Dokopy</b> = súčet, nemusí ísť po sebe. Po sebe sú len REŤAZ (mŕtvy spin rad vynuluje) a SUCHO (výhra tiket hneď ukončí).
            </li>
            <li>Tikety so 4KA TV (TACHYKARDIA, PLECHOVKY) sa plnia len vo 4KA TV, POHOTOVOSŤ len v kúpenej 4KA TV.</li>
            <li>
              Tikety na ZÁSAH, bonus bar, KONTROLU a Ž-BOX rátajú platené spiny základnej hry (spiny ZÁSAHU áno, 4KA TV nie). ZÁSAH alebo bonus,
              ktorý začal včas, sa dohrá aj po poslednom točení.
            </li>
            <li>Kým beží tiket, stávka je zamknutá. Vo VERSUS sa tikety neberú.</li>
          </ul>
        </Sec>

        <Sec id="ranky" lead={`Liga: ${RANKS.map((r) => r.name).join(" → ")}. Hlavný zdroj RP sú splnené tikety (pozri RP z tiketov). Výhry v eurách pridávajú, mŕtve spiny a prehratá kúpa berú.`}>
          <div className="man-ranks">
            {RANKS.map((r) => {
              const p = RANK_PERKS.find((x) => x.id === r.id);
              return (
                <div key={r.id} style={{ ["--rc" as string]: r.color }}>
                  <b>
                    {r.name}
                    <small>{r.divisions > 1 ? `${r.divisions} divízie` : "1 divízia"}</small>
                  </b>
                  <span>{p?.detail}</span>
                </div>
              );
            })}
          </div>
          <ul className="man-list">
            <li>Raz za 7 dní klesneš o jednu divíziu. Dlhá pauza zoberie najviac jednu skupinu.</li>
            <li>
              Cashback (od OPTIKA): z mŕtveho spinu vráti percento stávky, najviac {REBATE_CAP_BETS} stávok za {REBATE_WINDOW} spinov.
            </li>
            <li>Prehratá kúpa ťa v ranku stojí ako {buyDeadEquiv(BUY_COST_X)} mŕtvych spinov, najviac 1 divíziu.</li>
          </ul>
        </Sec>

        <Sec
          id="rp"
          lead={`Splnený tiket dá pevné RP podľa ceny, ligy a typu. Výhry na spinoch RP stále dávajú, ale vo vyšších ligách bez tiketu menej. Kredit, výhry ani RTP sa tým nemenia, mení sa len RP.`}
        >
          <Facts
            rows={[
              ["Základ tiketu", `lacný ${TICKET_RP_BASE.lacna} · stredný ${TICKET_RP_BASE.stred} · drahý ${TICKET_RP_BASE.draha} RP`],
              ["Liga", `× ${n(leagueMult(0))} (KREDIT) až × ${n(leagueMult(10))} (NEKONEČNO), +0,1 za každý stupeň`],
              [
                "Typ",
                `2 ciele × ${n(TYPE_MULT.twoGoal)} · základ + 4KA TV × ${n(TYPE_MULT.dual)} · feature (ZÁSAH, bonus bar) × ${n(TYPE_MULT.feature)} · OTRS × ${n(TYPE_MULT.mystery)} · denný tiket +${Math.round((TYPE_MULT.daily - 1) * 100)} %`,
              ],
              ["Stávka", `× ${n(+stakeFactor(0.2).toFixed(2))} pri 0,20 € až × 1 pri 1 000 € (malé stávky dajú menej)`],
              ["Strop", `${TICKET_RP_CAP.toLocaleString("sk-SK")} RP za jeden tiket`],
              ["Nesplnený tiket", `−${Math.round(TICKET_FAIL_SHARE * 100)} % z RP, ktoré by dal (aj keď ho ukončí málo kreditu)`],
            ]}
          />
          <div className="man-rp" role="table" aria-label="RP podľa ligy">
            <div role="row" className="is-head">
              <span role="columnheader">Liga</span>
              <span role="columnheader">Denný stredný 100 €</span>
              <span role="columnheader">Spin bez tiketu</span>
              <span role="columnheader">Spin s tiketom</span>
            </div>
            {RANKS.map((r) => {
              const ex = ticketRp({ floor: "stred", stake: 100, template: "", mystery: false }, r.id);
              return (
                <div role="row" key={r.id} style={{ ["--rc" as string]: r.color }}>
                  <b role="cell">{r.name}</b>
                  <span role="cell">
                    +{ex.ok} <em>/ −{Math.abs(ex.fail)}</em>
                  </span>
                  <span role="cell">× {n(IDLE_MULT[r.id] ?? 1)}</span>
                  <span role="cell">× {n(spinGainMult(r.id, true))}</span>
                </div>
              );
            })}
          </div>
          <ul className="man-list">
            <li>
              RP sa ukáže na karte tiketu: <b>+RP</b> za splnenie a <b>−RP</b> za neúspech. Pri OTRS uvidíš presné číslo hneď po prijatí.
            </li>
            <li>
              Kým beží tiket, výhry na spinoch dávajú najmenej × {n(ACTIVE_MULT)} RP. Strata RP za mŕtvy spin sa nemení. Každá výhra dá aspoň 1 RP.
            </li>
            <li>
              <b>SUCHO</b> (od ligy {RANKS.find((r) => r.entry >= SUCHO_MIN_ENTRY)?.name}): po {SUCHO_GRACE} platených spinoch bez tiketu ťa každý ďalší stojí −1 RP. Ukazovateľ pod rankom
              odpočítava. Tiket SUCHO zastaví, splnený tiket ho vynuluje, nesplnený nie. Spiny ZÁSAHU, 4KA TV a VERSUS sa nerátajú.
            </li>
            <li>
              <b>Denný pokles</b>: ak si v daný deň hral a nesplnil žiadny tiket, na ďalší deň stratíš 1 % z RP nad {DAILY_FLOOR.toLocaleString("sk-SK")}. Deň bez hry sa
              neráta (platí len týždenný drop).
            </li>
            <li>SUCHO ani denný pokles ťa nestiahnu pod {RP_PROTECT_FLOOR.toLocaleString("sk-SK")} RP.</li>
          </ul>
        </Sec>

        <Sec id="duel" lead="DUEL (2), TRIPLE THREAT (3) alebo FANTASTIC FOUR (4 hráči) pri jednom stole (jeden kredit, telefón koluje) alebo online cez kód. Hra štartuje, keď je miestnosť plná. Všetci točia rovnakou stávkou aj ante.">
          <Facts
            rows={[
              ["Dĺžka", "5, 10 alebo 20 točení"],
              ["Skóre", "súčet výhier; víťaz berie celý bank (výhry všetkých). Remíza dvoch hráčov: každý má svoje; remíza na čele pri 3–4 hráčoch: bank sa delí"],
              ["Kaucia", `${DUEL_DEPOSIT_MULT}× stávka; vráti sa po dohraní aj pri remíze, prepadne pri odchode, VZDAŤ a neaktivite`],
              ["Chyba hry / odchod súperov", "kaucia sa vráti; pri 3–4 hráčoch kto vzdá, vypadne a jeho výhry ostávajú v banku"],
            ]}
          />
          <p className="man-p man-off">
            <b>Vo VERSUS je vypnuté:</b> kúpa 4KA TV, ZÁSAH (HLÁSENIE sa neplní), bonus bar KONTROLA · Ž-BOX · KOLESO (neplní sa, čakajúci bonus počká na koniec
            hry), daňové obdobie ±23 %, extra plechovka NEKONEČNA a tikety.
          </p>
        </Sec>

        <Sec id="nastavenia">
          <Facts
            rows={[
              [
                <span className="man-ico" key="v">
                  <Volume2 size={14} /> Zvuk
                </span>,
                "stlmí alebo zapne všetky zvuky",
              ],
              ["QUICK / TURBO", "rýchlejšie spiny; zapnutie jedného vypne druhé (Ž-BOX aj KOLESO v TURBO bežia asi 2× rýchlejšie)"],
              ["AUTO", `10, 25, 50 alebo 100 spinov. Výhra a bonus AUTO len pozastavia, po odkliknutí pokračuje. ZÁSAH zostane na ručnom točení. Pod polovicou kreditu, jackpot a málo kreditu AUTO zastavia.`],
              [
                <span className="man-ico" key="s">
                  <SettingsIcon size={14} /> Nastavenia
                </span>,
                "cloudová záloha štatistík (predvolene vypnutá), vymazanie lokálnych štatistík, vysvetlenie Ž-BOXu a KOLESA zapnúť / vypnúť, obálky v KOLESE",
              ],
              ["Uloženie", "EXPORT a IMPORT v Nastaveniach. Prenesie kredit, hodnosť, lístok a rozohratú hru, keď sa medzi odkazmi neprenesie sám."],
              [
                <span className="man-ico" key="b">
                  <BarChart3 size={14} /> Štatistiky · <Trophy size={14} /> Rebríček
                </span>,
                "tvoja história hry a poradie hráčov",
              ],
            ]}
          />
          <p className="man-p">Hlasitosť jednotlivých zvukov a vlastné zvuky mení len admin (s heslom); platia pre všetkých hráčov.</p>
          <p className="man-p pt-satire">
            Satira. Akákoľvek podobnosť s reálnymi doručovacími službami je zveličená pre zábavu. Všetky balíky, e-shopy a čísla zásielok v hre sú
            fiktívne a doručené včas.
          </p>
        </Sec>
        {desk && mine ? (
          <section className="man-sec man-bank" aria-label="Park Bank dnes">
            <div className="atm-desk in-info" aria-label="Dnešný counter automatu">
              <header>
                <span>PARK BANK</span>
                <b>DNES</b>
              </header>
              <p className="atm-kicker">COUNTER AUTOMATU · VŠETCI HRÁČI · ťukni aj na poty</p>
              <dl>
                <div>
                  <dt>PRETOČENÉ</dt>
                  <dd>{formatMoney(desk.wagered)}</dd>
                  <dd className="atm-me">TY {formatMoney(mine.wagered)}</dd>
                </div>
                <div>
                  <dt>VÝHRY</dt>
                  <dd>{formatMoney(desk.paid)}</dd>
                  <dd className="atm-me">TY {formatMoney(mine.paid)}</dd>
                </div>
                <div>
                  <dt>MAX</dt>
                  <dd>{formatMoney(desk.best)}</dd>
                  <dd className="atm-me">TY {formatMoney(mine.best)}</dd>
                </div>
              </dl>
              <p className="atm-kicker atm-ticket-kicker">TIKETY · LEN TY · MIMO OBRATU</p>
              <dl className="atm-tickets">
                <div>
                  <dt>VYHRANÉ</dt>
                  <dd>{formatMoney(mine.ticketWon)}</dd>
                  <dd className="atm-me">zisk · výhra − vklad</dd>
                </div>
                <div>
                  <dt>PREHRANÉ</dt>
                  <dd className="is-loss">{formatMoney(mine.ticketLost)}</dd>
                  <dd className="atm-me">vklad nesplneného tiketu</dd>
                </div>
              </dl>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
