/** Player-facing update log. The settings tab keeps only the last 7 calendar days. */

export interface ChangeNote {
  /** YYYY-MM-DD, Europe/Bratislava. */
  day: string;
  text: string;
}

export const CHANGELOG: readonly ChangeNote[] = [
  { day: "2026-10-15", text: "SMRŤ EGA: týždenný event pre NEKONEČNO, od pondelka 01:00 do ďalšieho pondelka 01:00. Vstupné 2,5 % RP (min 500, max 2 500). Vyhráva najviac čistých RP za týždeň (zisky aj straty). Výhra: kľúč 4KA TV XL s archívom na 28 dní, doručí sa sám. Strieda sa s jackpotom, ťukni naň." },
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
