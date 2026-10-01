import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
mkdirSync("/workspace/screenshots", { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const views = [
  { name: "d1280", w: 1280, h: 800 },
  { name: "d1920", w: 1920, h: 1080 },
  { name: "d1366", w: 1366, h: 768 },
];
for (const v of views) {
  const page = await browser.newPage({ viewport: { width: v.w, height: v.h } });
  await page.goto("https://gates-of-olympus-4k.vercel.app/", { waitUntil: "networkidle", timeout: 45000 });
  const play = page.getByRole("button", { name: /HRAŤ/i });
  if (await play.count()) await play.click();
  await page.waitForTimeout(1200);
  const box = await page.evaluate(() => {
    const stage = document.querySelector(".board-stage");
    const inner = document.querySelector(".board-stage-inner");
    const frame = document.querySelector(".reel-frame");
    const arena = document.querySelector(".arena");
    const table = document.querySelector(".table");
    const wrap = document.querySelector(".board-wrap");
    const r = (el) => el ? el.getBoundingClientRect() : null;
    const j = (b) => b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null;
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      table: j(r(table)),
      arena: j(r(arena)),
      wrap: j(r(wrap)),
      stage: j(r(stage)),
      inner: j(r(inner)),
      frame: j(r(frame)),
    };
  });
  console.log(v.name, JSON.stringify(box));
  await page.screenshot({ path: `/workspace/screenshots/pc-${v.name}.png`, fullPage: false });
  await page.close();
}
await browser.close();
