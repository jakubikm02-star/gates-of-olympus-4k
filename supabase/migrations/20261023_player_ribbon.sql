-- Daily ribbon (latest title only). Cosmetic. NOT APPLIED.
-- Martin runs this by hand in the Supabase SQL editor. Do not apply it from
-- CI, from `npm run build`, or against any database from this repo's tests.
-- One small row per player. ribbon_put rewrites the row only when the title,
-- the Bratislava day, or the nick actually changed.
--
-- Supabase stops auto-exposing new public tables on 2026-10-30. This table
-- has RLS, no policies, and no grants. anon reaches it only through the two
-- functions below, which are granted explicitly.

create table if not exists public.player_ribbon (
  player_id text primary key check (char_length(player_id) between 8 and 64 and player_id ~ '^[A-Za-z0-9-]+$'),
  nick text not null default '',
  ribbon text not null check (ribbon ~ '^[a-z0-9-]{2,24}$'),
  earned_at timestamptz not null default now(),
  day date not null
);

create index if not exists player_ribbon_day_idx on public.player_ribbon (day);

alter table public.player_ribbon enable row level security;
revoke all on table public.player_ribbon from public, anon, authenticated;

create or replace function public.ribbon_put(p_id text, p_nick text, p_ribbon text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (timezone('Europe/Bratislava', now()))::date;
  rid text := lower(btrim(coalesce(p_ribbon, '')));
  nick text := left(btrim(coalesce(p_nick, '')), 24);
begin
  if p_id is null or p_id !~ '^[A-Za-z0-9-]{8,64}$' then
    return;
  end if;
  if rid !~ '^[a-z0-9-]{2,24}$' then
    return;
  end if;
  insert into public.player_ribbon as r (player_id, nick, ribbon, earned_at, day)
  values (p_id, nick, rid, now(), today)
  on conflict (player_id) do update
    set nick = excluded.nick,
        ribbon = excluded.ribbon,
        earned_at = now(),
        day = excluded.day
    where r.day is distinct from excluded.day
       or r.ribbon is distinct from excluded.ribbon
       or r.nick is distinct from excluded.nick;
end;
$$;

create or replace function public.ribbon_today()
returns table (player_id text, nick text, ribbon text, earned_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.player_id, r.nick, r.ribbon, r.earned_at
  from public.player_ribbon r
  where r.day = (timezone('Europe/Bratislava', now()))::date;
$$;

revoke all on function public.ribbon_put(text, text, text) from public, anon, authenticated;
revoke all on function public.ribbon_today() from public, anon, authenticated;
grant execute on function public.ribbon_put(text, text, text) to anon, authenticated, service_role;
grant execute on function public.ribbon_today() to anon, authenticated, service_role;
