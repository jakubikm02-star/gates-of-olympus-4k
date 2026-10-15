/**
 * Copy public.sfx_cue.bytes into the public Storage bucket `sfx` and set sfx_cue.path.
 * Does not delete bytes. Never runs on import — call uploadSfxCues() or the CLI.
 *
 * Object names match src/lib/slot/sfx-storage.ts: `<key>/<md5>.<ext>`.
 */
import { createHash } from "node:crypto";

export const PROD_HOST = "xgpnmxkquxzbhgktjipa.supabase.co";
export const SFX_BUCKET = "sfx";
export const SFX_OBJECT_CACHE = "public, max-age=31536000, immutable";

const EXT = [
  ["flac", ".flac"],
  ["ogg", ".ogg"],
  ["opus", ".ogg"],
  ["wav", ".wav"],
  ["mp4", ".m4a"],
  ["m4a", ".m4a"],
  ["aac", ".m4a"],
  ["webm", ".webm"],
];

export function extForMime(mime) {
  const m = String(mime || "").toLowerCase();
  for (const [needle, ext] of EXT) if (m.includes(needle)) return ext;
  return ".mp3";
}

export function sfxObjectPath(key, md5, mime) {
  const safe = String(key).replace(/[^a-zA-Z0-9_-]/g, "");
  const hash = String(md5 || "").toLowerCase().replace(/[^a-f0-9]/g, "");
  if (!safe || hash.length < 8) throw new Error(`bad object name for ${key}`);
  return `${safe}/${hash}${extForMime(mime)}`;
}

export function sfxPublicUrl(supaUrl, objectPath) {
  const base = String(supaUrl).replace(/\/$/, "");
  const encoded = String(objectPath).split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${SFX_BUCKET}/${encoded}`;
}

/** PostgREST bytea: `\x` hex, or a base64 string. */
export function decodeBytea(value) {
  if (value == null) return Buffer.alloc(0);
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value !== "string") throw new Error("unexpected bytes shape");
  const s = value.trim();
  if (s.startsWith("\\x") || s.startsWith("\\X")) return Buffer.from(s.slice(2), "hex");
  return Buffer.from(s, "base64");
}

export function assertUploadEnv(env) {
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const url = String(env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
  if (!url) throw new Error("SUPABASE_URL is required");
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    throw new Error("SUPABASE_URL is not a URL");
  }
  if (!host) throw new Error("SUPABASE_URL is not a URL");
  if (env.SFX_UPLOAD_CONFIRM !== "yes") {
    throw new Error("Set SFX_UPLOAD_CONFIRM=yes to upload. This script does not run on its own.");
  }
  return { key, url, host };
}

function authHeaders(key, extra = {}) {
  return { apikey: key, authorization: `Bearer ${key}`, ...extra };
}

/**
 * @param {{ env: Record<string, string | undefined>, fetchImpl: typeof fetch, allowProduction?: boolean, log?: (m: string) => void }} opts
 * `allowProduction` is set only by the CLI. Tests leave it false, so a mocked
 * call aimed at the real project still throws before any request.
 */
export async function uploadSfxCues({ env, fetchImpl, allowProduction = false, log = () => {} }) {
  const cfg = assertUploadEnv(env);
  if ((cfg.host === PROD_HOST || cfg.url.includes(PROD_HOST)) && !allowProduction) {
    throw new Error(`Refusing ${PROD_HOST}. Run scripts/upload-sfx-storage.mjs yourself when you mean to.`);
  }
  const listRes = await fetchImpl(`${cfg.url}/rest/v1/sfx_cue?select=key,mime,md5,path&order=key.asc`, {
    headers: authHeaders(cfg.key, { accept: "application/json" }),
  });
  if (!listRes.ok) throw new Error(`list sfx_cue ${listRes.status}`);
  const rows = await listRes.json();
  if (!Array.isArray(rows)) throw new Error("sfx_cue listing was not a list");

  const summary = { uploaded: 0, skipped: 0, patched: 0, empty: 0 };
  for (const row of rows) {
    const key = String(row?.key || "");
    if (!key) continue;
    const one = await fetchImpl(
      `${cfg.url}/rest/v1/sfx_cue?key=eq.${encodeURIComponent(key)}&select=bytes,mime,md5,path`,
      { headers: authHeaders(cfg.key, { accept: "application/json" }) },
    );
    if (!one.ok) throw new Error(`read ${key} ${one.status}`);
    const body = await one.json();
    const rec = Array.isArray(body) ? body[0] : body;
    const bytes = decodeBytea(rec?.bytes);
    if (bytes.length < 8) {
      summary.empty += 1;
      log(`skip empty ${key}`);
      continue;
    }
    const hash = createHash("md5").update(bytes).digest("hex");
    if (rec?.md5 && String(rec.md5).toLowerCase() !== hash) {
      log(`warn ${key}: stored md5 differs from file md5, object name uses the file`);
    }
    const mime = String(rec?.mime || row.mime || "audio/mpeg");
    const objectPath = sfxObjectPath(key, hash, mime);
    const publicUrl = sfxPublicUrl(cfg.url, objectPath);
    const head = await fetchImpl(publicUrl, { method: "HEAD" });
    const pathOk = rec?.path === objectPath;
    if (head.ok && pathOk) {
      summary.skipped += 1;
      log(`skip ${key} ${objectPath}`);
      continue;
    }
    if (!head.ok) {
      const putUrl = `${cfg.url}/storage/v1/object/${SFX_BUCKET}/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
      const put = await fetchImpl(putUrl, {
        method: "POST",
        headers: authHeaders(cfg.key, {
          "content-type": mime,
          "cache-control": SFX_OBJECT_CACHE,
          "x-upsert": "true",
        }),
        body: bytes,
      });
      if (!put.ok) {
        const text = await put.text();
        throw new Error(`upload ${key} ${put.status} ${text.slice(0, 180)}`);
      }
      summary.uploaded += 1;
      log(`uploaded ${key} ${bytes.length}B -> ${objectPath}`);
    }
    if (!pathOk) {
      const patch = await fetchImpl(`${cfg.url}/rest/v1/sfx_cue?key=eq.${encodeURIComponent(key)}`, {
        method: "PATCH",
        headers: authHeaders(cfg.key, { "content-type": "application/json", prefer: "return=minimal" }),
        body: JSON.stringify({ path: objectPath }),
      });
      if (!patch.ok) throw new Error(`path ${key} ${patch.status}`);
      summary.patched += 1;
      log(`path ${key} = ${objectPath}`);
    }
  }
  return summary;
}
