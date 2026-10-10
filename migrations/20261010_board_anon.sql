-- Anonymous players land on the public board as nick "Anonym".
-- A later board_nick replaces the placeholder. Empty puts still do nothing.

create or replace function public.board_put(p_id text, p_wagered numeric, p_paid numeric, p_best numeric, p_how text, p_stake numeric DEFAULT 0)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (timezone('Europe/Bratislava', now()))::date;
  how text := left(btrim(coalesce(p_how, '')), 80);
  wagered numeric := greatest(0, round(coalesce(p_wagered, 0), 2));
  paid numeric := greatest(0, round(coalesce(p_paid, 0), 2));
  best numeric := greatest(0, round(coalesce(p_best, 0), 2));
  stake numeric := greatest(0, round(coalesce(p_stake, 0), 2));
begin
  if p_id is null or char_length(p_id) < 8 or p_id !~ '^[A-Za-z0-9-]+$' then
    raise exception 'id';
  end if;
  if not exists (select 1 from public.board_player where id = p_id) then
    if wagered <= 0 and paid <= 0 and best <= 0 then
      return;
    end if;
    insert into public.board_player (id, nick)
    values (p_id, 'Anonym')
    on conflict (id) do nothing;
  end if;
  insert into public.board_day as d (player_id, day, wagered, paid, best, best_how, best_stake, best_at)
  values (p_id, today, wagered, paid, best, how, stake, case when best > 0 then now() else null end)
  on conflict (player_id, day) do update set
    wagered = greatest(d.wagered, excluded.wagered),
    paid = greatest(d.paid, excluded.paid),
    best_how = case when excluded.best > d.best and excluded.best_how <> '' then excluded.best_how else d.best_how end,
    best_stake = case when excluded.best > d.best then excluded.best_stake else d.best_stake end,
    best_at = case when excluded.best > d.best then now() else d.best_at end,
    best = greatest(d.best, excluded.best);
end;
$$;

create or replace function public.board_put2(p_id text, p_wagered numeric, p_paid numeric, p_best numeric, p_how text, p_stake numeric DEFAULT 0, p_recipe jsonb DEFAULT NULL::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (timezone('Europe/Bratislava', now()))::date;
  how text := left(btrim(coalesce(p_how, '')), 80);
  wagered numeric := greatest(0, round(coalesce(p_wagered, 0), 2));
  paid numeric := greatest(0, round(coalesce(p_paid, 0), 2));
  best numeric := greatest(0, round(coalesce(p_best, 0), 2));
  stake numeric := greatest(0, round(coalesce(p_stake, 0), 2));
  recipe jsonb := public.board_recipe_clean(p_recipe, best, stake);
begin
  if p_id is null or char_length(p_id) < 8 or char_length(p_id) > 64 or p_id !~ '^[A-Za-z0-9-]+$' then
    raise exception 'id';
  end if;
  if not exists (select 1 from public.board_player where id = p_id) then
    if wagered <= 0 and paid <= 0 and best <= 0 then
      return;
    end if;
    insert into public.board_player (id, nick)
    values (p_id, 'Anonym')
    on conflict (id) do nothing;
  end if;
  insert into public.board_day as d (player_id, day, wagered, paid, best, best_how, best_stake, best_at, best_recipe)
  values (p_id, today, wagered, paid, best, how, stake, case when best > 0 then now() else null end, case when best > 0 then recipe end)
  on conflict (player_id, day) do update set
    wagered = greatest(d.wagered, excluded.wagered),
    paid = greatest(d.paid, excluded.paid),
    best_how = case when excluded.best > d.best and excluded.best_how <> '' then excluded.best_how else d.best_how end,
    best_stake = case when excluded.best > d.best then excluded.best_stake else d.best_stake end,
    best_at = case when excluded.best > d.best then now() else d.best_at end,
    best_recipe = case when excluded.best > d.best then excluded.best_recipe else d.best_recipe end,
    best = greatest(d.best, excluded.best);
end;
$$;
