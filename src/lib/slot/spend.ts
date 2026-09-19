import type { TierId } from "./jackpot";

export const SURPLUS_X = 500;
export const REROLL_COST = 1000;
export const TOPUP_AMOUNTS = [1000, 2500, 5000] as const;

export type ShiftId = "nocny" | "pdf" | "signal" | "siet" | "tvrdy";

export interface ShiftDef {
  id: ShiftId;
  name: string;
  spins: [number, number];
  costX: number;
  note: string;
}

export const SHIFTS: readonly ShiftDef[] = [
  { id: "nocny", name: "NOČNÝ DROP", spins: [20, 30], costX: 25, note: "Low clustre častejšie." },
  { id: "pdf", name: "PDF HUNT", spins: [20, 30], costX: 40, note: "PDF váha ×2." },
  { id: "signal", name: "SIGNÁL 5", spins: [20, 30], costX: 50, note: "LIVE začína na 5×." },
  { id: "siet", name: "DLHÁ SIEŤ", spins: [20, 30], costX: 35, note: "LIVE +5 spinov." },
  { id: "tvrdy", name: "TVRDÝ PORT", spins: [20, 30], costX: 30, note: "Contrib ×2. Drop rate nie." },
] as const;

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

const FLOOR: Record<JobFloor, { stake: [number, number]; pay: [number, number] }> = {
  lacna: { stake: [1000, 2500], pay: [1800, 5000] },
  stred: { stake: [8000, 15000], pay: [14000, 32000] },
  draha: { stake: [40000, 90000], pay: [70000, 180000] },
};

const TEMPLATES: { id: string; title: string; kind: JobCard["kind"]; need: [number, number]; line: string }[] = [
  { id: "zber", title: "ZBER", kind: "wins", need: [8, 14], line: "Výherných spinov" },
  { id: "balik", title: "BALÍK", kind: "tumbles", need: [6, 12], line: "Tumble reťazí" },
  { id: "siet", title: "SIEŤ", kind: "live", need: [1, 1], line: "Spustiť PARKNET LIVE" },
  { id: "signal", title: "SIGNÁL", kind: "signal", need: [10, 25], line: "SIGNÁL dosiahnuť" },
  { id: "retaz", title: "REŤAZ", kind: "wins", need: [4, 8], line: "Séria výhier v rade" },
  { id: "plechovky", title: "PLECHOVKY", kind: "tumbles", need: [3, 7], line: "Spiny s násobičom" },
  { id: "tv", title: "4TV", kind: "live", need: [1, 1], line: "4tv trigger" },
  { id: "plus", title: "PLUS", kind: "wins", need: [12, 20], line: "Akýchkoľvek výhier" },
  { id: "pot", title: "POT", kind: "ticket", need: [1, 1], line: "Sivý lístok ULICA" },
  { id: "sucho", title: "SUCHO", kind: "deads", need: [10, 18], line: "Mŕtvych spinov" },
  { id: "vynos", title: "VÝNOS", kind: "pdf", need: [1, 2], line: "PDF 8+" },
  { id: "duo", title: "DUO", kind: "wins", need: [2, 4], line: "Dva clustre na spine" },
];

function rngRange(rng: () => number, a: number, b: number): number {
  return Math.round(a + rng() * (b - a));
}

export function dealJobs(rng: () => number): JobCard[] {
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
    const f = FLOOR[floor];
    const stake = rngRange(rng, f.stake[0], f.stake[1]);
    const payout = rngRange(rng, f.pay[0], f.pay[1]);
    const need = t.need[0] === t.need[1] ? t.need[0] : rngRange(rng, t.need[0], t.need[1]);
    const limit = need === 1 ? rngRange(rng, 25, 80) : rngRange(rng, need * 4, need * 10);
    return {
      id: `${t.id}-${floor}-${Math.floor(rng() * 1e6)}`,
      floor,
      template: t.id,
      title: t.title,
      detail: `${t.line} · ${need}`,
      stake,
      payout,
      need,
      have: 0,
      limit,
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

export function canSpend(credit: number, bet: number): boolean {
  return bet > 0 && credit >= SURPLUS_X * bet;
}

export function shiftLen(def: ShiftDef, rng: () => number): number {
  return rngRange(rng, def.spins[0], def.spins[1]);
}

export const TOPUP_TIERS: TierId[] = ["ulica", "okres", "kraj"];

export function shiftById(id: string): ShiftDef | undefined {
  return SHIFTS.find((s) => s.id === id);
}
