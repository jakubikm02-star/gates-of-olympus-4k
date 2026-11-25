import { useEffect, useRef, useState } from "react";
import { FAMILY_NAME, metaOf, RARITY_NAME, rarityOf } from "@/lib/revier/depth";
import { claimChallenges, loadChallenges, saveChallenges, viewChallenges, bratislavaDay, type ChallengeView } from "@/lib/revier/challenges";
import { buyPerk, grantScrews, loadDielna, respec, saveDielna, type Dielna, type PerkTrack } from "@/lib/revier/dielna";
import { actionById } from "@/lib/revier/guide";
import { EQUIP_PRICE, HEAL_GAIN, HEAL_PRICE, HEAL_STOCK, HOLD_PRICE, REEL5_PRICE, REEL_PRICE, REMOVE_PRICE, SUPPORT_PRICE, UPGRADE_PRICE, aspectKind, floorInfo, rerollCost, symDef, symMark } from "@/lib/revier/symbols";
import { muffleMusic, playSoftHit, setNsSfx } from "@/lib/slot/audio";
import type { NocnaRecord, Run, SymId } from "@/lib/revier/types";
import { useRevier, type Stage } from "@/hooks/use-revier";
import { preloadNocna } from "@/nocna/preload";
import type { FightHandle } from "@/nocna/fight-types";
import { ActButton, Breakdown, DetailSheet, DielnaPanel, GuideSheet, LoadoutPicker } from "./MetaPanels";
import "./nocna.css";

interface Props {
  entry: number;
  record: NocnaRecord | null;
  onRecord: (run: Run) => void;
  onExit: () => void;
}

const FIGHT: Stage[] = ["ready", "spin", "preview", "act", "enemy"];

export function NocnaSmena(props: Props) {
  const [dielna, setDielna] = useState<Dielna>(() => loadDielna());
  const [challenges, setChallenges] = useState<ChallengeView[]>(() => viewChallenges(loadChallenges(), bratislavaDay()));
  const [claimed, setClaimed] = useState<string[]>([]);
  const [detail, setDetail] = useState<string | null>(null);
  const [guide, setGuide] = useState(false);
  const v = useRevier({ ...props, meta: dielna.perks, loadout: dielna.loadout });
  const host = useRef<HTMLDivElement>(null);
  const fightRef = useRef<FightHandle | null>(null);
  const [gear, setGear] = useState(false);
  const [sfxVol, setSfxVol] = useState(55);
  const [box, setBox] = useState({ w: 412, h: 915 });
  const kind = aspectKind(box.w, box.h);
  const info = floorInfo(v.run.floor);
  const showFight = FIGHT.includes(v.stage);
  const fps = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("fps");
  const paid = useRef(false);
  useEffect(() => {
    if (v.stage !== "dead") {
      paid.current = false;
      return;
    }
    if (paid.current) return;
    paid.current = true;
    const day = bratislavaDay();
    const claim = claimChallenges(loadChallenges(day), v.run, day);
    saveChallenges(claim.state);
    setClaimed(claim.titles);
    setChallenges(viewChallenges(claim.state, day));
    setDielna((prev) => {
      const next = grantScrews(prev, v.run.stats.bestFloor || v.run.floor, v.run.stats.kills);
      const withChallenges = { ...next, screws: next.screws + claim.gained };
      saveDielna(withChallenges);
      return withChallenges;
    });
  }, [v.stage, v.run]);
  useEffect(() => {
    if (v.stage !== "banner" || v.run.deck.length !== 6) return;
    setDielna((prev) => {
      if (prev.loadout.join() === v.run.deck.join()) return prev;
      const next = { ...prev, loadout: v.run.deck.slice() };
      saveDielna(next);
      return next;
    });
  }, [v.stage, v.run.deck]);
  const keep = (next: Dielna) => {
    const clean = { ...next, name: next.name.slice(0, 18) };
    saveDielna(clean);
    setDielna(clean);
  };

  useEffect(() => {
    const danger = v.run.hp > 0 && v.run.hp / Math.max(1, v.run.maxHp) <= 0.25 && v.stage !== "dead" && v.stage !== "draft";
    const hot = danger || (v.suspense && v.stage === "spin");
    if (!hot) {
      muffleMusic(false);
      return;
    }
    muffleMusic(danger);
    const timer = window.setInterval(() => playSoftHit("heart"), danger ? 720 : 880);
    return () => {
      window.clearInterval(timer);
      muffleMusic(false);
    };
  }, [v.run.hp, v.run.maxHp, v.suspense, v.stage]);

  useEffect(() => {
    void preloadNocna();
    const meta = document.querySelector('meta[name="color-scheme"]') ?? document.head.appendChild(document.createElement("meta"));
    meta.setAttribute("name", "color-scheme");
    const prev = meta.getAttribute("content");
    meta.setAttribute("content", "only dark");
    const root = document.documentElement;
    const prevScheme = root.style.colorScheme;
    root.style.colorScheme = "only dark";
    return () => {
      if (prev) meta.setAttribute("content", prev);
      else meta.remove();
      root.style.colorScheme = prevScheme;
    };
  }, []);

  const act = useRef(v.primary.run);
  act.current = v.primary.run;
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const g = globalThis as { __ns?: { stage: string; fx: (on: boolean) => void } };
    g.__ns = {
      get stage() {
        return document.querySelector(".ns")?.getAttribute("data-stage") ?? "";
      },
      fx: (on: boolean) => fightRef.current?.setEffects(on),
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== " " && e.key !== "Enter") || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      e.preventDefault();
      act.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const read = () => {
      const vv = window.visualViewport;
      setBox({ w: Math.round(vv?.width ?? window.innerWidth), h: Math.round(vv?.height ?? window.innerHeight) });
    };
    read();
    window.addEventListener("resize", read);
    window.visualViewport?.addEventListener("resize", read);
    return () => {
      window.removeEventListener("resize", read);
      window.visualViewport?.removeEventListener("resize", read);
    };
  }, []);

  useEffect(() => {
    if (!showFight || !host.current) return;
    let dead = false;
    let stage: FightHandle | null = null;
    void import("@/nocna/pixi/fight-stage").then(async ({ FightStage }) => {
      if (dead || !host.current) return;
      stage = await FightStage.mount(host.current);
      fightRef.current = stage;
      v.bindFight(stage);
    });
    return () => {
      dead = true;
      fightRef.current = null;
      v.bindFight(null);
      stage?.destroy();
    };
  }, [showFight]);

  return (
    <div
      className={`ns is-${kind}${v.who === "foe" ? " is-foe" : " is-you"}`}
      data-stage={v.stage}
      onPointerDown={() => {
        if (v.bubble) v.closeBubble();
        if (v.stage === "act" || v.stage === "enemy") v.hurry();
      }}
    >
      {showFight ? null : (
      <header className="ns-hud">
        <div>
          <small>{showFight ? (v.run.floor >= 6 ? "R" : v.run.floor) : `POSCHODIE ${v.run.floor >= 6 ? "R" : v.run.floor}`}</small>
          {showFight ? null : <b>{info.name}</b>}
        </div>
        {showFight ? (
          <strong className={v.who === "foe" ? "is-foe" : ""}>
            {v.stage === "enemy" ? "ŤAH NEPRIATEĽA" : v.stage === "spin" ? "TOČÍ SA" : v.stage === "shop" ? "OBCHOD" : "TVOJ ŤAH"}
          </strong>
        ) : (
          <span />
        )}
        <div className="ns-purse" data-coins>
          <img src="/nocna/ui/ui-coin.webp" alt="" />
          {v.run.coins}
        </div>
        <button type="button" className="ns-quit" onClick={v.giveUp}>
          {v.stage === "draft" ? "Späť" : "Vzdať"}
        </button>
      </header>
      )}

      {showFight ? <div className="ns-gl" ref={host} /> : null}

      {v.stage === "bench" ? (
        <DielnaPanel
          dielna={dielna}
          challenges={challenges}
          onName={(name) => keep({ ...dielna, name })}
          onBuy={(id: SymId, track: PerkTrack) => keep(buyPerk(dielna, id, track))}
          onRespec={(from, to, track) => keep(respec(dielna, from, to, track))}
          onGuide={() => setGuide(true)}
        />
      ) : null}

      {v.stage === "draft" ? (
        <LoadoutPicker picks={v.run.picks} onToggle={v.toggle} onInfo={v.openBubble} />
      ) : null}

      {v.stage === "shop" && v.run.shop ? (
        <Shop
          run={v.run}
          onBuy={v.buy}
          onReroll={v.reroll}
          onRemove={v.remove}
          onFace={v.face}
          onUpgrade={v.upgrade}
          onTrain={v.train}
          onPro={v.pro}
          onFortify={v.fortify}
          onHeal={v.heal}
          onKeys={v.keys}
          onStamp={v.stamp}
          onEquip={v.equip}
          onBubble={v.openBubble}
        />
      ) : null}

      {v.stage === "banner" ? (
        <section className="ns-plate ns-banner">
          <small>{v.run.floor >= 6 ? "RÁNO" : `${v.run.floor}. POSCHODIE`}</small>
          <h2>{info.name}</h2>
        </section>
      ) : null}

      {v.stage === "dead" ? <Breakdown run={v.run} challenges={challenges} claimed={claimed} /> : null}

      {v.hint && !showFight && v.stage !== "draft" ? (
        <button type="button" className="ns-hint" onClick={v.dismissHint}>
          {v.hint}
        </button>
      ) : null}

      <button type="button" className="ns-gear" aria-label="Nastavenie" onClick={() => setGear((g) => !g)}>
        ⚙
      </button>
      {gear ? (
        <div className="ns-pop" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => setGuide(true)}>
            Ako to funguje
          </button>
          <button type="button" className={v.rychlo ? "is-on" : ""} onClick={() => v.setRychlo(!v.rychlo)} aria-pressed={v.rychlo}>
            Rýchlo
          </button>
          <button type="button" onClick={() => v.setShake(v.shake === 0 ? 0.5 : v.shake === 0.5 ? 1 : 0)}>
            Tras {Math.round(v.shake * 100)}
          </button>
          <button type="button" className={v.calm ? "is-on" : ""} onClick={() => v.setCalm(!v.calm)} aria-pressed={v.calm}>
            Kľud
          </button>
          <label className="ns-sfx">
            Zvuk {sfxVol}
            <input
              type="range"
              min={0}
              max={100}
              value={sfxVol}
              aria-label="Hlasitosť úderov"
              onChange={(e) => {
                const next = Number(e.target.value);
                setSfxVol(next);
                setNsSfx(next / 100);
              }}
            />
          </label>
          {v.stage === "shop" && v.run.shop ? (
            <>
              <button type="button" disabled={v.run.coins < REMOVE_PRICE || v.run.deck.length <= 3} onClick={() => v.remove(v.run.deck.length - 1)}>
                Vyradiť {REMOVE_PRICE}
              </button>
              <button type="button" disabled={v.run.coins < rerollCost(v.run.shop.rolls)} onClick={v.reroll}>
                Premiešať {rerollCost(v.run.shop.rolls)}
              </button>
              <button type="button" disabled={v.run.coins < HEAL_PRICE || v.run.shop.heals >= HEAL_STOCK || v.run.hp >= v.run.maxHp} onClick={v.heal}>
                Život {HEAL_PRICE}
              </button>
              <button type="button" disabled={v.run.reels >= 4 || v.run.floor < 3 || v.run.coins < REEL_PRICE} onClick={v.fourth}>
                4. valec {v.run.floor < 3 ? "od 3" : REEL_PRICE}
              </button>
              <button type="button" disabled={v.run.reels !== 4 || v.run.floor < 4 || v.run.coins < REEL5_PRICE} onClick={v.fifth}>
                5. valec {REEL5_PRICE}
              </button>
              <button type="button" disabled={v.run.coins < SUPPORT_PRICE || v.run.keys >= 2} onClick={v.keys}>
                Kľúče {SUPPORT_PRICE}
              </button>
              <button type="button" disabled={v.run.coins < SUPPORT_PRICE || v.run.stamp} onClick={v.stamp}>
                Pečiatka {SUPPORT_PRICE}
              </button>
              <button type="button" disabled={v.run.coins < EQUIP_PRICE || v.run.equip.includes("uder") || v.run.equip.length >= 2} onClick={() => v.equip("uder")}>
                Sila {EQUIP_PRICE}
              </button>
              <button type="button" disabled={v.run.coins < EQUIP_PRICE || v.run.equip.includes("stit") || v.run.equip.length >= 2} onClick={() => v.equip("stit")}>
                Odolnosť {EQUIP_PRICE}
              </button>
            </>
          ) : null}
          <button type="button" onClick={v.giveUp}>
            {v.stage === "draft" ? "Späť" : "Vzdať"}
          </button>
        </div>
      ) : null}
      {showFight ? (
        <div className="ns-meter" aria-label="Výboj">
          <i style={{ width: `${Math.min(100, v.run.super)}%` }} />
          <span>VÝBOJ {v.run.super}{v.run.momentum > 0 ? ` · SÉRIA +${v.run.momentum}` : ""}</span>
        </div>
      ) : null}
      {v.stage === "ready" && v.run.enemy?.dj ? (
        <div className="ns-risk ns-band">
          <button type="button" className={v.run.enemy.dj.focus < 0 ? "is-on" : ""} onClick={() => v.focusClone(-1)}>
            DJ
          </button>
          {v.run.enemy.dj.clones.map((clone, i) =>
            clone.hp > 0 ? (
              <button key={i} type="button" className={v.run.enemy?.dj?.focus === i ? "is-on" : ""} onClick={() => v.focusClone(i)}>
                KLON {i + 1} {clone.hp}
              </button>
            ) : null,
          )}
        </div>
      ) : null}
      {v.stage === "ready" ? (
        <div className="ns-risk">
          <ActButton id="vyboj" disabled={v.run.super < 100} onClick={v.burst} onInfo={() => setDetail("vyboj")} extra={`Výboj ${v.run.super}/100. Prieboj ${26 + v.run.momentum * 2}.`} />
          <ActButton id="allin" disabled={v.run.hp <= 18 || v.run.wager > 1} onClick={v.wager} onInfo={() => setDetail("allin")} />
          <ActButton id="zamok" disabled={v.run.coins < HOLD_PRICE || !v.run.lastLands.length} onClick={() => v.hold(0)} onInfo={() => setDetail("zamok")} />
        </div>
      ) : null}
      <button
        type="button"
        className="ns-go"
        disabled={v.primary.disabled}
        onClick={() => {
          fightRef.current?.pump();
          v.primary.run();
        }}
      >
        {v.primary.label}
      </button>

      {detail && actionById(detail) ? <DetailSheet entry={actionById(detail)!} onClose={() => setDetail(null)} /> : null}
      {guide ? <GuideSheet onClose={() => setGuide(false)} /> : null}
      {v.bubble ? (
        <div className="ns-bubble" role="dialog" onPointerDown={(e) => e.stopPropagation()}>
          <b>{titleOf(v.bubble.title)}</b>
          <p>{v.bubble.text}</p>
        </div>
      ) : null}
      {fps ? <Fps /> : null}
    </div>
  );
}

function titleOf(id: string) {
  return symDef(id as SymId)?.name ?? id;
}

function lineOf(blurb: string) {
  const cut = blurb.split(". ")[0] ?? blurb;
  return cut.endsWith(".") ? cut : `${cut}.`;
}

function Shop(props: {
  run: ReturnType<typeof useRevier>["run"];
  onBuy: (i: number) => void;
  onReroll: () => void;
  onRemove: (i: number) => void;
  onFace: (i: number) => void;
  onUpgrade: (sym: SymId) => void;
  onTrain: (sym: SymId) => void;
  onPro: (sym: SymId) => void;
  onFortify: (sym: SymId) => void;
  onHeal: () => void;
  onKeys: () => void;
  onStamp: () => void;
  onEquip: (id: "uder" | "stit") => void;
  onBubble: (title: string, text: string) => void;
}) {
  const shop = props.run.shop;
  const [edit, setEdit] = useState<SymId | null>(null);
  if (!shop) return null;
  const counts = new Map<SymId, number>();
  for (const id of props.run.deck) counts.set(id, (counts.get(id) ?? 0) + 1);
  const rows = [...counts.entries()];
  const price = rerollCost(shop.rolls);
  return (
    <section className="ns-plate ns-shop" aria-label="Obchod">
      <h2>OBCHOD</h2>
      <p className="ns-pity">Istota vyššej karty {Math.min(4, props.run.pity)}/4</p>
      <div className="ns-offers">
        {shop.offers.map((offer, i) => {
          const def = symDef(offer.sym);
          const rarity = rarityOf(offer.sym);
          if (!def) return null;
          return (
            <button key={`${offer.sym}-${i}`} type="button" className={`ns-offer is-${rarity}${offer.sym === "pokuta" ? " is-pokuta" : ""}`} disabled={props.run.coins < offer.price} onClick={() => props.onBuy(i)}>
              <img src={def.art} alt="" />
              <b>{def.name}</b>
              <small>{RARITY_NAME[rarity]}</small>
              <em>{lineOf(def.blurb)}</em>
              <span className="ns-price">{offer.price} RJ</span>
            </button>
          );
        })}
      </div>
      <div className="ns-shop-row">
        <button type="button" className="ns-act is-eco" disabled={props.run.coins < price} onClick={props.onReroll}>
          <b>Premiešať {price}</b>
          <small>Tri nové ponuky. Ďalšie miešanie +3 RJ.</small>
        </button>
        <button type="button" className="ns-act is-def" disabled={props.run.coins < HEAL_PRICE || shop.heals >= HEAL_STOCK || props.run.hp >= props.run.maxHp} onClick={props.onHeal}>
          <b>Život {HEAL_PRICE}</b>
          <small>+{HEAL_GAIN} HP. Najviac {HEAL_STOCK}× v tomto obchode.</small>
        </button>
      </div>
      {shop.faces.length ? (
        <div className="ns-draft" aria-label="Skrytý výber">
          <p>Skrytý výber · vezmi jednu</p>
          <div className="ns-offers">
            {shop.faces.map((id, i) => (
              <button key={`face-${i}`} type="button" className="ns-offer is-back" onClick={() => props.onFace(i)}>
                <b>?</b>
                <em>Neznáma karta</em>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="ns-services">
        <button type="button" className="ns-act is-atk" disabled={props.run.coins < SUPPORT_PRICE || props.run.keys >= 2} onClick={props.onKeys}>
          <b>Kľúče {SUPPORT_PRICE}</b>
          <small>Najbližší úder +8. Sklad {props.run.keys}/2.</small>
        </button>
        <button type="button" className="ns-act is-def" disabled={props.run.coins < SUPPORT_PRICE || props.run.stamp} onClick={props.onStamp}>
          <b>Pečiatka {SUPPORT_PRICE}</b>
          <small>Najbližší ťah nepriateľa vynechá útok.</small>
        </button>
        <button type="button" className="ns-act is-atk" disabled={props.run.coins < EQUIP_PRICE || props.run.equip.includes("uder") || props.run.equip.length >= 2} onClick={() => props.onEquip("uder")}>
          <b>Sila {props.run.equip.includes("uder") ? "máš" : EQUIP_PRICE}</b>
          <small>Každý úder v behu +2.</small>
        </button>
        <button type="button" className="ns-act is-def" disabled={props.run.coins < EQUIP_PRICE || props.run.equip.includes("stit") || props.run.equip.length >= 2} onClick={() => props.onEquip("stit")}>
          <b>Odolnosť {props.run.equip.includes("stit") ? "máš" : EQUIP_PRICE}</b>
          <small>Každý štít v behu +3.</small>
        </button>
      </div>
      <p className="ns-deck-count">
        Balík {rows.length} druhov · {props.run.deck.length} kariet
        {props.run.equip.length ? ` · výbava ${props.run.equip.length}/2` : ""}
      </p>
      <ul className="ns-deck-list">
        {rows.map(([id, n]) => {
          const def = symDef(id);
          const lv = props.run.levels[id] ?? 0;
          const fort = props.run.fortify[id] ?? 0;
          const pro = props.run.pro.includes(id);
          const at = props.run.deck.lastIndexOf(id);
          return (
            <li key={id} className={id === "pokuta" ? "is-pokuta" : ""}>
              <div className="ns-deck-head">
                <img src={def?.art} alt="" />
                <div>
                  <b>{def?.name ?? id} ×{n}{pro ? " PRO" : ""}</b>
                  <small>
                    {lv > 0 ? `úroveň ${lv} ` : ""}
                    {fort > 0 ? `pevnosť ${fort} ` : ""}
                    {id === "pokuta" ? "Vnútený lístok. Stojí ťa život." : lineOf(def?.blurb ?? "")}
                  </small>
                </div>
              </div>
              <button type="button" className="ns-svc ns-edit" onClick={() => setEdit(id)}>
                Upraviť
              </button>
            </li>
          );
        })}
      </ul>
      {edit ? (
        <div className="ns-sheet" role="dialog" aria-label="Upraviť kartu">
          <b>{symDef(edit)?.name ?? edit}</b>
          <button type="button" className="ns-act is-danger" disabled={props.run.deck.length <= 3 || props.run.coins < REMOVE_PRICE} onClick={() => { props.onRemove(props.run.deck.lastIndexOf(edit)); setEdit(null); }}>
            <b>Vyradiť {REMOVE_PRICE}</b>
            <small>Vyhodí túto kartu. Balík musí mať aspoň 4.</small>
          </button>
          <button type="button" className="ns-act is-atk" disabled={(props.run.levels[edit] ?? 0) >= 3 || props.run.coins < UPGRADE_PRICE} onClick={() => props.onUpgrade(edit)}>
            <b>Zlepšiť {UPGRADE_PRICE}</b>
            <small>Úroveň +1, každá je +10 %. Strop 3. Len tento beh.</small>
          </button>
          <button type="button" className="ns-act is-atk" disabled={(counts.get(edit) ?? 0) < 2 || (props.run.levels[edit] ?? 0) >= 3} onClick={() => props.onTrain(edit)}>
            <b>Tréning</b>
            <small>Zje kópiu a dá úroveň +1. RJ nestoja.</small>
          </button>
          <button type="button" className="ns-act is-atk" disabled={(counts.get(edit) ?? 0) < 2 || (props.run.levels[edit] ?? 0) < 3 || props.run.pro.includes(edit)} onClick={() => props.onPro(edit)}>
            <b>Pro</b>
            <small>Zje kópiu na úrovni 3. Karta bije ×1,2 do konca behu.</small>
          </button>
          <button type="button" className="ns-act is-def" disabled={(counts.get(edit) ?? 0) < 2 || (props.run.fortify[edit] ?? 0) >= 3} onClick={() => props.onFortify(edit)}>
            <b>Pevnosť</b>
            <small>Zje kópiu. +2 k úderu, najviac trikrát.</small>
          </button>
          <button type="button" className="ns-svc" onClick={() => setEdit(null)}>
            Zavrieť
          </button>
        </div>
      ) : null}
    </section>
  );
}


function Fps() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let last = performance.now();
    let frames = 0;
    let worst = 0;
    let acc = 0;
    let raf = 0;
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      frames++;
      acc += dt;
      worst = Math.max(worst, dt);
      if (acc > 500 && ref.current) {
        ref.current.textContent = `${Math.round((frames * 1000) / acc)} fps · ${worst.toFixed(0)} ms`;
        frames = 0;
        acc = 0;
        worst = 0;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div className="ns-fps" ref={ref} />;
}
