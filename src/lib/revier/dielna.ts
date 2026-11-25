import { rarityOf, type Rarity } from "./depth.ts";
import { PLAY_SYMS, symDef } from "./symbols.ts";
import type { MetaPerk, SymId } from "./types.ts";

/** Cards the player may bring. Curses and the DJ's own props stay out. */
export const LOADOUT_POOL: readonly SymId[] = PLAY_SYMS.filter((id) => {
  const def = symDef(id);
  return Boolean(def && def.price > 0);
});

export const LOADOUT_SIZE = 6;
export const LOADOUT_BUDGET = 10;

const POINTS: Record<Rarity, number> = {
  bezny: 1,
  vzacny: 2,
  epicky: 3,
  legendarny: 5,
};

export function rarityPoints(id: SymId): number {
  return POINTS[rarityOf(id)] ?? 1;
}

export function budgetOf(picks: readonly SymId[]): number {
  return picks.reduce((sum, id) => sum + rarityPoints(id), 0);
}

export function canTake(picks: readonly SymId[], id: SymId): boolean {
  if (!LOADOUT_POOL.includes(id) || picks.includes(id)) return false;
  if (picks.length >= LOADOUT_SIZE) return false;
  return budgetOf(picks) + rarityPoints(id) <= LOADOUT_BUDGET;
}

/** Šroubky = 3 × poschodie + počet súbojov. Poschodie je aspoň 1. */
export function screwsFor(floor: number, kills: number): number {
  const f = Math.max(1, Math.min(6, Math.floor(floor) || 1));
  const k = Math.max(0, Math.floor(kills) || 0);
  return f * 3 + k;
}

export const SCREW_FORMULA = "Šroubky = 3 × poschodie + súboje. Poschodie 1 je 3, Ranná špička je 18, každý súboj pripočíta 1.";

export function emptyPerk(): MetaPerk {
  return { dmg: 0, shield: 0, proc: 0, pro: false };
}

export type PerkTrack = "dmg" | "shield" | "proc" | "pro";

export const PERK_CAP = 2;

/** Rank 1 costs 12, rank 2 costs 24. Pro is a flat 40. */
export function perkCost(track: PerkTrack, nextRank: number): number {
  if (track === "pro") return 40;
  return 12 * Math.max(1, nextRank);
}

export interface Dielna {
  screws: number;
  perks: Partial<Record<SymId, MetaPerk>>;
  /** Name of the saved starting deck. Empty until the player types one. */
  name: string;
  /** The six cards a one-tap Nová smena brings back. */
  loadout: SymId[];
}

export const RESPEC_FEE = 6;

export function emptyDielna(): Dielna {
  return { screws: 0, perks: {}, name: "", loadout: [] };
}

export function perkOf(dielna: Dielna, id: SymId): MetaPerk {
  return { ...emptyPerk(), ...dielna.perks[id] };
}

export function buyPerk(dielna: Dielna, id: SymId, track: PerkTrack): Dielna {
  if (!LOADOUT_POOL.includes(id)) return dielna;
  const cur = perkOf(dielna, id);
  if (track === "pro") {
    if (cur.pro || dielna.screws < perkCost("pro", 1)) return dielna;
    return { ...dielna, screws: dielna.screws - perkCost("pro", 1), perks: { ...dielna.perks, [id]: { ...cur, pro: true } } };
  }
  const rank = cur[track];
  if (rank >= PERK_CAP) return dielna;
  const cost = perkCost(track, rank + 1);
  if (dielna.screws < cost) return dielna;
  return { ...dielna, screws: dielna.screws - cost, perks: { ...dielna.perks, [id]: { ...cur, [track]: rank + 1 } } };
}

export function grantScrews(dielna: Dielna, floor: number, kills: number): Dielna {
  return { ...dielna, screws: dielna.screws + screwsFor(floor, kills) };
}

const KEY = "p4k.nocna.dielna";

export function sanitizeDielna(raw: unknown): Dielna {
  const out = emptyDielna();
  if (!raw || typeof raw !== "object") return out;
  const r = raw as { screws?: unknown; perks?: unknown; name?: unknown; loadout?: unknown };
  const screws = typeof r.screws === "number" ? r.screws : 0;
  out.screws = Math.max(0, Math.min(100_000, Math.floor(screws) || 0));
  out.name = typeof r.name === "string" ? r.name.replace(/\s+/g, " ").trim().slice(0, 18) : "";
  if (Array.isArray(r.loadout)) {
    const ids = r.loadout.filter((id): id is SymId => typeof id === "string" && LOADOUT_POOL.includes(id as SymId));
    if (ids.length === LOADOUT_SIZE && new Set(ids).size === LOADOUT_SIZE && budgetOf(ids) <= LOADOUT_BUDGET) out.loadout = ids;
  }
  if (!r.perks || typeof r.perks !== "object") return out;
  for (const [id, perk] of Object.entries(r.perks as Record<string, unknown>)) {
    if (!LOADOUT_POOL.includes(id as SymId) || !perk || typeof perk !== "object") continue;
    const p = perk as Partial<MetaPerk>;
    const n = (v: unknown) => Math.max(0, Math.min(PERK_CAP, Math.floor(typeof v === "number" ? v : 0)));
    out.perks[id as SymId] = {
      dmg: n(p.dmg),
      shield: n(p.shield),
      proc: n(p.proc),
      pro: Boolean(p.pro),
    };
  }
  return out;
}

export function loadDielna(): Dielna {
  if (typeof localStorage === "undefined") return emptyDielna();
  try {
    return sanitizeDielna(JSON.parse(localStorage.getItem(KEY) || "null"));
  } catch {
    return emptyDielna();
  }
}

export function saveDielna(dielna: Dielna): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(sanitizeDielna(dielna)));
}

/** What the bot buys between runs. Damage, then a shield, then Pro on the hitter. Then it stops. */
export function botSpend(dielna: Dielna): Dielna {
  const plan: { sym: SymId; track: PerkTrack }[] = [
    { sym: "krimp", track: "dmg" },
    { sym: "krimp", track: "dmg" },
    { sym: "blocek", track: "dmg" },
    { sym: "stit", track: "shield" },
    { sym: "krimp", track: "pro" },
  ];
  let next = dielna;
  for (const step of plan) {
    const perk = perkOf(next, step.sym);
    if (step.track === "pro") {
      if (perk.pro) continue;
    } else if (perk[step.track] >= PERK_CAP) continue;
    const cost = perkCost(step.track, step.track === "pro" ? 1 : perk[step.track] + 1);
    if (next.screws < cost) break;
    next = buyPerk(next, step.sym, step.track);
  }
  return next;
}

/** Move one rank, or Pro, from one card to another. Costs RESPEC_FEE even when the move is the whole point. */
export function respec(dielna: Dielna, from: SymId, to: SymId, track: PerkTrack): Dielna {
  if (from === to || !LOADOUT_POOL.includes(from) || !LOADOUT_POOL.includes(to)) return dielna;
  if (dielna.screws < RESPEC_FEE) return dielna;
  const a = perkOf(dielna, from);
  const b = perkOf(dielna, to);
  if (track === "pro") {
    if (!a.pro || b.pro) return dielna;
    return {
      screws: dielna.screws - RESPEC_FEE,
      perks: { ...dielna.perks, [from]: { ...a, pro: false }, [to]: { ...b, pro: true } },
      name: dielna.name,
      loadout: dielna.loadout,
    };
  }
  if (a[track] <= 0 || b[track] >= PERK_CAP) return dielna;
  return {
    screws: dielna.screws - RESPEC_FEE,
    perks: {
      ...dielna.perks,
      [from]: { ...a, [track]: a[track] - 1 },
      [to]: { ...b, [track]: b[track] + 1 },
    },
    name: dielna.name,
    loadout: dielna.loadout,
  };
}

export function perkLine(perk: MetaPerk): string {
  const bits: string[] = [];
  if (perk.dmg) bits.push(`+${perk.dmg} úder`);
  if (perk.shield) bits.push(`+${perk.shield} štít`);
  if (perk.proc) bits.push(`+${perk.proc * 4} % proc`);
  if (perk.pro) bits.push("Pro ×1,12");
  return bits.length ? bits.join(" · ") : "bez trvalej úpravy";
}
