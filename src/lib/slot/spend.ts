import { PAY_SYMBOLS, payName, type PayId } from "./symbols.ts";
import { formatMoney } from "./format.ts";
import type { TierId } from "./jackpot";

/** Jobs unlock at this credit, any bet. */
export const JOB_BANK = 100;
export const SURPLUS_X = JOB_BANK;

export type JobFloor = "lacna" | "stred" | "draha";

export interface JobCard {
  id: string;
  floor: JobFloor;
  template: string;
  title: string;
  detail: string;
  /** Plain target shown under the reels. Creative title stays on the picker only. */
  goal?: string;
  stake: number;
  payout: number;
  need: number;
  have: number;
  limit: number;
  spun: number;
  kind:
    | "wins"
    | "deads"
    | "tumbles"
    | "live"
    | "ticket"
    | "pdf"
    | "signal"
    | "symbol"
    | "buy"
    | "hydra"
    | "chain"
    | "collect"
    | "cash"
    // Feature tickets (FEATURE_TEMPLATES): ZÁSAH starts, best of one ZÁSAH, KONTROLA · Ž-BOX bar points, bar bonuses, best of one bar bonus.
    | "zasah"
    | "zasahBest"
    | "bar"
    | "bonus"
    | "bonusBest";
  scope?: "base" | "live" | "any";
  /** Bet locked for the life of the job. */
  lockBet: number;
  mystery?: boolean;
  payId?: PayId;
  payIdB?: PayId;
  needB?: number;
  haveB?: number;
  /** OTRS second goal. Both have to finish. */
  kindB?: JobCard["kind"];
  templateB?: string;
  scopeB?: "base" | "live" | "any";
  /** Clock is dead but the LIVE feature has not closed yet. */
  seal?: boolean;
  /**
   * Dual OTRS (one goal in the base game, one only in 4KA TV) with split budgets.
   * Set: `limit`/`spun` count base-game spins only (leg A, the base goal) and `tries`/`triesUsed`
   * count 4KA TV rounds for leg B. Unset (older saves): one shared spin clock for both goals.
   */
  tries?: number;
  triesUsed?: number;
}

/** Share of bank → stake band. Spins-at-bet is the other axis. */
const FLOOR_PCT: Record<JobFloor, { stake: [number, number]; payX: [number, number] }> = {
  lacna: { stake: [0.06, 0.12], payX: [1.55, 1.9] },
  stred: { stake: [0.16, 0.26], payX: [1.7, 2.05] },
  draha: { stake: [0.32, 0.45], payX: [1.85, 2.2] },
};

const FLOOR_SPINS: Record<JobFloor, [number, number]> = {
  lacna: [10, 20],
  stred: [24, 40],
  draha: [48, 80],
};

const TEMPLATES: {
  id: string;
  titles: string[];
  kind: JobCard["kind"];
  scope: JobCard["scope"];
  need: [number, number];
  until: [number, number];
  line: string;
  payIds?: PayId[];
}[] = [
  { id: "zber", titles: ["ZBER", "OBCHÔDZKA", "DENNÁ DÁVKA"], kind: "wins", scope: "base", need: [14, 22], until: [65, 65], line: "výherných spinov dokopy" },
  { id: "balik", titles: ["CLUSTER TUMBLE", "REŤAZ CLUSTER TUMBLE", "DVA A VIAC"], kind: "chain", scope: "base", need: [4, 7], until: [60, 100], line: "spinov s 2+ Cluster tumble dokopy" },
  { id: "pada", titles: ["SÚČET CLUSTER TUMBLE", "CLUSTER TUMBLE", "CLUSTER TUMBLE DOLE"], kind: "tumbles", scope: "base", need: [20, 30], until: [70, 70], line: "Cluster tumble dokopy" },
  { id: "siet", titles: ["SIEŤ", "ANTÉNA", "4KA TV", "ŠTYRI TELEVÍZORY"], kind: "live", scope: "base", need: [1, 1], until: [50, 720], line: "spustiť 4KA TV" },
  { id: "signal", titles: ["TACHYKARDIA", "TEP 180", "PULZ PLECHOVIEK"], kind: "signal", scope: "live", need: [10, 51], until: [30, 30], line: "z násobičov dokopy v 4KA TV" },
  { id: "retaz", titles: ["REŤAZ", "TRI V RADE", "BEZ PRESTÁVKY"], kind: "wins", scope: "base", need: [3, 3], until: [15, 110], line: "výhier po sebe, mŕtvy vynuluje" },
  { id: "plechovky", titles: ["PLECHOVKY", "RAMPA HUČÍ", "PLECH NA PLECH"], kind: "tumbles", scope: "live", need: [3, 9], until: [25, 30], line: "plechoviek dokopy v 4KA TV" },
  { id: "pot", titles: ["POT", "SIVÝ LÍSTOK", "ULICA PADÁ"], kind: "ticket", scope: "base", need: [1, 1], until: [30, 50], line: "sivý lístok 1-FTTB" },
  { id: "sucho", titles: ["SUCHO", "TICHÁ ZÓNA", "RAMPA STOJÍ"], kind: "deads", scope: "base", need: [1, 3], until: [10, 15], line: "mŕtvych spinov po sebe, výhra končí" },
  { id: "vynos", titles: ["VÝNOS", "PDF 8+", "PAPIER PLATÍ"], kind: "pdf", scope: "base", need: [1, 1], until: [50, 180], line: "PDF aspoň 8 na jednom spine" },
  { id: "duo", titles: ["DUO", "DVA CLUSTER", "DVOJIČKA"], kind: "wins", scope: "base", need: [4, 7], until: [55, 90], line: "spinov s 2 cluster dokopy" },
  {
    id: "vyherne",
    titles: ["VÝHERNÝ ZBER", "LEN ČO PLATÍ", "ZBER VÝHIER"],
    kind: "symbol",
    scope: "base",
    payIds: ["rj45", "router", "hap", "roof", "arris", "case", "dacia", "meter", "pdf"],
    need: [1, 1],
    until: [40, 40],
    line: "výhier symbolu dokopy",
  },
  {
    id: "nevyherne",
    titles: ["NEVÝHERNÝ ZBER", "BEZ VÝHRY", "PRÁZDNE KUSY"],
    kind: "collect",
    scope: "base",
    payIds: ["rj45", "router", "hap", "roof", "arris", "case", "dacia", "meter", "pdf"],
    need: [1, 1],
    until: [20, 20],
    line: "nevýherných symbolu dokopy",
  },
  { id: "noc", titles: ["POHOTOVOSŤ", "SLUŽBA POHOTOVOSŤ", "VÝJAZD PO KÚPE"], kind: "buy", scope: "live", need: [2, 6], until: [25, 30], line: "výher dokopy v kúpenej 4KA TV" },
  { id: "hydra", titles: ["HYDRA", "DVA ZNAKY", "DVOJITÝ VÝJAZD"], kind: "hydra", scope: "base", need: [1, 3], until: [50, 80], line: "výhier dvoch znakov dokopy" },
  {
    id: "odpis",
    titles: ["ODPIS NÁKLADOV", "INKASO", "UZÁVIERKA KASY", "VÝBER HOTOVOSTI", "KASA DO ŠUPLÍKA"],
    kind: "cash",
    scope: "base",
    need: [1, 1],
    until: [20, 20],
    line: "€ vo výhrach",
  },
];

/** Which game feature a feature ticket is about (on-card marker, Slovak copy, counting). */
export type FeatureId = "zasah" | "kontrola" | "zbox" | "bar";

type Template = (typeof TEMPLATES)[number] & {
  feat?: FeatureId;
  /** Floors this feature ticket is dealt on (default all). */
  floors?: JobFloor[];
};

function featureFor(floor: JobFloor, rng: () => number): Template {
  return pickOne(
    FEATURE_TEMPLATES.filter((t) => !t.floors || t.floors.includes(floor)),
    rng,
  );
}

/**
 * Feature tickets: ZÁSAH (its HLÁSENIE heat bar), the KONTROLA · Ž-BOX bar (mode drawn 50:50) and each bar mode.
 * Budgets count paid base-game spins (ZÁSAH spins included, 4KA TV spins not), like every base ticket.
 * Each goal is tuned on the real engine (scripts/feature-sim) to the floor's clear rate of the base tickets,
 * so with the same payout bands the ticket return per € stays where it was. "Best of one" goals
 * (HACK, ZÁSAH win, one KONTROLA / Ž-BOX) keep the ticket open past its last spin until that ZÁSAH ends /
 * the bonus armed on the last spin is played (seal), so a run that started in time is never cut off.
 * Left out on purpose (too rare for any spin budget): 4KA TV inside ZÁSAH (~1 in 120 ZÁSAH),
 * all 9 pins in KONTROLA (1 in 220), VŠETKO DORUČENÉ (~1 in 6 000 Ž-BOX).
 */
const FEATURE_TEMPLATES: Template[] = [
  { id: "zasah", titles: ["ZÁSAH", "RAZIA", "NÁLET"], kind: "zasah", scope: "base", need: [1, 2], until: [150, 300], line: "spustiť ZÁSAH", feat: "zasah" },
  { id: "hack", titles: ["HACKER", "ZAMERANÉ", "PRIELOM"], kind: "zasahBest", scope: "base", need: [2, 4], until: [150, 300], line: "HACK v jednom ZÁSAHU", feat: "zasah" },
  { id: "lup", titles: ["LÚP ZO ZÁSAHU", "ČIERNA KASA", "ZÁSAH PLATÍ"], kind: "zasahBest", scope: "base", need: [3, 8], until: [150, 300], line: "× stávky v jednom ZÁSAHU", feat: "zasah" },
  { id: "kvota", titles: ["KVÓTA", "PAPIERE", "UDANIE"], kind: "bar", scope: "base", need: [70, 100], until: [40, 60], line: "bodov do baru KONTROLA · Ž-BOX", feat: "bar" },
  { id: "urad", titles: ["BONUS Z BARU", "NÁHODNÁ KONTROLA", "LOTÉRIA ÚRADU"], kind: "bonus", scope: "base", need: [1, 2], until: [60, 160], line: "bonus z baru KONTROLA · Ž-BOX", feat: "bar" },
  { id: "uradvyhra", titles: ["ÚRADNÁ VÝPLATA", "DOTÁCIA", "VRATKA"], kind: "bonusBest", scope: "base", need: [3, 6], until: [60, 200], line: "× stávky v jednom bonuse KONTROLA / Ž-BOX", feat: "bar" },
  { id: "listky", titles: ["BEZ ODŤAHU", "PARKOVACIE LÍSTKY", "ZÓNA A"], kind: "bonusBest", scope: "base", need: [2, 4], until: [100, 300], line: "lístkov v jednej KONTROLE", feat: "kontrola" },
  { id: "pokuta", titles: ["POKUTA", "BLOKOVÉ KONANIE", "MESTSKÁ KASA"], kind: "bonusBest", scope: "base", need: [3, 5], until: [100, 300], line: "× stávky v jednej KONTROLE", feat: "kontrola" },
  { id: "zasielky", titles: ["PAKEŤÁK", "DORUČOVATEĽ", "Ž-BOX"], kind: "bonusBest", scope: "base", need: [4, 7], until: [100, 300], line: "zásielok v jednom Ž-BOXE", feat: "zbox" },
  { id: "priplatok", titles: ["PRÍPLATOK", "KURIÉR", "PLECHOVKA NA STRECHE"], kind: "bonusBest", scope: "base", need: [2, 2], until: [180, 270], line: "kuriérsky príplatok v Ž-BOXE", feat: "zbox", floors: ["draha"] },
  { id: "okna", titles: ["DOČKAJ SA", "DORUČOVACIE OKNÁ", "TRPEZLIVOSŤ"], kind: "bonusBest", scope: "base", need: [4, 7], until: [100, 300], line: "kôl v jednom Ž-BOXE", feat: "zbox" },
];

const ALL_TEMPLATES: Template[] = [...TEMPLATES, ...FEATURE_TEMPLATES];

export const JOB_TEMPLATE_IDS: readonly string[] = ALL_TEMPLATES.map((t) => t.id);
export const FEATURE_TEMPLATE_IDS: readonly string[] = FEATURE_TEMPLATES.map((t) => t.id);

/** Feature of a ticket template, null for the classic tickets. */
export function featureOf(template: string | undefined): FeatureId | null {
  return FEATURE_TEMPLATES.find((t) => t.id === template)?.feat ?? null;
}

export function isFeatureKind(kind: JobCard["kind"] | undefined): boolean {
  return kind === "zasah" || kind === "zasahBest" || kind === "bar" || kind === "bonus" || kind === "bonusBest";
}

/** Slovak count word: 1 / 2–4 / 0 and 5+ (Slovak: 22 bodov, 133 bodov). */
export function skCount(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

/** Plain goal line of a feature ticket (picker, strip, sheet). */
export function featureGoal(template: string, need: number): string {
  switch (template) {
    case "zasah":
      return `${need}× spustiť ZÁSAH`;
    case "hack":
      return need >= 4 ? "4× HACK v jednom ZÁSAHU (únik BEZ DANE)" : `${need}× HACK v jednom ZÁSAHU`;
    case "lup":
      return `Vyhraj ${need}× stávku v jednom ZÁSAHU`;
    case "kvota":
      return `${need} ${skCount(need, "bod", "body", "bodov")} do baru KONTROLA · Ž-BOX`;
    case "urad":
      return `${need}× bonus z baru (KONTROLA alebo Ž-BOX)`;
    case "uradvyhra":
      return `Vyhraj ${need}× stávku v jednom bonuse z baru (KONTROLA alebo Ž-BOX)`;
    case "listky":
      return `${need} ${skCount(need, "lístok", "lístky", "lístkov")} v jednej KONTROLE`;
    case "pokuta":
      return `Vyhraj ${need}× stávku v jednej KONTROLE`;
    case "zasielky":
      return `${need} ${skCount(need, "zásielka", "zásielky", "zásielok")} v jednom Ž-BOXE`;
    case "priplatok":
      return `Kuriérsky príplatok ×${need} v jednom Ž-BOXE`;
    case "okna":
      return `${need} ${skCount(need, "kolo", "kolá", "kôl")} v jednom Ž-BOXE`;
    default:
      return `${need}×`;
  }
}

const titleOver = new Map<string, string[]>();

export function contractCatalog(): { id: string; line: string; titles: string[]; defaults: string[] }[] {
  return ALL_TEMPLATES.map((t) => ({
    id: t.id,
    line: t.line,
    defaults: [...t.titles],
    titles: titleOver.get(t.id) ?? [...t.titles],
  }));
}

export function setContractTitles(id: string, titles: string[] | null): void {
  if (!JOB_TEMPLATE_IDS.includes(id)) return;
  if (!titles || !titles.length) titleOver.delete(id);
  else titleOver.set(id, titles.map((s) => s.trim()).filter(Boolean).slice(0, 6));
}

function rngRange(rng: () => number, a: number, b: number): number {
  return a + rng() * (b - a);
}

export function roundStake(n: number): number {
  if (n < 20) return Math.max(1, Math.round(n * 10) / 10);
  if (n < 200) return Math.round(n);
  if (n < 2000) return Math.round(n / 5) * 5;
  if (n < 20000) return Math.round(n / 50) * 50;
  return Math.round(n / 100) * 100;
}

export function mixJobStake(credit: number, bet: number, floor: JobFloor, rng: () => number): number {
  // Under JOB_BANK the ticket is sized from what the player actually has (payout stays a multiple of stake).
  const bank = credit > 0 ? credit : JOB_BANK;
  const b = Math.max(0.01, bet);
  const f = FLOOR_PCT[floor];
  const spins = FLOOR_SPINS[floor];
  const fromBet = b * rngRange(rng, spins[0], spins[1]);
  const fromBank = bank * rngRange(rng, f.stake[0], f.stake[1]);
  const mixed = Math.pow(Math.max(0.01, fromBet), 0.62) * Math.pow(Math.max(0.01, fromBank), 0.38);
  return roundStake(Math.min(bank * 0.85, Math.max(b * 3, mixed)));
}

export function spinWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (n === 1) return "točenie";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "točenia";
  return "točení";
}

export function freeSpinsLabel(n: number): string {
  if (n === 1) return "1 voľné točenie";
  if (spinWord(n) === "točenia") return `${n} voľné točenia`;
  return `${n} voľných točení`;
}

export function jobLeft(job: JobCard): number {
  return Math.max(0, job.limit - job.spun);
}

export function jobDone(job: JobCard): boolean {
  const second = job.kind === "hydra" || Boolean(job.kindB);
  if (second) return job.have >= job.need && (job.haveB ?? 0) >= (job.needB ?? 1);
  return job.have >= job.need;
}

/** A goal that can only count inside 4KA TV (bought or any round). */
function legIsBonus(kind: JobCard["kind"] | undefined, scope: JobCard["scope"]): boolean {
  return kind === "buy" || scope === "live";
}

/** OTRS with one base goal and one 4KA TV goal. Which leg is the 4KA TV one, or null. */
export function dualBonusLeg(job: Pick<JobCard, "kind" | "scope" | "kindB" | "scopeB">): "A" | "B" | null {
  if (!job.kindB) return null;
  const a = legIsBonus(job.kind, job.scope);
  const b = legIsBonus(job.kindB, job.scopeB);
  if (a === b) return null;
  return a ? "A" : "B";
}

/** Dual ticket dealt with its own base-spin and 4KA TV-round budgets. Base goal is always leg A. */
export function jobSplit(job: JobCard): boolean {
  return job.tries != null && job.tries > 0 && dualBonusLeg(job) === "B";
}

export function jobBaseDone(job: JobCard): boolean {
  return job.have >= job.need;
}

export function jobBonusDone(job: JobCard): boolean {
  return (job.haveB ?? 0) >= (job.needB ?? 1);
}

/** 4KA TV rounds left for the bonus goal of a split dual ticket. */
export function jobTriesLeft(job: JobCard): number {
  return Math.max(0, (job.tries ?? 0) - (job.triesUsed ?? 0));
}

/** Unit of the 4KA TV budget: one whole round (kolo) of 4KA TV. */
export function triesWord(n: number): string {
  if (n === 1) return "kolo";
  if (n >= 2 && n <= 4) return "kolá";
  return "kôl";
}

/** Round of 4KA TV that is an attempt for this bonus goal: a buy goal only takes bought rounds. */
function roundCounts(job: JobCard, ev: JobEvent): boolean {
  if (!ev.featureOver) return false;
  return job.kindB === "buy" ? Boolean(ev.bought) : true;
}

function splitClock(job: JobCard): string {
  const left = jobLeft(job);
  const tl = jobTriesLeft(job);
  const a = jobBaseDone(job) ? "základ hotový" : `${left} ${spinWord(left)} v hre`;
  const b = jobBonusDone(job) ? "4KA TV hotová" : `${tl} ${triesWord(tl)} 4KA TV`;
  return `ešte ${a} + ${b}`;
}

export function jobClock(job: JobCard, inLive = false): string {
  if (jobDone(job)) return "SPLNENÁ";
  if (job.seal && isFeatureKind(job.kind)) return job.kind === "zasahBest" ? "ČAKÁ NA KONIEC ZÁSAHU" : "ČAKÁ NA BONUS";
  if (jobSplit(job)) return jobStatus(job) === "fail" ? "NEÚSPEŠNÝ TIKET" : splitClock(job);
  const bothLive =
    Boolean(job.kindB) &&
    (job.scope === "live" || job.kind === "buy") &&
    (job.scopeB === "live" || job.kindB === "buy");
  if ((job.scope === "live" || bothLive) && job.spun === 0 && !inLive) return "ČAKÁ NA 4KA TV";
  const left = jobLeft(job);
  if (left <= 0) return "NEÚSPEŠNÝ TIKET";
  if (left === 1) return "posledné točenie";
  return `ešte ${left} ${spinWord(left)}`;
}

/** Old tickets and board lines still say pop. Show the new name without rewriting saves. */
export function sayCluster(text: string): string {
  return text
    .replaceAll("CLUSTER POP", "CLUSTER TUMBLE")
    .replaceAll("REŤAZ POP", "REŤAZ CLUSTER TUMBLE")
    .replaceAll("SÚČET POP", "SÚČET CLUSTER TUMBLE")
    .replaceAll("POP DOLE", "CLUSTER TUMBLE DOLE")
    .replaceAll(/\bPOP\b/g, "CLUSTER TUMBLE")
    .replaceAll(/\bpop\b/g, "Cluster tumble");
}

export function jobShownGoal(job: JobCard): string {
  if (job.kind === "hydra" && job.payId && job.payIdB && job.needB) {
    return `${payName(job.payId)} ${job.need}× + ${payName(job.payIdB)} ${job.needB}× výhier dokopy`;
  }
  // Two-goal ticket (OTRS / dual): job.goal carries both goals "A + B". The single-goal lines below only know goal A.
  if (job.kindB) return sayCluster(job.goal || job.detail.split(" · ")[0] || "");
  if (job.kind === "collect" && job.payId) return `${job.need}× nevýherných ${payName(job.payId)} dokopy`;
  if (job.kind === "symbol" && job.payId) return `${job.need}× výhier ${payName(job.payId)} dokopy`;
  if (job.kind === "cash") return sayCluster(job.goal || `Nazbieraj ${formatMoney(job.need)} € vo výhrach`);
  return sayCluster(job.goal || job.detail);
}

export function jobMeter(job: JobCard): string {
  if (job.kind === "hydra" && job.payId && job.payIdB) {
    return `${payName(job.payId)} ${job.have}/${job.need} · ${payName(job.payIdB)} ${job.haveB ?? 0}/${job.needB ?? 0}`;
  }
  if (job.kindB) {
    const b =
      job.kindB === "cash" ? `${formatMoney(job.haveB ?? 0)}/${formatMoney(job.needB ?? 0)} €` : `${job.haveB ?? 0}/${job.needB ?? 0}`;
    const a = job.kind === "cash" ? `${formatMoney(job.have)}/${formatMoney(job.need)} €` : `${job.have}/${job.need}`;
    return `${a} + ${b}`;
  }
  if (job.kind === "collect") return `${job.have}/${job.need} ks`;
  if (job.kind === "cash") return `${formatMoney(job.have)} / ${formatMoney(job.need)} €`;
  if (job.template === "lup" || job.template === "pokuta" || job.template === "uradvyhra") return `${job.have}×/${job.need}×`;
  if (job.template === "priplatok") return job.have > 0 ? `×${job.have}/×${job.need}` : `–/×${job.need}`;
  if (job.kind === "bar") return `${job.have}/${job.need} b.`;
  return `${job.have}/${job.need}`;
}

export function jobScopeLabel(job: JobCard): string {
  const feat = featureOf(job.template);
  if (feat) return `BASE GAME · ${FEATURE_TAG[feat]}`;
  if (job.scope === "live") return job.kind === "buy" ? "KÚPA 4KA TV" : "4KA TV";
  if (job.scope === "any") return "BASE + 4KA TV";
  return "BASE GAME";
}

/** Paying 8+ cluster rate per paid spin. Mild 1.08 ladder, sticky 0.156. */
export const PAY_HIT: Record<PayId, number> = {
  rj45: 0.11,
  router: 0.082,
  hap: 0.062,
  roof: 0.046,
  arris: 0.033,
  case: 0.025,
  dacia: 0.016,
  meter: 0.012,
  pdf: 0.009,
};

/** Opening cells of this pay on a 6×5 land. */
export const PAY_CELL: Record<PayId, number> = {
  rj45: 4.38,
  router: 4.06,
  hap: 3.74,
  roof: 3.48,
  arris: 3.22,
  case: 2.99,
  dacia: 2.73,
  meter: 2.53,
  pdf: 2.37,
};

export function symbolNeed(id: PayId, until: number, hard: number): number {
  const p = PAY_HIT[id] ?? 0.03;
  const λ = p * Math.max(8, until);
  const k = 0.52 + hard * 0.55;
  return Math.max(1, Math.round(λ * k));
}

export function collectNeed(id: PayId, until: number, hard: number): number {
  const λ = (PAY_CELL[id] ?? 3) * Math.max(8, until);
  const k = 0.55 + hard * 0.4;
  return Math.max(8, Math.round(λ * k));
}

/**
 * Base-game rates after the factor pins (ante off, 50k).
 * A win is an 8+ cluster at any tumble. A miss is the opening cells of a symbol that never pays.
 */
const WIN_RATE: Record<PayId, number> = {
  rj45: 0.1097,
  router: 0.0822,
  hap: 0.0619,
  roof: 0.0462,
  arris: 0.0333,
  case: 0.0253,
  dacia: 0.0165,
  meter: 0.0119,
  pdf: 0.009,
};

const MISS_CELL: Record<PayId, { mean: number; sd: number }> = {
  rj45: { mean: 3.917, sd: 1.754 },
  router: { mean: 3.706, sd: 1.764 },
  hap: { mean: 3.474, sd: 1.743 },
  roof: { mean: 3.274, sd: 1.742 },
  arris: { mean: 3.07, sd: 1.728 },
  case: { mean: 2.868, sd: 1.702 },
  dacia: { mean: 2.648, sd: 1.67 },
  meter: { mean: 2.472, sd: 1.628 },
  pdf: { mean: 2.321, sd: 1.598 },
};

/** Chance the ticket is cleared if every spin of the window is used. */
const COLLECT_TARGET: Record<JobFloor, number> = { lacna: 0.8, stred: 0.58, draha: 0.38 };
const MISS_WINDOW: Record<JobFloor, number> = { lacna: 20, stred: 30, draha: 45 };
const NORM_Z: Record<JobFloor, number> = { lacna: -0.841621233, stred: -0.201893479, draha: 0.305480788 };

function logChoose(n: number, k: number): number {
  let s = 0;
  for (let i = 0; i < k; i++) s += Math.log(n - i) - Math.log(i + 1);
  return s;
}

function binomAtLeast(n: number, p: number, k: number): number {
  if (k <= 0) return 1;
  if (k > n || p <= 0) return 0;
  const q = 1 - p;
  let term = Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(q));
  let sum = term;
  for (let i = k; i < n; i++) {
    term *= ((n - i) / (i + 1)) * (p / q);
    sum += term;
    if (!Number.isFinite(sum)) return 1;
  }
  return Math.min(1, Math.max(0, sum));
}

function winAsk(p: number, floor: JobFloor): number {
  const common = p >= 0.045;
  const mid = p >= 0.017;
  if (floor === "lacna") return common ? 2 : 1;
  if (floor === "stred") return common ? 3 : mid ? 2 : 1;
  return common ? 4 : mid ? 2 : 1;
}

/** Winning-symbol ticket: one credit per spin the symbol pays. */
export function winCollectPlan(id: PayId, floor: JobFloor, ask?: number): { need: number; limit: number } {
  const p = WIN_RATE[id] ?? 0.02;
  const target = COLLECT_TARGET[floor];
  let k = ask != null ? Math.max(1, Math.round(ask)) : winAsk(p, floor);
  let limit = 120;
  const fit = (ask: number) => {
    for (let n = 20; n <= 120; n += 5) {
      if (binomAtLeast(n, p, ask) >= target) return n;
    }
    return 0;
  };
  let found = fit(k);
  if (!found) {
    k = 1;
    found = fit(1);
  }
  if (found) limit = found;
  return { need: k, limit };
}

/** Non-winning cells. Need is the floor's quantile of the sum over a fixed window. */
export function missCollectPlan(id: PayId, floor: JobFloor, window?: number, z?: number): { need: number; limit: number } {
  const cell = MISS_CELL[id] ?? { mean: 2.7, sd: 1.7 };
  const limit = window ?? MISS_WINDOW[floor];
  const mean = limit * cell.mean;
  const sd = cell.sd * Math.sqrt(limit);
  const need = Math.max(8, Math.round(mean + (z ?? NORM_Z[floor]) * sd));
  return { need: Math.min(need, limit * 12), limit };
}

export function hydraSplit(a: PayId, b: PayId, until: number, hard = 0.5): { needA: number; needB: number } {
  return { needA: symbolNeed(a, until, hard), needB: symbolNeed(b, until, hard) };
}

function shuffle<T>(bag: T[], rng: () => number): T[] {
  const out = bag.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}

function pickOne<T>(bag: T[], rng: () => number): T {
  return bag[Math.max(0, Math.min(bag.length - 1, Math.floor(rng() * bag.length)))] as T;
}

function snapFive(n: number): number {
  return Math.max(5, Math.round(n / 5) * 5);
}

/** Inclusive from–to range. Every per-ticket number is drawn from one of these. */
export type Span = readonly [number, number];

/**
 * Generator ranges (od–do) per template and floor. `need` = goal count, `window` = spins (multiples of 5).
 * Both are drawn independently and uniformly, so every ticket is a different combination.
 * Tuned on the real engine (/workspace/ticket-ranges/sim) to keep each template's clear rate.
 * need [0, 0] = goal derived from a rate (nevyherne, hydra, odpis) via JOB_KNOBS. For vyherne `need` only clamps the asked count.
 */
export const JOB_RANGES: Record<string, Record<JobFloor, { need: Span; window: Span }>> = {
  zber: { lacna: { need: [12, 19], window: [60, 75] }, stred: { need: [14, 22], window: [50, 85] }, draha: { need: [17, 25], window: [55, 75] } },
  balik: { lacna: { need: [3, 6], window: [75, 110] }, stred: { need: [4, 7], window: [60, 100] }, draha: { need: [5, 8], window: [45, 90] } },
  pada: { lacna: { need: [18, 26], window: [60, 85] }, stred: { need: [21, 28], window: [60, 80] }, draha: { need: [24, 33], window: [60, 80] } },
  siet: { lacna: { need: [1, 1], window: [440, 715] }, stred: { need: [1, 1], window: [250, 515] }, draha: { need: [1, 1], window: [45, 315] } },
  signal: { lacna: { need: [10, 27], window: [20, 45] }, stred: { need: [24, 43], window: [20, 30] }, draha: { need: [38, 58], window: [25, 45] } },
  retaz: { lacna: { need: [3, 3], window: [70, 115] }, stred: { need: [3, 3], window: [35, 95] }, draha: { need: [3, 3], window: [10, 60] } },
  plechovky: { lacna: { need: [3, 6], window: [25, 40] }, stred: { need: [4, 8], window: [25, 30] }, draha: { need: [7, 10], window: [25, 30] } },
  pot: { lacna: { need: [1, 1], window: [35, 55] }, stred: { need: [1, 1], window: [30, 50] }, draha: { need: [1, 1], window: [25, 45] } },
  sucho: { lacna: { need: [1, 2], window: [10, 20] }, stred: { need: [1, 3], window: [10, 20] }, draha: { need: [2, 3], window: [10, 20] } },
  vynos: { lacna: { need: [1, 1], window: [120, 200] }, stred: { need: [1, 1], window: [85, 145] }, draha: { need: [1, 1], window: [50, 105] } },
  duo: { lacna: { need: [3, 6], window: [65, 110] }, stred: { need: [4, 7], window: [60, 90] }, draha: { need: [5, 8], window: [45, 75] } },
  vyherne: { lacna: { need: [1, 3], window: [20, 150] }, stred: { need: [1, 4], window: [20, 150] }, draha: { need: [1, 5], window: [20, 150] } },
  nevyherne: { lacna: { need: [0, 0], window: [15, 25] }, stred: { need: [0, 0], window: [25, 35] }, draha: { need: [0, 0], window: [35, 55] } },
  noc: { lacna: { need: [2, 4], window: [25, 35] }, stred: { need: [3, 5], window: [25, 35] }, draha: { need: [4, 7], window: [25, 30] } },
  hydra: { lacna: { need: [0, 0], window: [65, 85] }, stred: { need: [0, 0], window: [55, 75] }, draha: { need: [0, 0], window: [45, 65] } },
  odpis: { lacna: { need: [0, 0], window: [15, 25] }, stred: { need: [0, 0], window: [25, 40] }, draha: { need: [0, 0], window: [40, 55] } },
  // Feature tickets (scripts/feature-sim/tune.ts on the real engine, Kredit rank, ante off): each cell clears
  // about as often as the base single tickets of its floor (76.6 / 59.3 / 39.6 %). Rates the windows rest on:
  // KONTROLA · Ž-BOX bar ≈ 1.93 points per spin (bar bonus every ~54 spins, KONTROLA or Ž-BOX ~1 in 108 each),
  // ZÁSAH every ~170 spins (10 spins, 4× HACK = únik in ~47 %).
  zasah: { lacna: { need: [1, 1], window: [110, 170] }, stred: { need: [1, 2], window: [160, 245] }, draha: { need: [2, 2], window: [190, 290] } },
  hack: { lacna: { need: [2, 3], window: [165, 250] }, stred: { need: [3, 4], window: [160, 240] }, draha: { need: [4, 4], window: [115, 175] } },
  lup: { lacna: { need: [2, 3], window: [225, 340] }, stred: { need: [3, 5], window: [200, 295] }, draha: { need: [5, 8], window: [185, 280] } },
  kvota: { lacna: { need: [45, 65], window: [30, 50] }, stred: { need: [70, 100], window: [40, 60] }, draha: { need: [120, 155], window: [55, 80] } },
  urad: { lacna: { need: [1, 1], window: [35, 50] }, stred: { need: [1, 2], window: [50, 80] }, draha: { need: [2, 3], window: [75, 115] } },
  uradvyhra: { lacna: { need: [2, 3], window: [125, 185] }, stred: { need: [3, 4], window: [110, 170] }, draha: { need: [4, 6], window: [95, 140] } },
  listky: { lacna: { need: [2, 2], window: [200, 295] }, stred: { need: [2, 3], window: [155, 230] }, draha: { need: [3, 4], window: [130, 195] } },
  pokuta: { lacna: { need: [2, 2], window: [225, 340] }, stred: { need: [3, 4], window: [210, 310] }, draha: { need: [4, 5], window: [135, 205] } },
  zasielky: { lacna: { need: [3, 4], window: [215, 325] }, stred: { need: [4, 5], window: [225, 340] }, draha: { need: [5, 6], window: [215, 320] } },
  // ×2 in one Ž-BOX is ~1 in 490 spins: only drahá fits a sane budget.
  priplatok: { lacna: { need: [2, 2], window: [180, 270] }, stred: { need: [2, 2], window: [180, 270] }, draha: { need: [2, 2], window: [180, 270] } },
  okna: { lacna: { need: [3, 4], window: [130, 200] }, stred: { need: [4, 6], window: [135, 205] }, draha: { need: [6, 8], window: [140, 205] } },
};

/**
 * Knobs for goals derived from rates (od–do as well):
 * - vyherne: `ask` = shift of the asked win count around the floor default, `fit` = factor on the fitted window,
 * - nevyherne: `z` = quantile of the non-winning sum over the drawn window (higher = harder),
 * - hydra: `hard` = difficulty fed to symbolNeed, `rareMin` = shortest window when a symbol is rare,
 * - odpis: `rate` = € goal as share of (bet × window).
 */
export const JOB_KNOBS = {
  vyherne: { ask: { lacna: [-1, 1], stred: [-1, 1], draha: [-1, 1] }, fit: { lacna: [0.85, 1.2], stred: [0.85, 1.2], draha: [0.8, 1.15] } },
  nevyherne: { z: { lacna: [-1.09, -0.59], stred: [-0.46, 0.04], draha: [0.11, 0.61] } },
  hydra: { hard: { lacna: [0.05, 0.35], stred: [0.35, 0.65], draha: [0.65, 0.95] }, rareMin: [65, 75] },
  odpis: { rate: { lacna: [0.21, 0.27], stred: [0.4, 0.52], draha: [0.58, 0.76] } },
} as const satisfies {
  vyherne: { ask: Record<JobFloor, Span>; fit: Record<JobFloor, Span> };
  nevyherne: { z: Record<JobFloor, Span> };
  hydra: { hard: Record<JobFloor, Span>; rareMin: Span };
  odpis: { rate: Record<JobFloor, Span> };
};

/** Pay-side ranges: OTRS legs and the 4th mystery card get a bonus factor, combos a spin-window mix. */
export const PAY_RANGES = {
  /** Mystery single (4th card). Was 1.15. */
  mystery: [1.1, 1.2] as Span,
  /** Each OTRS leg. Was 1.35. */
  otrs: [1.3, 1.4] as Span,
  /** ± share of payout that follows the drawn difficulty (0 = easiest end, 1 = hardest). */
  tilt: 0.3,
  /**
   * Difficulty that pays exactly the band. Below 0.5 because cleared tickets lean to the easy end:
   * set so a cleared ticket pays on average what it did before (payout per € unchanged).
   */
  center: {
    single: { lacna: 0.47, stred: 0.45, draha: 0.42 },
    combo: { lacna: 0.49, stred: 0.49, draha: 0.48 },
    dual: { lacna: 0.48, stred: 0.46, draha: 0.44 },
  } as Record<"single" | "combo" | "dual", Record<JobFloor, number>>,
};

/** Two-goal OTRS (not dual): window = longer + shorter × mix. Rare goals capped first. */
export const COMBO_RANGES = {
  same: { lacna: [0.45, 0.65], stred: [0.48, 0.68], draha: [0.52, 0.72] } as Record<JobFloor, Span>,
  cross: { lacna: [0.7, 0.9], stred: [0.73, 0.93], draha: [0.77, 0.97] } as Record<JobFloor, Span>,
  rareCap: { siet: [90, 110], vynos: [80, 100], pot: [50, 60], signal: [35, 45] } as Record<string, Span>,
};

/** Uniform draw from a range. `hard` = 0 at the easy end, 1 at the hard end. */
interface Drawn {
  v: number;
  hard: number;
}

function drawReal(rng: () => number, s: Span, hardHigh = true): Drawn {
  const u = s[0] === s[1] ? 0.5 : rng();
  return { v: s[0] + u * (s[1] - s[0]), hard: s[0] === s[1] ? 0.5 : hardHigh ? u : 1 - u };
}

function drawInt(rng: () => number, s: Span, hardHigh = true): Drawn {
  if (s[0] >= s[1]) return { v: s[0], hard: 0.5 };
  const n = s[1] - s[0] + 1;
  const i = Math.min(n - 1, Math.floor(rng() * n));
  const u = i / (n - 1);
  return { v: s[0] + i, hard: hardHigh ? u : 1 - u };
}

/** Spin window in steps of 5. Longer = easier. */
function drawWindow(rng: () => number, s: Span): Drawn {
  const d = drawInt(rng, [Math.round(s[0] / 5), Math.round(s[1] / 5)], false);
  return { v: Math.max(5, d.v * 5), hard: d.hard };
}

/** Payout factor from the drawn difficulty (0 easiest … 1 hardest): 1 at the floor's center, ±tilt/2 around it. */
export function payTilt(hards: number[], floor: JobFloor, kind: "single" | "combo" | "dual" = "single"): number {
  if (!hards.length) return 1;
  const d = hards.reduce((a, b) => a + b, 0) / hards.length;
  return 1 + PAY_RANGES.tilt * (d - PAY_RANGES.center[kind][floor]);
}

function makeJob(
  t: Template,
  floor: JobFloor,
  credit: number,
  bet: number,
  rng: () => number,
  extraPay = 1,
  mystery = false,
): JobCard {
  const b = Math.max(0.01, bet);
  const f = FLOOR_PCT[floor];
  const stake = mixJobStake(credit, b, floor, rng);
  const payMul = rngRange(rng, f.payX[0], f.payX[1]) * extraPay;
  const range = JOB_RANGES[t.id]?.[floor] ?? { need: t.need, window: t.until };
  const hards: number[] = [];
  const needD = drawInt(rng, range.need);
  const winD = drawWindow(rng, range.window);
  const need = needD.v;
  const slack = t.kind === "buy" || t.scope === "live" ? 3 : 8;
  // Feature goals are not one-per-spin (bar points, best of one ZÁSAH / bonus): the window alone is the budget.
  let limit = isFeatureKind(t.kind) ? snapFive(winD.v) : snapFive(Math.max(need + slack, winD.v));
  const title = pickOne(titleOver.get(t.id) ?? t.titles, rng);
  let payId = t.payIds?.length ? pickOne(t.payIds, rng) : undefined;
  let payIdB: PayId | undefined;
  let needB: number | undefined;
  let haveB: number | undefined;
  let needNow = need;
  if (t.kind === "symbol" && payId) {
    // Asked wins drawn around the floor default, window re-fitted to it and stretched by a drawn factor.
    const kn = JOB_KNOBS.vyherne;
    const shift = drawInt(rng, kn.ask[floor]);
    const fit = drawReal(rng, kn.fit[floor], false);
    const r = JOB_RANGES.vyherne[floor];
    const ask = Math.max(r.need[0], Math.min(r.need[1], winAsk(WIN_RATE[payId] ?? 0.02, floor) + shift.v));
    const plan = winCollectPlan(payId, floor, ask);
    needNow = plan.need;
    limit = Math.max(r.window[0], Math.min(r.window[1], snapFive(plan.limit * fit.v)));
    hards.push(fit.hard);
  } else if (t.kind === "collect" && payId) {
    const z = drawReal(rng, JOB_KNOBS.nevyherne.z[floor]);
    const plan = missCollectPlan(payId, floor, winD.v, z.v);
    needNow = plan.need;
    limit = plan.limit;
    hards.push(z.hard);
  } else if (t.kind === "hydra") {
    const ids = PAY_SYMBOLS.map((s) => s.id);
    const first = pickOne(ids, rng);
    const rest = ids.filter((id) => id !== first);
    const second = pickOne(rest, rng);
    payId = first;
    payIdB = second;
    const hard = drawReal(rng, JOB_KNOBS.hydra.hard[floor]);
    const rare = Math.min(PAY_HIT[first], PAY_HIT[second]) < 0.03;
    limit = winD.v;
    if (rare) limit = snapFive(Math.max(limit, drawInt(rng, JOB_KNOBS.hydra.rareMin).v));
    const split = hydraSplit(first, second, limit, hard.v);
    needNow = split.needA;
    needB = split.needB;
    haveB = 0;
    hards.push(hard.hard);
  } else if (t.kind === "cash") {
    const rate = drawReal(rng, JOB_KNOBS.odpis.rate[floor]);
    limit = winD.v;
    needNow = Math.max(roundStake(b * 3), roundStake(b * limit * rate.v));
    hards.push(rate.hard);
  } else {
    if (range.need[0] !== range.need[1]) hards.push(needD.hard);
    if (range.window[0] !== range.window[1] && t.kind !== "deads") hards.push(winD.hard);
  }
  const payout = Math.max(roundStake(stake * payMul * payTilt(hards, floor)), roundStake(stake * 1.4 * extraPay));
  const plainPay = Math.max(stake * payMul, stake * 1.4 * extraPay);
  const line =
    t.kind === "hydra" && payId && payIdB && needB
      ? `${payName(payId)} ${needNow}× + ${payName(payIdB)} ${needB}× výhier dokopy`
      : t.kind === "collect" && payId
        ? `nevýherných ${payName(payId)} dokopy`
        : t.kind === "symbol" && payId
          ? `výhier ${payName(payId)} dokopy`
          : t.line;
  const tag = t.feat ? ` · ${FEATURE_TAG[t.feat]}` : t.scope === "live" ? " · 4KA TV" : t.scope === "any" ? " · BASE+4KA TV" : "";
  const goal = t.feat
    ? featureGoal(t.id, needNow)
    : t.kind === "cash"
      ? `Nazbieraj ${formatMoney(needNow)} € vo výhrach do ${limit} ${spinWord(limit)}`
      : t.kind === "hydra"
        ? line
        : `${needNow}× ${line}`;
  const card: JobCard = {
    id: `${t.id}-${floor}-${mystery ? "rnd" : "pick"}-${Math.floor(rng() * 1e6)}`,
    floor,
    template: t.id,
    title,
    detail: t.kind === "cash" ? goal : `${goal} · ${limit} ${spinWord(limit)}${tag}`,
    goal,
    stake,
    payout,
    need: needNow,
    have: 0,
    limit,
    spun: 0,
    kind: t.kind,
    scope: t.scope,
    lockBet: b,
    mystery,
    payId,
    payIdB,
    needB,
    haveB,
  };
  legMeta.set(card, { hards, plainPay });
  return card;
}

const FEATURE_TAG: Record<FeatureId, string> = { zasah: "ZÁSAH", kontrola: "KONTROLA", zbox: "Ž-BOX", bar: "BONUS BAR" };

/** Drawn difficulty and untilted payout of a dealt goal, so OTRS can tilt the whole ticket once. */
const legMeta = new WeakMap<JobCard, { hards: number[]; plainPay: number }>();

const OTRS_SKIP = new Set(["sucho", "hydra", "retaz"]);

function otrsLine(job: JobCard): string {
  if (job.kind === "cash") return `nazbierať ${formatMoney(job.need)} € vo výhrach`;
  if (job.kind === "symbol" && job.payId) return `${job.need}× výhier ${payName(job.payId)}`;
  if (job.kind === "collect" && job.payId) return `${job.need}× nevýherných ${payName(job.payId)}`;
  return `${job.need}× ${job.goal?.replace(/^\d+× /, "") ?? ""}`.replace(/\s+·.*/, "");
}

function comboSpinLimit(a: JobCard, b: JobCard, floor: JobFloor, rng: () => number): { limit: number; hard: number[] } {
  const hard: number[] = [];
  const leg = (job: JobCard) => {
    const span = COMBO_RANGES.rareCap[job.template];
    if (!span) return job.limit;
    const cap = drawWindow(rng, span);
    hard.push(cap.hard);
    return Math.min(job.limit, cap.v);
  };
  const la = leg(a);
  const lb = leg(b);
  const longer = Math.max(la, lb);
  const shorter = Math.min(la, lb);
  const same = (a.scope ?? "base") === (b.scope ?? "base");
  const mix = drawReal(rng, (same ? COMBO_RANGES.same : COMBO_RANGES.cross)[floor], false);
  hard.push(mix.hard);
  return { limit: snapFive(longer + Math.round(shorter * mix.v)), hard };
}

function makeOtrs(rng: () => number, credit: number, bet: number): JobCard {
  const floors: JobFloor[] = ["lacna", "stred", "draha"];
  const floor = floors[Math.floor(rng() * floors.length)] ?? "stred";
  const pool = TEMPLATES.filter((t) => !OTRS_SKIP.has(t.id));
  const firstT = pickOne(pool, rng);
  const secondT = pickOne(
    pool.filter((t) => t.id !== firstT.id),
    rng,
  );
  let first = makeJob(firstT, floor, credit, bet, rng, drawReal(rng, PAY_RANGES.otrs).v, true);
  let second = makeJob(secondT, floor, credit, bet, rng, drawReal(rng, PAY_RANGES.otrs).v, true);
  if (second.kind === "cash" && first.kind !== "cash") {
    const swap = first;
    first = second;
    second = swap;
  }
  // Dual (base goal + 4KA TV goal): base goal first, each goal gets its own budget.
  const split = dualBonusLeg({ kind: first.kind, scope: first.scope, kindB: second.kind, scopeB: second.scope }) != null;
  if (split && legIsBonus(first.kind, first.scope)) {
    const swap = first;
    first = second;
    second = swap;
  }
  const budget = split ? dualBudget(first, second, floor, rng) : null;
  const combo = budget ? null : comboSpinLimit(first, second, floor, rng);
  const limit = budget ? budget.spins : combo!.limit;
  const goal = `${otrsLine(first)} + ${otrsLine(second)}`;
  const stake = Math.max(first.stake, second.stake);
  // One tilt for the whole ticket: both goals' draws plus the shared budget draws, on the untilted leg payout.
  const mA = legMeta.get(first);
  const mB = legMeta.get(second);
  const hards = [...(mA?.hards ?? []), ...(mB?.hards ?? []), ...(budget ? budget.hard : combo!.hard)];
  const plain = Math.max(mA?.plainPay ?? first.payout, mB?.plainPay ?? second.payout);
  const tilt = payTilt(hards, floor, budget ? "dual" : "combo");
  const payout = Math.max(roundStake(stake * 1.7), roundStake(plain * tilt));
  return {
    ...first,
    id: `otrs-${floor}-${Math.floor(rng() * 1e6)}`,
    template: first.template,
    templateB: second.template,
    title: pickOne(["OTRS", "KOMBINÁCIA", "DVE ÚLOHY", "ZMES"], rng),
    detail: budget
      ? `${goal} · ${limit} ${spinWord(limit)} v hre + ${budget.tries} ${triesWord(budget.tries)} 4KA TV`
      : `${goal} · ${limit} ${spinWord(limit)}`,
    goal,
    stake,
    payout,
    need: first.need,
    have: 0,
    limit,
    spun: 0,
    kind: first.kind,
    kindB: second.kind,
    scope: first.scope,
    scopeB: second.scope ?? "base",
    lockBet: first.lockBet,
    mystery: true,
    payId: first.payId,
    payIdB: second.payId,
    needB: second.need,
    haveB: 0,
    ...(budget ? { tries: budget.tries, triesUsed: 0 } : {}),
  };
}

/**
 * Split dual budgets (od–do), tuned on the real engine (/workspace/ticket-ranges/sim): the whole ticket clears
 * about as often as the old shared-clock dual did (lacná ~69 %, stred ~48 %, drahá ~26 %).
 * M = 4KA TV rounds for the bonus goal, drawn per floor and template.
 * N = base spins: the base goal's own window (rare goals capped by a drawn cap) × a drawn factor.
 */
export const DUAL_TRIES: Record<JobFloor, Record<string, Span>> = {
  lacna: { noc: [1, 3], signal: [2, 4], plechovky: [2, 4] },
  stred: { noc: [1, 3], signal: [2, 4], plechovky: [2, 4] },
  draha: { noc: [1, 3], signal: [2, 4], plechovky: [2, 4] },
};
export const DUAL_BASE_X: Record<JobFloor, Record<string, Span>> = {
  lacna: { noc: [0.9, 1.2], signal: [0.95, 1.25], plechovky: [1.0, 1.3] },
  stred: { noc: [0.85, 1.16], signal: [0.91, 1.23], plechovky: [0.9, 1.22] },
  draha: { noc: [0.82, 1.14], signal: [0.91, 1.24], plechovky: [0.87, 1.2] },
};
export const DUAL_RARE_CAP: Record<string, Span> = { siet: [90, 110], vynos: [80, 100], pot: [50, 60] };

export function dualBudget(
  base: JobCard,
  bonus: JobCard,
  floor: JobFloor,
  rng: () => number,
): { spins: number; tries: number; hard: number[] } {
  const hard: number[] = [];
  const capSpan = DUAL_RARE_CAP[base.template];
  let window = base.limit;
  if (capSpan) {
    const cap = drawWindow(rng, capSpan);
    hard.push(cap.hard);
    window = Math.min(window, cap.v);
  }
  const x = drawReal(rng, DUAL_BASE_X[floor][bonus.template] ?? [0.85, 1.15], false);
  const m = drawInt(rng, DUAL_TRIES[floor][bonus.template] ?? [2, 4], false);
  hard.push(x.hard, m.hard);
  return { spins: Math.min(400, snapFive(window * x.v)), tries: m.v, hard };
}

/** Test/sim hook: deal one OTRS card the same way dealJobs does. */
export function dealOtrs(rng: () => number, credit: number, bet: number): JobCard {
  return makeOtrs(rng, credit, bet);
}

/** Share of deals with a feature ticket among the three cards / as the 4th (mystery) single. */
export const FEATURE_DEAL = { daily: 0.5, mystery: 0.2 };

/** Test/sim hook: one feature ticket of a given template and floor, dealt like any card. */
export function dealFeature(id: string, floor: JobFloor, rng: () => number, credit: number, bet: number): JobCard {
  const t = FEATURE_TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`no feature template ${id}`);
  return makeJob(t, floor, credit, bet, rng);
}

export function dealJobs(rng: () => number, credit: number, bet: number): JobCard[] {
  const floors: JobFloor[] = ["lacna", "stred", "draha"];
  const bag = shuffle(TEMPLATES, rng);
  const threeT = bag.slice(0, 3);
  const rest = bag.slice(3);
  const cash = TEMPLATES.find((t) => t.id === "odpis");
  if (cash && !threeT.some((t) => t.id === "odpis") && rng() < 0.45) {
    const at = Math.floor(rng() * threeT.length);
    const displaced = threeT[at];
    threeT[at] = cash;
    const cashAt = rest.findIndex((t) => t.id === "odpis");
    if (cashAt >= 0) rest.splice(cashAt, 1);
    if (displaced) rest.unshift(displaced);
  }
  const deck: Template[] = threeT.slice();
  // One of the three cards is a feature ticket (ZÁSAH / bonus bar / KONTROLA / Ž-BOX) about every other deal.
  if (rng() < FEATURE_DEAL.daily) {
    const at = Math.floor(rng() * deck.length);
    deck[at] = featureFor(floors[at] ?? "stred", rng);
  }
  const three = floors.map((floor, i) => makeJob(deck[i % deck.length], floor, credit, bet, rng));
  const bonusFloor = floors[Math.floor(rng() * floors.length)] ?? "stred";
  const single = rng() < FEATURE_DEAL.mystery ? featureFor(bonusFloor, rng) : pickOne(TEMPLATES, rng);
  const bonus =
    rng() < 0.25
      ? makeOtrs(rng, credit, bet)
      : makeJob(single, bonusFloor, credit, bet, rng, drawReal(rng, PAY_RANGES.mystery).v, true);
  return [...three, bonus];
}

export type DailyMark = "ok" | "fail";

export interface DailyBoard {
  day: string;
  cards: JobCard[];
  marks: (DailyMark | null)[];
}

/** The three visible tickets. OTRS is not part of the daily board. */
export function freshDaily(rng: () => number, credit: number, bet: number, day: string): DailyBoard {
  const cards = dealJobs(rng, credit, bet).filter((c) => !c.mystery).slice(0, 3);
  return { day, cards, marks: [null, null, null] };
}

export function stampDaily(board: DailyBoard, job: JobCard, mark: DailyMark): DailyBoard {
  if (job.mystery) return board;
  const i = board.cards.findIndex((c) => c.id === job.id);
  if (i < 0 || board.marks[i]) return board;
  const marks = board.marks.slice();
  marks[i] = mark;
  return { ...board, marks };
}

export interface JobEvent {
  win: boolean;
  dead: boolean;
  tumbles: number;
  live: boolean;
  ticket: TierId | null;
  pdf: boolean;
  signal: number;
  clusters: number;
  orbs: boolean;
  spun?: boolean;
  pays?: PayId[];
  orbSum?: number;
  bought?: boolean;
  buyOver?: boolean;
  liveSpin?: boolean;
  shown?: number;
  /** Cans on the resolved grid. PLECHOVKY caps a spin at 6. */
  orbCount?: number;
  /** Paid euros this spin. ODPIS adds them up. */
  cash?: number;
  /** Natural or bought PARKNET just closed. */
  featureOver?: boolean;
  /** Feature tickets. This paid spin was a ZÁSAH spin. */
  chasing?: boolean;
  /** ZÁSAH started with this spin. */
  chaseStart?: boolean;
  /** HACK count and win (× bet, ZÁSAH spins only) of the running ZÁSAH after this spin. */
  chaseHits?: number;
  chaseX?: number;
  /** The ZÁSAH ended on this spin. */
  chaseOver?: boolean;
  /** Points this spin put on the KONTROLA · Ž-BOX bar (dead spin +2, 3 scatters +30). */
  pityAdd?: number;
  /** This spin filled the bar: a bar bonus (KONTROLA / Ž-BOX) plays right after it. */
  bonusArmed?: boolean;
  /** A bar bonus just paid (its own event, spun: false). */
  bonus?: BonusResult;
}

/** One finished bar bonus, as feature tickets read it. */
export interface BonusResult {
  mode: "kontrola" | "zbox";
  /** Payout × bet (after príplatok / ×2 / cap, before the tax period). */
  x: number;
  /** KONTROLA: safe pins opened. Ž-BOX: parcels in the wall at the end (start parcels included). */
  safes: number;
  /** KONTROLA: all 9 safes. Ž-BOX: VŠETKO DORUČENÉ. */
  cleared: boolean;
  /** Ž-BOX: kuriérsky príplatok (sum of the cans, 0 = none). */
  canSum: number;
  /** Ž-BOX: rounds played. */
  rounds: number;
}

/** Progress of a feature ticket after this event (null: the event does not touch this ticket). */
export function featureHave(job: JobCard, ev: JobEvent): number | null {
  const t = job.template;
  if (job.kind === "zasah") return ev.chaseStart ? job.have + 1 : null;
  if (job.kind === "zasahBest") {
    if (!ev.chasing) return null;
    const v = t === "hack" ? Math.floor(ev.chaseHits ?? 0) : Math.floor((ev.chaseX ?? 0) + 1e-9);
    return Math.max(job.have, v);
  }
  if (job.kind === "bar") return ev.pityAdd ? job.have + Math.max(0, Math.floor(ev.pityAdd)) : null;
  const b = ev.bonus;
  if (!b) return null;
  if (job.kind === "bonus") return job.have + 1;
  if (job.kind !== "bonusBest") return null;
  const metric = (): number | null => {
    if (t === "uradvyhra") return Math.floor(b.x + 1e-9);
    if (t === "listky") return b.mode === "kontrola" ? b.safes : null;
    if (t === "pokuta") return b.mode === "kontrola" ? Math.floor(b.x + 1e-9) : null;
    if (t === "zasielky") return b.mode === "zbox" ? b.safes : null;
    if (t === "priplatok") return b.mode === "zbox" ? b.canSum : null;
    if (t === "okna") return b.mode === "zbox" ? b.rounds : null;
    return null;
  };
  const m = metric();
  return m == null ? null : Math.max(job.have, m);
}

/** A "best of one" feature ticket still waiting for a run that started in time: the running ZÁSAH or the armed bonus. */
function featureWaits(job: JobCard, ev: JobEvent): boolean {
  if (job.kind === "zasahBest") return Boolean(ev.chasing && !ev.chaseOver);
  if (job.kind === "bonus" || job.kind === "bonusBest") return Boolean(ev.bonusArmed);
  return false;
}

/** Feature tickets: base-game spins only (ZÁSAH spins count, 4KA TV spins and the bonus itself do not). */
function tickFeature(job: JobCard, ev: JobEvent): JobCard {
  const live = Boolean(ev.liveSpin || ev.bought);
  const have = live ? null : featureHave(job, ev);
  const nextHave = have == null ? job.have : Math.min(job.need, have);
  if (job.seal) {
    const next = { ...job, have: nextHave };
    if (jobDone(next)) return { ...next, seal: undefined };
    // Released when the run it waited for is over: ZÁSAH ended, or the bonus paid.
    const over = job.kind === "zasahBest" ? Boolean(ev.chaseOver) : Boolean(ev.bonus);
    return over ? { ...next, seal: undefined, spun: job.limit } : next;
  }
  const counts = !live && ev.spun !== false;
  const spun = counts ? job.spun + 1 : job.spun;
  const next: JobCard = { ...job, have: nextHave, spun };
  if (jobDone(next)) return next;
  if (next.limit - next.spun <= 0) {
    if (featureWaits(next, ev)) return { ...next, spun: next.limit, seal: true };
    return { ...next, spun: next.limit };
  }
  return next;
}

function jobOnThisSpin(job: JobCard, ev: JobEvent): boolean {
  const live = Boolean(ev.liveSpin || ev.bought);
  const scope = job.scope ?? (job.kind === "buy" ? "live" : "base");
  if (job.kind === "buy") return Boolean(ev.bought);
  if (scope === "base") return !live;
  if (scope === "live") return live;
  return true;
}

function countOne(job: JobCard, ev: JobEvent): { have: number; haveB: number } {
  let add = 0;
  let have = job.have;
  if (job.kind === "wins") {
    if (job.template === "duo") add = ev.clusters >= 2 ? 1 : 0;
    else if (job.template === "retaz") {
      if (ev.dead) have = 0;
      else if (ev.win) add = 1;
    } else if (ev.win) add = 1;
  }
  if (job.kind === "deads" && ev.dead) add = 1;
  if (job.kind === "tumbles") {
    if (job.template === "plechovky") add = Math.min(6, Math.max(0, Math.floor(ev.orbCount ?? (ev.orbs ? 1 : 0))));
    else add = Math.max(0, ev.tumbles);
  }
  if (job.kind === "chain") add = ev.tumbles >= 2 ? 1 : 0;
  if (job.kind === "live" && ev.live) add = 1;
  if (job.kind === "ticket" && ev.ticket === "ulica") add = 1;
  if (job.kind === "pdf" && ev.pdf) add = 1;
  if (job.kind === "signal") add = Math.max(0, Math.floor(ev.orbSum ?? 0));
  if (job.kind === "symbol" && job.payId && ev.pays?.includes(job.payId)) add = 1;
  if (job.kind === "collect") {
    const won = Boolean(job.payId && ev.pays?.includes(job.payId));
    add = won ? 0 : Math.max(0, Math.floor(ev.shown ?? 0));
  }
  if (job.kind === "buy" && ev.win) add = 1;
  if (job.kind === "cash") add = Math.max(0, +(ev.cash ?? 0).toFixed(2));
  let haveB = job.haveB ?? 0;
  if (job.kind === "hydra") {
    if (job.payId && ev.pays?.includes(job.payId)) add = 1;
    if (job.payIdB && ev.pays?.includes(job.payIdB)) haveB = Math.min(job.needB ?? 0, haveB + 1);
  }
  const summed = job.kind === "cash" ? +((have + add).toFixed(2)) : have + add;
  return { have: Math.min(job.need, summed), haveB };
}

function legHops(template: string, kind: JobCard["kind"], need: number, have: number, left: number): boolean {
  const cap = jobCap({ template, kind } as JobCard);
  if (cap == null) return false;
  return need - have > left * cap;
}

/** Both goals' progress, counted exactly as tickCombo does. Budgets are handled by the caller. */
function comboProgress(job: JobCard, ev: JobEvent): { have: number; haveB: number } {
  const aOn = jobOnThisSpin(job, ev);
  const bOn = jobOnThisSpin(
    { ...job, kind: job.kindB ?? job.kind, template: job.templateB ?? job.template, scope: job.scopeB ?? job.scope },
    ev,
  );
  let have = job.have;
  let haveB = job.haveB ?? 0;
  if (aOn) have = countOne(job, ev).have;
  if (bOn) {
    haveB = countOne(
      {
        ...job,
        kind: job.kindB ?? job.kind,
        template: job.templateB ?? "",
        scope: job.scopeB,
        need: job.needB ?? 1,
        have: haveB,
        payId: job.payIdB,
        payIdB: undefined,
        kindB: undefined,
        needB: undefined,
        haveB: undefined,
      },
      ev,
    ).have;
  }
  return { have, haveB };
}

/**
 * Split dual ticket. Leg A (base goal) spends `limit` base-game spins; 4KA TV spins never touch it.
 * Leg B (4KA TV goal) spends one of `tries` per finished 4KA TV round (a buy goal: per bought round);
 * base spins never touch it. Fails as soon as either unfinished goal is out of its own budget.
 */
function tickSplit(job: JobCard, ev: JobEvent): JobCard {
  const { have, haveB } = comboProgress(job, ev);
  const live = Boolean(ev.liveSpin || ev.bought);
  const baseOpen = !jobBaseDone(job);
  const spun = baseOpen && !live && ev.spun !== false ? job.spun + 1 : job.spun;
  let next: JobCard = { ...job, have, haveB, spun, seal: undefined };
  if (!jobBonusDone(next) && roundCounts(next, ev)) next = { ...next, triesUsed: (job.triesUsed ?? 0) + 1 };
  if (jobDone(next)) return next;
  if (!jobBaseDone(next)) {
    const left = Math.max(0, next.limit - next.spun);
    if (left <= 0 || legHops(next.template, next.kind, next.need, next.have, left)) return { ...next, spun: next.limit };
  }
  return next;
}

function tickCombo(job: JobCard, ev: JobEvent): JobCard {
  const aOn = jobOnThisSpin(job, ev);
  const bOn = jobOnThisSpin(
    { ...job, kind: job.kindB ?? job.kind, template: job.templateB ?? job.template, scope: job.scopeB ?? job.scope },
    ev,
  );
  let have = job.have;
  let haveB = job.haveB ?? 0;
  if (aOn) have = countOne(job, ev).have;
  if (bOn) {
    const counted = countOne(
      {
        ...job,
        kind: job.kindB ?? job.kind,
        template: job.templateB ?? "",
        scope: job.scopeB,
        need: job.needB ?? 1,
        have: haveB,
        payId: job.payIdB,
        payIdB: undefined,
        kindB: undefined,
        needB: undefined,
        haveB: undefined,
      },
      ev,
    );
    haveB = counted.have;
  }
  const spun = job.spun + (ev.spun === false ? 0 : 1);
  const next: JobCard = { ...job, have, haveB, spun };
  if (jobDone(next) || !comboHops(next)) return next;
  if ((next.template === "signal" || next.templateB === "signal") && (ev.liveSpin || ev.bought) && !ev.featureOver) {
    return { ...next, spun: next.limit, seal: true };
  }
  return { ...next, seal: false, spun: next.limit };
}

function comboHops(job: JobCard): boolean {
  const left = Math.max(0, job.limit - job.spun);
  if (left <= 0) return true;
  return (
    legHops(job.template, job.kind, job.need, job.have, left) ||
    legHops(job.templateB ?? "", job.kindB ?? job.kind, job.needB ?? 1, job.haveB ?? 0, left)
  );
}

export function tickJob(job: JobCard, ev: JobEvent): JobCard {
  if (isFeatureKind(job.kind) && !job.kindB) return tickFeature(job, ev);
  // A bar bonus result is only for feature tickets: the classic ones never saw KONTROLA (no spin, no win).
  if (ev.bonus) return job;
  if (job.seal) {
    if (!ev.featureOver) return job;
    return jobDone(job) ? { ...job, seal: false } : { ...job, seal: false, spun: job.limit };
  }
  if (job.template === "retaz" && job.need > 3) {
    job = { ...job, need: 3, limit: Math.max(job.limit, 50) };
  }
  if (job.kindB && job.templateB && jobSplit(job)) return tickSplit(job, ev);
  if (job.kindB && job.templateB) return tickCombo(job, ev);
  if (!jobOnThisSpin(job, ev)) return job;
  let add = 0;
  let have = job.have;
  if (job.kind === "wins") {
    if (job.template === "duo") add = ev.clusters >= 2 ? 1 : 0;
    else if (job.template === "retaz") {
      if (ev.dead) have = 0;
      else if (ev.win) add = 1;
    } else if (ev.win) add = 1;
  }
  if (job.kind === "deads" && ev.dead) add = 1;
  if (job.kind === "tumbles") {
    if (job.template === "plechovky") add = Math.min(6, Math.max(0, Math.floor(ev.orbCount ?? (ev.orbs ? 1 : 0))));
    else add = Math.max(0, ev.tumbles);
  }
  if (job.kind === "chain") add = ev.tumbles >= 2 ? 1 : 0;
  if (job.kind === "live" && ev.live) add = 1;
  if (job.kind === "ticket" && ev.ticket === "ulica") add = 1;
  if (job.kind === "pdf" && ev.pdf) add = 1;
  if (job.kind === "signal") add = Math.max(0, Math.floor(ev.orbSum ?? 0));
  if (job.kind === "symbol" && job.payId && ev.pays?.includes(job.payId)) add = 1;
  if (job.kind === "collect") {
    const won = Boolean(job.payId && ev.pays?.includes(job.payId));
    add = won ? 0 : Math.max(0, Math.floor(ev.shown ?? 0));
  }
  if (job.kind === "buy" && ev.win) add = 1;
  if (job.kind === "cash") add = Math.max(0, +(ev.cash ?? 0).toFixed(2));
  let haveB = job.haveB ?? 0;
  if (job.kind === "hydra") {
    if (job.payId && ev.pays?.includes(job.payId)) add = 1;
    if (job.payIdB && ev.pays?.includes(job.payIdB)) haveB = Math.min(job.needB ?? 0, haveB + 1);
  }
  const summed = job.kind === "cash" ? +((have + add).toFixed(2)) : have + add;
  const nextHave = Math.min(job.need, summed);
  const done = job.kind === "hydra" ? nextHave >= job.need && haveB >= (job.needB ?? 1) : nextHave >= job.need;
  const spun =
    ev.buyOver && job.kind === "buy" && !done
      ? job.limit
      : job.spun + (ev.spun === false ? 0 : 1);
  const next: JobCard = { ...job, have: nextHave, haveB: job.kind === "hydra" ? haveB : job.haveB, spun };
  if (!jobHopeless(next, ev)) return next;
  if (next.template === "signal" && (ev.liveSpin || ev.bought) && !ev.featureOver) {
    return { ...next, spun: next.limit, seal: true };
  }
  return { ...next, seal: false, spun: next.limit };
}

/** Max progress one future spin can still add. Null = no ceiling, fail only when the clock hits zero. */
export function jobCap(job: JobCard): number | null {
  const id = job.template;
  if (id === "retaz" || id === "balik" || id === "siet" || id === "pot" || id === "signal" || id === "noc" || id === "odpis") return null;
  if (isFeatureKind(job.kind)) return null;
  if (id === "plechovky") return 6;
  if (id === "pada") return 20;
  if (job.kind === "collect") return 18;
  return 1;
}

/** True when the ticket can no longer be finished. Called after the spin is already counted. */
export function jobHopeless(job: JobCard, ev?: JobEvent): boolean {
  if (jobDone(job)) return false;
  const left = Math.max(0, job.limit - job.spun);
  if (left <= 0) return true;
  if (job.template === "sucho" && ev && (ev.win || ev.live)) return true;
  const cap = jobCap(job);
  if (cap == null) return false;
  const room = left * cap;
  if (job.kind === "hydra") {
    const a = job.need - job.have;
    const b = (job.needB ?? 1) - (job.haveB ?? 0);
    return a > room || b > room;
  }
  return job.need - job.have > room;
}

export function jobStatus(job: JobCard): "run" | "ok" | "fail" {
  if (jobDone(job)) return "ok";
  if (jobSplit(job)) {
    if (!jobBaseDone(job) && job.spun >= job.limit) return "fail";
    if (!jobBonusDone(job) && (job.triesUsed ?? 0) >= (job.tries ?? 0)) return "fail";
    return "run";
  }
  if (job.seal) return "run";
  if (job.spun >= job.limit) return "fail";
  return "run";
}

/** Goal can only land inside PARKNET, or the goal is to start it. */
export function jobNeedsParknet(job: JobCard): boolean {
  const needs = (kind: JobCard["kind"], scope: JobCard["scope"]) =>
    kind === "buy" || kind === "live" || scope === "live";
  if (job.kindB) return needs(job.kind, job.scope) || needs(job.kindB, job.scopeB);
  if (job.kind === "buy" || job.kind === "live") return true;
  return job.scope === "live";
}

/**
 * No way left into PARKNET.
 * A buy-only ticket dies when the purchase itself is unaffordable.
 * Any other PARKNET ticket dies only when both a spin and a buy are out of reach.
 */
export function jobParknetBroke(job: JobCard, credit: number, spinCost: number, buyCost: number): boolean {
  if (!jobNeedsParknet(job) || jobDone(job) || job.seal) return false;
  const wallet = +credit.toFixed(2);
  const buy = +Math.max(0, buyCost).toFixed(2);
  if (job.kind === "buy") return wallet < buy;
  // Split dual: a buy goal still open can only be finished by buying, whatever the base goal does.
  if (jobSplit(job) && job.kindB === "buy" && !jobBonusDone(job)) return wallet < buy;
  const spin = +Math.max(0, spinCost).toFixed(2);
  return wallet < spin && wallet < buy;
}

/** 0..1 for the compact ticket bar. Two-goal tickets average both legs. */
export function jobProgress(job: JobCard): number {
  const part = (have: number, need: number) => (need > 0 ? Math.min(1, Math.max(0, have / need)) : 0);
  const a = part(job.have, job.need);
  if (job.kind === "hydra" || job.kindB) return (a + part(job.haveB ?? 0, job.needB ?? 1)) / 2;
  return a;
}

export function jobChip(job: JobCard): string {
  return `TIKET ${job.have}/${job.need} · ${jobLeft(job)}`;
}

function lcdInt(n: number): string {
  return Math.round(Math.abs(n)).toLocaleString("sk-SK");
}

export interface LcdRow {
  pin: number;
  label: string;
  value: string;
}

/** Frozen meter. Same seven rows for run, PASS and FAIL. */
export function jobLcd(job: JobCard, verdict: "run" | "ok" | "fail"): { header: "TIKET" | "PASS" | "FAIL"; rows: LcdRow[] } {
  const left = jobLeft(job);
  const cap = jobCap(job);
  const miss = Math.max(0, job.need - job.have);
  const goal = jobShownGoal(job).split("·")[0]?.trim() || "CIEĽ";
  const rows: LcdRow[] = [
    { pin: 1, label: "CIEĽ", value: goal },
    {
      pin: 2,
      label: "SPINY",
      value: jobSplit(job) ? `${left} / ${job.limit} · ${jobTriesLeft(job)} ${triesWord(jobTriesLeft(job))} TV` : `${left} / ${job.limit}`,
    },
    {
      pin: 3,
      label: "HOTOVÉ",
      value: job.kind === "hydra" ? `${job.have}+${job.haveB ?? 0}` : job.kind === "cash" ? `${formatMoney(job.have)} €` : String(job.have),
    },
    {
      pin: 4,
      label: "TREBA",
      value:
        job.kind === "hydra"
          ? `${miss}+${Math.max(0, (job.needB ?? 0) - (job.haveB ?? 0))}`
          : job.kind === "cash"
            ? `${formatMoney(miss)} €`
            : String(miss),
    },
    { pin: 5, label: "MAX", value: cap == null ? "----" : String(left * cap) },
    {
      pin: 6,
      label: "STAV",
      value: verdict === "ok" ? `+${lcdInt(job.payout)}` : verdict === "fail" ? "0.0" : "----",
    },
    {
      pin: 7,
      label: "BANK",
      value: verdict === "fail" ? `−${lcdInt(job.stake)}` : `${lcdInt(job.stake)} → ${lcdInt(job.payout)}`,
    },
  ];
  if (verdict === "fail") {
    for (const row of rows) {
      if (row.pin === 6 || row.pin === 7) continue;
      row.value = "----";
    }
  }
  return { header: verdict === "ok" ? "PASS" : verdict === "fail" ? "FAIL" : "TIKET", rows };
}

/** Any credit can open tickets; takeJob still needs the stake plus one spin at the locked bet. */
export function canSpend(credit: number, _bet = 0): boolean {
  return credit > 0;
}
