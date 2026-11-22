import { useEffect, useRef, useState } from "react";
import type { Grade, SymId } from "@/lib/revier/types";
import {
  ENERGY_AT,
  HEAL_GAIN,
  HEAL_PRICE,
  HEAL_STOCK,
  REEL_PRICE,
  REMOVE_PRICE,
  REROLL_PRICE,
  aspectKind,
  bgSrc,
  floorInfo,
  frameWidth,
  symDef,
} from "@/lib/revier/symbols";
import { useRevier } from "@/hooks/use-revier";
import type { NocnaRecord, Run } from "@/lib/revier/types";
import "./nocna.css";

const WINS = [
  { left: "7.81%", top: "13.38%", width: "24.51%", height: "73.38%" },
  { left: "36.91%", top: "13.38%", width: "25.78%", height: "73.38%" },
  { left: "67.29%", top: "13.38%", width: "24.8%", height: "73.38%" },
];

interface Props {
  entry: number;
  record: NocnaRecord | null;
  onRecord: (run: Run) => void;
  onExit: () => void;
}

export function NocnaSmena({ entry, record, onRecord, onExit }: Props) {
  const v = useRevier({ entry, onRecord, onExit });
  const box = useBox();
  const kind = aspectKind(box.w, box.h);
  const info = floorInfo(v.run.floor);
  const fw = frameWidth(box.w, box.h, kind);
  const cell = Math.round(fw * (650 / 1024) * 0.7338);
  const [removing, setRemoving] = useState(false);

  return (
    <div className={`ns is-${kind}${v.shake ? ` is-shake is-shake-${v.shake}` : ""}${v.dim ? " is-dim" : ""}${v.crit ? " is-crit" : ""}`}>
      <img className="ns-bg" src={bgSrc(v.run.floor, kind)} alt="" />
      <div className="ns-scrim" />
      <div className="ns-world">
        <header className="ns-hud">
          <div className="ns-floor">
            <small>POSCHODIE</small>
            <b>{v.run.floor >= 6 ? "Ranná" : v.run.floor}</b>
            <em>{info.name}</em>
          </div>
          <div className="ns-vitals">
            <Vital icon="/nocna/ui/ui-hp-heart.webp" label="Život" value={Math.max(0, v.run.hp)} max={v.run.maxHp} tone="hp" />
            <Vital icon="/nocna/ui/ui-shield.webp" label="Štít" value={v.run.shield} max={48} tone="shield" />
            <div className="ns-energy" aria-label={`Výboj ${v.run.energy} z ${ENERGY_AT}`}>
              {Array.from({ length: ENERGY_AT }, (_, i) => (
                <img key={i} src="/nocna/ui/ui-energy.webp" alt="" className={i < v.run.energy ? "is-on" : ""} />
              ))}
            </div>
          </div>
          <div className="ns-purse" data-coins>
            <img src="/nocna/ui/ui-coin.webp" alt="" />
            <b>{v.run.coins}</b>
          </div>
          <button type="button" className="ns-quit" onClick={v.giveUp}>
            {v.run.phase === "draft" ? "Späť" : "Vzdať"}
          </button>
        </header>

        {v.run.phase === "draft" ? <Draft run={v.run} onToggle={v.toggle} onConfirm={v.confirm} /> : null}
        {v.run.phase === "banner" ? <Banner floor={v.run.floor} /> : null}
        {v.run.phase === "fight" && v.run.enemy ? (
          <Fight
            name={v.run.enemy.name}
            art={v.run.enemy.art}
            taunt={v.run.enemy.taunt}
            hp={Math.max(0, v.run.enemy.hp)}
            max={v.run.enemy.maxHp}
            shield={v.run.enemy.shield}
            boss={v.run.enemy.boss}
            elite={v.run.enemy.elite}
            intent={v.run.enemy.stunned ? "Omámený — ťah padá" : v.run.enemy.intent.label}
            poison={v.run.poison ? `Jed ${v.run.poison.dmg} ešte ${v.run.poison.left}×` : null}
            reels={v.run.reels}
            fw={v.run.reels === 4 ? cell * 4 + 28 : fw}
            cell={v.run.reels === 4 ? cell : cell}
            strips={v.strips}
            spinning={v.spinning}
            landed={v.landed}
            active={v.active}
            pop={v.pop}
            thud={v.thud}
            onBind={v.bindReel}
            onStop={v.stop}
          />
        ) : null}
        {v.run.phase === "shop" && v.run.shop ? (
          <Shop
            run={v.run}
            removing={removing}
            onRemoveMode={() => setRemoving((on) => !on)}
            onRemove={(index) => {
              v.remove(index);
              setRemoving(false);
            }}
            onBuy={v.buy}
            onHeal={v.heal}
            onReroll={v.reroll}
            onFourth={v.fourth}
            onLeave={v.leave}
          />
        ) : null}
        {v.run.phase === "dead" ? (
          <Dead run={v.run} entry={entry} record={record} onExit={v.exit} />
        ) : null}

        {v.crit ? (
          <div className="ns-crit-banner" role="status">
            <img src="/nocna/fx/fx-crit.webp" alt="" />
            <b>KRITICKÝ ZÁSAH!</b>
          </div>
        ) : null}
        {v.flash ? <img className={`ns-flash is-${v.flash}`} src={`/nocna/fx/fx-${v.flash}.webp`} alt="" /> : null}
        <div className="ns-floats" aria-hidden="true">
          {v.floats.map((row) => (
            <i key={row.id} className={`ns-float is-${row.tone} is-${row.where}`}>
              {row.text}
            </i>
          ))}
        </div>
        {v.tokens.map((token) => (
          <img
            key={token.id}
            className="ns-token"
            src="/nocna/ui/ui-coin.webp"
            alt=""
            style={{ ["--x" as string]: `${token.x}px`, ["--y" as string]: `${token.y}px`, ["--dx" as string]: `${token.dx}px`, ["--dy" as string]: `${token.dy}px` }}
          />
        ))}
        {v.skill ? <SkillCheck mode={v.skill.mode} sym={v.skill.sym} onGrade={v.grade} /> : null}
      </div>
    </div>
  );
}

function useBox() {
  const [box, setBox] = useState({ w: 390, h: 800 });
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
  return box;
}

function Vital({ icon, label, value, max, tone }: { icon: string; label: string; value: number; max: number; tone: string }) {
  const p = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className={`ns-vital is-${tone}`}>
      <img src={icon} alt="" />
      <span>
        <small>{label}</small>
        <b>{value}</b>
        <i style={{ transform: `scaleX(${p})` }} />
      </span>
    </div>
  );
}

function Draft({ run, onToggle, onConfirm }: { run: Run; onToggle: (sym: SymId) => void; onConfirm: () => void }) {
  return (
    <section className="ns-plate" aria-label="Výber symbolov">
      <p className="ns-kicker">NOČNÁ SMENA</p>
      <h2>Tri veci do vesty</h2>
      <p>Zvyšok nechaj v dodávke. Ráno to tu aj tak niekto rozoberie.</p>
      <div className="ns-draft">
        {run.draft.map((id) => {
          const def = symDef(id);
          if (!def) return null;
          const at = run.picks.indexOf(id);
          return (
            <button key={id} type="button" className={at >= 0 ? "is-on" : ""} onClick={() => onToggle(id)} aria-pressed={at >= 0}>
              {at >= 0 ? <em>{at + 1}</em> : null}
              <img src={def.art} alt="" />
              <b>{def.name}</b>
              <small>{def.blurb}</small>
            </button>
          );
        })}
      </div>
      <button type="button" className="ns-go" disabled={run.picks.length !== 3} onClick={onConfirm}>
        NASTÚPIŤ
      </button>
    </section>
  );
}

function Banner({ floor }: { floor: number }) {
  const info = floorInfo(floor);
  return (
    <section className="ns-banner" role="status">
      <small>{floor >= 6 ? "KONEC SMENY" : `${floor}. POSCHODIE`}</small>
      <h2>{info.name}</h2>
      <p>{info.line}</p>
    </section>
  );
}

function Fight(props: {
  name: string;
  art: string;
  taunt: string;
  hp: number;
  max: number;
  shield: number;
  boss: boolean;
  elite: boolean;
  intent: string;
  poison: string | null;
  reels: number;
  fw: number;
  cell: number;
  strips: SymId[][];
  spinning: boolean[];
  landed: (SymId | null)[];
  active: number | null;
  pop: SymId | null;
  thud: number;
  onBind: (reel: number, read: () => number) => void;
  onStop: (reel: number) => void;
}) {
  const popDef = props.pop ? symDef(props.pop) : null;
  const winW = props.reels === 4 ? props.cell : props.fw * 0.245;
  const winH = props.reels === 4 ? props.cell : props.fw * (650 / 1024) * 0.72;
  const symbol = Math.max(64, Math.floor(Math.min(winW, winH)));
  const pad = Math.max(0, (winH - symbol) / 2);
  return (
    <section className="ns-fight" aria-label="Súboj">
      <div className={`ns-foe${props.boss ? " is-boss" : ""}${props.elite ? " is-elite" : ""}`}>
        <img src={props.art} alt="" />
        <div className="ns-foe-card">
          <b>{props.name}</b>
          <small>{props.taunt}</small>
          <i className="ns-hp">
            <i style={{ transform: `scaleX(${props.max ? props.hp / props.max : 0})` }} />
          </i>
          <span>
            {props.hp}/{props.max}
            {props.shield > 0 ? ` · štít ${props.shield}` : ""}
          </span>
        </div>
      </div>
      <div className="ns-intent" role="status">
        <small>Ďalší ťah nepriateľa</small>
        <b>{props.intent}</b>
        {props.poison ? <em>{props.poison}</em> : null}
      </div>
      <div className={`ns-machine${props.reels === 4 ? " is-four" : ""}`} style={{ width: props.fw }}>
        {props.reels === 3 ? <img className="ns-frame" src="/nocna/ui/ui-reel-frame-3.webp" alt="" /> : null}
        {Array.from({ length: props.reels }, (_, i) => {
          const box = props.reels === 3 ? WINS[i] : undefined;
          return (
            <div key={i} className={`ns-win${props.active === i ? " is-live" : ""}`} style={box} data-reel={i}>
              <Reel
                spinning={props.spinning[i] ?? false}
                strip={props.strips[i] ?? []}
                landed={props.landed[i] ?? null}
                size={symbol}
                pad={pad}
                thud={props.thud}
                onBind={(read) => props.onBind(i, read)}
              />
            </div>
          );
        })}
        {popDef ? <img className="ns-pop" src={popDef.art} alt="" /> : null}
      </div>
      <button
        type="button"
        className="ns-stop"
        disabled={props.active == null || !(props.spinning[props.active] ?? false)}
        onClick={() => props.active != null && props.onStop(props.active)}
      >
        STOP{props.active != null ? ` ${props.active + 1}` : ""}
      </button>
    </section>
  );
}

function Reel({
  spinning,
  strip,
  landed,
  size,
  pad,
  thud,
  onBind,
}: {
  spinning: boolean;
  strip: SymId[];
  landed: SymId | null;
  size: number;
  pad: number;
  thud: number;
  onBind: (read: () => number) => void;
}) {
  const y = useRef(0);
  const el = useRef<HTMLDivElement>(null);
  const read = useRef<() => number>(() => 0);
  useEffect(() => {
    onBind(() => read.current());
  }, [onBind]);
  useEffect(() => {
    if (!spinning || !strip.length || size <= 0) return;
    let raf = 0;
    let last = performance.now();
    const loopH = strip.length * size;
    const speed = size / 0.34;
    const loop = (now: number) => {
      const dt = Math.min(0.034, (now - last) / 1000);
      last = now;
      y.current = (y.current + speed * dt) % loopH;
      if (el.current) el.current.style.transform = `translate3d(0,${-y.current}px,0)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [spinning, strip, size]);
  read.current = () => {
    if (!strip.length || size <= 0) return 0;
    const at = Math.round(y.current / size);
    return ((at % strip.length) + strip.length) % strip.length;
  };
  if (!spinning && landed) {
    const def = symDef(landed);
    return def ? (
      <img key={thud} className="ns-landed is-thud" src={def.art} alt={def.name} />
    ) : (
      <span className="ns-blank">MEDZERA</span>
    );
  }
  const loop = strip.length ? [...strip, ...strip] : [];
  return (
    <div className="ns-strip" ref={el} style={{ top: pad }}>
      {loop.map((id, i) => {
        const def = symDef(id);
        return def ? <img key={i} src={def.art} alt="" style={{ height: size }} /> : <span key={i} className="ns-blank" style={{ height: size }} />;
      })}
    </div>
  );
}

function Shop({
  run,
  removing,
  onRemoveMode,
  onRemove,
  onBuy,
  onHeal,
  onReroll,
  onFourth,
  onLeave,
}: {
  run: Run;
  removing: boolean;
  onRemoveMode: () => void;
  onRemove: (index: number) => void;
  onBuy: (index: number) => void;
  onHeal: () => void;
  onReroll: () => void;
  onFourth: () => void;
  onLeave: () => void;
}) {
  const shop = run.shop!;
  return (
    <section className="ns-shop" aria-label="Obchod">
      <header>
        <p className="ns-kicker">PO SÚBOJI</p>
        <h2>Kšeft za garážou</h2>
        <p>Mŕtvi nekupujú. Ty ešte áno.</p>
      </header>
      <div className="ns-shop-grid">
        <div className="ns-offers">
          {shop.offers.map((offer, i) => {
            const def = symDef(offer.sym);
            if (!def) return null;
            return (
              <button key={`${offer.sym}-${i}`} type="button" disabled={run.coins < offer.price} onClick={() => onBuy(i)}>
                <img src={def.art} alt="" />
                <b>{def.name}</b>
                <small>{def.blurb}</small>
                <em>
                  <img src="/nocna/ui/ui-coin.webp" alt="" /> {offer.price}
                </em>
              </button>
            );
          })}
          {shop.offers.length === 0 ? <p className="ns-empty">Pult je prázdny.</p> : null}
        </div>
        <div className="ns-ups">
          <button type="button" disabled={run.coins < REMOVE_PRICE || run.deck.length <= 3} onClick={onRemoveMode}>
            <b>{removing ? "Vyber symbol" : "Vyradiť symbol"}</b>
            <small>10 mincí · aspoň 3 ostanú</small>
          </button>
          <button type="button" disabled={run.coins < REROLL_PRICE} onClick={onReroll}>
            <b>Premiešať pult</b>
            <small>{REROLL_PRICE} mincí</small>
          </button>
          <button type="button" disabled={run.coins < HEAL_PRICE || shop.heals >= HEAL_STOCK || run.hp >= run.maxHp} onClick={onHeal}>
            <b>Energeták</b>
            <small>
              {HEAL_PRICE} mincí · +{HEAL_GAIN} HP · {HEAL_STOCK - shop.heals}×
            </small>
          </button>
          <button type="button" disabled={run.reels >= 4 || run.floor < 3 || run.coins < REEL_PRICE} onClick={onFourth}>
            <b>Štvrtý valec</b>
            <small>{run.floor < 3 ? "Až od 3. poschodia" : run.reels >= 4 ? "Už ho máš" : `${REEL_PRICE} mincí`}</small>
          </button>
        </div>
      </div>
      <div className="ns-deck" aria-label="Tvoje symboly">
        {run.deck.map((id, i) => {
          const def = symDef(id);
          if (!def) return null;
          return (
            <button key={`${id}-${i}`} type="button" disabled={!removing} onClick={() => onRemove(i)}>
              <img src={def.art} alt={def.name} />
            </button>
          );
        })}
      </div>
      <button type="button" className="ns-go" onClick={onLeave}>
        ĎALEJ DO TMY
      </button>
    </section>
  );
}

function Dead({ run, entry, record, onExit }: { run: Run; entry: number; record: NocnaRecord | null; onExit: () => void }) {
  const best = Math.max(record?.bestFloor ?? 0, run.stats.bestFloor);
  return (
    <section className="ns-plate ns-dead" role="dialog" aria-label="Koniec smeny">
      <p className="ns-kicker">KONIEC SMENY</p>
      <h2>{run.cause || "Garantované miesto."}</h2>
      <dl>
        <div>
          <dt>Poschodie</dt>
          <dd>{run.stats.bestFloor >= 6 ? "Ranná špička" : run.stats.bestFloor}</dd>
        </div>
        <div>
          <dt>Súboje</dt>
          <dd>{run.stats.kills}</dd>
        </div>
        <div>
          <dt>Ťahy</dt>
          <dd>{run.stats.turns}</dd>
        </div>
        <div>
          <dt>Kritické</dt>
          <dd>{run.stats.crits}</dd>
        </div>
        <div>
          <dt>Udelené</dt>
          <dd>{run.stats.dealt}</dd>
        </div>
        <div>
          <dt>Utržené</dt>
          <dd>{run.stats.taken}</dd>
        </div>
        <div>
          <dt>Mince</dt>
          <dd>{run.stats.coins}</dd>
        </div>
        <div>
          <dt>Vstupné</dt>
          <dd>{entry.toLocaleString("sk-SK")}</dd>
        </div>
      </dl>
      <p className="ns-rec">Rekord poschodia: {best >= 6 ? "Ranná špička" : best || "—"}</p>
      <button type="button" className="ns-go" onClick={onExit}>
        SPÄŤ DO GARÁŽE
      </button>
    </section>
  );
}

function SkillCheck({ mode, sym, onGrade }: { mode: "bar" | "dial"; sym: SymId; onGrade: (grade: Grade) => void }) {
  const t0 = useRef(performance.now());
  const pos = useRef(0);
  const mark = useRef<HTMLElement | null>(null);
  const done = useRef(false);
  const gradeRef = useRef(onGrade);
  gradeRef.current = onGrade;
  const def = symDef(sym);
  const finish = (grade: Grade) => {
    if (done.current) return;
    done.current = true;
    gradeRef.current(grade);
  };
  useEffect(() => {
    let raf = 0;
    const period = mode === "bar" ? 2100 : 2600;
    const loop = (now: number) => {
      const u = ((now - t0.current) % (period * 2)) / period;
      const ping = u <= 1 ? u : 2 - u;
      pos.current = ping;
      const node = mark.current;
      if (node) {
        node.style.transform = mode === "bar" ? `translate3d(calc(${ping} * (100cqi - 12px)),0,0)` : `rotate(${-150 + ping * 300}deg)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const slow = window.setTimeout(() => finish(mode === "bar" ? gradeBar(pos.current) : gradeDial(pos.current)), 4300);
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.code !== "Enter") return;
      e.preventDefault();
      finish(mode === "bar" ? gradeBar(pos.current) : gradeDial(pos.current));
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(slow);
      window.removeEventListener("keydown", onKey);
    };
  }, [mode]);
  return (
    <div className="ns-skill" role="dialog" aria-label="Časovanie">
      <p>{def?.name}</p>
      <b>{mode === "bar" ? "Traf stred" : "Traf zelené"}</b>
      {mode === "bar" ? (
        <button type="button" className="ns-bar" onPointerDown={() => finish(gradeBar(pos.current))}>
          <img src="/nocna/ui/ui-skillcheck-bar.webp" alt="" />
          <i ref={mark} />
        </button>
      ) : (
        <button type="button" className="ns-dial" onPointerDown={() => finish(gradeDial(pos.current))}>
          <img src="/nocna/ui/ui-skillcheck-dial.webp" alt="" />
          <span />
          <i ref={mark} />
        </button>
      )}
      <small>Pomaly. Má to byť čitateľné.</small>
    </div>
  );
}

function gradeBar(p: number): Grade {
  if (p >= 0.4 && p <= 0.6) return "perfect";
  if (p >= 0.24 && p <= 0.76) return "good";
  return "miss";
}

function gradeDial(p: number): Grade {
  const angle = Math.abs(-150 + p * 300);
  if (angle <= 22) return "perfect";
  if (angle <= 54) return "good";
  return "miss";
}

