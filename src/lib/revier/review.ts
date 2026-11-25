import { STAT_NAME } from "./depth.ts";
import { screwsFor } from "./dielna.ts";
import type { Run } from "./types.ts";

export interface PostMortem {
  cause: string;
  floor: number;
  floorLabel: string;
  screws: number;
  gaps: string[];
  hints: string[];
}

/** What the death screen is allowed to say. Every line comes from this run's trace. */
export function postMortem(run: Run): PostMortem {
  const floor = Math.max(1, run.stats.bestFloor || run.floor || 1);
  const trace = run.trace;
  const gaps: string[] = [];
  const hints: string[] = [];
  if (trace.chemBad > trace.chemGood) {
    gaps.push(`Chémia šla proti tebe ${trace.chemBad}× a s tebou len ${trace.chemGood}×.`);
    hints.push("Daj vedľa seba karty rovnakej farby. Opačná šípka tej istej farby je +10 %, iná farba je −5 %.");
  } else if (trace.chemGood === 0 && trace.chemBad === 0 && run.stats.turns > 2) {
    gaps.push("V rade nebola ani jedna chémia.");
    hints.push("Dve karty rovnakej rodiny v jednom spine sú +8 %. Tri sú +15 %.");
  }
  if (trace.callMiss > trace.callHits && run.call.length) {
    const names = run.call.map((id) => STAT_NAME[id]).join(" / ");
    gaps.push(`Volanie ${names} si trafil ${trace.callHits}× a minul ${trace.callMiss}×.`);
    hints.push(`Do balíka pridaj kartu, ktorá volá ${names}. Zhoda pridá +12 %.`);
  }
  if (trace.allIns >= 2 && run.hp <= 0) {
    hints.push(`ALL-IN si použil ${trace.allIns}×. Každý stojí 8 HP a dáva len ×1,5, nie ×2.`);
  }
  if (trace.chemRow < 3 && run.stats.bestFloor >= 2) {
    hints.push("Denná výzva chce 3 chémie v jednom spine. Drž v balíku jednu farbu, nie šesť rôznych.");
  }
  if (run.cause.startsWith("Jed") && !hints.some((line) => line.includes("štít"))) {
    hints.push("Jed nerieši štít. Dvere-štít a Odolnosť berú úder, nie jed.");
  }
  return {
    cause: run.cause || "Koniec smeny",
    floor,
    floorLabel: floor >= 6 ? "Ranná špička" : `${floor}. poschodie`,
    screws: screwsFor(floor, run.stats.kills),
    gaps: gaps.slice(0, 2),
    hints: hints.slice(0, 2),
  };
}
