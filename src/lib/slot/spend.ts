import { PAY_SYMBOLS, type PayId } from "./symbols.ts";
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
  kind: "wins" | "deads" | "tumbles" | "live" | "ticket" | "pdf" | "signal" | "symbol" | "buy" | "hydra" | "chain" | "collect";
  scope?: "base" | "live" | "any";
  /** Bet locked for the life of the job. */
  lockBet: number;
  mystery?: boolean;
  payId?: PayId;
  payIdB?: PayId;
  needB?: number;
  haveB?: number;
  /** Clock is dead but the LIVE feature has not closed yet. */
  seal?: boolean;
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
  { id: "zber", titles: ["ZBER", "OBCHÔDZKA", "DENNÁ DÁVKA"], kind: "wins", scope: "base", need: [6, 12], until: [35, 55], line: "výherných spinov" },
  { id: "plus", titles: ["PLUS", "HOCIČO", "VÝHRY"], kind: "wins", scope: "base", need: [8, 16], until: [30, 50], line: "akýchkoľvek výhier" },
  { id: "balik", titles: ["MULTI TUMBLE", "REŤAZ PÁDOV", "DVA A VIAC"], kind: "chain", scope: "base", need: [2, 5], until: [40, 70], line: "spinov s 2+ tumble" },
  { id: "pada", titles: ["SÚČET TUMBLE", "PADÁ TO", "PÁDY DOLE"], kind: "tumbles", scope: "base", need: [8, 18], until: [35, 55], line: "tumble pádov súčtom" },
  { id: "siet", titles: ["SIEŤ", "PARKNET LIVE", "ŠTYRI TELEVÍZORY"], kind: "live", scope: "base", need: [1, 1], until: [30, 50], line: "spustiť PARKNET LIVE" },
  { id: "signal", titles: ["TACHYKARDIA", "TEP 180", "PULZ PLECHOVIEK"], kind: "signal", scope: "live", need: [10, 24], until: [15, 25], line: "násobičov súčtom v LIVE" },
  { id: "retaz", titles: ["REŤAZ", "TRI V RADE", "BEZ PRESTÁVKY"], kind: "wins", scope: "base", need: [3, 3], until: [40, 55], line: "výhier v rade" },
  { id: "plechovky", titles: ["PLECHOVKY", "RAMPA HUČÍ", "PLECH NA PLECH"], kind: "tumbles", scope: "live", need: [3, 8], until: [12, 22], line: "spinov s násobičom v LIVE" },
  { id: "tv", titles: ["4TV", "ŠTVORKA NA STENE", "KONTROLA 4KY"], kind: "live", scope: "base", need: [1, 1], until: [30, 50], line: "4tv trigger" },
  { id: "pot", titles: ["POT", "SIVÝ LÍSTOK", "ULICA PADÁ"], kind: "ticket", scope: "base", need: [1, 1], until: [30, 50], line: "lístok 1-FTTB" },
  { id: "sucho", titles: ["SUCHO", "TICHÁ ZÓNA", "RAMPA STOJÍ"], kind: "deads", scope: "base", need: [8, 18], until: [20, 35], line: "mŕtvych spinov" },
  { id: "vynos", titles: ["VÝNOS", "PDF 8+", "PAPIER PLATÍ"], kind: "pdf", scope: "base", need: [1, 2], until: [30, 50], line: "PDF 8+" },
  { id: "duo", titles: ["DUO", "DVA CLUSTRE", "DVOJIČKA"], kind: "wins", scope: "base", need: [2, 4], until: [30, 50], line: "dva clustre na spine" },
  { id: "wifipro", titles: ["DOPOJ WIFIPRO", "WIFI NA STRECHE", "HESLO NA SPODKU"], kind: "symbol", scope: "base", payIds: ["router", "hap"], need: [2, 4], until: [45, 65], line: "výher WifiPRO" },
  { id: "stb", titles: ["DOPOJ STB", "BOX DO OBÝVAČKY", "SET-TOP NA STÔL"], kind: "symbol", scope: "base", payIds: ["arris"], need: [2, 4], until: [45, 70], line: "výher Arris set-top boxom" },
  { id: "domov", titles: ["CESTOU DOMOV", "POSLEDNÝ VÝJAZD", "CESTA SPÄŤ"], kind: "symbol", scope: "base", payIds: ["dacia", "roof"], need: [1, 2], until: [60, 90], line: "výher cestou domov" },
  { id: "noc", titles: ["POHOTOVOSŤ", "SLUŽBA POHOTOVOSŤ", "VÝJAZD PO KÚPE"], kind: "buy", scope: "live", need: [6, 12], until: [15, 25], line: "výher v kúpenom PARKNET" },
  { id: "hydra", titles: ["HYDRA", "DVA ZNAKY", "DVOJITÝ VÝJAZD"], kind: "hydra", scope: "base", need: [1, 3], until: [50, 80], line: "výher dvoch znakov" },
  { id: "prilohy", titles: ["NAHRAJ PRÍLOHY", "SCAN DO OTRS", "FOTO NA TIKET"], kind: "collect", scope: "any", payIds: ["rj45", "router", "hap", "roof", "arris", "case", "dacia", "meter", "pdf"], need: [30, 80], until: [12, 28], line: "kusov na valcoch" },
];

export const JOB_TEMPLATE_IDS: readonly string[] = TEMPLATES.map((t) => t.id);

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
  const bank = Math.max(JOB_BANK, credit);
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
  if (job.kind === "hydra") return job.have >= job.need && (job.haveB ?? 0) >= (job.needB ?? 1);
  return job.have >= job.need;
}

export function jobClock(job: JobCard, inLive = false): string {
  if (jobDone(job)) return "SPLNENÁ";
  if (job.scope === "live" && job.spun === 0 && !inLive) return "ČAKÁ NA PARKNET";
  const left = jobLeft(job);
  if (left <= 0) return "NEÚSPEŠNÝ TIKET";
  if (left === 1) return "posledné točenie";
  return `ešte ${left} ${spinWord(left)}`;
}

const SHORT_PAY: Record<PayId, string> = {
  rj45: "RJ45",
  router: "WIFI",
  hap: "HAP",
  roof: "KRYT",
  arris: "STB",
  case: "KUF",
  dacia: "DAC",
  meter: "OLP",
  pdf: "PDF",
};

export function payShort(id: PayId): string {
  return SHORT_PAY[id] ?? id.toUpperCase();
}

export function jobMeter(job: JobCard): string {
  if (job.kind === "hydra" && job.payId && job.payIdB) {
    return `${payShort(job.payId)} ${job.have}/${job.need} · ${payShort(job.payIdB)} ${job.haveB ?? 0}/${job.needB ?? 0}`;
  }
  if (job.kind === "collect") return `${job.have}/${job.need} ks`;
  return `${job.have}/${job.need}`;
}

export function jobScopeLabel(job: JobCard): string {
  if (job.scope === "live") return job.kind === "buy" ? "KÚPA LIVE" : "PARKNET LIVE";
  if (job.scope === "any") return "BASE + LIVE";
  return "BASE GAME";
}

/** Paying 8+ cluster rate per paid spin (40k sim, tumbles included). */
export const PAY_HIT: Record<PayId, number> = {
  rj45: 0.065,
  router: 0.064,
  hap: 0.057,
  roof: 0.053,
  arris: 0.053,
  case: 0.026,
  dacia: 0.021,
  meter: 0.02,
  pdf: 0.014,
};

/** Cells of this pay on a 6×5 land (weight / 121.5 × 30). */
export const PAY_CELL: Record<PayId, number> = {
  rj45: 3.85,
  router: 3.83,
  hap: 3.7,
  roof: 3.6,
  arris: 3.63,
  case: 3.04,
  dacia: 2.91,
  meter: 2.81,
  pdf: 2.62,
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

/** lacna → low need / long clock; draha → high need / short clock. */
function rollBand(band: [number, number], rng: () => number, bias: number): number {
  if (band[0] === band[1]) return band[0];
  const t = Math.min(1, Math.max(0, bias + rngRange(rng, -0.18, 0.18)));
  return Math.round(band[0] + t * (band[1] - band[0]));
}

function makeJob(
  t: (typeof TEMPLATES)[number],
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
  const payout = Math.max(roundStake(stake * payMul), roundStake(stake * 1.4 * extraPay));
  const hard = floor === "lacna" ? 0.2 : floor === "draha" ? 0.8 : 0.5;
  const need = t.need[0] === t.need[1] ? t.need[0] : Math.max(t.need[0], Math.min(t.need[1], rollBand(t.need, rng, hard)));
  const rawUntil = t.until[0] === t.until[1] ? t.until[0] : rollBand(t.until, rng, 1 - hard);
  const slack = t.kind === "buy" || t.scope === "live" ? 3 : 8;
  let limit = snapFive(Math.max(need + slack, rawUntil));
  if (limit < need) limit = snapFive(need + 5);
  const title = pickOne(t.titles, rng);
  let payId = t.payIds?.length ? pickOne(t.payIds, rng) : undefined;
  let payIdB: PayId | undefined;
  let needB: number | undefined;
  let haveB: number | undefined;
  let needNow = need;
  if (t.kind === "symbol" && payId) {
    if ((PAY_HIT[payId] ?? 1) < 0.03) limit = snapFive(Math.max(limit, 70));
    needNow = symbolNeed(payId, limit, hard);
  }
  if (t.kind === "collect" && payId) {
    needNow = collectNeed(payId, limit, hard);
    if (limit < needNow) limit = snapFive(needNow + 5);
  }
  if (t.kind === "hydra") {
    const ids = PAY_SYMBOLS.map((s) => s.id);
    const first = pickOne(ids, rng);
    const rest = ids.filter((id) => id !== first);
    const second = pickOne(rest, rng);
    payId = first;
    payIdB = second;
    const rare = Math.min(PAY_HIT[first], PAY_HIT[second]) < 0.03;
    if (rare) limit = snapFive(Math.max(limit, 70));
    const split = hydraSplit(first, second, limit, hard);
    needNow = split.needA;
    needB = split.needB;
    haveB = 0;
  }
  const line =
    t.kind === "hydra" && payId && payIdB && needB
      ? `${payShort(payId)} ${needNow}× + ${payShort(payIdB)} ${needB}×`
      : t.kind === "collect" && payId
        ? `kusov ${payShort(payId)} na valcoch`
        : payId === "router" || payId === "hap"
          ? "výher WifiPRO"
          : payId === "arris"
            ? "výher Arris set-top boxom"
            : payId === "dacia"
              ? "výher Daciou cestou domov"
              : payId === "roof"
                ? "výher krytinou cestou domov"
                : t.line;
  const tag = t.scope === "live" ? " · LIVE" : t.scope === "any" ? " · BASE+LIVE" : "";
  const goal = t.kind === "hydra" ? line : `${needNow}× ${line}`;
  return {
    id: `${t.id}-${floor}-${mystery ? "rnd" : "pick"}-${Math.floor(rng() * 1e6)}`,
    floor,
    template: t.id,
    title,
    detail: `${goal} · ${limit} ${spinWord(limit)}${tag}`,
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
}

export function dealJobs(rng: () => number, credit: number, bet: number): JobCard[] {
  const floors: JobFloor[] = ["lacna", "stred", "draha"];
  const bag = shuffle(TEMPLATES, rng);
  const three = floors.map((floor, i) => makeJob(bag[i % bag.length], floor, credit, bet, rng));
  const used = new Set(three.map((j) => j.template));
  const rest = shuffle(
    TEMPLATES.filter((t) => !used.has(t.id)),
    rng,
  );
  const bonusT = rest[0] ?? pickOne(TEMPLATES, rng);
  const bonusFloor = floors[Math.floor(rng() * floors.length)] ?? "stred";
  const bonus = makeJob(bonusT, bonusFloor, credit, bet, rng, 1.15, true);
  return [...three, bonus];
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
  /** Natural or bought PARKNET just closed. */
  featureOver?: boolean;
}

function jobOnThisSpin(job: JobCard, ev: JobEvent): boolean {
  const live = Boolean(ev.liveSpin || ev.bought);
  const scope = job.scope ?? (job.kind === "buy" ? "live" : "base");
  if (job.kind === "buy") return Boolean(ev.bought);
  if (scope === "base") return !live;
  if (scope === "live") return live;
  return true;
}

export function tickJob(job: JobCard, ev: JobEvent): JobCard {
  if (job.seal) {
    if (!ev.featureOver) return job;
    return jobDone(job) ? { ...job, seal: false } : { ...job, seal: false, spun: job.limit };
  }
  if (job.template === "retaz" && job.need > 3) {
    job = { ...job, need: 3, limit: Math.max(job.limit, 50) };
  }
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
  if (job.kind === "collect") add = Math.max(0, Math.floor(ev.shown ?? 0));
  if (job.kind === "buy" && ev.win) add = 1;
  let haveB = job.haveB ?? 0;
  if (job.kind === "hydra") {
    if (job.payId && ev.pays?.includes(job.payId)) add = 1;
    if (job.payIdB && ev.pays?.includes(job.payIdB)) haveB = Math.min(job.needB ?? 0, haveB + 1);
  }
  const nextHave = Math.min(job.need, have + add);
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
  if (id === "retaz" || id === "balik" || id === "siet" || id === "pot" || id === "signal" || id === "noc") return null;
  if (id === "plechovky") return 6;
  if (id === "pada") return 20;
  if (id === "prilohy" || job.kind === "collect") return 30;
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
  if (job.seal) return "run";
  if (job.spun >= job.limit) return "fail";
  return "run";
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
  const goal = (job.goal || job.detail || "CIEĽ").split("·")[0]?.trim() || "CIEĽ";
  const rows: LcdRow[] = [
    { pin: 1, label: "CIEĽ", value: goal },
    { pin: 2, label: "SPINY", value: `${left} / ${job.limit}` },
    {
      pin: 3,
      label: "HOTOVÉ",
      value: job.kind === "hydra" ? `${job.have}+${job.haveB ?? 0}` : String(job.have),
    },
    {
      pin: 4,
      label: "TREBA",
      value:
        job.kind === "hydra"
          ? `${miss}+${Math.max(0, (job.needB ?? 0) - (job.haveB ?? 0))}`
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

export function canSpend(credit: number, _bet = 0): boolean {
  return credit >= JOB_BANK;
}
