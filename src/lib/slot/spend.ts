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
  stake: number;
  payout: number;
  need: number;
  have: number;
  limit: number;
  spun: number;
  kind: "wins" | "deads" | "tumbles" | "live" | "ticket" | "pdf" | "signal" | "dry" | "symbol" | "buy" | "hydra";
  /** Bet locked for the life of the job. */
  lockBet: number;
  mystery?: boolean;
  payId?: PayId;
  payIdB?: PayId;
  needB?: number;
  haveB?: number;
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
  need: [number, number];
  until: [number, number];
  line: string;
  payIds?: PayId[];
}[] = [
  { id: "zber", titles: ["ZBER", "OBCHÔDZKA", "DENNÁ DÁVKA"], kind: "wins", need: [8, 14], until: [40, 55], line: "výherných spinov" },
  { id: "balik", titles: ["BALÍK", "REŤAZ TUMBLE", "PADÁ TO"], kind: "tumbles", need: [6, 12], until: [30, 50], line: "tumble reťazí" },
  { id: "siet", titles: ["SIEŤ", "PARKNET LIVE", "ŠTYRI TELEVÍZORY"], kind: "live", need: [1, 1], until: [30, 50], line: "spustiť PARKNET LIVE" },
  { id: "signal", titles: ["TACHYKARDIA", "TEP 180", "PULZ PLECHOVIEK"], kind: "signal", need: [12, 28], until: [40, 55], line: "násobičov súčtom plechoviek" },
  { id: "retaz", titles: ["REŤAZ", "TRI V RADE", "BEZ PRESTÁVKY"], kind: "wins", need: [3, 3], until: [40, 55], line: "výhier v rade" },
  { id: "plechovky", titles: ["PLECHOVKY", "RAMPA HUČÍ", "PLECH NA PLECH"], kind: "tumbles", need: [3, 8], until: [25, 40], line: "spinov s násobičom" },
  { id: "tv", titles: ["4TV", "ŠTVORKA NA STENE", "KONTROLA 4KY"], kind: "live", need: [1, 1], until: [30, 50], line: "4tv trigger" },
  { id: "plus", titles: ["PLUS", "HOCIČO", "VÝHRY"], kind: "wins", need: [10, 22], until: [40, 55], line: "akýchkoľvek výhier" },
  { id: "pot", titles: ["POT", "SIVÝ LÍSTOK", "ULICA PADÁ"], kind: "ticket", need: [1, 1], until: [30, 50], line: "sivý lístok ULICA" },
  { id: "sucho", titles: ["SUCHO", "TICHÁ ZÓNA", "RAMPA STOJÍ"], kind: "deads", need: [8, 18], until: [20, 35], line: "mŕtvych spinov" },
  { id: "vynos", titles: ["VÝNOS", "PDF 8+", "PAPIER PLATÍ"], kind: "pdf", need: [1, 2], until: [30, 50], line: "PDF 8+" },
  { id: "duo", titles: ["DUO", "DVA CLUSTRE", "DVOJIČKA"], kind: "wins", need: [2, 5], until: [25, 40], line: "dva clustre na spine" },
  { id: "wifipro", titles: ["DOPOJ WIFIPRO", "WIFI NA STRECHE", "HESLO NA SPODKU"], kind: "symbol", payIds: ["router", "hap"], need: [4, 9], until: [40, 55], line: "výher WifiPRO" },
  { id: "stb", titles: ["DOPOJ STB", "BOX DO OBÝVAČKY", "SET-TOP NA STÔL"], kind: "symbol", payIds: ["arris", "case"], need: [4, 9], until: [40, 55], line: "výher set-top boxom" },
  { id: "rebrik", titles: ["REBRÍK NETREBA", "Z OKNA", "BEZ LEŠENIA"], kind: "dry", need: [6, 14], until: [40, 55], line: "výher bez tumble" },
  { id: "domov", titles: ["CESTOU DOMOV", "POSLEDNÝ VÝJAZD", "CESTA SPÄŤ"], kind: "symbol", payIds: ["dacia", "roof"], need: [3, 8], until: [35, 55], line: "výher cestou domov" },
  { id: "noc", titles: ["POHOTOVOSŤ", "SLUŽBA POHOTOVOSŤ", "VÝJAZD PO KÚPE"], kind: "buy", need: [6, 12], until: [15, 25], line: "výher v kúpenom PARKNET" },
  { id: "hydra", titles: ["HYDRA", "DVA ZNAKY", "DVOJITÝ VÝJAZD"], kind: "hydra", need: [4, 8], until: [40, 55], line: "výher dvoch znakov" },
];

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

export function jobClock(job: JobCard): string {
  if (jobDone(job)) return "SPLNENÁ";
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
  return `${job.have}/${job.need}`;
}

export function hydraSplit(a: PayId, b: PayId, budget: number): { needA: number; needB: number } {
  const wa = PAY_SYMBOLS.find((s) => s.id === a)?.weight ?? 12;
  const wb = PAY_SYMBOLS.find((s) => s.id === b)?.weight ?? 12;
  const sum = Math.max(0.01, wa + wb);
  let na = Math.round((budget * wa) / sum);
  let nb = Math.round((budget * wb) / sum);
  if (na < 2) {
    nb = Math.max(2, nb - (2 - na));
    na = 2;
  }
  if (nb < 2) {
    na = Math.max(2, na - (2 - nb));
    nb = 2;
  }
  if (na + nb < 4) {
    na = 2;
    nb = 2;
  }
  return { needA: na, needB: nb };
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
  const slack = t.kind === "buy" ? 3 : 8;
  let limit = snapFive(Math.max(need + slack, rawUntil));
  if (limit < need) limit = snapFive(need + 5);
  const title = pickOne(t.titles, rng);
  let payId = t.payIds?.length ? pickOne(t.payIds, rng) : undefined;
  let payIdB: PayId | undefined;
  let needB: number | undefined;
  let haveB: number | undefined;
  let needNow = need;
  if (t.kind === "hydra") {
    const ids = PAY_SYMBOLS.map((s) => s.id);
    const first = pickOne(ids, rng);
    const rest = ids.filter((id) => id !== first);
    const second = pickOne(rest, rng);
    payId = first;
    payIdB = second;
    const split = hydraSplit(first, second, need);
    needNow = split.needA;
    needB = split.needB;
    haveB = 0;
    limit = snapFive(Math.max(limit, needNow + needB + 15));
  }
  const line =
    t.kind === "hydra" && payId && payIdB && needB
      ? `${payShort(payId)} ${needNow}× + ${payShort(payIdB)} ${needB}×`
      : payId === "router" || payId === "hap"
        ? "výher WifiPRO"
        : payId === "arris" || payId === "case"
          ? "výher set-top boxom"
          : payId === "dacia"
            ? "výher Daciou cestou domov"
            : payId === "roof"
              ? "výher krytinou cestou domov"
              : t.line;
  return {
    id: `${t.id}-${floor}-${mystery ? "rnd" : "pick"}-${Math.floor(rng() * 1e6)}`,
    floor,
    template: t.id,
    title,
    detail: `${t.kind === "hydra" ? line : `${needNow}× ${line}`} · ${limit} ${spinWord(limit)}`,
    stake,
    payout,
    need: needNow,
    have: 0,
    limit,
    spun: 0,
    kind: t.kind,
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
  const bonusT = rest[0] ?? bag[0];
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
}

export function tickJob(job: JobCard, ev: JobEvent): JobCard {
  if (job.template === "retaz" && job.need > 3) {
    job = { ...job, need: 3, limit: Math.max(job.limit, 50) };
  }
  if (job.kind === "buy" && !ev.bought) return job;
  if (job.kind !== "buy" && ev.bought) return job;
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
    if (job.template === "plechovky") add = ev.orbs ? 1 : 0;
    else if (ev.tumbles > 0) add = 1;
  }
  if (job.kind === "live" && ev.live) add = 1;
  if (job.kind === "ticket" && ev.ticket === "ulica") add = 1;
  if (job.kind === "pdf" && ev.pdf) add = 1;
  if (job.kind === "signal") add = Math.max(0, Math.floor(ev.orbSum ?? 0));
  if (job.kind === "dry" && ev.win && ev.tumbles <= 0) add = 1;
  if (job.kind === "symbol" && job.payId && ev.pays?.includes(job.payId)) add = 1;
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
  return { ...job, have: nextHave, haveB: job.kind === "hydra" ? haveB : job.haveB, spun };
}

export function jobStatus(job: JobCard): "run" | "ok" | "fail" {
  if (jobDone(job)) return "ok";
  if (job.spun >= job.limit) return "fail";
  return "run";
}

export function canSpend(credit: number, _bet = 0): boolean {
  return credit >= JOB_BANK;
}
