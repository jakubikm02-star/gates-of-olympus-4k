import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const MARK = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0b0d10"/>
  <rect x="28" y="28" width="456" height="456" rx="96" fill="#12161c" stroke="#f0c419" stroke-width="36"/>
  <rect x="64" y="64" width="384" height="384" rx="72" fill="none" stroke="#3ec6e0" stroke-width="10" opacity="0.55"/>
  <path fill="#fff8e8" d="M118 96h168c86 0 142 48 142 126 0 76-58 128-146 128H200v126h-82V96zm82 172h78c42 0 66-22 66-54s-24-52-66-52h-78v106z"/>
  <circle cx="392" cy="128" r="38" fill="#3ec6e0"/>
  <circle cx="392" cy="128" r="16" fill="#0b0d10"/>
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
await raster(page, 16, 1, "public/favicon-16.png");
await raster(page, 32, 2, "public/favicon-32.png");
await raster(page, 48, 3, "public/favicon-48.png");
await raster(page, 180, 10, "public/__grok/icon-180.png");
await raster(page, 180, 10, "public/apple-touch-icon.png");
await raster(page, 180, 10, "public/apple-touch-icon-precomposed.png");
await raster(page, 192, 14, "public/icon-192.png");
await raster(page, 512, 48, "public/icon-512.png");
await browser.close();
console.log("pwa icons written");
