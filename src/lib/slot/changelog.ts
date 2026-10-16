/** Player-facing update log. The settings tab keeps only the last 7 calendar days. */

export interface ChangeNote {
  /** YYYY-MM-DD, Europe/Bratislava. */
  day: string;
  text: string;
}

export const CHANGELOG: readonly ChangeNote[] = [
  { day: "2026-10-16", text: "Oprava ZLATÉHO BONUSU: zlatá SIM sa minie až keď zlatý bonus naozaj niečo pridá. Minutá ZLATÁ POKUTA alebo nulová zlatá výhra SIM znova nabije, aj v AUTO, pri rýchlom točení a po načítaní hry." },
  { day: "2026-10-15", text: "Valce držia jednu veľkosť. Riadok TUMBLE, GOOD LUCK, lístok aj pás jackpotu majú stále rovnaké miesto, aj keď sú prázdne. Bonus ani výhra skrinku nepohnú." },
  { day: "2026-10-15", text: "Skrinka na výšku ide takmer od okraja po okraj. Bunky sú väčšie, medzera pod BONUS a HLÁSENIE je preč a riadok GOOD LUCK je nižší. Na šírku voľné miesto v lištách patrí valcom. Všetkých päť radov ostáva vidno." },
  { day: "2026-10-15", text: "Na úzkej výške sú štyri jackpoty v mriežke 2×2 a pod nimi SMRŤ EGA: miesto, RP a KONČÍ O. Sumy sa už nestrihajú. V kredite je celá stávka, aj 1.00. To isté na rozloženom Z Fold na výšku." },
  { day: "2026-10-15", text: "Na skladacom telefóne má riadok TUMBLE vlastné miesto nad valcami a suma výhry ostáva čitateľná. Okno výhry sa zmestí aj na nízku obrazovku." },
  { day: "2026-10-15", text: "Na výšku symboly znova vyplnia šírku skrinky. Medzera nad valcami a pod nimi je preč a symboly sú aspoň také veľké ako predtým. Lišta prehliadača už nerozbíja rozloženie." },
  { day: "2026-10-15", text: "Na šírku je skrinka len taká široká ako päť radov valcov. BONUS a HLÁSENIE sedia na nej a symboly nezakrývajú. Pravá lišta pohltí voľné miesto: −, + a AUTO sú celé vnútri, TIKET a online sú v karte kreditu." },
  { day: "2026-10-15", text: "Symboly sú celé v bunke. Bunka je štvorec podľa užšej strany poľa a obrázok sa zmestí dnu, na výšku aj na šírku." },
  { day: "2026-10-15", text: "Na šírku sa −, + a AUTO zmestia do pravej lišty. Všetkých päť radov valcov je vidno celé. Rank NEKONEČNO sa už neskracuje." },
  { day: "2026-10-15", text: "Na šírku sú valce cez celú výšku medzi lištami. Vľavo je jeden panel: rank, lístok, KÚPIŤ 4KA, ANTE a režimy QUICK / TURBO / TIKETY / VERSUS v mriežke 2×2. Vpravo je kredit so stávkou, veľké točenie s − a + vedľa seba, pod ním AUTO a ikony. Jackpot a SMRŤ EGA sú len nad valcami. Lístok už nesedí na valcoch. Nápis v pozadí je stmavený." },
  { day: "2026-10-15", text: "Na karte EVENT sú Podmienky zbalené. Šípka „Podmienky ▾ Rozbaliť“ ich otvorí, „▴ Zbaliť“ zatvorí. Otvorené podmienky sa rolujú vo vlastnom okne. Hore ostáva odpočet, stav hráča a poradie bez rolovania celej karty." },
  { day: "2026-10-15", text: "AUTO sa otvára ako list dole s tmavým pozadím a nezakrýva valce ani lístok. Celá veta o pauze ostáva čitateľná. DUAL lístok (ZÁKLAD a 4KA TV) sa zalamuje, dlhý text končí trojbodkou. V pravom hornom páse sedia jackpot aj SMRŤ EGA vedľa seba: miesto, živé RP (zelené v pluse, červené v mínuse) a KONČÍ O. Kto nie je v evente, vidí krátky vstup. Ťuknutie otvorí EVENT. Text sa už neprekrýva. Na šírku sú valce v strede a ovládanie v stĺpcoch, aj na tablete, úzkom kryte, rozloženom Z Fold a vo Flex režime." },
  { day: "2026-10-15", text: "Nahraté zvuky sa sťahujú po jednom z rýchlej adresy a ostanú v telefóne. Kým tam ešte nie sú, hra ich berie po starom." },
  { day: "2026-10-15", text: "SMRŤ EGA: skóre na karte je zelené v pluse a červené v mínuse. Odpočet týždňa je hore veľký a svieti namodro. Odkaz Admin je len na zariadení, ktoré event vedie." },
  { day: "2026-10-15", text: "SMRŤ EGA je na pohári v tabuli, karta EVENT. Výkričník na pohári svieti, keď si NEKONEČNO a ešte si nezaplatil, keď sa zmení tvoje miesto, alebo keď čaká kľúč. Jackpot sa s eventom už nestrieda. Tvoje skóre na karte sa hýbe pri každej zmene RP a pri ňom je napísané, že vstupné je už v skóre." },
  { day: "2026-10-15", text: "SMRŤ EGA: týždenný event pre NEKONEČNO, od pondelka 01:00 do ďalšieho pondelka 01:00. Vstupné 2,5 % RP (min 500, max 2 500). Vyhráva najviac čistých RP za týždeň (zisky aj straty). Výhra: kľúč 4KA TV XL s archívom na 28 dní, doručí sa sám." },
  { day: "2026-10-15", text: "Oprava ZLATÉHO BONUSU: každý zlatý bonus s nulou zlatú SIM znova nabije, aj po kompenzácii. Nedohraný zlatý bonus (zatvorená hra) sa po načítaní vráti. Kto dnes zlato minul, má ho po načítaní ešte raz nabité." },
  { day: "2026-10-15", text: "Kompenzácia: kto dnes minul ZLATÝ BONUS, má dnešné zlato nabité znova. Ďalší bonus z baru je opäť zlatý." },
  { day: "2026-10-15", text: "ZLATÝ BONUS už neskončí nulou. Keď zlatý bonus nič nevyplatí, zlatá SIM sa znova nabije a ďalší bonus z baru je opäť zlatý, až kým zlatý bonus niečo nevyplatí." },
  { day: "2026-10-14", text: "ZÁSAH: okno na inom ako cieľovom symbole je vždy MIMO, symbol sa už nemení na cieľ. Po ustálení spinu sa cieľové symboly označia EVIDENCE a nevyplácajú, sú len cieľom okien." },
  { day: "2026-10-14", text: "ZÁSAH: keď sú všetky okná MIMO, EVIDENCE aj symboly Finančnej správy ostanú na mieste aj ďalší spin. HACK alebo zásah FS ich uvoľní a príde nový cieľ. Úvod ZÁSAHU ukáže vyžrebovaný symbol a jeho premenu na Finančnú správu pomalšie." },
  { day: "2026-10-14", text: "HACK lístky majú nové ciele: lacná 2–3, stredná 3, drahá 3–4 HACKy v jednom ZÁSAHU." },
  { day: "2026-10-12", text: "Nad AUTO je tiché počítadlo hráčov online. Zelená bodka blikne, keď sa počet zmení. Klik otvorí Park Bank s dnešným pretočeným." },
  { day: "2026-10-11", text: "KOLESO NEŠŤASTIA: písmeno si vyberáš sám z 3 náhodných (alebo nechaj Joža). Kto pozná tajničku, má výhodu. Výplaty kolesa ostávajú. A 40 nových tajničiek o podmienkach 4KA a parkovaní PAAS. Autospin sa pred KOLESOM zastaví, aby si mohol vyberať." },
  { day: "2026-10-11", text: "ZLATÝ BONUS: prvý bonus z baru každý deň je zlatý. Strop 100× namiesto 30× a zlatá karta podľa režimu: ZLATÁ POKUTA, ZLATÝ KURIÉR alebo ZLATÉ VÝSEKY. Nový deň začína o polnoci." },
  { day: "2026-10-10", text: "Hra má nový link parkizmus.vercel.app. Na starom linku je tlačidlo PRESUNÚŤ HRU, na novom PRENIESŤ HRU ZO STARÉHO LINKU. Po presune je starý link len na čítanie." },
  { day: "2026-10-10", text: "Odkaz parkizmus.vercel.app už neodskakuje na starú adresu. Hra na ňom ostane." },
  { day: "2026-10-10", text: "Oznam a v nastaveniach záložka Uloženie: EXPORT a IMPORT progresu a návod, keď sa medzi odkazmi neprenesie sám." },
  { day: "2026-10-09", text: "Ž-BOX sken má štvrtý slot. Každá vlna ním končí, ako ozvena posledného výstrelu. Posledná schránka vždy." },
  { day: "2026-10-09", text: "V nastaveniach je záložka Zmeny. Drží, čo sa v hre zmenilo, po dňoch, najviac týždeň." },
  { day: "2026-10-09", text: "Big win a jackpot už autospin nevypnú. Obrazovka ho len pozastaví a po VIDENÉ pokračuje tam, kde skončil." },
  { day: "2026-10-09", text: "Ž-BOX sken má tri zvukové sloty. Každá prázdna schránka pustí jeden, v náhodnom poradí, a sken je o polovicu pomalší." },
  { day: "2026-10-09", text: "Daňová kontrola v kolese hrá len zvučku Daňový úrad, rovnakú ako neúspešný únik po zásahu." },
  { day: "2026-10-09", text: "Inštalácia na počítač je dole vľavo pri ozubenom koliesku. Opera GX ju v menu PONUKA nemá." },
  { day: "2026-10-09", text: "ZÁSAH na PC ostáva v plnej kvalite, hmla a lúče sa kreslia menšie a zväčšia na grafike, aby nesekali." },
  { day: "2026-10-09", text: "Nahraté zvuky a hlasitosti zo servera sú nový východzí mix." },
  { day: "2026-10-09", text: "Pri plnom hlásení 100/100 sa bonus nekúpi. Klik na kúpu zahrá obyčajný spin a pustí zásah." },
  { day: "2026-10-09", text: "Autospin sa pri výhre a bonuse len pozastaví. Zásah ostáva ručný." },
  { day: "2026-10-08", text: "VERSUS: odveta čaká, kým zahlasujú všetci, a ponechá si rovnaký kód aj stávky." },
  { day: "2026-10-08", text: "Keď vo VERSUS ostaneš sám, odídeš bez straty kaucie." },
  { day: "2026-10-08", text: "Na výsledku VERSUS je clash pásik so súčtom a náskokom." },
  { day: "2026-10-08", text: "Ostatní hráči vidia masívnu výhru od 100×. Neznámy výherca sa volá Niekto." },
  { day: "2026-10-08", text: "Súťaž o 4KA TV sa strieda s jackpotom každých 20 sekúnd, s neonovým rámom a bežiacim textom." },
  { day: "2026-10-07", text: "Hudba 4KA TV a zásahu používa nahraté slučky namiesto pôvodných." },
  { day: "2026-10-05", text: "ZÁSAH vypláca 2× na všetky výhry vrátane kaskád a plechoviek." },
  { day: "2026-10-05", text: "Výhra sa zapíše do kreditu ešte pred bannerom. Zaseknutá výhra sa dorovná pri ďalšom štarte." },
  { day: "2026-10-04", text: "Ž-BOX je vedľa kontroly, s novým vzhľadom skrinky a pomalším otváraním schránok." },
  { day: "2026-10-04", text: "VERSUS je pre 2 až 4 hráčov. Pribudlo koleso nešťastia." },
  { day: "2026-10-04", text: "Každý zvuk má vlastnú dĺžku a fade out. Blesk do plechovky hrá raz za spin." },
  { day: "2026-10-04", text: "Valce sa pri zastavení neprestavujú a neposkočia." },
  { day: "2026-10-03", text: "Rampa hrá pri oboch pádoch plechoviek. Krátke zvuky sa pripravia hneď, nie až po stiahnutí hudby." },
  { day: "2026-10-03", text: "Valce držia rovnakú rýchlosť aj keď telefón klesne na 30 Hz." },
];

const DAY = 86_400_000;

/** Notes from the last 7 calendar days, newest day first, already grouped. */
export function recentChanges(now = Date.now()): { day: string; items: string[] }[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const from = start.getTime() - 6 * DAY;
  const groups = new Map<string, string[]>();
  for (const note of CHANGELOG) {
    const t = Date.parse(`${note.day}T12:00:00`);
    if (!Number.isFinite(t) || t < from || t > now + DAY) continue;
    const list = groups.get(note.day);
    if (list) list.push(note.text);
    else groups.set(note.day, [note.text]);
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, items]) => ({ day, items }));
}

const WEEKDAYS = ["nedeľa", "pondelok", "utorok", "streda", "štvrtok", "piatok", "sobota"];

export function changeDayLabel(day: string, now = Date.now()): string {
  const t = Date.parse(`${day}T12:00:00`);
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  const diff = Math.round((today.getTime() - t) / DAY);
  const [y, m, d] = day.split("-");
  const date = `${Number(d)}. ${Number(m)}. ${y}`;
  if (diff === 0) return `Dnes · ${date}`;
  if (diff === 1) return `Včera · ${date}`;
  const wd = WEEKDAYS[new Date(t).getDay()] ?? "";
  return `${wd} · ${date}`;
}
