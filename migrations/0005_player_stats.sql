-- 0005_player_stats.sql
-- WRITE ONLY — do not apply from automation. User runs this in Supabase SQL editor before deploy.
-- Lifetime personal statistics for Parkizmus (player_stats + stats_* RPCs).

create table if not exists public.player_stats (
  player_id  text primary key check (char_length(player_id) between 8 and 64 and player_id ~ '^[A-Za-z0-9-]+$'),
  v          int  not null default 1,
  stats      jsonb not null default '{}'::jsonb check (pg_column_size(stats) < 32768),
  since      timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.player_stats enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.player_stats from anon, authenticated;
  end if;
end $$;

-- Merge two stats jsonb blobs: c/hi = greatest per key; lo/first = least; hours/weekdays element-wise greatest.
create or replace function public.stats_merge(a jsonb, b jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  out jsonb := coalesce(a, '{}'::jsonb);
  bk text;
  bv jsonb;
  ak jsonb;
  av numeric;
  bv_num numeric;
  i int;
  hours_a jsonb;
  hours_b jsonb;
  hours_o jsonb := '[]'::jsonb;
  days_a jsonb;
  days_b jsonb;
  days_o jsonb := '[]'::jsonb;
  rec jsonb := '{}'::jsonb;
begin
  if b is null then
    return out;
  end if;

  -- counters
  for bk, bv in select key, value from jsonb_each(coalesce(b->'c', '{}'::jsonb)) loop
    av := coalesce((out->'c'->>bk)::numeric, 0);
    bv_num := coalesce((bv)::text::numeric, 0);
    out := jsonb_set(out, array['c', bk], to_jsonb(greatest(av, bv_num)), true);
  end loop;

  -- highs
  for bk, bv in select key, value from jsonb_each(coalesce(b->'hi', '{}'::jsonb)) loop
    av := coalesce((out->'hi'->>bk)::numeric, 0);
    bv_num := coalesce((bv)::text::numeric, 0);
    out := jsonb_set(out, array['hi', bk], to_jsonb(greatest(av, bv_num)), true);
  end loop;

  -- lows
  for bk, bv in select key, value from jsonb_each(coalesce(b->'lo', '{}'::jsonb)) loop
    if out->'lo' ? bk then
      av := (out->'lo'->>bk)::numeric;
      bv_num := coalesce((bv)::text::numeric, 0);
      out := jsonb_set(out, array['lo', bk], to_jsonb(least(av, bv_num)), true);
    else
      out := jsonb_set(out, array['lo', bk], bv, true);
    end if;
  end loop;

  -- firsts (earliest timestamp wins)
  for bk, bv in select key, value from jsonb_each(coalesce(b->'first', '{}'::jsonb)) loop
    if out->'first' ? bk then
      av := (out->'first'->>bk)::numeric;
      bv_num := coalesce((bv)::text::numeric, 0);
      out := jsonb_set(out, array['first', bk], to_jsonb(least(av, bv_num)), true);
    else
      out := jsonb_set(out, array['first', bk], bv, true);
    end if;
  end loop;

  -- recipes: prefer side with higher companion hi
  rec := coalesce(out->'rec', '{}'::jsonb);
  for bk, bv in select key, value from jsonb_each(coalesce(b->'rec', '{}'::jsonb)) loop
    av := coalesce((out->'hi'->>bk)::numeric, 0);
    bv_num := coalesce((b->'hi'->>bk)::numeric, 0);
    if bv_num > av or (bv_num = av and (not (rec ? bk) or rec->bk = 'null'::jsonb)) then
      rec := jsonb_set(rec, array[bk], bv, true);
    end if;
  end loop;
  out := jsonb_set(out, '{rec}', rec, true);

  -- hours[24]
  hours_a := coalesce(out->'hours', '[]'::jsonb);
  hours_b := coalesce(b->'hours', '[]'::jsonb);
  hours_o := '[]'::jsonb;
  for i in 0..23 loop
    av := coalesce((hours_a->>i)::numeric, 0);
    bv_num := coalesce((hours_b->>i)::numeric, 0);
    hours_o := hours_o || to_jsonb(greatest(av, bv_num));
  end loop;
  out := jsonb_set(out, '{hours}', hours_o, true);

  -- weekdays[7]
  days_a := coalesce(out->'weekdays', '[]'::jsonb);
  days_b := coalesce(b->'weekdays', '[]'::jsonb);
  days_o := '[]'::jsonb;
  for i in 0..6 loop
    av := coalesce((days_a->>i)::numeric, 0);
    bv_num := coalesce((days_b->>i)::numeric, 0);
    days_o := days_o || to_jsonb(greatest(av, bv_num));
  end loop;
  out := jsonb_set(out, '{weekdays}', days_o, true);

  -- since / updatedAt
  if (b ? 'since') then
    if (out ? 'since') then
      out := jsonb_set(out, '{since}', to_jsonb(least((out->>'since')::numeric, (b->>'since')::numeric)), true);
    else
      out := jsonb_set(out, '{since}', b->'since', true);
    end if;
  end if;
  if (b ? 'updatedAt') then
    out := jsonb_set(out, '{updatedAt}', to_jsonb(greatest(coalesce((out->>'updatedAt')::numeric, 0), coalesce((b->>'updatedAt')::numeric, 0))), true);
  end if;
  out := jsonb_set(out, '{v}', '1'::jsonb, true);
  return out;
end;
$$;

create or replace function public.stats_put(p_id text, p_stats jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_id is null or p_id !~ '^[A-Za-z0-9-]{8,64}$' then
    raise exception 'id';
  end if;
  if pg_column_size(p_stats) > 32768 then
    raise exception 'size';
  end if;
  insert into player_stats as s (player_id, stats, since, v)
  values (
    p_id,
    p_stats,
    case
      when (p_stats ? 'since') then to_timestamp((p_stats->>'since')::bigint / 1000.0)
      else now()
    end,
    1
  )
  on conflict (player_id) do update
    set stats = public.stats_merge(s.stats, excluded.stats),
        updated_at = now(),
        since = least(s.since, excluded.since);
end;
$$;

create or replace function public.stats_get(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select stats from player_stats where player_id = p_id
$$;

create or replace function public.stats_drop(p_id text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from player_stats where player_id = p_id
$$;

do $$
begin
  -- Preview PGLite has no Supabase roles. Production already does; grants stay.
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.stats_put(text, jsonb) to anon, authenticated;
    grant execute on function public.stats_get(text) to anon, authenticated;
    grant execute on function public.stats_drop(text) to anon, authenticated;
  end if;
end $$;

-- Optional retention: drop rows idle 180 days (run via cron later).
-- delete from public.player_stats where updated_at < now() - interval '180 days';
