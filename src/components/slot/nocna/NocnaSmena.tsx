import { useEffect, useRef, useState } from "react";
import { HEAL_PRICE, HEAL_STOCK, REEL_PRICE, REMOVE_PRICE, REROLL_PRICE, aspectKind, floorInfo, symDef, symMark } from "@/lib/revier/symbols";
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

const FIGHT: Stage[] = ["ready", "spin", "preview", "act", "enemy", "shop"];

export function NocnaSmena(props: Props) {
  const v = useRevier(props);
  const host = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 412, h: 915 });
  const kind = aspectKind(box.w, box.h);
  const info = floorInfo(v.run.floor);
  const showFight = FIGHT.includes(v.stage);
  const fps = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("fps");

  useEffect(() => {
    void preloadNocna();
  }, []);

  const act = useRef(v.primary.run);
  act.current = v.primary.run;
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
      v.bindFight(stage);
    });
    return () => {
      dead = true;
      v.bindFight(null);
      stage?.destroy();
    };
  }, [showFight]);

  return (
    <div
      className={`ns is-${kind}${v.who === "foe" ? " is-foe" : " is-you"}`}
      onPointerDown={() => {
        if (v.bubble) v.closeBubble();
        if (v.stage === "act" || v.stage === "enemy") v.hurry();
      }}
    >
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
                  <span>{mark.chip}</span>
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

      {v.hint && v.stage !== "draft" && v.stage !== "shop" ? (
        <button type="button" className="ns-hint" onClick={v.dismissHint}>
          {v.hint}
        </button>
      ) : null}

      <div className="ns-foot">
      {v.stage === "shop" && v.run.shop ? (
        <div className="ns-icons">
          <button type="button" disabled={v.run.coins < REMOVE_PRICE || v.run.deck.length <= 3} onClick={() => v.remove(v.run.deck.length - 1)} aria-label="Vyradiť">
            ✕<small>{REMOVE_PRICE}</small>
          </button>
          <button type="button" disabled={v.run.coins < REROLL_PRICE} onClick={v.reroll} aria-label="Premiešať">
            ↻<small>{REROLL_PRICE}</small>
          </button>
          <button type="button" disabled={v.run.coins < HEAL_PRICE || v.run.shop.heals >= HEAL_STOCK || v.run.hp >= v.run.maxHp} onClick={v.heal} aria-label="Život">
            ❤<small>{HEAL_PRICE}</small>
          </button>
          <button type="button" disabled={v.run.reels >= 4 || v.run.floor < 3 || v.run.coins < REEL_PRICE} onClick={v.fourth} aria-label="Štvrtý valec">
            +4<small>{v.run.floor < 3 ? "3" : REEL_PRICE}</small>
          </button>
        </div>
      ) : null}
      <div className="ns-toggles">
        <button type="button" className={v.rychlo ? "is-on" : ""} onClick={() => v.setRychlo(!v.rychlo)} aria-pressed={v.rychlo}>
          Rýchlo
        </button>
        <button type="button" onClick={() => v.setShake(v.shake === 0 ? 0.5 : v.shake === 0.5 ? 1 : 0)} aria-label="Trasenie">
          Tras {Math.round(v.shake * 100)}
        </button>
        <button type="button" className={v.calm ? "is-on" : ""} onClick={() => v.setCalm(!v.calm)} aria-pressed={v.calm}>
          Kľud
        </button>
      </div>
      <button type="button" className={`ns-go${v.primary.pulse ? " is-pulse" : ""}`} disabled={v.primary.disabled} onClick={v.primary.run}>
        {v.primary.label}
      </button>
      </div>

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
