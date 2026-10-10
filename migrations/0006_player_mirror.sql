-- Encrypted player-save bridge between parkizmus.vercel.app and gates-of-olympus-4k.vercel.app.
-- The blob is AES-GCM ciphertext. The key never leaves the two browsers.
-- anon can call the RPCs but cannot read the table.

create table if not exists public.player_mirror (
  player_id  text primary key check (char_length(player_id) between 8 and 64 and player_id ~ '^[A-Za-z0-9-]+$'),
  blob       text not null check (char_length(blob) between 16 and 48000),
  updated_at timestamptz not null default now()
);

alter table public.player_mirror enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.player_mirror from anon, authenticated;
  end if;
end $$;

create or replace function public.mirror_put(p_id text, p_blob text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_id is null or p_id !~ '^[A-Za-z0-9-]{8,64}$' then
    raise exception 'id';
  end if;
  if p_blob is null or char_length(p_blob) < 16 or char_length(p_blob) > 48000 then
    raise exception 'size';
  end if;
  insert into public.player_mirror (player_id, blob)
  values (p_id, p_blob)
  on conflict (player_id) do update
    set blob = excluded.blob,
        updated_at = now();
end;
$$;

create or replace function public.mirror_get(p_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select blob from public.player_mirror where player_id = p_id
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.mirror_put(text, text) to anon, authenticated;
    grant execute on function public.mirror_get(text) to anon, authenticated;
  end if;
end $$;
