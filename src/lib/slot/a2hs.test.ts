import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chromeIntentUrl, detectEnv, installGuide, isSnoozed, markInstalled, snooze, SNOOZE_DAYS, type KV } from "./a2hs.ts";

const UA = {
  iosSafari18: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  iosSafari26: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  iosChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1",
  iosChromeOld: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/110.0.5481.83 Mobile/15E148 Safari/604.1",
  iosFirefox: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/125.0 Mobile/15E148 Safari/605.1.15",
  iosEdge: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/124.0.2478.50 Mobile/15E148 Safari/605.1.15",
  iosInsta: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.40.92 (iPhone14,5; iOS 17_4; sk_SK; sk; scale=3.00; 1170x2532; 600000000)",
  iosFb: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/460.0.0.36.105;FBBV/1;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.4;FBSS/3;FBLC/sk_SK]",
  iPadOs: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  andChrome: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  firefoxAnd: "Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0",
  miui: "Mozilla/5.0 (Linux; U; Android 13; sk-sk; 23078PND5G Build/TP1A.220624.014) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/112.0.5615.136 Mobile Safari/537.36 XiaoMi/MiuiBrowser/14.10.1.2-gn",
  huawei: "Mozilla/5.0 (Linux; Android 12; HarmonyOS; NOH-NX9; HMSCore 6.13.0.302) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 HuaweiBrowser/15.0.4.312 Mobile Safari/537.36",
  operaMini: "Opera/9.80 (Android; Opera Mini/77.0.2254/191.303; U; sk) Presto/2.12.423 Version/12.16",
  operaAnd: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36 OPR/84.0.4452.81",
  edgeAnd: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36 EdgA/128.0.2739.67",
  yandexAnd: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 YaBrowser/24.7.1.94.00 SA/3 Mobile Safari/537.36",
  fbAnd: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.6533.103 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/477.0.0.49.82;]",
  messengerAnd: "Mozilla/5.0 (Linux; Android 14; SM-A546B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.6533.103 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/470.0.0.43.109;]",
  tiktokAnd: "Mozilla/5.0 (Linux; Android 13; 2201117TY Build/TKQ1.221114.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.193 Mobile Safari/537.36 trill_340302 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/34.3.2 ByteLocale/sk",
  winChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  winEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
  winFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
};

const env = (ua: string, extra = {}) => detectEnv({ ua, ...extra });
const guide = (ua: string, extra = {}) => installGuide(env(ua, extra));
const allText = (ua: string, extra = {}) => {
  const g = guide(ua, extra)!;
  return [g.title, g.label, g.note ?? "", ...g.steps.map((s) => `${s.text} ${s.hint ?? ""}`)].join(" | ");
};

describe("detectEnv", () => {
  it("tells iOS browsers apart", () => {
    assert.deepEqual([env(UA.iosSafari18).browser, env(UA.iosChrome).browser, env(UA.iosFirefox).browser, env(UA.iosEdge).browser], ["safari", "chrome", "firefox", "edge"]);
    assert.equal(env(UA.iosSafari18).ios, 18.5);
    assert.equal(env(UA.iosSafari26).safari, 26);
    assert.equal(env(UA.iosChrome).brand, "apple");
  });
  it("treats a touch Macintosh as iPadOS Safari", () => {
    const e = env(UA.iPadOs, { touch: 5 });
    assert.equal(e.os, "ios");
    assert.equal(e.ipad, true);
    assert.equal(e.browser, "safari");
    assert.equal(env(UA.macSafari, { touch: 0 }).os, "desktop");
  });
  it("finds Android browsers", () => {
    const b = (ua: string, x = {}) => env(ua, x).browser;
    assert.equal(b(UA.andChrome), "chrome");
    assert.equal(b(UA.samsung), "samsung");
    assert.equal(b(UA.firefoxAnd), "firefox");
    assert.equal(b(UA.miui), "miui");
    assert.equal(b(UA.huawei), "huawei");
    assert.equal(b(UA.operaMini), "opera-mini");
    assert.equal(b(UA.operaAnd), "opera");
    assert.equal(b(UA.edgeAnd), "edge");
    assert.equal(b(UA.yandexAnd), "yandex");
    assert.equal(b(UA.andChrome, { brave: true }), "brave");
  });
  it("spots in-app webviews", () => {
    assert.equal(env(UA.iosInsta).inApp, "instagram");
    assert.equal(env(UA.iosFb).inApp, "facebook");
    assert.equal(env(UA.fbAnd).inApp, "facebook");
    assert.equal(env(UA.messengerAnd).inApp, "messenger");
    assert.equal(env(UA.tiktokAnd).inApp, "tiktok");
    assert.equal(env(UA.miui).inApp, null);
  });
  it("reads the brand from the UA or the userAgentData model", () => {
    assert.equal(env(UA.samsung).brand, "samsung");
    assert.equal(env(UA.miui).brand, "xiaomi");
    assert.equal(env(UA.tiktokAnd).brand, "xiaomi");
    assert.equal(env(UA.huawei).brand, "huawei");
    assert.equal(env(UA.fbAnd).brand, "pixel");
    assert.equal(env(UA.andChrome).brand, "other");
    assert.equal(env(UA.andChrome, { model: "Pixel 9" }).brand, "pixel");
    assert.equal(env(UA.andChrome, { model: "moto g84 5G" }).brand, "motorola");
    assert.equal(env(UA.andChrome, { model: "CPH2581" }).brand, "oneplus");
    assert.equal(env(UA.andChrome, { model: "Nokia G42 5G" }).brand, "nokia");
    assert.equal(env(UA.andChrome, { model: "Redmi Note 13" }).brand, "xiaomi");
    assert.equal(env(UA.andChrome, { model: "SM-A556B" }).brand, "samsung");
  });
});

describe("installGuide", () => {
  it("iOS Safari: Zdieľať → Pridať na plochu", () => {
    const t = allText(UA.iosSafari18);
    assert.match(t, /Zdieľať/);
    assert.match(t, /Pridať na plochu/);
    assert.equal(guide(UA.iosSafari18)!.pointer, "bottom-center");
  });
  it("iOS 26 Safari goes through the ⋯ menu", () => {
    const g = guide(UA.iosSafari26)!;
    assert.equal(g.id, "ios-safari-26");
    assert.match(g.steps[0].text, /⋯/);
  });
  it("iOS Chrome ≥16.4 uses its share menu; older iOS sends the player to Safari", () => {
    assert.equal(guide(UA.iosChrome)!.id, "ios-chrome");
    const old = guide(UA.iosChromeOld)!;
    assert.match(old.title, /Safari/);
    assert.deepEqual(old.actions, ["copy"]);
  });
  it("in-app webviews say Otvor v prehliadači", () => {
    assert.match(allText(UA.iosInsta), /Otvoriť v Safari/);
    const and = guide(UA.fbAnd)!;
    assert.match(and.steps.map((s) => s.text).join(" "), /Otvoriť v prehliadači/);
    assert.deepEqual(and.actions, ["open-chrome", "copy"]);
    assert.match(allText(UA.tiktokAnd), /TikTok/);
  });
  it("Android menus per browser", () => {
    assert.match(allText(UA.samsung), /☰.*Pridať stránku do.*Domovská obrazovka/);
    assert.match(allText(UA.firefoxAnd), /⋮.*Inštalovať.*Pridať na plochu/);
    assert.match(allText(UA.andChrome), /⋮.*Inštalovať aplikáciu/);
    assert.match(allText(UA.edgeAnd), /Pridať do telefónu/);
    assert.match(allText(UA.operaAnd), /Pridať do….*Domovská obrazovka/);
    assert.match(allText(UA.miui), /Skratky na ploche/);
    assert.match(allText(UA.huawei), /Domovská obrazovka/);
    assert.match(allText(UA.operaMini), /Chrome/);
  });
  it("labels the phone brand", () => {
    assert.match(guide(UA.samsung)!.label, /^Samsung · Samsung Internet$/);
    assert.match(guide(UA.miui)!.label, /^Xiaomi · Mi Prehliadač$/);
    assert.match(guide(UA.iosSafari18)!.label, /^iPhone · Safari$/);
  });
  it("desktop: Chrome/Edge/Safari get a route, Firefox none", () => {
    assert.equal(guide(UA.winChrome)!.id, "desktop-chrome");
    assert.equal(guide(UA.winEdge)!.id, "desktop-edge");
    assert.equal(guide(UA.macSafari)!.id, "mac-safari");
    assert.equal(guide(UA.winFirefox), null);
  });
  it("every guide has steps with matched ** markers", () => {
    for (const ua of Object.values(UA)) {
      const g = guide(ua, { touch: 5 });
      if (!g) continue;
      assert.ok(g.steps.length >= 2, g.id);
      for (const s of g.steps) assert.equal((s.text.match(/\*\*/g) ?? []).length % 2, 0, s.text);
    }
  });
});

describe("snooze", () => {
  const mem = (): KV & { m: Map<string, string> } => {
    const m = new Map<string, string>();
    return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
  };
  it("Neskôr hides the button for SNOOZE_DAYS", () => {
    const kv = mem();
    const now = 1_700_000_000_000;
    assert.equal(isSnoozed(kv, now), false);
    snooze(kv, now);
    assert.equal(isSnoozed(kv, now + 864e5), true);
    assert.equal(isSnoozed(kv, now + SNOOZE_DAYS * 864e5 + 1), false);
  });
  it("appinstalled hides it for a month", () => {
    const kv = mem();
    const t0 = 1_700_000_000_000;
    markInstalled(kv, t0);
    assert.equal(isSnoozed(kv, t0 + 10 * 864e5), true);
    assert.equal(isSnoozed(kv, t0 + 31 * 864e5), false);
  });
  it("survives a throwing storage", () => {
    const bad: KV = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => {} };
    assert.equal(isSnoozed(bad, 0), false);
    snooze(bad, 0);
    assert.equal(isSnoozed(null, 0), false);
  });
});

describe("chromeIntentUrl", () => {
  it("opens the same page in Chrome with a web fallback", () => {
    const u = chromeIntentUrl("https://parkizmus.example/?ref=fb");
    assert.match(u, /^intent:\/\/parkizmus\.example\/\?ref=fb#Intent;scheme=https;package=com\.android\.chrome;/);
    assert.match(u, /S\.browser_fallback_url=https%3A%2F%2Fparkizmus\.example/);
  });
});
