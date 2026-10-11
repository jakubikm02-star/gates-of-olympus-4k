// Virtual module "virtual:park-public-assets": byte size of every file the boot preloader reads from public/
// (so the loading bar knows the whole download up front) and the md5 of every built-in sound (so an upload
// that is byte-identical to the shipped file is played from Vercel's cache instead of Supabase).
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** public/ folders the boot preloader reads from. */
export const PRELOAD_DIRS = ["symbols", "art", "koleso", "zbox", "fx", "machine", "machine-ai", "ranks", "frames", "massive", "sfx"];

/**
 * @param {string} root project root (the folder holding public/)
 * @returns {{ sizes: Record<string, number>, md5: Record<string, string> }}
 */
export function publicAssets(root) {
  const pub = join(root, "public");
  /** @type {Record<string, number>} */
  const sizes = {};
  /** @type {Record<string, string>} */
  const md5 = {};
  /** @param {string} dir */
  const walk = (dir) => {
    /** @type {string[]} */
    let names = [];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const n of names) {
      const p = join(dir, n);
      const st = statSync(p);
      if (st.isDirectory()) {
        walk(p);
        continue;
      }
      const url = "/" + relative(pub, p).split(sep).join("/");
      sizes[url] = st.size;
      if (url.startsWith("/sfx/")) md5[url] = createHash("md5").update(readFileSync(p)).digest("hex");
    }
  };
  for (const d of PRELOAD_DIRS) walk(join(pub, d));
  return { sizes, md5 };
}

const ID = "virtual:park-public-assets";
const RID = "\0" + ID;

export function parkAssetsPlugin() {
  let root = process.cwd();
  return {
    name: "park:public-assets",
    /** @param {{ root: string }} c */
    configResolved(c) {
      root = c.root;
    },
    /** @param {string} id */
    resolveId(id) {
      return id === ID ? RID : null;
    },
    /** @param {string} id */
    load(id) {
      if (id !== RID) return null;
      return `export default ${JSON.stringify(publicAssets(root))};`;
    },
  };
}
