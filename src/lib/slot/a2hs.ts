/**
 * "PRIDAŤ NA PLOCHU" (Add to Home Screen): environment detection + Slovak step-by-step guides.
 * Pure (no DOM), so it is unit-tested; the UI lives in components/slot/AddToHome.tsx and the early
 * `beforeinstallprompt` capture in lib/slot/a2hs-client.ts + the inline head script in __root.tsx.
 */

export type Os = "ios" | "android" | "desktop";
export type Browser =
  | "safari"
  | "chrome"
  | "edge"
  | "firefox"
  | "samsung"
  | "opera"
  | "opera-mini"
  | "yandex"
  | "brave"
  | "miui"
  | "huawei"
  | "uc"
  | "duckduckgo"
  | "google-app"
  | "inapp"
  | "other";
export type Brand = "apple" | "samsung" | "xiaomi" | "huawei" | "pixel" | "motorola" | "oneplus" | "nokia" | "other";
export type InApp = "facebook" | "instagram" | "messenger" | "tiktok" | "snapchat" | "line" | "telegram" | "x" | "linkedin" | "webview";

export interface InstallEnv {
  os: Os;
  browser: Browser;
  brand: Brand;
  inApp: InApp | null;
  /** iOS major.minor as a number (16.4 → 16.4); null off iOS / unknown. */
  ios: number | null;
  /** Safari "Version/x" major on iOS (Safari 26 has the ⋯ menu instead of the bottom share button). */
  safari: number | null;
  /** macOS desktop (Safari "Pridať do Docku"). */
  mac: boolean;
  ipad: boolean;
}

export interface EnvInput {
  ua: string;
  /** navigator.maxTouchPoints (iPadOS reports "Macintosh"). */
  touch?: number;
  /** navigator.userAgentData.brands[].brand */
  brands?: readonly string[];
  /** userAgentData high-entropy `model` (Chrome's reduced UA hides it: "Android 10; K"). */
  model?: string;
  /** navigator.brave present */
  brave?: boolean;
}


export function detectInApp(ua: string): InApp | null {
  if (/FB_IAB|FBAN|FBAV|FBIOS|FB4A/i.test(ua)) return /Messenger|MESSENGER|Orca-Android|FBAN\/Messenger/i.test(ua) ? "messenger" : "facebook";
  if (/Instagram/i.test(ua)) return "instagram";
  if (/musical_ly|TikTok|BytedanceWebview|trill_/i.test(ua)) return "tiktok";
  if (/Snapchat/i.test(ua)) return "snapchat";
  if (/\bLine\//.test(ua)) return "line";
  if (/Telegram/i.test(ua)) return "telegram";
  if (/Twitter|TwitterAndroid/i.test(ua)) return "x";
  if (/LinkedInApp/i.test(ua)) return "linkedin";
  // Android System WebView ("; wv)") without a browser token of its own.
  if (/Android/.test(ua) && /; wv\)/.test(ua) && !/SamsungBrowser|MiuiBrowser|HuaweiBrowser|HONORBrowser|EdgA|OPR\/|YaBrowser|UCBrowser/.test(ua)) return "webview";
  return null;
}

export function detectBrand(ua: string, model = ""): Brand {
  const s = `${ua} ${model}`;
  if (/iPhone|iPad|iPod|Macintosh/.test(ua)) return "apple";
  if (/SM-[A-Z]\d|SAMSUNG|Galaxy|SamsungBrowser/i.test(s)) return "samsung";
  if (/Xiaomi|Redmi|POCO|\bMi \d|\bMI \d|MiuiBrowser|XiaoMi|\bM2\d{3}[A-Z0-9]{2,}|\b2[0-4]\d{5,6}[A-Z]{1,3}\d?G?\b/i.test(s)) return "xiaomi";
  if (/HUAWEI|HONOR|HuaweiBrowser|HONORBrowser|\b(ELS|ANA|NOH|LIO|VOG|ELE|JNY|MAR|POT|STK|ART|YAL|CDY|BRQ|ALN|NAM|FOA|CTR|RKY|LGE)-[A-Z]{2}\d/.test(s)) return "huawei";
  if (/Pixel/.test(s)) return "pixel";
  if (/\bmoto|motorola|\bXT\d{4}/i.test(s)) return "motorola";
  if (/OnePlus|ONEPLUS|OPPO|realme|\b(CPH|RMX|PH[A-Z])\d{4}|\bIN20\d\d|\bLE2\d{3}|\bNE2\d{3}/i.test(s)) return "oneplus";
  if (/Nokia|\bTA-\d{4}/i.test(s)) return "nokia";
  return "other";
}

export function detectEnv(input: EnvInput): InstallEnv {
  const ua = input.ua || "";
  const brands = (input.brands ?? []).join(" ");
  const iPadOs = /Macintosh/.test(ua) && (input.touch ?? 0) > 1;
  const os: Os = /iPhone|iPad|iPod/.test(ua) || iPadOs ? "ios" : /Android/.test(ua) ? "android" : "desktop";
  const inApp = detectInApp(ua);
  const iosM = ua.match(/(?:iPhone )?OS (\d+)[_.](\d+)/);
  const ios = os === "ios" ? (iosM ? Number(`${iosM[1]}.${iosM[2]}`) : iPadOs ? 17 : null) : null;
  const verM = ua.match(/Version\/(\d+)/);
  let browser: Browser;
  if (inApp) browser = "inapp";
  else if (os === "ios") {
    if (/CriOS/.test(ua)) browser = "chrome";
    else if (/EdgiOS/.test(ua)) browser = "edge";
    else if (/FxiOS/.test(ua)) browser = "firefox";
    else if (/OPiOS|OPT\//.test(ua)) browser = "opera";
    else if (/YaBrowser/.test(ua)) browser = "yandex";
    else if (/DuckDuckGo/i.test(ua)) browser = "duckduckgo";
    else if (/GSA\//.test(ua)) browser = "google-app";
    else if (/Brave/i.test(ua) || input.brave) browser = "brave";
    else if (/Safari\//.test(ua) && verM) browser = "safari";
    else browser = "other";
  } else {
    if (/Opera Mini|OPiOS|OPR\/.*Mini/.test(ua)) browser = "opera-mini";
    else if (/SamsungBrowser/.test(ua)) browser = "samsung";
    else if (/MiuiBrowser|XiaoMi\/MiuiBrowser|Mint Browser/.test(ua)) browser = "miui";
    else if (/HuaweiBrowser|HONORBrowser|PetalBrowser/.test(ua)) browser = "huawei";
    else if (/EdgA?\/|Edg\//.test(ua) || /Microsoft Edge/.test(brands)) browser = "edge";
    else if (/OPR\/|Opera/.test(ua) || /Opera/.test(brands)) browser = "opera";
    else if (/YaBrowser|YaSearchBrowser/.test(ua) || /Yandex/.test(brands)) browser = "yandex";
    else if (/UCBrowser/.test(ua)) browser = "uc";
    else if (/DuckDuckGo/i.test(ua)) browser = "duckduckgo";
    else if (/Firefox\//.test(ua)) browser = "firefox";
    else if (input.brave || /Brave/.test(brands)) browser = "brave";
    else if (/GSA\//.test(ua)) browser = "google-app";
    else if (/Chrome\//.test(ua)) browser = "chrome";
    else if (/Safari\//.test(ua) && verM) browser = "safari";
    else browser = "other";
  }
  return {
    os,
    browser,
    brand: detectBrand(ua, input.model),
    inApp,
    ios,
    safari: os === "ios" && browser === "safari" && verM ? Number(verM[1]) : null,
    mac: os === "desktop" && /Macintosh/.test(ua),
    ipad: /iPad/.test(ua) || iPadOs,
  };
}

export type StepIcon =
  | "share"
  | "plus-square"
  | "dots-v"
  | "dots-h"
  | "menu"
  | "home"
  | "install"
  | "compass"
  | "external"
  | "check"
  | "monitor"
  | "shield";

export interface Step {
  icon: StepIcon;
  /** Main line; **x** marks the exact menu label (rendered bold). */
  text: string;
  hint?: string;
}

export type GuideAction = "copy" | "open-chrome";
/** Where the browser's own button sits, for the animated pointer (approximate). */
export type Pointer = "bottom-center" | "bottom-right" | "top-right" | null;

export interface Guide {
  id: string;
  /** Chip in the sheet header, e.g. "iPhone · Safari". */
  label: string;
  title: string;
  steps: Step[];
  note?: string;
  actions?: GuideAction[];
  pointer: Pointer;
}

const BRAND_NAME: Record<Brand, string> = {
  apple: "iPhone",
  samsung: "Samsung",
  xiaomi: "Xiaomi",
  huawei: "Huawei / Honor",
  pixel: "Pixel",
  motorola: "Motorola",
  oneplus: "OnePlus / Oppo",
  nokia: "Nokia",
  other: "Android",
};

const BROWSER_NAME: Record<Browser, string> = {
  safari: "Safari",
  chrome: "Chrome",
  edge: "Edge",
  firefox: "Firefox",
  samsung: "Samsung Internet",
  opera: "Opera",
  "opera-mini": "Opera Mini",
  yandex: "Yandex",
  brave: "Brave",
  miui: "Mi Prehliadač",
  huawei: "Huawei Prehliadač",
  uc: "UC Browser",
  duckduckgo: "DuckDuckGo",
  "google-app": "Aplikácia Google",
  inapp: "vstavaný prehliadač",
  other: "prehliadač",
};

const IN_APP_NAME: Record<InApp, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  messenger: "Messenger",
  tiktok: "TikTok",
  snapchat: "Snapchat",
  line: "LINE",
  telegram: "Telegram",
  x: "X",
  linkedin: "LinkedIn",
  webview: "aplikácia",
};

/** The phone's own browser per brand: the one the guide recommends when the current one cannot install. */
export function defaultBrowser(brand: Brand): string {
  switch (brand) {
    case "apple":
      return "Safari";
    case "samsung":
      return "Samsung Internet alebo Chrome";
    case "huawei":
      return "Huawei Prehliadač (Petal)";
    case "xiaomi":
      return "Chrome alebo Mi Prehliadač";
    default:
      return "Chrome";
  }
}

const FINISH: Step = { icon: "check", text: "Ikona **Parkizmus** pribudne na ploche — spúšťaj hru odtiaľ, na celú obrazovku." };

function deviceLabel(env: InstallEnv): string {
  if (env.os === "ios") return env.ipad ? "iPad" : "iPhone";
  if (env.os === "desktop") return env.mac ? "Mac" : "Počítač";
  return BRAND_NAME[env.brand];
}

function safariSteps(env: InstallEnv): Step[] {
  if ((env.safari ?? 0) >= 26) {
    return [
      { icon: "dots-h", text: "Ťukni na **⋯** vedľa adresy dole", hint: "v Safari od iOS 26" },
      { icon: "share", text: "Vyber **Zdieľať**" },
      { icon: "plus-square", text: "Posuň nižšie a ťukni **Pridať na plochu**", hint: "prípadne najprv „Zobraziť viac“" },
      { icon: "check", text: "Nechaj zapnuté **Otvoriť ako webovú appku** a potvrď **Pridať**" },
    ];
  }
  return [
    { icon: "share", text: "Ťukni na **Zdieľať**", hint: "štvorček so šípkou hore – dole v strede (na iPade hore vpravo)" },
    { icon: "plus-square", text: "Posuň menu nižšie a vyber **Pridať na plochu**" },
    { icon: "check", text: "Vpravo hore potvrď **Pridať**" },
  ];
}

function openElsewhere(env: InstallEnv, why: string): Guide {
  const target = env.os === "ios" ? "Safari" : defaultBrowser(env.brand).split(" alebo ")[0];
  return {
    id: `${env.os}-open-${env.browser}`,
    label: `${deviceLabel(env)} · ${env.inApp ? IN_APP_NAME[env.inApp] : BROWSER_NAME[env.browser]}`,
    title: `Otvor hru v ${target === "Safari" ? "Safari" : "prehliadači"}`,
    steps: [
      env.inApp
        ? { icon: env.os === "ios" ? "dots-h" : "dots-v", text: `Ťukni na **⋯** / **⋮** vpravo hore v ${IN_APP_NAME[env.inApp]}`, hint: "menu vstavaného prehliadača" }
        : { icon: "external", text: "Skopíruj odkaz tlačidlom nižšie" },
      env.inApp
        ? { icon: env.os === "ios" ? "compass" : "external", text: env.os === "ios" ? "Vyber **Otvoriť v Safari** / **v prehliadači**" : "Vyber **Otvoriť v prehliadači** / **v Chrome**" }
        : { icon: env.os === "ios" ? "compass" : "external", text: `Otvor **${target}** a vlož odkaz do adresy` },
      { icon: "plus-square", text: `Tam ťukni znova na **PRIDAŤ NA PLOCHU** – ${target} to už vie` },
    ],
    note: why,
    actions: env.os === "android" ? ["open-chrome", "copy"] : ["copy"],
    pointer: env.inApp ? "top-right" : null,
  };
}

/** Slovak guide for the detected browser; null where installing is not possible at all (desktop Firefox…). */
export function installGuide(env: InstallEnv): Guide | null {
  const label = `${deviceLabel(env)} · ${BROWSER_NAME[env.browser]}`;
  if (env.inApp) {
    return openElsewhere(env, `${IN_APP_NAME[env.inApp]} otvára odkazy vo vlastnom okne, ktoré na plochu pridávať nevie.`);
  }
  if (env.os === "ios") {
    const modern = (env.ios ?? 0) >= 16.4;
    if (env.browser === "safari") {
      return { id: (env.safari ?? 0) >= 26 ? "ios-safari-26" : "ios-safari", label, title: "Pridaj Parkizmus na plochu", steps: [...safariSteps(env), FINISH], pointer: (env.safari ?? 0) >= 26 ? "bottom-right" : "bottom-center" };
    }
    if (modern && env.browser === "chrome") {
      return {
        id: "ios-chrome",
        label,
        title: "Pridaj Parkizmus na plochu",
        steps: [
          { icon: "share", text: "Ťukni na **Zdieľať** v paneli s adresou", hint: "vpravo hore (alebo ⋯ → Zdieľať)" },
          { icon: "plus-square", text: "Vyber **Pridať na plochu**", hint: "ak chýba, posuň zoznam nižšie" },
          { icon: "check", text: "Potvrď **Pridať**" },
          FINISH,
        ],
        note: "Nejde to? Otvor stránku v Safari – tam to funguje vždy.",
        actions: ["copy"],
        pointer: "top-right",
      };
    }
    if (modern && (env.browser === "edge" || env.browser === "firefox")) {
      return {
        id: `ios-${env.browser}`,
        label,
        title: "Pridaj Parkizmus na plochu",
        steps: [
          { icon: env.browser === "edge" ? "dots-h" : "menu", text: `Ťukni na **${env.browser === "edge" ? "⋯" : "☰"}** dole vpravo` },
          { icon: "share", text: "Vyber **Zdieľať**" },
          { icon: "plus-square", text: "Vyber **Pridať na plochu** a potvrď **Pridať**" },
          FINISH,
        ],
        note: "Nejde to? Otvor stránku v Safari – tam to funguje vždy.",
        actions: ["copy"],
        pointer: "bottom-right",
      };
    }
    return openElsewhere(env, `${BROWSER_NAME[env.browser]} na iPhone na plochu pridávať nevie${modern ? "" : " (do iOS 16.4 to vie len Safari)"}.`);
  }
  if (env.os === "android") {
    switch (env.browser) {
      case "chrome":
      case "brave":
        return {
          id: `android-${env.browser}`,
          label,
          title: "Nainštaluj Parkizmus",
          steps: [
            { icon: "dots-v", text: "Ťukni na **⋮** vpravo hore" },
            { icon: "install", text: "Vyber **Pridať na plochu** alebo **Inštalovať aplikáciu**" },
            { icon: "check", text: "Potvrď **Inštalovať**" },
            FINISH,
          ],
          pointer: "top-right",
        };
      case "edge":
        return {
          id: "android-edge",
          label,
          title: "Nainštaluj Parkizmus",
          steps: [
            { icon: "dots-h", text: "Ťukni na **⋯** dole v strede" },
            { icon: "install", text: "Vyber **Pridať do telefónu**", hint: "alebo Pridať na plochu" },
            { icon: "check", text: "Potvrď **Inštalovať**" },
            FINISH,
          ],
          pointer: "bottom-center",
        };
      case "samsung":
        return {
          id: "android-samsung",
          label,
          title: "Pridaj Parkizmus na plochu",
          steps: [
            { icon: "menu", text: "Ťukni na **☰** vpravo dole", hint: "alebo ikonu ⤓ Inštalovať priamo v adresnom riadku" },
            { icon: "plus-square", text: "Vyber **Pridať stránku do**" },
            { icon: "home", text: "Vyber **Domovská obrazovka** a potvrď **Pridať**" },
            FINISH,
          ],
          pointer: "bottom-right",
        };
      case "firefox":
        return {
          id: "android-firefox",
          label,
          title: "Pridaj Parkizmus na plochu",
          steps: [
            { icon: "dots-v", text: "Ťukni na **⋮** (pri adrese hore alebo dole)" },
            { icon: "install", text: "Vyber **Inštalovať** alebo **Pridať na plochu**", hint: "v novších verziách v ponuke Zdieľať / Ďalšie" },
            { icon: "check", text: "Potvrď **Pridať**" },
            FINISH,
          ],
          pointer: "top-right",
        };
      case "opera":
        return {
          id: "android-opera",
          label,
          title: "Pridaj Parkizmus na plochu",
          steps: [
            { icon: "dots-v", text: "Ťukni na **⋮** vpravo hore" },
            { icon: "plus-square", text: "Vyber **Pridať do…**" },
            { icon: "home", text: "Vyber **Domovská obrazovka** a potvrď **Pridať**" },
            FINISH,
          ],
          pointer: "top-right",
        };
      case "yandex":
        return {
          id: "android-yandex",
          label,
          title: "Pridaj Parkizmus na plochu",
          steps: [
            { icon: "dots-v", text: "Ťukni na **⋮** pri adrese" },
            { icon: "plus-square", text: "Vyber **Pridať odkaz na plochu**" },
            { icon: "check", text: "Potvrď **Pridať**" },
            FINISH,
          ],
          pointer: "bottom-right",
        };
      case "miui":
        return {
          id: "android-miui",
          label,
          title: "Pridaj Parkizmus na plochu",
          steps: [
            { icon: "menu", text: "Ťukni na **☰** (Menu) vpravo dole" },
            { icon: "plus-square", text: "Vyber **Pridať na plochu**", hint: "prípadne Záložky → Pridať do → Domovská obrazovka" },
            { icon: "check", text: "Potvrď **Pridať**" },
            FINISH,
          ],
          note: "Ikona sa neobjavila? Nastavenia → Aplikácie → Prehliadač → Povolenia: zapni **Skratky na ploche**. Alebo použi Chrome.",
          pointer: "bottom-right",
        };
      case "huawei":
        return {
          id: "android-huawei",
          label,
          title: "Pridaj Parkizmus na plochu",
          steps: [
            { icon: "menu", text: "Ťukni na **☰** (Menu) vpravo dole" },
            { icon: "plus-square", text: "Vyber **Pridať do**", hint: "alebo Pridať skratku" },
            { icon: "home", text: "Vyber **Domovská obrazovka** a potvrď **Pridať**" },
            FINISH,
          ],
          note: "Ikona sa neobjavila? Nastavenia → Aplikácie → Prehliadač → Povolenia: povoľ **Vytváranie skratiek na ploche**.",
          pointer: "bottom-right",
        };
      case "opera-mini":
      case "uc":
      case "duckduckgo":
      case "google-app":
      case "other":
        return openElsewhere(env, `${BROWSER_NAME[env.browser]} hru na plochu nepridá. Na ${BRAND_NAME[env.brand]} to vie ${defaultBrowser(env.brand)}.`);
      default:
        return openElsewhere(env, `Na ${BRAND_NAME[env.brand]} to vie ${defaultBrowser(env.brand)}.`);
    }
  }
  // desktop
  if (env.browser === "chrome" || env.browser === "brave" || env.browser === "opera" || env.browser === "yandex") {
    return {
      id: "desktop-chrome",
      label,
      title: "Nainštaluj Parkizmus",
      steps: [
        { icon: "monitor", text: "Klikni na ikonu **Inštalovať** vpravo v adresnom riadku" },
        { icon: "dots-v", text: "alebo **⋮** → **Prenášať, uložiť a zdieľať** → **Inštalovať stránku ako aplikáciu**" },
        { icon: "check", text: "Potvrď **Inštalovať**" },
      ],
      pointer: null,
    };
  }
  if (env.browser === "edge") {
    return {
      id: "desktop-edge",
      label,
      title: "Nainštaluj Parkizmus",
      steps: [
        { icon: "dots-h", text: "Klikni na **⋯** vpravo hore" },
        { icon: "install", text: "**Aplikácie** → **Nainštalovať túto lokalitu ako aplikáciu**" },
        { icon: "check", text: "Potvrď **Inštalovať**" },
      ],
      pointer: null,
    };
  }
  if (env.browser === "safari" && env.mac) {
    return {
      id: "mac-safari",
      label,
      title: "Pridaj Parkizmus do Docku",
      steps: [
        { icon: "share", text: "V menu **Súbor** (alebo cez Zdieľať) vyber **Pridať do Docku**", hint: "Safari 17 a novší (macOS Sonoma+)" },
        { icon: "check", text: "Potvrď **Pridať**" },
      ],
      pointer: null,
    };
  }
  return null;
}

/* ---- snooze ("Neskôr") ---- */
export const SNOOZE_KEY = "park-a2hs-snooze";
export const INSTALLED_KEY = "park-a2hs-installed";
export const SNOOZE_DAYS = 5;
const DAY = 864e5;

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export function isSnoozed(kv: KV | null | undefined, now: number): boolean {
  if (!kv) return false;
  try {
    const until = Number(kv.getItem(SNOOZE_KEY) || 0);
    if (until > now) return true;
    const inst = Number(kv.getItem(INSTALLED_KEY) || 0);
    // After appinstalled the browser tab hides the button for a month (a removed app gets it back later).
    return inst > 0 && now - inst < 30 * DAY;
  } catch {
    return false;
  }
}

export function snooze(kv: KV | null | undefined, now: number, days = SNOOZE_DAYS): void {
  try {
    kv?.setItem(SNOOZE_KEY, String(now + days * DAY));
  } catch {
    /* private mode */
  }
}

export function markInstalled(kv: KV | null | undefined, now: number): void {
  try {
    kv?.setItem(INSTALLED_KEY, String(now));
  } catch {
    /* private mode */
  }
}

/** Android Chrome intent URL: opens the same page in Chrome from an in-app / non-installing browser. */
export function chromeIntentUrl(href: string): string {
  const u = new URL(href);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(":", "")};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
}
