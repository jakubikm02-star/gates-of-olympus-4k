import type { Run } from "./types.ts";

export interface ChallengeDef {
  id: string;
  period: "day" | "week";
  title: string;
  line: string;
  reward: number;
  met: (run: Run) => boolean;
}

const DAILY: readonly Omit<ChallengeDef, "period">[] = [
  {
    id: "chem3",
    title: "Tri chémie",
    line: "V jednom spine maj aspoň 3 susedské chémie.",
    reward: 8,
    met: (run) => run.trace.chemRow >= 3,
  },
  {
    id: "boss-plain",
    title: "Boss bez ALL-IN",
    line: "Zabi bossa a v tom behu nechoď ALL-IN.",
    reward: 12,
    met: (run) => run.trace.bosses >= 1 && run.trace.allIns === 0,
  },
  {
    id: "floor3",
    title: "Tretie poschodie",
    line: "Dostaň sa aspoň na 3. poschodie.",
    reward: 6,
    met: (run) => run.stats.bestFloor >= 3,
  },
  {
    id: "crit3",
    title: "Tri kritické",
    line: "V jednom behu daj 3 kritické zásahy.",
    reward: 8,
    met: (run) => run.stats.crits >= 3,
  },
];

const WEEKLY: readonly Omit<ChallengeDef, "period">[] = [
  {
    id: "floor5",
    title: "Piate poschodie",
    line: "Dostaň sa aspoň na 5. poschodie.",
    reward: 20,
    met: (run) => run.stats.bestFloor >= 5,
  },
  {
    id: "kills8",
    title: "Osem súbojov",
    line: "V jednom behu vyhraj 8 súbojov.",
    reward: 16,
    met: (run) => run.stats.kills >= 8,
  },
];

export interface ChallengeView {
  id: string;
  period: "day" | "week";
  title: string;
  line: string;
  reward: number;
  done: boolean;
}

export interface ChallengeState {
  day: string;
  week: string;
  claimed: string[];
}

function hash(text: string): number {
  let n = 2166136261;
  for (let i = 0; i < text.length; i++) {
    n ^= text.charCodeAt(i);
    n = Math.imul(n, 16777619);
  }
  return n >>> 0;
}

/** YYYY-MM-DD in Europe/Bratislava. Tests pass their own stamp. */
export function bratislavaDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function weekKey(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const utc = Date.UTC(y || 2026, (m || 1) - 1, d || 1);
  const date = new Date(utc);
  const dayNum = (date.getUTCDay() + 6) % 7;
  const thursday = new Date(utc);
  thursday.setUTCDate(date.getUTCDate() - dayNum + 3);
  const year = thursday.getUTCFullYear();
  const first = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((thursday.getTime() - first.getTime()) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function challengesOn(day: string): ChallengeDef[] {
  const week = weekKey(day);
  const daily = [...DAILY].sort((a, b) => (hash(day + a.id) % 997) - (hash(day + b.id) % 997)).slice(0, 2);
  const weekly = WEEKLY[hash(week) % WEEKLY.length]!;
  return [
    ...daily.map((row) => ({ ...row, period: "day" as const })),
    { ...weekly, period: "week" as const },
  ];
}

export function emptyChallenges(day = "1970-01-01"): ChallengeState {
  return { day, week: weekKey(day), claimed: [] };
}

const KEY = "p4k.nocna.challenges";

export function loadChallenges(day = bratislavaDay()): ChallengeState {
  if (typeof localStorage === "undefined") return emptyChallenges(day);
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null") as Partial<ChallengeState> | null;
    const claimed = Array.isArray(raw?.claimed) ? raw!.claimed.filter((id) => typeof id === "string") : [];
    return { day, week: weekKey(day), claimed };
  } catch {
    return emptyChallenges(day);
  }
}

export function saveChallenges(state: ChallengeState): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify({ claimed: state.claimed.slice(-40) }));
}

function token(period: "day" | "week", stamp: string, id: string): string {
  return `${period}:${stamp}:${id}`;
}

export function viewChallenges(state: ChallengeState, day: string): ChallengeView[] {
  const week = weekKey(day);
  return challengesOn(day).map((row) => {
    const stamp = row.period === "day" ? day : week;
    return { id: row.id, period: row.period, title: row.title, line: row.line, reward: row.reward, done: state.claimed.includes(token(row.period, stamp, row.id)) };
  });
}

/** Pay a challenge once per its day or week. Returns the screws gained. */
export function claimChallenges(state: ChallengeState, run: Run, day: string): { state: ChallengeState; gained: number; titles: string[] } {
  const week = weekKey(day);
  const claimed = state.claimed.slice();
  let gained = 0;
  const titles: string[] = [];
  for (const row of challengesOn(day)) {
    const stamp = row.period === "day" ? day : week;
    const key = token(row.period, stamp, row.id);
    if (claimed.includes(key) || !row.met(run)) continue;
    claimed.push(key);
    gained += row.reward;
    titles.push(row.title);
  }
  return { state: { day, week, claimed }, gained, titles };
}
