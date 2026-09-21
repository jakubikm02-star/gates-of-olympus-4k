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
  kind: "wins" | "deads" | "tumbles" | "live" | "ticket" | "pdf" | "signal" | "dry";
}

/** Share of bank → stake, then payout as multiple of stake. */
const FLOOR_PCT: Record<JobFloor, { stake: [number, number]; payX: [number, number] }> = {
  lacna: { stake: [0.06, 0.12], payX: [1.55, 1.9] },
  stred: { stake: [0.16, 0.26], payX: [1.7, 2.05] },
  draha: { stake: [0.32, 0.45], payX: [1.85, 2.2] },
};

const TEMPLATES: {
  id: string;
  title: string;
  kind: JobCard["kind"];
  need: [number, number];
  until: number;
  line: string;
}[] = [
  { id: "zber", title: "ZBER", kind: "wins", need: [8, 14], until: 50, line: "výherných spinov" },
  { id: "balik", title: "BALÍK", kind: "tumbles", need: [6, 12], until: 40, line: "tumble reťazí" },
  { id: "siet", title: "SIEŤ", kind: "live", need: [1, 1], until: 40, line: "spustiť PARKNET LIVE" },
  { id: "signal", title: "SIGNÁL", kind: "signal", need: [10, 25], until: 50, line: "SIGNÁL dosiahnuť" },
  { id: "retaz", title: "REŤAZ", kind: "wins", need: [3, 3], until: 50, line: "výhier v rade" },
  { id: "plechovky", title: "PLECHOVKY", kind: "tumbles", need: [3, 7], until: 30, line: "spinov s násobičom" },
  { id: "tv", title: "4TV", kind: "live", need: [1, 1], until: 40, line: "4tv trigger" },
  { id: "plus", title: "PLUS", kind: "wins", need: [12, 20], until: 50, line: "akýchkoľvek výhier" },
  { id: "pot", title: "POT", kind: "ticket", need: [1, 1], until: 40, line: "sivý lístok ULICA" },
  { id: "sucho", title: "SUCHO", kind: "deads", need: [10, 18], until: 25, line: "mŕtvych spinov" },
  { id: "vynos", title: "VÝNOS", kind: "pdf", need: [1, 2], until: 40, line: "PDF 8+" },
  { id: "duo", title: "DUO", kind: "wins", need: [2, 4], until: 30, line: "dva clustre na spine" },
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

export function rerollCost(credit: number): number {
  return roundStake(Math.max(5, credit * 0.018));
}

export function jobLeft(job: JobCard): number {
  return Math.max(0, job.limit - job.spun);
}

export function jobClock(job: JobCard): string {
  if (job.have >= job.need) return "SPLNEŇÁ";
  const left = jobLeft(job);
  if (left <= 0) return "TERMÍN PREŠIEL";
  if (left === 1) return "posledné točenie";
  return `ešte ${left} točení`;
}

export function dealJobs(rng: () => number, credit: number): JobCard[] {
  const bank = Math.max(JOB_BANK, credit);
  const floors: JobFloor[] = ["lacna", "stred", "draha"];
  const bag = TEMPLATES.map((t) => t);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = bag[i];
    bag[i] = bag[j];
    bag[j] = t;
  }
  return floors.map((floor, i) => {
    const t = bag[i % bag.length];
    const f = FLOOR_PCT[floor];
    const stake = Math.min(roundStake(bank * rngRange(rng, f.stake[0], f.stake[1])), roundStake(bank * 0.85));
    const payout = Math.max(roundStake(stake * rngRange(rng, f.payX[0], f.payX[1])), roundStake(stake * 1.4));
    const need = t.need[0] === t.need[1] ? t.need[0] : Math.round(rngRange(rng, t.need[0], t.need[1]));
    return {
      id: `${t.id}-${floor}-${Math.floor(rng() * 1e6)}`,
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
    };
  });
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
  if (job.kind === "signal" && ev.signal >= job.need) add = job.need;
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
