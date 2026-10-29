/**
 * "Dnes v automate": the short plain-language popover behind the Spektrum carton.
 * Pure: reads only the HUD snapshot (real game state), never changes it. One line per effect.
 */
import { COLORS, ROLE_MOOD, ROLE_OPPONENT, ROLE_SUPPORT, type SpectrumHud } from "./spectrum.ts";
import { formatMoney } from "./format.ts";
import { cashbackLabel } from "./cashback.ts";

/** What each colour does to the slot, without its name. Same facts as COLOR_TIP in spectrum.ts. */
export const COLOR_DOES: Readonly<Record<number, string>> = {
  0: "plechovku zdvojnásobí, alebo ju zamietne",
  1: "pridá krok tiketu, alebo 10 % výhry odloží do 1-FTTB",
  2: "dobije HLÁSENIE (ZÁSAH), alebo zníži výhru spinu",
  3: "podrží plechovku cez tumble, bez tumble prepadne",
  4: "posunie BONUS bar, alebo zníži plechovku",
  5: "pridá alebo uberie 4 RP",
  6: "pridá +0,5× do Cashback bonusu (max ×3), alebo 0,5× uberie",
};

/** Label printed on the carton under each can. Full names are in the popover. */
export const COLOR_SHORT: Readonly<Record<number, string>> = {
  0: "REKLAM.",
  1: "PRÍPL.",
  2: "UPOM.",
  3: "SIGNÁL",
  4: "ČAKAČ.",
  5: "SOLID.",
  6: "VERN.",
};

const ROLE_HOW: Readonly<Record<string, string>> = {
  [ROLE_MOOD]: "padá najčastejšie",
  [ROLE_SUPPORT]: "padá občas",
  [ROLE_OPPONENT]: "padá zriedka",
};

const WEATHER_DOES = [
  "farby dnes hýbu výhrou slabšie",
  "farby hýbu výhrou normálne",
  "farby občas hýbu výhrou silnejšie, do plusu aj do mínusu",
];

/** 1 spin, 2–4 spiny, 5+ spinov. */
export function spinsSk(n: number): string {
  const k = Math.max(0, Math.floor(n));
  if (k === 1) return "1 spin";
  if (k >= 2 && k <= 4) return `${k} spiny`;
  return `${k} spinov`;
}

export interface SummaryLine {
  key: string;
  /** Colour dot, when the line is a colour. */
  hex?: string;
  /** Bold lead (name). */
  lead: string;
  text: string;
}

export interface SpektrumSummary {
  title: string;
  lines: SummaryLine[];
  kicker: string;
  foot: string;
}

export function spektrumSummary(hud: SpectrumHud): SpektrumSummary {
  const lines: SummaryLine[] = [];
  for (const r of hud.roles) {
    const c = COLORS[r.id];
    if (!c) continue;
    const left = hud.lit[r.id] ?? 0;
    const how = ROLE_HOW[r.role] ?? "";
    const when = left > 0 ? `Svieti ešte ${spinsSk(left)}.` : "Teraz nesvieti.";
    lines.push({
      key: `c${r.id}`,
      hex: c.hex,
      lead: c.name,
      text: `${COLOR_DOES[r.id] ?? ""}${how ? ` (${how})` : ""}. ${when}`,
    });
  }
  const wi = Math.min(2, Math.max(0, hud.weather | 0));
  lines.push({ key: "w", lead: `Počasie ${hud.weatherLabel || "Bežný"}:`, text: `${WEATHER_DOES[wi]}.` });
  if (hud.fttb > 0) lines.push({ key: "f", lead: "1-FTTB", text: `dvojnásobná šanca ešte ${spinsSk(hud.fttb)}.` });
  if (hud.cashback > 0) {
    lines.push({ key: "cb", lead: `Cashback ${cashbackLabel(hud.cashback)}`, text: "čaká na najbližší Cashback bonus (KONTROLA, Ž-BOX alebo KOLESO)." });
  }
  if (hud.pending > 0) lines.push({ key: "p", lead: "Odložené", text: `${formatMoney(hud.pending)} z PRÍPLATKU čaká na 1-FTTB.` });
  return {
    title: "DNES V AUTOMATE",
    kicker: "Čo ti automat dnes namiešal",
    lines,
    foot: "Platí do polnoci, len v základnej hre. Svietiace farby robia páry, opačná farba ich zhasne.",
  };
}
