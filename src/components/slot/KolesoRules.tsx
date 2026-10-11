import {
  KOLESO_CAP_X,
  KOLESO_COURIER,
  KOLESO_EXEK,
  KOLESO_OFFER,
  KOLESO_SLICES,
  KOLESO_SOLVE_AT,
  KOLESO_SPINS,
  KOLESO_SPINS_MAX,
  KOLESO_START,
  KOLESO_TAX,
  KOLESO_VOWEL_COST,
  KOLESO_WHEEL,
  kolesoSolveLabel,
} from "@/lib/slot/koleso";
import { KOLESO_PICK_S } from "@/lib/slot/koleso-help";

const num = (n: number) => String(n).replace(".", ",");

/** Slices with the same effect, counted once (value slices grouped by value). */
function wheelRows(): { k: string; n: number; line: string; tone: "val" | "good" | "bad" }[] {
  const vals = new Map<number, number>();
  const gags = new Map<string, number>();
  for (const s of KOLESO_WHEEL) {
    if (s.kind === "val") vals.set(s.v ?? 0, (vals.get(s.v ?? 0) ?? 0) + 1);
    else gags.set(s.kind, (gags.get(s.kind) ?? 0) + 1);
  }
  const out: { k: string; n: number; line: string; tone: "val" | "good" | "bad" }[] = [];
  for (const [v, n] of [...vals].sort((a, b) => a[0] - b[0])) out.push({ k: `${num(v)}×${v === Math.max(...vals.keys()) ? " PRÉMIA" : ""}`, n, line: "× stávky za každé políčko s písmenom, ktoré si vyberieš (alebo vyberie Jožo)", tone: "val" });
  const G: Record<string, [string, string, "good" | "bad"]> = {
    x2: ["×2 (Lukáš Adapter)", "banka ×2", "good"],
    extra: ["EXTRA ŤAH", `+1 točenie (najviac ${KOLESO_SPINS_MAX})`, "good"],
    courier: ["KURIÉR (Kuriér Nezastihol)", `balík ${KOLESO_COURIER.map(num).join(" / ")}× stávky (rovnaká šanca), 0 = nezastihol`, "good"],
    vowel: ["SAMOHLÁSKA ZA PENIAZE", `samohláska za ${num(KOLESO_VOWEL_COST)}× z banky (pri prázdnej banke zadarmo); nič nezarába, len odkrýva`, "good"],
    bankrot: ["BANKROT", "banka = 0 (šek ostáva)", "bad"],
    exek: ["EXEKÚCIA (JUDr. Zabavil)", `banka ×${num(KOLESO_EXEK)}`, "bad"],
    tax: ["DAŇOVÁ KONTROLA (Daňová Danka)", `banka ×${num(KOLESO_TAX)} (−23 %)`, "bad"],
    lost: ["STRATIL SI ŤAH", "prídeš o ďalšie točenie", "bad"],
  };
  for (const [kind, n] of gags) {
    const g = G[kind];
    if (g) out.push({ k: g[0], n, line: g[1], tone: g[2] });
  }
  return out;
}

/**
 * KOLESO NEŠŤASTIA rules, one source for the in-game (i) sheet and the manual (Paytable → Bonus bar). Every
 * number comes from lib/slot/koleso.ts. All characters are fictional parodies.
 */
export function KolesoRules({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`zr kr ${compact ? "is-compact" : ""}`}>
      <ol className="zr-steps">
        <li>
          <b>Tajnička</b>
          <span>
            Na tabuli je skrytá veta (biele karty Zvrátených myšlienok, paródie na všeobecné podmienky 4KA a na parkovanie PAAS). Písmená {KOLESO_START.map((c) => c.toUpperCase()).join(" ")} daruje Jožo hneď na
            začiatku. Písmeno odkryje aj svoje varianty s diakritikou (A aj Á, Ä).
          </span>
        </li>
        <li>
          <b>{KOLESO_SPINS} točení</b>
          <span>
            Koleso má {KOLESO_SLICES} rovnakých dielov, každý má šancu 1/{KOLESO_SLICES}. Na hodnote dostaneš {KOLESO_OFFER} náhodné spoluhlásky (častejšie
            písmená častejšie) a <b>jednu si vyberieš</b>. Betka Frekvencová otočí jej políčka. Výhra = hodnota × počet políčok.
          </span>
        </li>
        <li>
          <b>Voľba písmena</b>
          <span>
            Režim VYBERÁM (tlačidlo na kolese, Nastavenia): ťukni na jedno z {KOLESO_OFFER} písmen (na klávesnici 1 – {KOLESO_OFFER}). Kto pozná tajničku, má
            výhodu, to je v poriadku. Ak do {KOLESO_PICK_S} s nevyberieš, pri PRESKOČIŤ alebo v režime JOŽO berie Jožo Pročkár svoj tip (označený
            JOŽOV TIP). Pri samohláske za peniaze vyberáš samohlásku rovnako. Po obnovení stránky sa tvoje voľby zopakujú. Autospin sa pri KOLESE zastaví, písmená vyberáš sám.
          </span>
        </li>
        <li>
          <b>Tajnička vyriešená</b>
          <span>
            Keď je odkrytých aspoň {Math.round(KOLESO_SOLVE_AT * 100)} % písmen, je vylúštená: {kolesoSolveLabel()} a koleso končí. Inak sa po poslednom točení vyplatí banka tak, ako je.
          </span>
        </li>
        <li>
          <b>Výplata</b>
          <span>
            Strop {KOLESO_CAP_X}× stávky za koleso. Navrch Sponzorský šek podľa ranku (BANKROT ani strop ho neovplyvnia). Daňové obdobie ±23 % platí ako pri
            KONTROLE.
          </span>
        </li>
      </ol>

      <h4 className="zr-h">Diely kolesa</h4>
      <ul className="zr-mods kr-wheel">
        {wheelRows().map((r) => (
          <li key={r.k} className={`zr-mod kr-${r.tone}`}>
            <i>{r.n}×</i>
            <b>{r.k}</b>
            <span>{r.line}</span>
          </li>
        ))}
      </ul>
      <p className="zr-note">
        Výsledky kolesa (diely, balíky kuriéra) sú dané vopred a od tvojej voľby nezávisia; voľba mení len to, ktoré písmeno sa odkryje. Výplata je
        vyladená tak, aby hráč, ktorý tajničky pozná naspamäť, mal najviac o ~5 % viac ako KONTROLA a náhodná voľba najviac o ~5 % menej.
      </p>
    </div>
  );
}
