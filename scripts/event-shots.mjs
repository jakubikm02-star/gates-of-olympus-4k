/** EVENT-tab screenshots. Supabase host xgpnmxkquxzbhgktjipa is mocked, never contacted. */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, devices } from "playwright-core";

const OUT = path.resolve("screenshots/layouts");
const HOST = "xgpnmxkquxzbhgktjipa";
const SAVE = {
  playerId: "layoutshot1",
  updatedAt: Date.now(),
  balance: 5000,
  rp: 8000,
  autoHalt: true,
  muted: true,
  betIndex: 4,
};

function egoBody() {
  const now = Date.now();
  const end = now + (3 * 24 + 4) * 3600 * 1000 + 12 * 60 * 1000;
  return {
    week_start: now - 2 * 3600 * 1000,
    week_end: end,
    now,
    players: 517,
    top: [
      { nick: "layout", score: 10, admin: false },
      { nick: "Palica360", score: 8, admin: false },
      { nick: "Martin", score: 6, admin: true },
      { nick: "Nika", score: -4, admin: false },
      { nick: "Jozo", score: 2, admin: false },
      { nick: "Eva", score: -12, admin: false },
    ],
    me: { joined: true, score: 10, place: 1, fee: 500, admin: false },
    leader: null,
    prize: null,
    last_winner: null,
  };
}

const SHOTS = [
  ["event-s24-ultra-portrait", { w: 384, h: 824 }],
  ["event-s24-ultra-landscape", { w: 824, h: 384 }],
  ["event-iphone-15-pro-landscape", devices["iPhone 15 Pro landscape"].viewport],
  ["event-pixel-9-landscape", devices["Pixel 9 landscape"].viewport],
  ["event-fold8-cover", { w: 360, h: 840, fold: "cover" }],
  ["event-fold8-inner", { w: 984, h: 1016, fold: "inner" }],
  ["event-fold8-flex", { w: 984, h: 1016, fold: "flex-v" }],
  ["event-ipad-portrait", devices["iPad Pro 11"].viewport],
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
  viewport: { width: 384, height: 824 },
  userAgent: devices["Galaxy S24"].userAgent,
});
await context.addInitScript((save) => {
  localStorage.setItem("park-save-notice", "1");
  localStorage.setItem("parkizmus-v1", JSON.stringify(save));
}, SAVE);
await context.route("**/*", async (route) => {
  const url = route.request().url();
  if (!url.includes(HOST)) return route.continue();
  const body = url.includes("/rpc/ego_current") ? egoBody() : route.request().method() === "POST" ? {} : [];
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
});
const page = await context.newPage();
await page.goto("http://127.0.0.1:8080/?zlaty=0", { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForFunction(() => {
  const b = document.querySelector("button.bs-cta");
  return b && !b.disabled;
}, { timeout: 180_000 });
await page.locator("button.bs-cta").click();
await page.locator(".ego-dock").click();
await page.locator('button[role="tab"][aria-selected="true"]', { hasText: "EVENT" }).waitFor({ timeout: 8000 });
await page.locator(".ego-rules-toggle").waitFor();

async function measure() {
  return page.evaluate(() => {
    const sheet = document.querySelector(".fb-sheet.is-ego");
    const sr = sheet.getBoundingClientRect();
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        h: Math.round(r.height),
        inside: r.height > 2 && r.top >= sr.top - 2 && r.bottom <= sr.bottom + 2,
      };
    };
    const rules = document.querySelector(".ego-rules-scroll");
    return {
      sheetScroll: sheet.scrollHeight - sheet.clientHeight,
      toggle: document.querySelector(".ego-rules-toggle")?.textContent?.trim() ?? "",
      word: box(".ego-word"),
      clock: box(".ego-clock"),
      stand: box(".ego-stand"),
      board: box(".ego-board-scroll h4"),
      rulesOpen: Boolean(rules),
      rulesScroll: rules ? rules.scrollHeight > rules.clientHeight + 2 : false,
      rulesMax: rules ? getComputedStyle(rules).maxHeight : "",
    };
  });
}

const report = [];
for (const [name, vp] of SHOTS) {
  const url = new URL(page.url());
  if (vp.fold) url.searchParams.set("fold", vp.fold);
  else url.searchParams.delete("fold");
  await page.evaluate((next) => {
    history.replaceState(null, "", next);
    window.dispatchEvent(new Event("resize"));
  }, `${url.pathname}${url.search}`);
  await page.setViewportSize({ width: vp.width || vp.w, height: vp.height || vp.h });
  await page.waitForTimeout(250);
  const info = await measure();
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
  report.push({ name, ...info });
  console.log(name, JSON.stringify(info));
}

await page.setViewportSize({ width: 384, height: 824 });
await page.locator(".ego-rules-toggle").click();
await page.locator(".ego-rules-scroll").waitFor();
await page.waitForTimeout(200);
const open = await measure();
await page.screenshot({ path: path.join(OUT, "event-s24-ultra-portrait-open.png"), fullPage: false });
console.log("open", JSON.stringify(open));
report.push({ name: "open", ...open });

await browser.close();
const bad = report.filter((r) => r.sheetScroll > 4 || !r.word?.inside || !r.clock?.inside || !r.stand?.inside || !r.board?.inside);
const openBad = !open.rulesOpen || !open.rulesScroll || open.toggle !== "▴ Zbaliť";
if (bad.length || openBad || report[0].toggle !== "Podmienky ▾ Rozbaliť") {
  console.error("FAIL", { bad: bad.map((b) => b.name), openBad, toggle: report[0].toggle });
  process.exit(2);
}
