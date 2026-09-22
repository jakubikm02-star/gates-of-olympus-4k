import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const MARK = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="108" fill="#0b0d10"/>
  <rect x="22" y="22" width="468" height="468" rx="88" fill="none" stroke="#f0c419" stroke-width="28"/>
  <path fill="#f8fafc" d="M128 108h154c74 0 122 41 122 108s-50 110-125 110H200v118h-72V108zm70 148h76c36 0 56-19 56-45s-21-45-56-45h-76v90z"/>
  <circle cx="392" cy="132" r="34" fill="#3ec6e0"/>
</svg>`;

async function raster(page, size, pad, file) {
  const inner = size - pad * 2;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><html><head><style>
    html,body{margin:0;width:${size}px;height:${size}px;background:#0b0d10;}
    .box{width:${size}px;height:${size}px;display:grid;place-items:center;background:#0b0d10;}
    svg{width:${inner}px;height:${inner}px;display:block;}
  </style></head><body><div class="box">${MARK}</div></body></html>`);
  const buf = await page.screenshot({ type: "png", omitBackground: false });
  writeFileSync(file, buf);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await raster(page, 180, 8, "public/__grok/icon-180.png");
await raster(page, 180, 8, "public/apple-touch-icon.png");
await raster(page, 192, 10, "public/icon-192.png");
await raster(page, 512, 28, "public/icon-512.png");
await browser.close();
console.log("pwa icons written");
