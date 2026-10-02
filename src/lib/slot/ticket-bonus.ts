import { formatMoney } from "./format.ts";
import { jobBaseDone, jobBonusDone, jobLeft, jobShownGoal, jobSplit, jobTriesLeft, spinWord, triesWord, type JobCard } from "./spend.ts";

/**
 * Display-only read of a ticket: does finishing it depend on 4KA TV (the bonus)?
 * Mirrors the counting rules in spend.ts (jobOnThisSpin / tickJob). Never changes a ticket.
 *
 * - "buy":     only a BOUGHT 4KA TV counts (template noc).
 * - "fs":      counts only on 4KA TV spins, natural or bought (scope "live": signal, plechovky).
 * - "trigger": 4KA TV has to land naturally in the base game; a buy does not count (template siet).
 *              Ante doubles the 4KA TV chance, so it is the useful switch here.
 */
export type BonusNeed = "buy" | "fs" | "trigger";

export interface TicketLeg {
  /** Where this goal counts. "trigger" goals count base spins. */
  where: "base" | "bonus";
  need: BonusNeed | null;
  label: string;
  meter: string;
  /** Narrow meter for the fixed strip (cash in whole euros). */
  meterShort?: string;
  goal: string;
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

const RANK: Record<BonusNeed, number> = { buy: 3, fs: 2, trigger: 1 };

export function legNeed(kind: JobCard["kind"], scope: JobCard["scope"]): BonusNeed | null {
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

function legLabel(need: BonusNeed | null): string {
  if (need === "buy") return "KÚPA";
  if (need === "fs") return "4KA TV";
  return "ZÁKLAD";
}

export function ticketBonus(job: JobCard): TicketBonus {
  const a = legNeed(job.kind, job.scope);
  const legs: TicketLeg[] = [];
  const two = Boolean(job.kindB);
  if (two) {
    const goals = jobShownGoal(job).split(" + ");
    const b = legNeed(job.kindB!, job.scopeB);
    legs.push({
      where: a === "buy" || a === "fs" ? "bonus" : "base",
      need: a,
      label: legLabel(a),
      meter: meterOf(job.kind, job.have, job.need),
      meterShort: meterShortOf(job.kind, job.have, job.need),
      goal: goals[0] ?? "",
    });
    legs.push({
      where: b === "buy" || b === "fs" ? "bonus" : "base",
      need: b,
      label: legLabel(b),
      meter: meterOf(job.kindB!, job.haveB ?? 0, job.needB ?? 0),
      meterShort: meterShortOf(job.kindB!, job.haveB ?? 0, job.needB ?? 0),
      goal: goals.slice(1).join(" + "),
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
  }
  if (dual) badge = need === "buy" ? "DVOJITÝ · ZÁKLAD + KÚPA 4KA TV" : "DVOJITÝ · ZÁKLAD + 4KA TV";
  return { need, dual, split, legs, badge, pill, hint, cta };
}
