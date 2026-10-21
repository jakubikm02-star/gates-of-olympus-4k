/**
 * The reel frame and the reel window keep one bounding box across play states.
 * Needs the dev server on :8080 and system Chrome. Skips when either is missing.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync } from "node:fs";

const BASE = process.env.REEL_BOX_URL || "http://127.0.0.1:8080";
const CHROME = ["/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => existsSync(p));

const VIEWS = [
  { name: "384x780", w: 384, h: 780 },
  { name: "384x832", w: 384, h: 832 },
  { name: "412x915", w: 412, h: 915, pwa: true },
  { name: "fold-cover-344x882", w: 344, h: 882, fold: "cover" },
  { name: "fold-cover-412x1000", w: 412, h: 1000, fold: "cover" },
  { name: "fold-inner-884x1104", w: 884, h: 1104, fold: "inner" },
  { name: "fold-inner-1104x884", w: 1104, h: 884, fold: "inner" },
  { name: "landscape-824x384", w: 824, h: 384 },
  { name: "fold-land-1084x790", w: 1084, h: 790, dpr: 2.625 },
  { name: "fold-land-968x840", w: 968, h: 840, dpr: 3 },
  { name: "s24-land-915x412", w: 915, h: 412, dpr: 3.5 },
  { name: "s24-land-870x360", w: 870, h: 360, dpr: 3 },
];

const UA =
  "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

async function serverUp() {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

function near(a, b, name, state) {
  for (const k of ["x", "y", "w", "h"]) {
    assert.ok(
      Math.abs(a[k] - b[k]) <= 1,
      `${name} ${state} .reel-${a.kind || "box"} ${k}: ${a[k]} vs idle ${b[k]}`,
    );
  }
}

describe("reel grid box", () => {
  it("stays fixed across idle, tumble, win, bonus, and ticket states", { timeout: 300_000 }, async (t) => {
    if (!CHROME || !(await serverUp())) {
      t.skip("needs system Chrome and the dev server on :8080");
      return;
    }
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({
      executablePath: CHROME,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    try {
      for (const view of VIEWS) {
        const ctx = await browser.newContext({
          viewport: { width: view.w, height: view.h },
          deviceScaleFactor: view.dpr ?? 1,
          isMobile: true,
          hasTouch: true,
          userAgent: view.h > view.w ? UA : UA.replace(" Mobile", ""),
        });
        await ctx.addInitScript((pwa) => {
          try {
            localStorage.setItem("park-save-notice", "1");
            localStorage.setItem(
              "parkizmus-v1",
              JSON.stringify({
                balance: 5000,
                betIndex: 4,
                muted: true,
                rp: 8000,
                playerId: "reel-box-player",
                updatedAt: Date.now(),
              }),
            );
          } catch {
            /* private mode */
          }
          const native = window.matchMedia.bind(window);
          window.matchMedia = (q) => {
            const m = native(q);
            if (/display-mode:\s*(standalone|fullscreen|minimal-ui)/.test(q)) {
              const matches = Boolean(pwa);
              return {
                matches,
                media: q,
                addListener() {},
                removeListener() {},
                addEventListener() {},
                removeEventListener() {},
                dispatchEvent() {
                  return false;
                },
                onchange: null,
              };
            }
            return m;
          };
          Object.defineProperty(navigator, "standalone", { configurable: true, get: () => Boolean(pwa) });
        }, Boolean(view.pwa));
        const page = await ctx.newPage();
        await page.route("**/*", (route) => {
          const url = route.request().url();
          if (url.includes("xgpnmxkquxzbhgktjipa")) {
            return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
          }
          return route.continue();
        });
        const fold = view.fold ? `&fold=${view.fold}` : "";
        await page.goto(`${BASE}/?zlaty=0${fold}`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(".bs-cta:not([disabled])", { timeout: 25000 });
        await page.click(".bs-cta");
        await page.waitForSelector(".reel-window", { timeout: 10000 });
        await page.waitForTimeout(350);

        const read = () =>
          page.evaluate(() => {
            const box = (sel) => {
              const el = document.querySelector(sel);
              if (!el) return null;
              const r = el.getBoundingClientRect();
              return {
                x: Math.round(r.x * 10) / 10,
                y: Math.round(r.y * 10) / 10,
                w: Math.round(r.width * 10) / 10,
                h: Math.round(r.height * 10) / 10,
              };
            };
            const frame = box(".reel-frame");
            const win = box(".reel-window");
            const cells = document.querySelectorAll(".reel-window .cell").length;
            return { frame, win, cells, vh: window.innerHeight, vw: window.innerWidth };
          });

        const idle = await read();
        assert.ok(idle.frame && idle.win, `${view.name} missing reel`);
        assert.equal(idle.cells, 30, `${view.name} cell count`);
        const painted = await page.evaluate(() => {
          const win = document.querySelector(".reel-window");
          const col = document.querySelector(".reel-col");
          const r = win.getBoundingClientRect();
          const hits = [0.1, 0.3, 0.5, 0.7, 0.9].filter((t) => {
            const el = document.elementFromPoint(r.left + r.width * 0.42, r.top + r.height * t);
            return Boolean(el?.closest(".cell"));
          }).length;
          return { hits, colH: col.clientHeight, winH: r.height, scroll: col.scrollHeight };
        });
        assert.equal(painted.hits, 5, `${view.name} painted rows ${painted.hits} (col ${painted.colH} / win ${painted.winH})`);
        assert.ok(
          painted.colH > painted.winH / 3,
          `${view.name} column ${painted.colH}px is one row of window ${painted.winH}px`,
        );
        assert.ok(
          painted.scroll <= painted.colH + 8,
          `${view.name} column clips cells (scroll ${painted.scroll} > col ${painted.colH})`,
        );
        assert.ok(idle.frame.y >= -1, `${view.name} frame above viewport`);
        assert.ok(idle.frame.y + idle.frame.h <= idle.vh + 1, `${view.name} frame below viewport ${idle.frame.y + idle.frame.h} > ${idle.vh}`);
        assert.ok(idle.frame.h > 80, `${view.name} frame too short`);

        const apply = (state) =>
          page.evaluate((which) => {
            const stage = document.querySelector(".stage");
            const ticker = document.querySelector(".top-ticker");
            const line = document.querySelector(".win-line");
            const hint = document.querySelector(".pay-hint");
            const job = document.querySelector(".board-job");
            const stack = document.querySelector(".jp-stack");
            const meter = document.querySelector(".board-meter");
            if (which === "tumble" && ticker) {
              ticker.classList.remove("is-idle", "is-chase");
              ticker.innerHTML = "TUMBLE <strong>25.00</strong>";
            }
            if (which === "win") {
              if (line) {
                line.classList.add("has-win");
                line.textContent = "VÝHRA 25.00";
              }
              if (hint) {
                hint.classList.remove("is-idle");
                hint.textContent = "8× PLECH = 25.00";
              }
            }
            if (which === "jackpot" && stack) {
              stack.classList.add("is-hit");
              const value = stack.querySelector(".jp-row.stat b");
              if (value) value.textContent = "1 250 000,00";
              if (!stack.querySelector("em")) {
                const em = document.createElement("em");
                em.textContent = "4-FTTB · 100 % = 120 000.00";
                stack.appendChild(em);
              }
            }
            if ((which === "ticket" || which === "dual") && job) {
              job.classList.add("has-job");
              const dual = which === "dual" ? " is-dual" : "";
              job.innerHTML = `<button class="job-chip is-compact${dual}"><span class="jc-row"><b class="job-kicker">TIKET BEŽÍ</b><span class="jc-goal">ZBER PLECHOVKY NA ULICI</span></span><span class="jc-row"><span class="tb-legs"><span class="tb-leg"><em>ZÁKLAD</em><b>1/8</b></span><span class="tb-leg"><em>4KA TV</em><b>3/8</b></span></span></span></button>`;
            }
            if (which === "ticket-off" && job) {
              job.classList.remove("has-job");
              job.innerHTML = "";
            }
            if (which === "bonus" && stage && meter) {
              stage.classList.add("in-fs");
              document.querySelector(".ego-dock")?.remove();
              meter.innerHTML = '<div class="fs-hero"><div class="wing-mult"><span>Mbps</span><b>12×</b></div><div class="fs-left">4KA TV <strong>8/15</strong></div></div>';
            }
            if (which === "chase" && ticker) {
              ticker.classList.add("is-chase");
              ticker.classList.remove("is-idle");
              ticker.textContent = "ZÁSAH CIEĽ PLECH 2/4";
            }
          }, state);

        const states = ["tumble", "win", "jackpot", "ticket", "dual", "ticket-off", "bonus", "chase"];
        for (const state of states) {
          await apply(state);
          await page.waitForTimeout(40);
          const now = await read();
          near({ ...now.frame, kind: "frame" }, idle.frame, view.name, state);
          near({ ...now.win, kind: "window" }, idle.win, view.name, state);
          assert.equal(now.cells, 30, `${view.name} ${state} cells`);
        }
        await ctx.close();
      }
    } finally {
      await browser.close();
    }
  });
});
