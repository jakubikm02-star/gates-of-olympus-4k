/**
 * Public Storage layout for uploaded cues.
 * Object names are content-addressed (`<key>/<md5>.<ext>`), so the CDN can send
 * `Cache-Control: public, max-age=31536000, immutable`. A re-upload is a new name.
 * Keep this in lockstep with scripts/sfx-storage.mjs.
 */

export const SFX_BUCKET = "sfx";
/** Sent by the upload script as the object's Cache-Control. */
export const SFX_OBJECT_CACHE = "public, max-age=31536000, immutable";

const OBJECT_PATH = /^[a-zA-Z0-9][a-zA-Z0-9_-]*\/[a-f0-9]{8,64}\.(mp3|ogg|flac|wav|m4a|webm)$/;

const EXT: readonly [string, string][] = [
  ["flac", ".flac"],
  ["ogg", ".ogg"],
  ["opus", ".ogg"],
  ["wav", ".wav"],
  ["mp4", ".m4a"],
  ["m4a", ".m4a"],
  ["aac", ".m4a"],
  ["webm", ".webm"],
];

export function extForMime(mime: string): string {
  const m = (mime || "").toLowerCase();
  for (const [needle, ext] of EXT) if (m.includes(needle)) return ext;
  return ".mp3";
}

/** Versioned object key inside the `sfx` bucket. */
export function sfxObjectPath(key: string, md5: string, mime: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, "");
  const hash = md5.toLowerCase().replace(/[^a-f0-9]/g, "");
  if (!safe || hash.length < 8) throw new Error(`bad object name for ${key}`);
  return `${safe}/${hash}${extForMime(mime)}`;
}

/** Public CDN URL. No apikey: the bucket is world-readable and the GET stays cacheable. */
export function sfxPublicUrl(supaUrl: string, objectPath: string): string {
  const base = supaUrl.replace(/\/$/, "");
  const encoded = objectPath.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${SFX_BUCKET}/${encoded}`;
}

/**
 * Path the client may fetch. Rejects anything that is not the versioned object name,
 * and rejects a path whose hash is not the listing's `v` (admin re-upload: fall back
 * to sfx_audio until the script copies the new bytes).
 */
export function storagePathForRow(row: { path?: string; v?: string }): string | null {
  const path = typeof row.path === "string" ? row.path.trim() : "";
  if (!OBJECT_PATH.test(path)) return null;
  if (row.v) {
    const hash = row.v.toLowerCase();
    if (!/^[a-f0-9]{8,64}$/.test(hash)) return null;
    if (!path.toLowerCase().includes(`/${hash}.`)) return null;
  }
  return path;
}
