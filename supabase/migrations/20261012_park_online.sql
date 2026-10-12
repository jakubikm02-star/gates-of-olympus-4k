-- Who has the game open. A phone checks in with its player id; the count is everyone
-- heard from in the last 50 seconds. Hidden tabs stop checking in and drop off.

create table if not exists public.park_online (
  id text primary key,
  seen timestamptz not null default now()
);

create index if not exists park_online_seen on public.park_online (seen);

alter table public.park_online enable row level security;

create or replace function public.park_online_beat(p_id text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  n integer;
begin
  if p_id is null or length(btrim(p_id)) < 8 or length(p_id) > 64 then
    return 0;
  end if;
  insert into public.park_online (id, seen)
  values (btrim(p_id), now())
  on conflict (id) do update set seen = excluded.seen;
  delete from public.park_online where seen < now() - interval '3 minutes';
  select count(*) into n from public.park_online where seen >= now() - interval '50 seconds';
  return n;
end;
$function$;

revoke all on function public.park_online_beat(text) from public;
grant execute on function public.park_online_beat(text) to anon, authenticated;
