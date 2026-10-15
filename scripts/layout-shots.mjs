/**
 * Device-layout screenshots. Supabase is mocked in the browser — production
 * host xgpnmxkquxzbhgktjipa is never contacted.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, devices } from "playwright-core";

const OUT = path.resolve("screenshots/layouts");
const HOST = "xgpnmxkquxzbhgktjipa";
const BASE = "http://127.0.0.1:8080/?zlaty=0";

const SAVE = {
  playerId: "layoutshot1",
  updatedAt: Date.now(),
  balance: 5000,
  rp: 8000,
  autoHalt: true,
  muted: true,
  betIndex: 4,
  job: {
    id: "layout-dual",
    floor: "stred",
    template: "zber",
    templateB: "plechovky",
    title: "OTRS",
    detail: "1× sivý lístok v hre + 8 kôl 4KA TV",
    goal: "1× sivý lístok v hre + 8 kôl 4KA TV",
    stake: 100,
    payout: 200,
    kind: "wins",
    kindB: "tumbles",
    scope: "base",
    scopeB: "live",
    need: 1,
    have: 0,
    needB: 8,
    haveB: 0,
    limit: 30,
    spun: 0,
    tries: 8,
    triesUsed: 0,
    lockBet: 1,
    mystery: true,
  },
};

let egoJoined = true;

function egoBody() {
  const now = Date.now();
  const end = now + (3 * 24 + 4) * 3600 * 1000 + 40 * 60 * 1000;
  return {
    week_start: now - 2 * 3600 * 1000,
    week_end: end,
    now,
    players: 517,
    top: [{ nick: "layout", score: 10, admin: false }],
    me: egoJoined
      ? { joined: true, score: 10, place: 1, fee: 500, admin: false }
      : { joined: false, score: 0, place: 0, fee: 0, admin: false },
    leader: null,
    prize: null,
    last_winner: null,
  };
}

function mockPayload(url, method) {
  if (url.includes("/rpc/ego_current")) return egoBody();
  if (url.includes("park_online_beat")) return 17;
  if (method === "POST") return {};
  return [];
}

const named = (device, fold = "") => ({ device, fold, w: 0, h: 0 });
const custom = (w, h, fold = "") => ({ device: "", fold, w, h });

const SHOTS = [
  ["iphone-15-pro-portrait", named("iPhone 15 Pro")],
  ["iphone-15-pro-landscape", named("iPhone 15 Pro landscape")],
  ["iphone-15-pro-max-portrait", named("iPhone 15 Pro Max")],
  ["iphone-15-pro-max-landscape", named("iPhone 15 Pro Max landscape")],
  ["iphone-16-pro-portrait", named("iPhone 16 Pro")],
  ["iphone-16-pro-landscape", named("iPhone 16 Pro landscape")],
  ["iphone-16-pro-max-portrait", named("iPhone 16 Pro Max")],
  ["iphone-16-pro-max-landscape", named("iPhone 16 Pro Max landscape")],
  ["galaxy-s24-portrait", named("Galaxy S24")],
  ["galaxy-s24-landscape", named("Galaxy S24 landscape")],
  ["galaxy-s24-ultra-portrait", custom(384, 824)],
  ["galaxy-s24-ultra-landscape", custom(824, 384)],
  ["galaxy-s25-ultra-portrait", custom(384, 832)],
  ["galaxy-s25-ultra-landscape", custom(832, 384)],
  ["pixel-8-portrait", named("Pixel 8")],
  ["pixel-8-landscape", named("Pixel 8 landscape")],
  ["pixel-9-portrait", named("Pixel 9")],
  ["pixel-9-landscape", named("Pixel 9 landscape")],
  ["galaxy-tab-s9-portrait", named("Galaxy Tab S9")],
  ["galaxy-tab-s9-landscape", named("Galaxy Tab S9 landscape")],
  ["ipad-pro-11-portrait", named("iPad Pro 11")],
  ["ipad-pro-11-landscape", named("iPad Pro 11 landscape")],
  ["fold8-cover-portrait", custom(360, 840, "cover")],
  ["fold8-cover-landscape", custom(840, 360, "cover")],
  ["fold8-inner-portrait", custom(984, 1016, "inner")],
  ["fold8-inner-landscape", custom(1016, 984, "inner")],
  ["fold8-flex-portrait", custom(984, 1016, "flex-v")],
  ["fold8-flex-landscape", custom(1016, 984, "flex-h")],
  ["landscape-915x412", custom(915, 412)],
  ["landscape-932x430", custom(932, 430)],
];

function viewportOf(spec) {
  if (spec.device) {
    const d = devices[spec.device];
    if (!d) throw new Error(`unknown device ${spec.device}`);
    return { width: d.viewport.width, height: d.viewport.height };
  }
  return { width: spec.w, height: spec.h };
}

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const leaked = [];
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
  if (url.includes(HOST)) {
    leaked.push(url);
    const body = mockPayload(url, route.request().method());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
    return;
  }
  await route.continue();
});

const page = await context.newPage();
const consoleErrors = [];
page.on("pageerror", (err) => consoleErrors.push(String(err)));
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 120_000 });
const play = page.locator("button.bs-cta");
await play.waitFor({ state: "visible", timeout: 60_000 });
await page.waitForFunction(() => {
  const b = document.querySelector("button.bs-cta");
  return b && !b.disabled;
}, { timeout: 180_000 });
await play.click();
await page.locator("button.auto-pill").waitFor({ state: "visible", timeout: 30_000 });
await page.waitForTimeout(600);

async function applyShot(spec) {
  const vp = viewportOf(spec);
  const url = new URL(page.url());
  if (spec.fold) url.searchParams.set("fold", spec.fold);
  else url.searchParams.delete("fold");
  await page.evaluate((next) => {
    history.replaceState(null, "", next);
    window.dispatchEvent(new Event("resize"));
  }, `${url.pathname}${url.search}`);
  await page.setViewportSize(vp);
  await page.waitForTimeout(350);
}

function overlapArea(a, b) {
  if (!a || !b) return 0;
  const x = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const y = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (x <= 1 || y <= 1) return 0;
  return x * y;
}

async function audit(name) {
  return page.evaluate(() => {
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
    };
    const stage = document.querySelector(".stage");
    const dock = document.querySelector(".ego-dock");
    const jp = document.querySelector(".jp-row");
    const dockBox = box(dock);
    const jpBox = box(jp);
    const ox = dockBox && jpBox ? Math.min(dockBox.right, jpBox.right) - Math.max(dockBox.x, jpBox.x) : 0;
    const oy = dockBox && jpBox ? Math.min(dockBox.bottom, jpBox.bottom) - Math.max(dockBox.y, jpBox.y) : 0;
    const legs = [...document.querySelectorAll(".board-job .tb-leg")].map((el) => {
      const em = el.querySelector("em");
      const b = el.querySelector("b");
      const clip = (n) => (n ? n.scrollWidth > n.clientWidth + 2 : false);
      return {
        text: el.textContent?.replace(/\s+/g, " ").trim() ?? "",
        emClip: clip(em),
        bClip: clip(b),
      };
    });
    const goal = document.querySelector(".board-job .jc-goal");
    const root = document.documentElement;
    return {
      land: stage?.classList.contains("is-land") ?? false,
      fold: [...(stage?.classList ?? [])].find((c) => c.startsWith("fold-")) ?? "",
      shell: [...(stage?.classList ?? [])].find((c) => c.startsWith("shell-")) ?? "",
      orient: root.dataset.orient ?? "",
      dock: dock?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      dockOff: dockBox ? dockBox.right > window.innerWidth + 2 || dockBox.bottom > window.innerHeight + 2 : true,
      dockJp: ox > 2 && oy > 2 ? Math.round(ox * oy) : 0,
      legs,
      goal: goal?.textContent?.trim() ?? "",
      goalClip: goal ? goal.scrollWidth > goal.clientWidth + 2 : false,
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  }).then((info) => ({ name, ...info }));
}

const report = [];
for (const [name, spec] of SHOTS) {
  await applyShot(spec);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  report.push(await audit(name));
  process.stdout.write(`shot ${name}\n`);
}

await applyShot(SHOTS.find(([n]) => n === "galaxy-s24-ultra-portrait")[1]);
await page.locator(".ego-dock").click();
await page.locator('button[role="tab"][aria-selected="true"]', { hasText: "EVENT" }).waitFor({ timeout: 8000 });
await page.locator('button[aria-label="Zavrieť"]').click();
await page.locator(".modal-card").waitFor({ state: "hidden", timeout: 8000 });
await page.locator("button.auto-pill").click();
await page.locator(".auto-pop").waitFor({ state: "visible" });
await page.waitForTimeout(250);
const autoFile = path.join(OUT, "galaxy-s24-ultra-portrait-auto.png");
await page.screenshot({ path: autoFile, fullPage: false });

const autoAudit = await page.evaluate(() => {
  const r = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height, right: b.right, bottom: b.bottom };
  };
  const hint = document.querySelector(".auto-hint");
  return {
    hint: hint?.textContent ?? "",
    hintClip: hint ? hint.scrollHeight > hint.clientHeight + 2 || hint.scrollWidth > hint.clientWidth + 2 : true,
    pop: r(".auto-pop"),
    reels: r(".reel-host"),
    ticket: r(".board-job"),
    stage: document.querySelector(".stage")?.className ?? "",
  };
});

function area(a, b) {
  return overlapArea(
    a && { x: a.x, y: a.y, width: a.w, height: a.h },
    b && { x: b.x, y: b.y, width: b.w, height: b.h },
  );
}

const autoOverlap = {
  reels: area(autoAudit.pop, autoAudit.reels),
  ticket: area(autoAudit.pop, autoAudit.ticket),
};

const summary = {
  leaked: leaked.length,
  leakedSample: leaked.slice(0, 5),
  consoleErrors: consoleErrors.filter((t) => !/favicon|Download the React DevTools/.test(t)).slice(0, 30),
  auto: { ...autoAudit, overlap: autoOverlap },
  shots: report,
};

egoJoined = false;
await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForFunction(() => {
  const b = document.querySelector("button.bs-cta");
  return b && !b.disabled;
}, { timeout: 180_000 });
await page.locator("button.bs-cta").click();
await page.waitForFunction(() => (document.querySelector(".ego-dock")?.textContent || "").includes("VSTUP"), null, { timeout: 30_000 });
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(OUT, "galaxy-s24-ultra-portrait-join.png"), fullPage: false });
const joinText = await page.locator(".ego-dock").innerText();

await writeFile(path.join(OUT, "audit.json"), JSON.stringify({ ...summary, joinText }, null, 2));
const badDock = report.filter((s) => !s.dock.includes("KONČÍ O") || !s.dock.includes("1.") || s.dockJp > 0 || s.dockOff);
console.log(JSON.stringify({ leaked: summary.leaked, errors: summary.consoleErrors.length, joinText, badDock: badDock.map((s) => ({ name: s.name, dock: s.dock, off: s.dockOff, jp: s.dockJp })), auto: summary.auto.overlap }, null, 2));

await browser.close();

if (leaked.length && leaked.some(() => false)) process.exit(2);
if (autoOverlap.reels > 8 || autoOverlap.ticket > 8) {
  console.error("AUTO sheet overlaps critical UI", autoOverlap);
  process.exit(3);
}
if (autoAudit.hintClip || !autoAudit.hint.includes("kreditu stop.")) {
  console.error("AUTO hint clipped or missing", autoAudit.hint, autoAudit.hintClip);
  process.exit(4);
}
if (badDock.length || !joinText.includes("VSTUP")) {
  console.error("ego dock", badDock.length, joinText);
  process.exit(5);
}
