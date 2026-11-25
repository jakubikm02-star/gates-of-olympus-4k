import { useEffect, useRef, useState } from "react";
import { FAMILY_NAME, metaOf, RARITY_NAME, rarityOf } from "@/lib/revier/depth";
import { EQUIP_PRICE, HEAL_PRICE, HEAL_STOCK, HOLD_PRICE, REEL5_PRICE, REEL_PRICE, REMOVE_PRICE, SUPPORT_PRICE, UPGRADE_PRICE, aspectKind, floorInfo, rerollCost, symDef, symMark } from "@/lib/revier/symbols";
import { muffleMusic, playSoftHit, setNsSfx } from "@/lib/slot/audio";
import type { NocnaRecord, Run, SymId } from "@/lib/revier/types";
import { useRevier, type Stage } from "@/hooks/use-revier";
import { preloadNocna } from "@/nocna/preload";
import type { FightHandle } from "@/nocna/fight-types";
import "./nocna.css";

interface Props {
  entry: number;
  record: NocnaRecord | null;
  onRecord: (run: Run) => void;
  onExit: () => void;
}

const FIGHT: Stage[] = ["ready", "spin", "preview", "act", "enemy"];

export function NocnaSmena(props: Props) {
  const v = useRevier(props);
  const host = useRef<HTMLDivElement>(null);
  const fightRef = useRef<FightHandle | null>(null);
  const [gear, setGear] = useState(false);
  const [sfxVol, setSfxVol] = useState(55);
  const [box, setBox] = useState({ w: 412, h: 915 });
  const kind = aspectKind(box.w, box.h);
  const info = floorInfo(v.run.floor);
  const showFight = FIGHT.includes(v.stage);
  const fps = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("fps");

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

      {v.stage === "draft" ? (
        <section className="ns-plate" aria-label="Výber symbolov">
          <p className="ns-count">{v.run.picks.length}/3</p>
          <div className="ns-cards">
            {v.run.draft.map((id) => {
              const def = symDef(id);
              const mark = symMark(id);
              if (!def || !mark) return null;
              const at = v.run.picks.indexOf(id);
              return (
                <button key={id} type="button" className={at >= 0 ? "is-on" : ""} onClick={() => v.toggle(id)}>
                  {at >= 0 ? <em>{at + 1}</em> : null}
                  <img src={def.art} alt="" />
                  <span>{def.name}</span>
                  <b>{mark.chip}</b>
                  {metaOf(id) ? <small>{FAMILY_NAME[metaOf(id)!.family]}</small> : null}
                  <i
                    role="button"
                    aria-label="Detail"
                    onClick={(e) => {
                      e.stopPropagation();
                      v.openBubble(def.name, mark.detail);
                    }}
                  >
                    i
                  </i>
                </button>
              );
            })}
          </div>
        </section>
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

      {v.stage === "dead" ? (
        <section className="ns-plate ns-dead" role="dialog" aria-label="Koniec smeny">
          <h2>{v.run.cause || "Koniec smeny"}</h2>
          <p>
            {v.run.stats.bestFloor >= 6 ? "Ranná" : `P${v.run.stats.bestFloor}`} · {v.run.stats.kills} súbojov · ⚔{v.run.stats.dealt}
          </p>
          <p>Vstupné {props.entry.toLocaleString("sk-SK")}</p>
        </section>
      ) : null}

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
      {v.stage === "ready" ? (
        <div className="ns-risk">
          <button type="button" disabled={v.run.super < 100} onClick={v.burst}>
            VÝBOJ
          </button>
          <button type="button" disabled={v.run.hp <= 18 || v.run.wager > 1} onClick={v.wager}>
            ALL-IN
          </button>
          <button type="button" disabled={v.run.coins < HOLD_PRICE || !v.run.lastLands.length} onClick={() => v.hold(0)}>
            ZÁMOK {HOLD_PRICE}
          </button>
        </div>
      ) : null}
      {v.stage === "shop" && v.run.shop?.faces.length ? (
        <div className="ns-faces" aria-label="Výber kariet">
          {v.run.shop.faces.map((id, i) => (
            <button key={`${id}-${i}`} type="button" onClick={() => v.face(i)}>
              <img src={symDef(id)?.art} alt="" />
              <span>{symDef(id)?.name ?? id}</span>
            </button>
          ))}
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
        <button type="button" disabled={props.run.coins < price} onClick={props.onReroll}>
          Premiešať {price} RJ
        </button>
        <button type="button" disabled={props.run.coins < HEAL_PRICE || shop.heals >= HEAL_STOCK || props.run.hp >= props.run.maxHp} onClick={props.onHeal}>
          Život {HEAL_PRICE}
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
        <button type="button" disabled={props.run.coins < SUPPORT_PRICE || props.run.keys >= 2} onClick={props.onKeys}>
          Kľúče od auta {SUPPORT_PRICE}
        </button>
        <button type="button" disabled={props.run.coins < SUPPORT_PRICE || props.run.stamp} onClick={props.onStamp}>
          Pečiatka úradu {SUPPORT_PRICE}
        </button>
        <button type="button" disabled={props.run.coins < EQUIP_PRICE || props.run.equip.includes("uder") || props.run.equip.length >= 2} onClick={() => props.onEquip("uder")}>
          Slot Sila {props.run.equip.includes("uder") ? "máš" : EQUIP_PRICE}
        </button>
        <button type="button" disabled={props.run.coins < EQUIP_PRICE || props.run.equip.includes("stit") || props.run.equip.length >= 2} onClick={() => props.onEquip("stit")}>
          Slot Odolnosť {props.run.equip.includes("stit") ? "máš" : EQUIP_PRICE}
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
              <img src={def?.art} alt="" />
              <div>
                <b>{def?.name ?? id} ×{n}{pro ? " PRO" : ""}</b>
                <small>
                  {lv > 0 ? `úroveň ${lv} ` : ""}
                  {fort > 0 ? `pevnosť ${fort} ` : ""}
                  {id === "pokuta" ? "Vnútený lístok. Stojí ťa život." : lineOf(def?.blurb ?? "")}
                </small>
              </div>
              <div className="ns-row-actions">
                <button type="button" disabled={props.run.deck.length <= 3 || props.run.coins < REMOVE_PRICE} onClick={() => props.onRemove(at)}>
                  Vyradiť
                </button>
                <button type="button" disabled={lv >= 3 || props.run.coins < UPGRADE_PRICE} onClick={() => props.onUpgrade(id)}>
                  Zlepšiť {UPGRADE_PRICE}
                </button>
                <button type="button" disabled={n < 2 || lv >= 3} onClick={() => props.onTrain(id)}>
                  Tréning
                </button>
                <button type="button" disabled={n < 2 || lv < 3 || pro} onClick={() => props.onPro(id)}>
                  Pro
                </button>
                <button type="button" disabled={n < 2 || fort >= 3} onClick={() => props.onFortify(id)}>
                  Pevnosť
                </button>
              </div>
            </li>
          );
        })}
      </ul>
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
