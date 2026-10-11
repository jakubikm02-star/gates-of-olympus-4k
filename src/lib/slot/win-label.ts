/**
 * What kind of win a board row is, for the price board (Leaderboard.tsx).
 *
 * Two things arrive per row: `best_how` (free text, 80 chars, always stored) and `best_recipe` (jsonb, only the six
 * modes board_recipe_clean() accepts: base / fs / buy / zasah / duel / ticket, and dropped for base / fs / buy / zasah
 * when the stake is 0 or the win is over 6200× the stake). KONTROLA, Ž-BOX, KOLESO, ZLATÝ BONUS and the jackpot share
 * have no recipe mode, so they only live in the text. Every label bumpToday() writes is built here and every one
 * maps to a BOARD_KIND entry (win-label.test.ts checks both, and greps use-slot-game.ts for the callers).
 */
import { WIN_POP_X } from "./symbols.ts";
import type { WinRecipe } from "./win-recipe.ts";

export type BoardKind = "base" | "zasah" | "fs" | "buy" | "duel" | "ticket" | "share" | "kontrola" | "zbox" | "koleso" | "unknown";

/** Text on the mode chip and its tooltip, per kind. A Record, so a new kind cannot ship without a display entry. */
export const BOARD_KIND: Record<BoardKind, { label: string; title: string }> = {
  base: { label: "ZÁKLAD", title: "Základná hra" },
  zasah: { label: "ZÁSAH", title: "Výhra počas ZÁSAHU" },
  fs: { label: "4KA TV", title: "4KA TV (točenia zadarmo)" },
  buy: { label: "KÚPA", title: "Kúpená 4KA TV" },
  duel: { label: "VERSUS", title: "Výhra vo VERSUS (2 až 4 hráči)" },
  ticket: { label: "LÍSTOK", title: "Parkovací lístok (jackpot)" },
  share: { label: "PODIEL", title: "Podiel z jackpotu, ktorý trafil iný hráč" },
  kontrola: { label: "KONTROLA", title: "Bonus KONTROLA" },
  zbox: { label: "Ž-BOX", title: "Bonus Ž-BOX (Pakeťák)" },
  koleso: { label: "KOLESO", title: "Bonus KOLESO NEŠŤASTIA" },
  unknown: { label: "?", title: "Spôsob výhry nie je zaznamenaný" },
};

/** Labels written by the pick bonuses and the jackpot share. */
export const PICK_HOW = { kontrola: "KONTROLA", zbox: "Ž-BOX", koleso: "KOLESO" } as const;
export type PickMode = keyof typeof PICK_HOW;
export const GOLD_HOW = "ZLATÝ BONUS";
export const SHARE_HOW = "LÍSTOK podiel";

/** Board text of a pick bonus. A gold run (ZLATÝ BONUS, first bar bonus of the day) says so up front. */
export function pickHow(mode: PickMode, gold = false): string {
  return gold ? `${GOLD_HOW} · ${PICK_HOW[mode]}` : PICK_HOW[mode];
}

function norm(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, " ");
}

/** Kind from the text alone (old rows, rows whose recipe the server dropped, kinds without a recipe mode). */
export function kindFromHow(how: string): { kind: BoardKind; gold: boolean } {
  const parts = (how || "")
    .split("·")
    .map(norm)
    .filter(Boolean);
  let gold = false;
  if (parts[0] === GOLD_HOW || parts[0] === "ZLATY BONUS" || parts[0] === "ZLATÝ") {
    gold = true;
    parts.shift();
  }
  const head = parts[0] ?? "";
  let kind: BoardKind = "unknown";
  if (head === "BASE" || head === "ZÁKLAD") kind = "base";
  else if (head === "ZÁSAH") kind = "zasah";
  else if (head === "PARKNET" || head === "4KA TV") kind = "fs";
  else if (head === "KÚPA") kind = "buy";
  else if (head === "DUEL" || head === "VERSUS") kind = "duel";
  else if (head === "LÍSTOK PODIEL" || head === "PODIEL") kind = "share";
  else if (head.startsWith("LÍSTOK")) kind = "ticket";
  else if (head === "KONTROLA") kind = "kontrola";
  else if (head === "Ž-BOX" || head === "ZBOX" || head === "PAKEŤÁK") kind = "zbox";
  else if (head === "KOLESO") kind = "koleso";
  return { kind, gold };
}

export interface BoardMark {
  kind: BoardKind;
  /** ZLATÝ BONUS run. */
  gold: boolean;
  /** MASÍVNA VÝHRA (250× the stake or more) — a size, not a source; shown as an extra badge. */
  massive: boolean;
}

/** Kinds paid from a pool or another player's stake: the "× stávky" multiple means nothing there. */
export function isPoolKind(kind: BoardKind): boolean {
  return kind === "ticket" || kind === "share" || kind === "duel";
}

/**
 * The row's kind: the structured recipe when the server kept one, refined by the text (a jackpot share is stored
 * without a tier; a base spin during ZÁSAH may have lost its recipe), else the text alone.
 */
export function boardMark(how: string, recipe: WinRecipe | null, best = 0, stake = 0): BoardMark {
  const text = kindFromHow(how);
  let kind: BoardKind = recipe ? recipe.mode : text.kind;
  if (recipe && text.kind === "share") kind = "share";
  if (recipe?.mode === "base" && text.kind === "zasah") kind = "zasah";
  if (recipe?.mode === "fs" && text.kind === "buy") kind = "buy";
  const massive = !isPoolKind(kind) && stake > 0 && best > 0 && best / stake >= WIN_POP_X.massive && best / stake <= 6200;
  return { kind, gold: text.gold, massive };
}

/**
 * Board text (best_how) of a spin / bonus / duel win. Max 80 chars, like the server column.
 * BASE during ZÁSAH writes "ZÁSAH", a bought 4KA TV writes "KÚPA · 4KA TV": the recipe says the same, but the
 * server drops the recipe for big multiples / zero stakes, and then only this text is left.
 */
export function winHow(opts: {
  mode: "BASE" | "ZÁSAH" | "PARKNET" | "LÍSTOK" | "DUEL";
  pops?: number;
  pays?: string[];
  signal?: number;
  pdf?: number;
  mult?: number;
  spins?: number;
  ticket?: string;
  duel?: string;
  bought?: boolean;
}): string {
  if (opts.mode === "LÍSTOK") return `LÍSTOK ${opts.ticket ?? ""}`.trim().slice(0, 80);
  if (opts.mode === "DUEL") return ["DUEL", opts.duel].filter(Boolean).join(" · ").slice(0, 80);
  const spin = opts.mode === "BASE" || opts.mode === "ZÁSAH";
  const bits: string[] = spin ? [opts.mode] : opts.bought ? ["KÚPA", "4KA TV"] : ["4KA TV"];
  const cap = bits.length + 3;
  if (spin) {
    for (const name of (opts.pays ?? []).slice(0, 2)) bits.push(name);
    if ((opts.pops ?? 0) > 0 && bits.length < cap) bits.push(`${opts.pops} Cluster tumble`);
  } else {
    if ((opts.signal ?? 0) > 1) bits.push(`SIGNÁL ${Math.round(opts.signal!)}×`);
    if ((opts.pdf ?? 0) > 0 && bits.length < cap) bits.push(`${opts.pdf}× PDF`);
    if ((opts.mult ?? 0) > 1 && bits.length < cap) bits.push(`${Math.round(opts.mult!)}×`);
    if ((opts.spins ?? 0) > 0 && bits.length < cap) bits.push(`${opts.spins} točení`);
  }
  return bits.slice(0, cap).join(" · ").slice(0, 80);
}
