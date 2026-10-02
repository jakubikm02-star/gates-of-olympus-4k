import { ORB_VALUES, PAY_SYMBOLS, type PayId, type TicketId } from "./symbols.ts";

/**
 * How a max win was made, in a shape small enough for one jsonb cell.
 * Client-reported: the server re-checks shape and ranges, but a player with the
 * anon key can still send a well-formed lie. Show it as "how", never as proof.
 */
export type RecipeMode = "base" | "fs" | "buy" | "zasah" | "duel" | "ticket";

export interface RecipePay {
  id: PayId;
  /** Largest cluster of this symbol in the win (8+). */
  n: number;
}

export interface WinRecipe {
  v: 1;
  mode: RecipeMode;
  /** Pay symbols that paid, biggest contribution first (max 3). */
  pays: RecipePay[];
  /** Can values that landed with a win, biggest first (max 6). */
  cans?: number[];
  /** Base: can sum applied. Free spins: final total multiplier. */
  mult?: number;
  /** 4ka TV count that opened the feature (or landed in base). */
  scatters?: number;
  tumbles?: number;
  /** Free spins played / extra spins from retriggers. */
  spins?: number;
  extra?: number;
  ante?: boolean;
  ticket?: TicketId;
  /** Duel score: mine, theirs. */
  vs?: [number, number];
  /** Bonus/tax modifier applied to the feature (1.23 / 0.77). */
  mod?: number;
  /** Rebuilt from the old text column — partial by nature. */
  legacy?: boolean;
}

const MODES: readonly RecipeMode[] = ["base", "fs", "buy", "zasah", "duel", "ticket"];
const PAY_IDS = new Set<string>(PAY_SYMBOLS.map((s) => s.id));
const TICKET_IDS = new Set<string>(["ulica", "okres", "kraj", "stat"]);
const ORBS = new Set<number>(ORB_VALUES);

function int(v: unknown, lo: number, hi: number): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  const n = v;
  const r = Math.round(n);
  return r >= lo && r <= hi ? r : undefined;
}

/** Whitelist + range check. Same limits as board_recipe_clean() in SQL. */
export function cleanRecipe(raw: unknown): WinRecipe | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1 || !MODES.includes(o.mode as RecipeMode)) return null;
  const out: WinRecipe = { v: 1, mode: o.mode as RecipeMode, pays: [] };
  if (Array.isArray(o.pays)) {
    for (const p of o.pays.slice(0, 12)) {
      const q = p as Record<string, unknown> | null;
      const id = typeof q?.id === "string" ? q.id : "";
      const n = int(q?.n, 8, 30);
      if (PAY_IDS.has(id) && n !== undefined && !out.pays.some((x) => x.id === id)) out.pays.push({ id: id as PayId, n });
      if (out.pays.length >= 3) break;
    }
  }
  if (Array.isArray(o.cans)) {
    const cans = o.cans
      .slice(0, 24)
      .map((c) => int(c, 2, 500))
      .filter((c): c is number => c !== undefined && ORBS.has(c))
      .slice(0, 6);
    if (cans.length) out.cans = cans;
  }
  const mult = int(o.mult, 1, 100_000);
  if (mult !== undefined && mult > 1) out.mult = mult;
  const scatters = int(o.scatters, 3, 30);
  if (scatters !== undefined) out.scatters = scatters;
  const tumbles = int(o.tumbles, 1, 99);
  if (tumbles !== undefined) out.tumbles = tumbles;
  const spins = int(o.spins, 1, 500);
  if (spins !== undefined) out.spins = spins;
  const extra = int(o.extra, 1, 500);
  if (extra !== undefined) out.extra = extra;
  if (o.ante === true) out.ante = true;
  if (typeof o.ticket === "string" && TICKET_IDS.has(o.ticket)) out.ticket = o.ticket as TicketId;
  if (Array.isArray(o.vs) && o.vs.length === 2) {
    const a = int(o.vs[0], 0, 10_000_000);
    const b = int(o.vs[1], 0, 10_000_000);
    if (a !== undefined && b !== undefined) out.vs = [a, b];
  }
  const mod = typeof o.mod === "number" ? Math.round(o.mod * 100) / 100 : NaN;
  if (mod >= 0.5 && mod <= 2 && mod !== 1) out.mod = mod;
  if (o.legacy === true) out.legacy = true;
  return out;
}

/** Per-sequence tally the spin loop fills in. */
export interface SeqTally {
  pays: Map<PayId, { n: number; x: number }>;
  cans: number[];
  scatters: number;
  tumbles: number;
}

export function emptyTally(): SeqTally {
  return { pays: new Map(), cans: [], scatters: 0, tumbles: 0 };
}

export function notePays(t: SeqTally, wins: readonly { payId: PayId | "scatter"; count: number; payX: number }[]): void {
  for (const w of wins) {
    if (w.payId === "scatter") continue;
    const had = t.pays.get(w.payId);
    t.pays.set(w.payId, { n: Math.max(had?.n ?? 0, w.count), x: (had?.x ?? 0) + w.payX });
  }
}

/** Fold one free spin's tally into the feature total. Scatters stay = what opened the feature. */
export function mergeTally(into: SeqTally, add: SeqTally): void {
  for (const [id, v] of add.pays) {
    const had = into.pays.get(id);
    into.pays.set(id, { n: Math.max(had?.n ?? 0, v.n), x: (had?.x ?? 0) + v.x });
  }
  into.cans.push(...add.cans);
  into.tumbles += add.tumbles;
}

export function topPays(t: SeqTally, max = 3): RecipePay[] {
  return [...t.pays.entries()]
    .sort((a, b) => b[1].x - a[1].x || b[1].n - a[1].n)
    .slice(0, max)
    .map(([id, v]) => ({ id, n: Math.min(30, v.n) }));
}

export function topCans(cans: readonly number[], max = 6): number[] {
  return [...cans].filter((c) => ORBS.has(c)).sort((a, b) => b - a).slice(0, max);
}

const NAME_TO_ID = new Map<string, PayId>(PAY_SYMBOLS.map((s) => [s.name.toLowerCase(), s.id]));

/**
 * Best effort from the old 80-char text (e.g. "PARKNET · 42× · 22 FS",
 * "BASE · Krytina · PDF 4K 5G · 1 pop"). Only what the text says; cluster
 * counts were never stored, so pays come back with n = 8 and are marked legacy.
 */
export function recipeFromHow(how: string): WinRecipe | null {
  const parts = how
    .split("·")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const head = parts[0].toUpperCase();
  let mode: RecipeMode;
  if (head === "BASE") mode = "base";
  else if (head === "PARKNET" || head === "4KA TV") mode = "fs";
  else if (head === "KÚPA") mode = "buy";
  else if (head === "DUEL") mode = "duel";
  else if (head.startsWith("LÍSTOK")) mode = "ticket";
  else return null;
  const r: WinRecipe = { v: 1, mode, pays: [], legacy: true };
  if (mode === "ticket") {
    const m = /([1-4])-FTTB/.exec(how);
    const tier = m ? (["ulica", "okres", "kraj", "stat"] as const)[Number(m[1]) - 1] : undefined;
    if (tier) r.ticket = tier;
    return r;
  }
  const mults: number[] = [];
  for (const raw of parts.slice(1)) {
    const p = raw.trim();
    const id = NAME_TO_ID.get(p.toLowerCase());
    let m: RegExpExecArray | null;
    if (id) r.pays.push({ id, n: 8 });
    else if ((m = /^(\d+)\s*(?:pop|cluster tumble)$/i.exec(p))) r.tumbles = Number(m[1]);
    else if ((m = /^(\d+)\s*(?:FS|točení)$/i.exec(p))) r.spins = Number(m[1]);
    else if ((m = /^(\d+)\s*scatter$/i.exec(p))) r.scatters = Number(m[1]);
    else if ((m = /^SIGNÁL\s*(\d+)×$/i.exec(p))) r.mult = Number(m[1]);
    else if ((m = /^(\d+)×$/.exec(p))) mults.push(Number(m[1]));
    else if ((m = /^(\d+)\s*vs\s*(\d+)$/i.exec(p))) r.vs = [Number(m[1]), Number(m[2])];
  }
  if (mults.length && r.mult === undefined) {
    if (mode === "base") {
      const cans = mults.filter((x) => ORBS.has(x));
      const odd = mults.filter((x) => !ORBS.has(x));
      if (cans.length) r.cans = topCans(cans);
      if (odd.length) r.mult = Math.max(...odd);
    } else r.mult = Math.max(...mults);
  }
  return cleanRecipe(r);
}

/** One-line Slovak reading of the recipe for screen readers and tooltips. */
export function recipeSentence(r: WinRecipe | null, payName: (id: PayId) => string): string {
  if (!r) return "Spôsob výhry nie je zaznamenaný.";
  const bits: string[] = [];
  const mode: Record<RecipeMode, string> = {
    base: "Základná hra",
    fs: "4KA TV",
    buy: "Kúpená 4KA TV",
    zasah: "ZÁSAH",
    duel: "Duel",
    ticket: "Parkovací lístok (jackpot)",
  };
  bits.push(mode[r.mode]);
  if (r.ante) bits.push("s ANTE");
  if (r.scatters) bits.push(`${r.scatters}× 4ka TV`);
  if (r.spins) bits.push(`${r.spins} točení 4KA TV${r.extra ? ` (+${r.extra} navyše)` : ""}`);
  for (const p of r.pays) bits.push(r.legacy ? payName(p.id) : `${p.n}× ${payName(p.id)}`);
  if (r.cans?.length) bits.push(`plechovky ${r.cans.map((c) => `${c}×`).join(", ")}`);
  if (r.mult) bits.push(r.mode === "base" ? `násobič ${r.mult}×` : `celkový násobič ${r.mult}×`);
  if (r.tumbles) bits.push(`${r.tumbles} Cluster tumble`);
  if (r.vs) bits.push(`skóre ${r.vs[0]} : ${r.vs[1]}`);
  if (r.mod) bits.push(r.mod > 1 ? `bonus ${r.mod}×` : `daň ${r.mod}×`);
  return bits.join(", ") + ".";
}
