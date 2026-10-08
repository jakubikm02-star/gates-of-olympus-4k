/**
 * KOLESO NEŠŤASTIA: the third mode of the KONTROLA bar (navrh /workspace/koleso/navrh.md, variant A "Expres").
 * Satire of a TV wheel-and-phrase game show; every host is a fictional parody (Peter Marcipán, Jožo Pročkár,
 * Betka Frekvencová, Lukáš Adapter, JUDr. Zabavil, Daňová Danka, Kuriér Nezastihol), no real names or likeness.
 *
 * - The board shows a hidden phrase (tajnička, white cards of Zvrátené Myšlienky) on 16 columns × ≤ 4 rows,
 *   with S T N A E already shown ("Jožo daruje"). Letters fold diacritics: S shows S and Š, A shows A Á Ä …
 * - 6 spins (EXTRA ŤAH up to 9). The wheel has 16 equal slices (P = 1/16 each, what you see is what you get).
 *   Value slices pay value × occurrences of a consonant picked by the host (frequency-weighted, never the
 *   player: a player who reads the board would double the EV). Gags: ×2, BANKROT, STRATIL SI ŤAH (−1 more
 *   spin), DAŇOVÁ KONTROLA (bank ×0.77), EXEKÚCIA (×0.5), KURIÉR (parcel 0/0.5/1/2/5×), SAMOHLÁSKA ZA PENIAZE
 *   (−0.3× bank, a vowel; free when the bank cannot pay), EXTRA ŤAH (+1 spin).
 * - Solved when ≥ 55 % of the letters are visible: bank × 2 + 1.58×. Otherwise the bank is paid as is.
 * - Cap KOLESO_CAP_X × bet on the wheel part; the Sponzorský šek (KOLESO_VIP) is paid on top, untouched by
 *   BANKROT and the cap, so E[KOLESO] = E[KONTROLA] per rank (scripts/koleso-ev.ts, koleso.test.ts).
 * - The whole run is decided up front by playKoleso(rng) with the game's createRng(seed); the UI animates it.
 */

export type KSegKind = "val" | "x2" | "bankrot" | "lost" | "tax" | "exek" | "courier" | "vowel" | "extra";

export interface KSeg {
  kind: KSegKind;
  /** val: × bet per occurrence. */
  v?: number;
  /** Text drawn on the slice (code, not art). */
  label: string;
  /** Second line (small). */
  sub?: string;
}

/**
 * The 16 slices clockwise from the pointer (slice 0 sits under the pointer at angle 0). Values and gags are
 * spread so no two gags of the same mood touch (Martin's reference wheel: red / black alternate).
 */
export const KOLESO_WHEEL: readonly KSeg[] = [
  { kind: "val", v: 0.25, label: "0,25×" },
  { kind: "bankrot", label: "BANKROT" },
  { kind: "val", v: 0.4, label: "0,4×" },
  { kind: "courier", label: "KURIÉR", sub: "balík" },
  { kind: "val", v: 0.7, label: "0,7×" },
  { kind: "tax", label: "DAŇOVÁ", sub: "KONTROLA" },
  { kind: "val", v: 0.25, label: "0,25×" },
  { kind: "extra", label: "EXTRA", sub: "ŤAH" },
  { kind: "val", v: 1.5, label: "1,5×", sub: "PRÉMIA" },
  { kind: "lost", label: "STRATIL", sub: "SI ŤAH" },
  { kind: "val", v: 0.4, label: "0,4×" },
  { kind: "vowel", label: "SAMO-", sub: "HLÁSKA" },
  { kind: "val", v: 0.25, label: "0,25×" },
  { kind: "exek", label: "EXEKÚCIA" },
  { kind: "val", v: 0.7, label: "0,7×" },
  { kind: "x2", label: "×2" },
];
export const KOLESO_SLICES = KOLESO_WHEEL.length;

export const KOLESO_SPINS = 6;
export const KOLESO_SPINS_MAX = 9;
export const KOLESO_VOWEL_COST = 0.3;
export const KOLESO_TAX = 0.77;
export const KOLESO_EXEK = 0.5;
export const KOLESO_COURIER: readonly number[] = [0, 0.5, 1, 2, 5];
export const KOLESO_SOLVE_AT = 0.55;
export const KOLESO_SOLVE_MUL = 2;
export const KOLESO_SOLVE_FLAT = 1.58;
export const KOLESO_CAP_X = 30;
/** Letters shown before the first spin ("Jožo daruje S, T, N, A, E — zvyšok je spoplatnený"). */
export const KOLESO_START: readonly string[] = ["s", "t", "n", "a", "e"];
export const KOLESO_COLS = 16;
export const KOLESO_ROWS = 4;

/**
 * Sponzorský šek (× bet), paid on top of the wheel (rank perk, like KONTROLA's peek and Ž-BOX's priority parcel).
 * E[KONTROLA(rank)] − E[wheel without šek] (3.011× at solve bonus 1.58×, 4 M runs), rounded to 0.01:
 * scripts/koleso-ev.ts tune. Every rank lands on its KONTROLA EV (koleso.test.ts).
 */
export const KOLESO_VIP: Record<string, number> = {
  kredit: 0.04,
  sloboda: 0.04,
  smart: 0.21,
  telka: 0.36,
  optika: 0.44,
  duo: 0.66,
  fiveg: 0.81,
  nekonecno: 1.44,
};

export function kolesoVipOf(rankId: string | undefined): number {
  return (rankId && KOLESO_VIP[rankId]) || 0;
}

/**
 * Tajničky: white cards of Zvrátené Myšlienky (https://zvratene-myslienky.lovable.app, bundle
 * /assets/index-CUuOcnLK.js, white card id), quoted exactly. No brands, no real names (navrh.md 6).
 */
export const KOLESO_PHRASES: readonly { id: number; cat: string; text: string }[] = [
  { id: 549, cat: "PENIAZE", text: "Exekútor s lepším autom ako ja." },
  { id: 544, cat: "PENIAZE", text: "Splátky za splácanie splátok." },
  { id: 541, cat: "BÝVANIE", text: "Hypotéka na celý život." },
  { id: 551, cat: "ÚRADY", text: "Pokuta zaplatená neskoro s úrokom." },
  { id: 557, cat: "PENIAZE", text: "Výplata, čo zmizla do víkendu." },
  { id: 547, cat: "PENIAZE", text: "Nulové úspory pred penziou." },
  { id: 542, cat: "PENIAZE", text: "Investícia do kamarátovho startupu." },
  { id: 558, cat: "PRÁCA", text: "Šéf vysvetľujúci inflačnú mzdu." },
  { id: 656, cat: "PRÁCA", text: "Kolega, čo robí menej a zarába viac." },
  { id: 511, cat: "ÚRADY", text: "Dotácia na niečo, čo nefunguje." },
  { id: 516, cat: "POLITIKA", text: "Predvolebný sľub zabudnutý do piatku." },
  { id: 811, cat: "POLITIKA", text: "Starosta so sľubmi z každej kampane." },
  { id: 483, cat: "ÚRADY", text: "Štátny zamestnanec pri práci." },
  { id: 680, cat: "DOPRAVA", text: "Parkovanie v Petržalke ako vojna." },
  { id: 824, cat: "DOPRAVA", text: "Stres z parkovania trvajúci hodinu." },
  { id: 682, cat: "DOPRAVA", text: "Revízor s pokutou bez milosti." },
  { id: 690, cat: "DOPRAVA", text: "Meškajúca MHD v -15 stupňoch." },
  { id: 684, cat: "DOPRAVA", text: "Bazárové auto so skrytými chybami." },
  { id: 676, cat: "DOPRAVA", text: "STK odmietajúca prehnité auto." },
  { id: 799, cat: "TELEKOM", text: "Tarif s dátami, čo nikdy nestačia." },
  { id: 808, cat: "TELEKOM", text: "Lacný tarif so skrytými obmedzeniami." },
  { id: 782, cat: "TELEKOM", text: "Dáta vyčerpané za prvý týždeň mesiaca." },
  { id: 800, cat: "TELEKOM", text: "Skrytý poplatok objavený až vo faktúre." },
  { id: 819, cat: "DOPRAVA", text: "Parkovacie miesto drahšie ako nájom v dedine." },
  { id: 843, cat: "ŽIVOT", text: "Záchytka s päťhviezdičkovým hodnotením." },
  { id: 604, cat: "ŽIVOT", text: "Plán B, čo tiež nefunguje." },
  { id: 814, cat: "SUSEDIA", text: "Sused vediaci všetko o všetkých." },
  { id: 810, cat: "DEDINA", text: "Krčma riešiaca všetky dedinské problémy." },
  { id: 512, cat: "POLITIKA", text: "Záchranné balíčky pre milionárov." },
  { id: 655, cat: "ŽIVOT", text: "Smrť ako jediná istota v živote." },
  { id: 831, cat: "SLOVENSKO", text: "Bratislavčan, čo nikdy nebol v Košiciach." },
  { id: 832, cat: "SLOVENSKO", text: "Hrdosť na blízkosť k Viedni." },
  { id: 803, cat: "TELEKOM", text: "Zákaznícka linka presmerovávajúca do nekonečna." },
  { id: 798, cat: "PENIAZE", text: "Vernostný program po 10 rokoch s nulovou hodnotou." },
  { id: 834, cat: "PENIAZE", text: "Kávička za 4 eurá ako životný štandard." },
  { id: 828, cat: "BÝVANIE", text: "Nájom v Starom Meste ako druhá hypotéka." },
  { id: 830, cat: "DOPRAVA", text: "Prístavný most v piatok o 17:00 ako parkovisko." },
  { id: 732, cat: "RODINA", text: "Rodinný chat plný dezinformácií." },
  { id: 812, cat: "RODINA", text: "Babka pri kostole s názorom na všetko." },
  { id: 548, cat: "RODINA", text: "Pôžička od rodičov, čo sa nikdy nevráti." },
  { id: 796, cat: "TELEKOM", text: "Roaming poplatok vyšší ako celá dovolenka." },
  /* Slovné spojenia z Všeobecných podmienok SWAN na mobilné služby (platné od 1. 7. 2024). */
  { id: 9001, cat: "PODMIENKY", text: "Zmluva na dobu neurčitú." },
  { id: 9002, cat: "PODMIENKY", text: "Výpovedná lehota je jeden mesiac." },
  { id: 9003, cat: "PODMIENKY", text: "Vrátiť všetky SIM karty." },
  { id: 9004, cat: "PODMIENKY", text: "Nová SIM karta podľa cenníka." },
  { id: 9005, cat: "PODMIENKY", text: "Aktivácia do dvoch dní." },
  { id: 9006, cat: "PODMIENKY", text: "Rýchlosť klesne na 256 kbit." },
  { id: 9007, cat: "PODMIENKY", text: "Podnik nezodpovedá za signál." },
  { id: 9008, cat: "PODMIENKY", text: "Nezakladá právo odstúpiť." },
  { id: 9009, cat: "PODMIENKY", text: "Konečné vyúčtovanie treba uhradiť." },
  { id: 9010, cat: "PODMIENKY", text: "Podnik môže zablokovať SIM kartu." },
  { id: 9011, cat: "PODMIENKY", text: "Kredit môže podnik znížiť." },
  { id: 9012, cat: "PODMIENKY", text: "Roaming až po zábezpeke." },
  { id: 9013, cat: "PODMIENKY", text: "Prenos čísla do jedného dňa." },
  { id: 9014, cat: "PODMIENKY", text: "Faktúra po zúčtovacom období." },
  { id: 9015, cat: "PODMIENKY", text: "Zariadenia treba vrátiť podniku." },
  { id: 9016, cat: "PODMIENKY", text: "Ceny stanovuje platný cenník." },
];

const FOLD: Record<string, string> = {
  á: "a", ä: "a", č: "c", ď: "d", é: "e", í: "i", ĺ: "l", ľ: "l", ň: "n", ó: "o", ô: "o", ŕ: "r", š: "s", ť: "t", ú: "u", ý: "y", ž: "z",
};
/** Approx. Slovak letter frequency (folded): the host's pick weights. */
export const KOLESO_FREQ: Record<string, number> = {
  a: 9.5, o: 9.2, e: 8.4, i: 6.6, n: 5.6, v: 4.4, s: 5.3, r: 4.4, t: 5.0, l: 4.4, k: 3.8, d: 3.6, m: 3.3, p: 2.9, u: 3.0, j: 2.0, y: 2.0,
  z: 2.3, c: 2.4, h: 2.1, b: 1.6, g: 0.3, f: 0.3, x: 0.05, w: 0.05, q: 0.02,
};
export const KOLESO_VOWELS: readonly string[] = ["a", "e", "i", "o", "u", "y"];
const CONS = Object.keys(KOLESO_FREQ).filter((c) => !KOLESO_VOWELS.includes(c));
const VOWS = Object.keys(KOLESO_FREQ).filter((c) => KOLESO_VOWELS.includes(c));
/** Letters in the used-letter row (base letters, alphabet order). */
export const KOLESO_ALPHABET: readonly string[] = "abcdefghijklmnopqrstuvwxyz".split("");

/** Base letter of a character (lower case, diacritics folded), null for anything that is not a letter. */
export function kolesoBase(ch: string): string | null {
  const l = ch.toLowerCase();
  const b = FOLD[l] ?? l;
  return b in KOLESO_FREQ ? b : null;
}

/** Board text: the phrase without its final period, upper case. */
export function kolesoBoardText(text: string): string {
  return text.replace(/\.$/, "").toLocaleUpperCase("sk");
}

/** Word wrap on KOLESO_COLS columns. null when a word or the row count does not fit. */
export function kolesoRows(text: string, cols = KOLESO_COLS, rows = KOLESO_ROWS): string[] | null {
  const out: string[] = [""];
  for (const w of kolesoBoardText(text).split(" ")) {
    if (w.length > cols) return null;
    const cur = out[out.length - 1];
    if (!cur.length) out[out.length - 1] = w;
    else if (cur.length + 1 + w.length <= cols) out[out.length - 1] = cur + " " + w;
    else out.push(w);
  }
  return out.length <= rows ? out : null;
}

export interface KStep {
  /** Slice index the wheel stops on (0 … 15). */
  seg: number;
  kind: KSegKind;
  /** Where inside the slice the pointer lands (0 … 1, cosmetic, part of the seeded run). */
  jitter: number;
  /** Letter called on this spin (base letter), null when none. */
  letter: string | null;
  /** Occurrences of the letter on the board. */
  hits: number;
  /** × bet won by this spin before multipliers (val: v × hits, courier: parcel). */
  gain: number;
  /** SAMOHLÁSKA: price paid (0 = free, "na splátky"). */
  cost: number;
  /** KURIÉR: parcel value (× bet). */
  parcel: number;
  bankBefore: number;
  bankAfter: number;
  /** Spins left after this one. */
  left: number;
  /** STRATIL SI ŤAH took one more spin. EXTRA ŤAH: false when the sponsor is out of budget (max spins). */
  extra: boolean;
  /** Share of the letters visible after this spin. */
  shown: number;
  solved: boolean;
}

export interface KPlay {
  phrase: number;
  text: string;
  cat: string;
  start: readonly string[];
  steps: KStep[];
  solved: boolean;
  /** Bank at the end of the spins (× bet). */
  bankX: number;
  /** After the solve bonus, before the cap. */
  grossX: number;
  capped: boolean;
  vip: number;
  /** Paid × bet: min(grossX, cap) + vip. */
  totalX: number;
  /** Spins given in total (6 + EXTRA). */
  spins: number;
}

function pickWeighted(rng: () => number, keys: readonly string[], called: Set<string>): string | null {
  let tot = 0;
  for (const c of keys) if (!called.has(c)) tot += KOLESO_FREQ[c];
  if (tot <= 0) return null;
  let r = rng() * tot;
  let last: string | null = null;
  for (const c of keys) {
    if (called.has(c)) continue;
    last = c;
    r -= KOLESO_FREQ[c];
    if (r < 0) return c;
  }
  return last;
}

const r4 = (x: number) => Math.round(x * 1e6) / 1e6;

export interface KOpts {
  vip?: number;
  /** Tuning hooks (scripts/koleso-ev.ts). */
  solveFlat?: number;
  phrase?: number;
}

/** One whole KOLESO run, decided up front (deterministic per rng). */
export function playKoleso(rng: () => number, opts: KOpts = {}): KPlay {
  const vip = opts.vip ?? 0;
  const solveFlat = opts.solveFlat ?? KOLESO_SOLVE_FLAT;
  const pi = opts.phrase ?? Math.min(KOLESO_PHRASES.length - 1, Math.floor(rng() * KOLESO_PHRASES.length));
  const ph = KOLESO_PHRASES[pi];
  const cnt: Record<string, number> = {};
  let letters = 0;
  for (const ch of ph.text) {
    const b = kolesoBase(ch);
    if (b) {
      cnt[b] = (cnt[b] ?? 0) + 1;
      letters++;
    }
  }
  const called = new Set<string>();
  let shown = 0;
  const reveal = (c: string) => {
    called.add(c);
    const n = cnt[c] ?? 0;
    shown += n;
    return n;
  };
  for (const c of KOLESO_START) reveal(c);
  let bank = 0;
  let left = KOLESO_SPINS;
  let given = KOLESO_SPINS;
  let solved = false;
  const steps: KStep[] = [];
  while (left > 0 && !solved) {
    left--;
    const seg = Math.min(KOLESO_SLICES - 1, Math.floor(rng() * KOLESO_SLICES));
    const jitter = rng();
    const s = KOLESO_WHEEL[seg];
    const before = bank;
    let letter: string | null = null;
    let hits = 0;
    let gain = 0;
    let cost = 0;
    let parcel = 0;
    let extra = false;
    if (s.kind === "val") {
      letter = pickWeighted(rng, CONS, called) ?? pickWeighted(rng, VOWS, called);
      if (letter) {
        hits = reveal(letter);
        gain = (s.v ?? 0) * hits;
        bank += gain;
      }
    } else if (s.kind === "x2") bank *= 2;
    else if (s.kind === "bankrot") bank = 0;
    else if (s.kind === "lost") {
      extra = left > 0;
      left = Math.max(0, left - 1);
    } else if (s.kind === "tax") bank *= KOLESO_TAX;
    else if (s.kind === "exek") bank *= KOLESO_EXEK;
    else if (s.kind === "courier") {
      parcel = KOLESO_COURIER[Math.min(KOLESO_COURIER.length - 1, Math.floor(rng() * KOLESO_COURIER.length))];
      gain = parcel;
      bank += parcel;
    } else if (s.kind === "vowel") {
      letter = pickWeighted(rng, VOWS, called) ?? pickWeighted(rng, CONS, called);
      if (letter) {
        if (bank >= KOLESO_VOWEL_COST) {
          cost = KOLESO_VOWEL_COST;
          bank -= cost;
        }
        hits = reveal(letter);
      }
    } else if (s.kind === "extra") {
      if (given < KOLESO_SPINS_MAX) {
        left++;
        given++;
        extra = true;
      }
    }
    bank = r4(bank);
    const share = letters ? shown / letters : 1;
    if (share >= KOLESO_SOLVE_AT) solved = true;
    steps.push({ seg, kind: s.kind, jitter, letter, hits, gain: r4(gain), cost, parcel, bankBefore: before, bankAfter: bank, left, extra, shown: share, solved });
  }
  const grossX = r4(solved ? bank * KOLESO_SOLVE_MUL + solveFlat : bank);
  const capped = grossX > KOLESO_CAP_X;
  const totalX = r4(Math.min(grossX, KOLESO_CAP_X) + vip);
  return { phrase: pi, text: ph.text, cat: ph.cat, start: KOLESO_START, steps, solved, bankX: bank, grossX, capped, vip, totalX, spins: given };
}

/** Letters visible on the board after `n` steps (start letters + every called letter so far). */
export function kolesoCalledAfter(play: KPlay, n: number): Set<string> {
  const s = new Set<string>(play.start);
  for (const st of play.steps.slice(0, n)) if (st.letter) s.add(st.letter);
  return s;
}
