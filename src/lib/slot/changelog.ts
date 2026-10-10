/** Player-facing update log. The settings tab keeps only the last 7 calendar days. */

export interface ChangeNote {
  /** YYYY-MM-DD, Europe/Bratislava. */
  day: string;
  text: string;
}

export const CHANGELOG: readonly ChangeNote[] = [
  { day: "2026-10-10", text: "Nový odkaz hry je parkizmus.vercel.app. Starý odkaz ostáva. Kredit, hodnosť, lístok a rozohratá hra sa medzi nimi prenášajú. Nainštalovaná aplikácia sa nepresúva." },
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
