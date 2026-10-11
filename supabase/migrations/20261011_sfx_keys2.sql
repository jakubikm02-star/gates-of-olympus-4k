-- sfx_keys2: the upload listing with a content version, so clients can
--   * skip uploads that are byte-identical to the file shipped in public/sfx (served by Vercel, immutable cache),
--   * keep every other upload in Cache Storage and re-download it only when its md5 changes.
-- PROPOSED, NOT APPLIED. Until it exists the client gets a 404, remembers that for 24 h and falls back to sfx_keys.
-- The md5 is a stored generated column: computed once per upload, not per listing (sfx_cue holds ~33 MB).

alter table public.sfx_cue
  add column if not exists md5 text generated always as (md5(bytes)) stored;

create or replace function public.sfx_keys2()
  returns table(key text, mime text, v text, len integer)
  language sql
  stable security definer
  set search_path to 'public'
as $function$
  select c.key, c.mime, c.md5, octet_length(c.bytes) from public.sfx_cue c order by c.key;
$function$;

revoke all on function public.sfx_keys2() from public;
grant execute on function public.sfx_keys2() to anon, authenticated;
