import type { PayId } from "./symbols";
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
  kind: "wins" | "deads" | "tumbles" | "live" | "ticket" | "pdf" | "signal" | "dry" | "symbol";
  /** Bet locked for the life of the job. */
  lockBet: number;
  mystery?: boolean;
  payId?: PayId;
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
  title: string;
  kind: JobCard["kind"];
  need: [number, number];
  until: number;
  line: string;
  payId?: PayId;
}[] = [
  { id: "zber", title: "ZBER", kind: "wins", need: [8, 14], until: 50, line: "výherných spinov" },
  { id: "balik", title: "BALÍK", kind: "tumbles", need: [6, 12], until: 40, line: "tumble reťazí" },
  { id: "siet", title: "SIEŤ", kind: "live", need: [1, 1], until: 40, line: "spustiť PARKNET LIVE" },
  { id: "signal", title: "TACHYKARDIA", kind: "signal", need: [15, 25], until: 50, line: "násobičov súčtom plechoviek" },
  { id: "retaz", title: "REŤAZ", kind: "wins", need: [3, 3], until: 50, line: "výhier v rade" },
  { id: "plechovky", title: "PLECHOVKY", kind: "tumbles", need: [3, 7], until: 30, line: "spinov s násobičom" },
  { id: "tv", title: "4TV", kind: "live", need: [1, 1], until: 40, line: "4tv trigger" },
  { id: "plus", title: "PLUS", kind: "wins", need: [12, 20], until: 50, line: "akýchkoľvek výhier" },
  { id: "pot", title: "POT", kind: "ticket", need: [1, 1], until: 40, line: "sivý lístok ULICA" },
  { id: "sucho", title: "SUCHO", kind: "deads", need: [10, 18], until: 25, line: "mŕtvych spinov" },
  { id: "vynos", title: "VÝNOS", kind: "pdf", need: [1, 2], until: 40, line: "PDF 8+" },
  { id: "duo", title: "DUO", kind: "wins", need: [2, 4], until: 30, line: "dva clustre na spine" },
  { id: "wifipro", title: "DOPOJ WIFIPRO", kind: "symbol", payId: "router", need: [5, 8], until: 50, line: "výher routerom WifiPRO" },
  { id: "stb", title: "DOPOJ STB", kind: "symbol", payId: "arris", need: [5, 8], until: 50, line: "výher set-top boxom" },
  { id: "rebrik", title: "REBRÍK NETREBA", kind: "dry", need: [8, 14], until: 50, line: "výher bez tumble" },
  { id: "domov", title: "CESTOU DOMOV", kind: "symbol", payId: "dacia", need: [4, 7], until: 50, line: "výher Daciou cestou domov" },
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

export function jobClock(job: JobCard): string {
  if (job.have >= job.need) return "SPLNENÁ";
  const left = jobLeft(job);
  if (left <= 0) return "TERMÍN PREŠIEL";
  if (left === 1) return "posledné točenie";
  return `ešte ${left} ${spinWord(left)}`;
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
  const need = t.need[0] === t.need[1] ? t.need[0] : Math.round(rngRange(rng, t.need[0], t.need[1]));
  return {
    id: `${t.id}-${floor}-${mystery ? "rnd" : "pick"}-${Math.floor(rng() * 1e6)}`,
    floor,
    template: t.id,
    title: t.title,
    detail: `${need}× ${t.line}`,
    stake,
    payout,
    need,
    have: 0,
    limit: t.until,
    spun: 0,
    kind: t.kind,
    lockBet: b,
    mystery,
    payId: t.payId,
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
}

export function tickJob(job: JobCard, ev: JobEvent): JobCard {
  if (job.template === "retaz" && job.need > 3) {
    job = { ...job, need: 3, limit: Math.max(job.limit, 50) };
  }
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
  const spun = job.spun + (ev.spun === false ? 0 : 1);
  return { ...job, have: Math.min(job.need, have + add), spun };
}

export function jobStatus(job: JobCard): "run" | "ok" | "fail" {
  if (job.have >= job.need) return "ok";
  if (job.spun >= job.limit) return "fail";
  return "run";
}

export function canSpend(credit: number, _bet = 0): boolean {
  return credit >= JOB_BANK;
}
