-- SFX bytes → public Storage bucket `sfx`. NOT auto-applied (this file lives under
-- supabase/migrations/, which the Vercel migrator does not read). Run it once in the
-- SQL editor, then scripts/upload-sfx-storage.mjs.
--
-- public.sfx_cue.bytes is intentionally kept. sfx_audio stays the fallback until
-- every row has `path` and every client knows how to read it.

insert into storage.buckets (id, name, public)
values ('sfx', 'sfx', true)
on conflict (id) do update set public = true, name = excluded.name;

update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array[
      'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/opus',
      'audio/flac', 'audio/x-flac', 'audio/wav', 'audio/wave', 'audio/x-wav',
      'audio/mp4', 'audio/aac', 'audio/webm'
    ]
where id = 'sfx';

alter table storage.objects enable row level security;

drop policy if exists "sfx_public_read" on storage.objects;
create policy "sfx_public_read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'sfx');

-- No insert / update / delete policy: anon cannot write. The upload script uses the
-- service role, which bypasses RLS.

alter table public.sfx_cue
  add column if not exists md5 text generated always as (md5(bytes)) stored;

alter table public.sfx_cue
  add column if not exists path text;

comment on column public.sfx_cue.path is
  'Object key in the public sfx bucket, versioned by content hash (key/md5.ext). Null until the upload script fills it. bytes is not dropped.';

-- CREATE OR REPLACE cannot add an OUT column, so replace the listing.
-- A missing function is a 404; the client falls back to sfx_keys for that visit.
drop function if exists public.sfx_keys2();

create function public.sfx_keys2()
  returns table(key text, mime text, v text, len integer, path text)
  language sql
  stable
  security definer
  set search_path to 'public'
as $function$
  select c.key, c.mime, c.md5, octet_length(c.bytes), c.path
  from public.sfx_cue c
  order by c.key;
$function$;

revoke all on function public.sfx_keys2() from public;
grant execute on function public.sfx_keys2() to anon, authenticated;

notify pgrst, 'reload schema';
