import { formatMoney } from "./format.ts";
import { featureOf, jobBaseDone, jobBonusDone, jobLeft, jobShownGoal, jobSplit, jobTriesLeft, spinWord, triesWord, type JobCard } from "./spend.ts";

/**
 * Display-only read of a ticket: does finishing it depend on 4KA TV (the bonus)?
 * Mirrors the counting rules in spend.ts (jobOnThisSpin / tickJob). Never changes a ticket.
 *
 * - "buy":     only a BOUGHT 4KA TV counts (template noc).
 * - "fs":      counts only on 4KA TV spins, natural or bought (scope "live": signal, plechovky).
 * - "trigger": 4KA TV has to land naturally in the base game; a buy does not count (template siet).
 *              Ante doubles the 4KA TV chance, so it is the useful switch here.
 */
export type BonusNeed = "buy" | "fs" | "trigger" | FeatureNeed;

/**
 * Feature tickets (spend.ts FEATURE_TEMPLATES): the goal needs a game feature to run.
 * - "zasah":    ZÁSAH (starts when the HLÁSENIE heat bar is full),
 * - "bar":      the bonus bar or its bonus, whichever mode the 1/3 draw gives (KONTROLA, Ž-BOX, KOLESO),
 * - "kontrola": only a KONTROLA counts (a Ž-BOX or KOLESO from the bar does not),
 * - "zbox":     only a Ž-BOX counts (KONTROLA / KOLESO do not).
 */
export type FeatureNeed = "zasah" | "bar" | "kontrola" | "zbox";

const FEATURE_NOTE: Record<FeatureNeed, { badge: string; pill: string; hint: string }> = {
  zasah: {
    badge: "LEN V ZÁSAHU",
    pill: "ZÁSAH",
    hint:
      "ZÁSAH sa spustí, keď sa výhrami naplní HLÁSENIE. Spiny ZÁSAHU minú točenia tiketu, 4KA TV nie. Ak ZÁSAH beží pri poslednom točení, tiket počká na jeho koniec.",
  },
  bar: {
    badge: "BONUS BAR · KONTROLA, Ž-BOX ALEBO KOLESO",
    pill: "BONUS",
    hint:
      "Bonus bar plnia mŕtve spiny (+2) a 3 scattery (+30). Plný bar losuje KONTROLU, Ž-BOX alebo KOLESO NEŠŤASTIA (každé 1/3), počíta sa všetko. Bonus spustený posledným točením sa ešte odohrá.",
  },
  kontrola: {
    badge: "LEN V KONTROLE",
    pill: "KONTROLA",
    hint:
      "Ráta sa len KONTROLA. Plný bonus bar losuje režim (každý 1/3), Ž-BOX ani KOLESO sa pri tomto tikete nepočítajú (limit je na to nastavený). Bonus spustený posledným točením sa ešte odohrá.",
  },
  zbox: {
    badge: "LEN V Ž-BOXE",
    pill: "Ž-BOX",
    hint:
      "Ráta sa len Ž-BOX. Plný bonus bar losuje režim (každý 1/3), KONTROLA ani KOLESO sa pri tomto tikete nepočítajú (limit je na to nastavený). Bonus spustený posledným točením sa ešte odohrá.",
  },
};

export function isFeatureNeed(need: BonusNeed | null | undefined): need is FeatureNeed {
  return need === "zasah" || need === "bar" || need === "kontrola" || need === "zbox";
}

export interface TicketLeg {
  /** Where this goal counts. "trigger" goals count base spins. */
  where: "base" | "bonus";
  need: BonusNeed | null;
  label: string;
  meter: string;
  /** Narrow meter for the fixed strip (cash in whole euros). */
  meterShort?: string;
  goal: string;
  /** This goal's own progress 0..1, for its own bar. */
  pct: number;
  done: boolean;
  /** Split dual only: this goal's own budget left ("32 toč." / "3 kolá"), "✓" when the goal is done. */
  left?: string;
  /** Same budget, long form for the sheet and offer ("32 točení v hre" / "3 kolá 4KA TV"). */
  budget?: string;
  late?: boolean;
}

export interface TicketBonus {
  need: BonusNeed | null;
  /** One goal counts in the base game, the other only in 4KA TV. */
  dual: boolean;
  /** Dual ticket with its own budget per goal (base spins / 4KA TV rounds). Older saves: false, one shared clock. */
  split: boolean;
  legs: TicketLeg[];
  /** Big badge on offer cards and the sheet. */
  badge: string;
  /** Short pill on the fixed-height strip. */
  pill: string;
  /** One sentence for the sheet / offer card. */
  hint: string;
  cta: "buy" | "ante" | null;
}

const RANK: Record<BonusNeed, number> = { buy: 3, fs: 2, trigger: 1, zasah: 1, bar: 1, kontrola: 1, zbox: 1 };

export function legNeed(kind: JobCard["kind"], scope: JobCard["scope"], template?: string): BonusNeed | null {
  const feat = featureOf(template);
  if (feat) return feat;
  if (kind === "buy") return "buy";
  if (scope === "live") return "fs";
  if (kind === "live") return "trigger";
  return null;
}

function meterOf(kind: JobCard["kind"], have: number, need: number): string {
  if (kind === "cash") return `${formatMoney(have)}/${formatMoney(need)} €`;
  return `${have}/${need}`;
}

function meterShortOf(kind: JobCard["kind"], have: number, need: number): string | undefined {
  if (kind !== "cash") return undefined;
  return `${Math.floor(have)}/${Math.ceil(need)} €`;
}

function partOf(have: number, need: number): number {
  return need > 0 ? Math.min(1, Math.max(0, have / need)) : 0;
}

function legLabel(need: BonusNeed | null): string {
  if (need === "buy") return "KÚPA";
  if (need === "fs") return "4KA TV";
  return "ZÁKLAD";
}

export function ticketBonus(job: JobCard): TicketBonus {
  const a = legNeed(job.kind, job.scope, job.template);
  const legs: TicketLeg[] = [];
  const two = Boolean(job.kindB);
  if (two) {
    const goals = jobShownGoal(job).split(" + ");
    const b = legNeed(job.kindB!, job.scopeB, job.templateB);
    legs.push({
      where: a === "buy" || a === "fs" ? "bonus" : "base",
      need: a,
      label: legLabel(a),
      meter: meterOf(job.kind, job.have, job.need),
      meterShort: meterShortOf(job.kind, job.have, job.need),
      goal: goals[0] ?? "",
      pct: partOf(job.have, job.need),
      done: job.have >= job.need,
    });
    legs.push({
      where: b === "buy" || b === "fs" ? "bonus" : "base",
      need: b,
      label: legLabel(b),
      meter: meterOf(job.kindB!, job.haveB ?? 0, job.needB ?? 0),
      meterShort: meterShortOf(job.kindB!, job.haveB ?? 0, job.needB ?? 0),
      goal: goals.slice(1).join(" + "),
      pct: partOf(job.haveB ?? 0, job.needB ?? 1),
      done: (job.haveB ?? 0) >= (job.needB ?? 1),
    });
  }
  const needs = (two ? legs.map((l) => l.need) : [a]).filter((n): n is BonusNeed => n != null);
  const need = needs.sort((x, y) => RANK[y] - RANK[x])[0] ?? null;
  const dual = two && legs[0].where !== legs[1].where;
  // Base leg first so the strip always reads ZÁKLAD → 4KA TV.
  if (dual && legs[0].where === "bonus") legs.reverse();
  const split = dual && jobSplit(job);
  if (split) {
    const base = legs[0];
    const bonusLeg = legs[1];
    const left = jobLeft(job);
    const tl = jobTriesLeft(job);
    base.left = jobBaseDone(job) ? "✓" : `${left} toč.`;
    base.budget = jobBaseDone(job) ? "hotové" : `${left} ${spinWord(left)} v hre`;
    base.late = !jobBaseDone(job) && left <= 5;
    bonusLeg.left = jobBonusDone(job) ? "✓" : `${tl} ${triesWord(tl)}`;
    bonusLeg.budget = jobBonusDone(job)
      ? "hotové"
      : `${tl} ${triesWord(tl)} ${bonusLeg.need === "buy" ? "kúpenej 4KA TV" : "4KA TV"}`;
    bonusLeg.late = !jobBonusDone(job) && tl <= 1;
  }
  const round = need === "buy" ? "kolo = jedna kúpená 4KA TV" : "kolo = jedna celá 4KA TV, spustená v hre alebo kúpená";
  const shared = split
    ? ` Každá úloha má vlastný limit: točenia v hre pre základnú úlohu, kolá 4KA TV pre bonusovú (${round}). Točenia v 4KA TV neminú točenia v hre a naopak. Tiket padne, keď nesplnenej úlohe dôjde jej limit.`
    : two
      ? " Limit točení je spoločný pre obe úlohy, ráta sa každé točenie aj v 4KA TV."
      : "";
  let badge = "";
  let pill = "";
  let hint = "";
  let cta: TicketBonus["cta"] = null;
  if (need === "buy") {
    badge = "VYŽADUJE KÚPU 4KA TV";
    pill = "KÚPA";
    hint = "Ráta sa len kúpená 4KA TV. Prirodzene spustená sa nepočíta." + shared;
    cta = "buy";
  } else if (need === "fs") {
    badge = "BONUS · LEN V 4KA TV";
    pill = "4KA TV";
    hint = two
      ? "Jedna úloha sa ráta len v 4KA TV. Spusti ju v hre alebo ju kúp." + shared
      : "Ráta sa len v 4KA TV. Spusti ju v hre alebo ju kúp. Točenia v základnej hre limit neminú.";
    cta = "buy";
  } else if (need === "trigger") {
    badge = "SPUSTI 4KA TV V HRE";
    pill = "SPUSTI TV";
    hint = "4KA TV musí padnúť v základnej hre, kúpa sa nepočíta. Odporúčame ANTE (4KA TV ×2)." + shared;
    cta = "ante";
  } else if (isFeatureNeed(need)) {
    ({ badge, pill, hint } = FEATURE_NOTE[need]);
  }
  if (dual) badge = need === "buy" ? "DVOJITÝ · ZÁKLAD + KÚPA 4KA TV" : "DVOJITÝ · ZÁKLAD + 4KA TV";
  return { need, dual, split, legs, badge, pill, hint, cta };
}
