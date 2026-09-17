#!/usr/bin/env node
/**
 * Nitro bundles @electric-sql/pglite into `_libs/electric-sql__pglite.mjs` but
 * does not copy the sidecar WASM payloads it reads via `new URL("./pglite.data",
 * import.meta.url)`. Without them, `vite preview` (PGLite, no DATABASE_URL)
 * crashes on boot. Deployed Vercel uses Neon, so this is a local/QA-only gap.
 */
import { copyFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "node_modules/@electric-sql/pglite/dist");
const FILES = ["pglite.data", "pglite.wasm", "initdb.wasm"];
const BUNDLE_NAMES = new Set(["electric-sql__pglite.mjs", "pglite.mjs"]);

function walk(dir, acc) {
  if (!existsSync(dir)) return acc;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, acc);
    else if (BUNDLE_NAMES.has(name)) acc.push(dirname(p));
  }
  return acc;
}

const dests = [...new Set([...walk(join(ROOT, ".vercel"), []), ...walk(join(ROOT, ".output"), [])])];
if (!dests.length) {
  console.log("[pglite-assets] no nitro pglite bundle found — skip");
  process.exit(0);
}

let copied = 0;
for (const dest of dests) {
  for (const file of FILES) {
    const from = join(SRC, file);
    if (!existsSync(from)) {
      console.warn(`[pglite-assets] missing ${from}`);
      continue;
    }
    copyFileSync(from, join(dest, file));
    copied += 1;
    console.log(`[pglite-assets] ${file} -> ${dest}`);
  }
}
console.log(`[pglite-assets] copied ${copied} file(s)`);
