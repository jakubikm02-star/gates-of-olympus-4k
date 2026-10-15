/**
 * One-off uploader. Does nothing on import.
 *
 *   SUPABASE_URL=https://<project>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role> \
 *   SFX_UPLOAD_CONFIRM=yes \
 *   node scripts/upload-sfx-storage.mjs
 *
 * Run the SQL in supabase/migrations/20261015_sfx_storage.sql first.
 * Safe to re-run: an object that already exists at key/md5.ext is left in place.
 */
import { pathToFileURL } from "node:url";
import { uploadSfxCues } from "./sfx-storage.mjs";

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invoked) {
  uploadSfxCues({
    env: process.env,
    fetchImpl: globalThis.fetch,
    allowProduction: true,
    log: (m) => console.log(m),
  })
    .then((summary) => {
      console.log(`done uploaded=${summary.uploaded} skipped=${summary.skipped} patched=${summary.patched} empty=${summary.empty}`);
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
