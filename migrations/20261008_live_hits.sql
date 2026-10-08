-- Live MASÍVNA VÝHRA pings (normal game, not VERSUS).
-- Other phones poll live_hit_poll. Rows older than 10 minutes are deleted on the next insert.

create table if not exists public.live_hits (
  id bigint generated always as identity primary key,
  player_id text not null,
  nick text not null,
  mult numeric not null,
  amount numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists live_hits_created_idx on public.live_hits (created_at desc);

alter table public.live_hits enable row level security;
revoke all on public.live_hits from anon, authenticated;

create or replace function public.live_hit_put(p_id text, p_nick text, p_mult numeric, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pid text := left(coalesce(p_id, ''), 64);
  nick text := left(btrim(coalesce(p_nick, '')), 24);
begin
  if pid !~ '^[A-Za-z0-9-]{8,64}$' then
    return;
  end if;
  if nick = '' or p_mult < 250 or p_mult > 5000 or p_amount <= 0 or p_amount > 100000000 then
    return;
  end if;
  if exists (
    select 1 from public.live_hits
    where player_id = pid and created_at > now() - interval '8 seconds'
  ) then
    return;
  end if;
  insert into public.live_hits (player_id, nick, mult, amount)
  values (pid, nick, round(p_mult, 2), round(p_amount, 2));
  delete from public.live_hits where created_at < now() - interval '10 minutes';
end;
$$;

create or replace function public.live_hit_head()
returns bigint
language sql
security definer
set search_path = public
as $$
  select coalesce(max(id), 0) from public.live_hits;
$$;

create or replace function public.live_hit_poll(p_after bigint, p_self text)
returns table (id bigint, nick text, mult numeric, amount numeric)
language sql
security definer
set search_path = public
as $$
  select h.id, h.nick, h.mult, h.amount
  from public.live_hits h
  where h.id > coalesce(p_after, 0)
    and h.player_id is distinct from left(coalesce(p_self, ''), 64)
    and h.created_at > now() - interval '45 seconds'
  order by h.id
  limit 6;
$$;

revoke all on function public.live_hit_put(text, text, numeric, numeric) from public;
revoke all on function public.live_hit_head() from public;
revoke all on function public.live_hit_poll(bigint, text) from public;
grant execute on function public.live_hit_put(text, text, numeric, numeric) to anon, authenticated;
grant execute on function public.live_hit_head() to anon, authenticated;
grant execute on function public.live_hit_poll(bigint, text) to anon, authenticated;
