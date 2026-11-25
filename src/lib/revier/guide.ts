import { EQUIP_PRICE, HEAL_GAIN, HEAL_PRICE, HEAL_STOCK, HOLD_PRICE, REMOVE_PRICE, REEL5_PRICE, REEL_PRICE, SUPPORT_PRICE, UPGRADE_PRICE } from "./symbols.ts";
import { LOADOUT_BUDGET, LOADOUT_SIZE, PERK_CAP, SCREW_FORMULA, perkCost } from "./dielna.ts";

export interface GuideEntry {
  id: string;
  cat: "atk" | "def" | "eco" | "nav" | "danger";
  title: string;
  /** One line, with the numbers. */
  line: string;
  body: string;
}

export const ACTIONS: readonly GuideEntry[] = [
  {
    id: "vyboj",
    cat: "atk",
    title: "VÝBOJ",
    line: "Prieboj 26 + séria×2. Minie celých 100 výboja.",
    body: "Výboj sa plní po 4 za každý zásah, ktorý prejde. Pod 100 je tlačidlo slepé. Zásah ide cez štít. Séria 1 pridá 2, séria 3 pridá 6.",
  },
  {
    id: "allin",
    cat: "danger",
    title: "ALL-IN",
    line: "Ďalší spin má útok ×1,5. Stojí 8 HP. Pod 19 HP nejde.",
    body: "Násobič je 1,5, nie 2. Nepriateľ za to nedostáva bonus. Platí len na najbližší spin a potom spadne na ×1.",
  },
  {
    id: "zamok",
    cat: "def",
    title: "ZÁMOK",
    line: `Podrží symbol z minulého spinu na 1. valci. Stojí ${HOLD_PRICE} RJ.`,
    body: "Bez minulého spinu je slepý. Pokuta a prázdne okno sa zamknúť nedajú. Zamknutý symbol príde znova, ostatné valce sa točia.",
  },
  {
    id: "premiesat",
    cat: "eco",
    title: "Premiešať",
    line: "Tri nové ponuky. Prvé miešanie 5 RJ, každé ďalšie +3.",
    body: "Staré ponuky zmiznú. Skrytý výber sa nemieša. Istota vyššej karty (4 obchody bez vzácnej ponuky) sa miešaním nemaže.",
  },
  {
    id: "zivot",
    cat: "def",
    title: "Život",
    line: `+${HEAL_GAIN} HP za ${HEAL_PRICE} RJ. Najviac ${HEAL_STOCK}× v jednom obchode.`,
    body: "Nad maximum života nejde. V boji toto tlačidlo nie je.",
  },
  {
    id: "vyradit",
    cat: "danger",
    title: "Vyradiť",
    line: `Vyhodí jednu kartu z balíka za ${REMOVE_PRICE} RJ. Balík musí mať aspoň 4.`,
    body: "Menej ako 4 karty vyhodiť nejde, aby beh nezostal prázdny. Pokuta sa dá vyhodiť rovnako.",
  },
  {
    id: "zlepsit",
    cat: "atk",
    title: "Zlepšiť",
    line: `Úroveň +1 až do 3. Každá úroveň je +10 % čísel karty. Stojí ${UPGRADE_PRICE} RJ.`,
    body: "Platí len do konca behu. Trvalá úprava je v dielni, nie tu.",
  },
  {
    id: "trening",
    cat: "atk",
    title: "Tréning",
    line: "Zje jednu kópiu a dá úroveň +1. RJ nestoja.",
    body: "Treba dve kópie v balíku a úroveň pod 3. Efekt je ten istý ako Zlepšiť: +10 % za úroveň, len v tomto behu.",
  },
  {
    id: "pro",
    cat: "atk",
    title: "Pro",
    line: "Zje jednu kópiu karty na úrovni 3. Tá karta potom bije ×1,2 do konca behu.",
    body: "Treba dve kópie a úroveň 3. Trvalé Pro v dielni je slabšie, ×1,12, a s týmto behom sa skladá najviac do ×1,28.",
  },
  {
    id: "pevnost",
    cat: "def",
    title: "Pevnosť",
    line: "Zje jednu kópiu. Karta dostane +2 k úderu, najviac trikrát (+6).",
    body: "Plochý bonus, nie percentá. Platí len do konca behu.",
  },
  {
    id: "kluce",
    cat: "atk",
    title: "Kľúče",
    line: `Najbližší úder, ktorý prejde, dostane +8. Sklad 2. Stojí ${SUPPORT_PRICE} RJ.`,
    body: "Minca sa minie pri zásahu, nie pri štíte ani liečení.",
  },
  {
    id: "peciatka",
    cat: "def",
    title: "Pečiatka",
    line: `Najbližší ťah nepriateľa vynechá útok. Stojí ${SUPPORT_PRICE} RJ. Jedna naraz.`,
    body: "Omámenie zruší aj nabíjaný ťažký úder. DJ Blastbeat pri omámení spadne tempom na 84.",
  },
  {
    id: "sila",
    cat: "atk",
    title: "Sila",
    line: `Každý úder v behu +2. Stojí ${EQUIP_PRICE} RJ. Výbava najviac 2 kusy.`,
    body: "Sčíta sa s kľúčami a s dielňou. Druhý kus sily kúpiť nejde.",
  },
  {
    id: "odolnost",
    cat: "def",
    title: "Odolnosť",
    line: `Každý štít v behu +3. Stojí ${EQUIP_PRICE} RJ.`,
    body: "Liečenie nezvyšuje. Výbava je spoločná so Silou, dokopy dve.",
  },
  {
    id: "valec4",
    cat: "eco",
    title: "4. valec",
    line: `Štvrté okno od 3. poschodia za ${REEL_PRICE} RJ.`,
    body: "Nový beh začína znova na 3 oknách. Valec sa medzi behmi neprenáša.",
  },
  {
    id: "valec5",
    cat: "eco",
    title: "5. valec",
    line: `Piate okno od 4. poschodia za ${REEL5_PRICE} RJ, len keď už máš štyri.`,
    body: "Aj piaty valec zomrie s behom.",
  },
  {
    id: "klon",
    cat: "atk",
    title: "KLON",
    line: "Ďalší spin bije do klonu, nie do DJa. Klon má 26 HP.",
    body: "Klon bez značky len stojí. Značka (žltý rám) je výstraha. Červený rám znamená, že najbližší spin to okno stíši. Mŕtvy klon značku stratí.",
  },
];

export const GUIDE: readonly { title: string; body: string }[] = [
  {
    title: "Beh",
    body: "Každý beh začína na 3 valcoch, s prázdnym obchodom, bez úrovní, Tréningu, Pro aj Pevnosti. Prenášajú sa len šroubky a trvalé úpravy z dielne.",
  },
  {
    title: "Výber 6 kariet",
    body: `Pred behom zložíš ${LOADOUT_SIZE} rôznych symbolov z celej hry. Rozpočet je ${LOADOUT_BUDGET} bodov: bežný 1, vzácny 2, epický 3, legendárny 5. Dve legendy sa do šiestich kariet nezmestia.`,
  },
  {
    title: "Dielňa",
    body: `${SCREW_FORMULA} Úder a štít idú do +${PERK_CAP}. Proc je +4 % a +2 za stupeň, najviac dva stupne. Pro stojí ${perkCost("pro", 1)} a dáva ×1,12. Stupeň 1 stojí ${perkCost("dmg", 1)}, stupeň 2 stojí ${perkCost("dmg", 2)}.`,
  },
  {
    title: "Rodiny",
    body: "Telekom, Úrad, Polícia, Kamene, PARKVOLT. Dve karty rovnakej rodiny v rade dávajú +8 %, tri a viac +15 %.",
  },
  {
    title: "Chémia",
    body: "Susedia rovnakej farby s rovnakou alebo opačnou šípkou majú +10 %. Iná šípka tej istej farby je +5 %. Iná farba je −5 %.",
  },
  {
    title: "Proc",
    body: "Niektoré karty majú šancu na plochý bonus. Bloček proc nemá, aby tri Bločky ostali presne 90. Dielňa vie proc pridať aj karte, ktorá ho nemala.",
  },
  {
    title: "Séria",
    body: "Každá výhra v behu zdvihne sériu o 1, strop je 3. Séria pridá 4 % útoku za stupeň a k výboju +2 priebozu za stupeň.",
  },
  {
    title: "Istota",
    body: "Štyri obchody po sebe bez epickej alebo legendárnej ponuky zaručia vyššiu kartu v ďalšom. Počítadlo je na vrchu obchodu.",
  },
  {
    title: "Tempo DJ Blastbeat",
    body: "Začína na 96. Každý jeho ťah +6, strop 132. Útok sa násobí tempom / 96. Omámenie ho zrazí na 84. Charizma v kole ho stiahne o 24, najmenej na 72.",
  },
  {
    title: "Kapela a ventilátor",
    body: "Každý tretí ťah (1, 4, 7…) privolá klona, najviac štyroch. Klon najprv označí okno a až ďalší tvoj spin ho stíši, ak klon žije. Ventilátor sa ohlási a najbližší spin posunie jeden symbol o okno vedľa.",
  },
  {
    title: "Prijmi zlyhanie",
    body: "Pod polovicou života DJ zhodí štít, košeľu zmení na čiernu a udrie dvakrát. Prázdny alebo márny spin ti nabije 12 výboja.",
  },
  {
    title: "Syntík",
    body: "Úder 8. Sused z rodiny PARKVOLT dostane +8 k úderu, štítu aj liečeniu.",
  },
];

export function actionById(id: string): GuideEntry | undefined {
  return ACTIONS.find((row) => row.id === id);
}
