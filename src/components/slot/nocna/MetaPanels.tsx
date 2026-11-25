import { useState } from "react";
import { FAMILY_NAME, RARITY_NAME, metaOf, rarityOf } from "@/lib/revier/depth";
import {
  LOADOUT_BUDGET,
  LOADOUT_POOL,
  LOADOUT_SIZE,
  RESPEC_FEE,
  SCREW_FORMULA,
  budgetOf,
  canTake,
  perkCost,
  perkLine,
  perkOf,
  rarityPoints,
  type Dielna,
  type PerkTrack,
} from "@/lib/revier/dielna";
import { ACTIONS, GUIDE, type GuideEntry } from "@/lib/revier/guide";
import { postMortem } from "@/lib/revier/review";
import { symDef, symMark } from "@/lib/revier/symbols";
import type { Run, SymId } from "@/lib/revier/types";
import type { ChallengeView } from "@/lib/revier/challenges";

export function DetailSheet(props: { entry: GuideEntry; onClose: () => void }) {
  return (
    <div className="ns-sheet ns-detail" role="dialog" aria-label={props.entry.title} onPointerDown={(e) => e.stopPropagation()}>
      <b className={`ns-cat is-${props.entry.cat}`}>{props.entry.title}</b>
      <p>{props.entry.line}</p>
      <p>{props.entry.body}</p>
      <button type="button" className="ns-act is-nav" onClick={props.onClose}>
        Zavrieť
      </button>
    </div>
  );
}

export function GuideSheet(props: { onClose: () => void }) {
  return (
    <div className="ns-sheet ns-guide" role="dialog" aria-label="Ako to funguje" onPointerDown={(e) => e.stopPropagation()}>
      <b>Ako to funguje</b>
      {GUIDE.map((row) => (
        <p key={row.title}>
          <strong>{row.title}. </strong>
          {row.body}
        </p>
      ))}
      <button type="button" className="ns-act is-nav" onClick={props.onClose}>
        Zavrieť
      </button>
    </div>
  );
}

export function ActButton(props: {
  id: string;
  disabled?: boolean;
  onClick: () => void;
  onInfo: (entry: GuideEntry) => void;
  extra?: string;
}) {
  const entry = ACTIONS.find((row) => row.id === props.id);
  if (!entry) return null;
  return (
    <button type="button" className={`ns-act is-${entry.cat}`} disabled={props.disabled} onClick={props.onClick}>
      <b>{entry.title}</b>
      <small>{props.extra ?? entry.line}</small>
      <i
        role="button"
        aria-label={`Detail ${entry.title}`}
        onClick={(e) => {
          e.stopPropagation();
          props.onInfo(entry);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        i
      </i>
    </button>
  );
}

export function ChallengeList(props: { rows: ChallengeView[] }) {
  return (
    <ul className="ns-challenges">
      {props.rows.map((row) => (
        <li key={`${row.period}-${row.id}`} className={row.done ? "is-done" : ""}>
          <b>{row.period === "day" ? "Dnes" : "Týždeň"} · {row.title}</b>
          <small>{row.line}</small>
          <em>{row.done ? "hotové" : `+${row.reward} šroubkov`}</em>
        </li>
      ))}
    </ul>
  );
}

export function Breakdown(props: { run: Run; challenges: ChallengeView[]; claimed: string[] }) {
  const card = postMortem(props.run);
  return (
    <section className="ns-plate ns-dead" role="dialog" aria-label="Koniec smeny">
      <h2>{card.cause}</h2>
      <p>
        {card.floorLabel} · {props.run.stats.kills} súbojov · +{card.screws} šroubkov
      </p>
      {card.gaps.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {card.hints.map((line) => (
        <p key={line}>
          <strong>Inak by to dopadlo takto. </strong>
          {line}
        </p>
      ))}
      {props.claimed.length ? <p>Výzvy: {props.claimed.join(", ")}</p> : null}
      <ChallengeList rows={props.challenges} />
    </section>
  );
}

export function DielnaPanel(props: {
  dielna: Dielna;
  challenges: ChallengeView[];
  onName: (name: string) => void;
  onBuy: (id: SymId, track: PerkTrack) => void;
  onRespec: (from: SymId, to: SymId, track: PerkTrack) => void;
  onGuide: () => void;
}) {
  const [from, setFrom] = useState<SymId>("krimp");
  const [to, setTo] = useState<SymId>("blocek");
  const owned = Object.entries(props.dielna.perks).filter(([, perk]) => perk && perkLine(perk) !== "bez trvalej úpravy");
  return (
    <section className="ns-plate ns-dielna" aria-label="Dielňa">
      <h2>DIELŇA</h2>
      <p className="ns-pity">{props.dielna.screws} šroubkov</p>
      <p>{SCREW_FORMULA}</p>
      <label className="ns-name">
        Názov balíka
        <input value={props.dielna.name} maxLength={18} aria-label="Názov balíka" onChange={(e) => props.onName(e.target.value)} />
      </label>
      <ChallengeList rows={props.challenges} />
      <p>Trvalé úpravy ostávajú po smrti. Stupeň 1 stojí {perkCost("dmg", 1)}, stupeň 2 stojí {perkCost("dmg", 2)}. Pro stojí {perkCost("pro", 1)} a dáva ×1,12. Presun stojí {RESPEC_FEE}.</p>
      <ul className="ns-perk-list">
        {LOADOUT_POOL.map((id) => {
          const def = symDef(id);
          const perk = perkOf(props.dielna, id);
          return (
            <li key={id}>
              <img src={def?.art} alt="" />
              <div>
                <b>{def?.name}</b>
                <small>{perkLine(perk)}</small>
              </div>
              <button type="button" className="ns-act is-atk" disabled={props.dielna.screws < perkCost("dmg", perk.dmg + 1) || perk.dmg >= 2} onClick={() => props.onBuy(id, "dmg")}>
                +1 úder · {perk.dmg >= 2 ? "plné" : perkCost("dmg", perk.dmg + 1)}
              </button>
            </li>
          );
        })}
      </ul>
      {owned.length ? (
        <div className="ns-respec">
          <p>Presunúť vylepšenie za {RESPEC_FEE} šroubkov.</p>
          <select aria-label="Odkiaľ" value={from} onChange={(e) => setFrom(e.target.value as SymId)}>
            {LOADOUT_POOL.map((id) => (
              <option key={id} value={id}>{symDef(id)?.name}</option>
            ))}
          </select>
          <select aria-label="Kam" value={to} onChange={(e) => setTo(e.target.value as SymId)}>
            {LOADOUT_POOL.map((id) => (
              <option key={id} value={id}>{symDef(id)?.name}</option>
            ))}
          </select>
          <button type="button" className="ns-act is-eco" onClick={() => props.onRespec(from, to, "dmg")}>
            Presunúť +úder
          </button>
        </div>
      ) : null}
      <button type="button" className="ns-act is-nav" onClick={props.onGuide}>
        Ako to funguje
      </button>
    </section>
  );
}

export function LoadoutPicker(props: { picks: SymId[]; onToggle: (id: SymId) => void; onInfo: (title: string, text: string) => void }) {
  const spent = budgetOf(props.picks);
  return (
    <section className="ns-plate" aria-label="Výber symbolov">
      <p className="ns-count">
        {props.picks.length}/{LOADOUT_SIZE} kariet · {spent}/{LOADOUT_BUDGET} bodov
      </p>
      <p>Bežný 1, vzácny 2, epický 3, legendárny 5. Dve legendy sa do šiestich kariet nezmestia.</p>
      <div className="ns-pick-grid">
        {LOADOUT_POOL.map((id) => {
          const def = symDef(id);
          const on = props.picks.includes(id);
          const blocked = !on && !canTake(props.picks, id);
          if (!def) return null;
          return (
            <button key={id} type="button" className={on ? "is-on" : ""} disabled={blocked} onClick={() => props.onToggle(id)}>
              <img src={def.art} alt="" />
              <span>{def.name}</span>
              <small>
                {RARITY_NAME[rarityOf(id)]} · {rarityPoints(id)} b · {metaOf(id) ? FAMILY_NAME[metaOf(id)!.family] : "základ"}
              </small>
              <em>{symMark(id)?.chip} {symMark(id)?.detail.split(".")[0]}</em>
              <i
                role="button"
                aria-label="Detail"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onInfo(def.name, symMark(id)?.detail ?? def.blurb);
                }}
              >
                i
              </i>
            </button>
          );
        })}
      </div>
    </section>
  );
}
