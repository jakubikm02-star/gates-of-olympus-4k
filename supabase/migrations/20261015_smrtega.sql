-- SMRŤ EGA (weekly NEKONEČNO event). NOT auto-applied: supabase/migrations/ is applied by hand after approval.
-- Prerequisites (Martin, once, in the SQL editor; the value never goes into git):
--   select vault.create_secret('<long random string>', 'smrtega_key');
-- pgcrypto lives in schema "extensions" on Supabase.

create table if not exists public.ego_week (
  week_start timestamptz primary key,
  week_end timestamptz not null,
  status text not null default 'open' check (status in ('open', 'settled', 'void')),
  winner_id text,
  settled_at timestamptz
);

create table if not exists public.ego_entry (
  week_start timestamptz not null references public.ego_week (week_start),
  player_id text not null,
  nick text not null default 'Niekto',
  fee integer not null,
  rp_start integer not null,
  rp_last integer not null,
  spins_start bigint not null default 0,
  spins_last bigint not null default 0,
  wagered_start numeric not null default 0,
  wagered_last numeric not null default 0,
  reports integer not null default 0,
  joined_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  best_score integer not null default 0,
  reached_at timestamptz not null default now(),
  claim_hash text not null,
  flags text[] not null default '{}',
  hard_flag boolean not null default false,
  primary key (week_start, player_id)
);

-- Martin's 4 moja.4ka.tv device slots. status: empty (free) | ready (key stored, unassigned) | used (key bound to an award, or awaiting removal).
create table if not exists public.ego_code (
  slot smallint primary key check (slot between 1 and 4),
  status text not null default 'empty' check (status in ('empty', 'ready', 'used')),
  code_enc bytea,
  entered_at timestamptz,
  removed_confirmed_at timestamptz
);
insert into public.ego_code (slot) values (1), (2), (3), (4) on conflict do nothing;

create table if not exists public.ego_award (
  id bigserial primary key,
  week_start timestamptz not null references public.ego_week (week_start),
  player_id text not null,
  nick text not null,
  score integer not null,
  slot smallint references public.ego_code (slot),
  status text not null default 'pending' check (status in ('pending', 'awarded', 'expired', 'revoked')),
  code_enc bytea,
  soft_flags text[] not null default '{}',
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  expires_at timestamptz,
  revealed_at timestamptz,
  revoked_at timestamptz
);
create index if not exists ego_award_player on public.ego_award (player_id, status);

create table if not exists public.ego_admin (
  player_id text primary key,
  label text
);

alter table public.ego_week enable row level security;
alter table public.ego_entry enable row level security;
alter table public.ego_code enable row level security;
alter table public.ego_award enable row level security;
alter table public.ego_admin enable row level security;
-- No policies: anon reads nothing directly; everything goes through the functions below.

create or replace function public.ego_week_start(t timestamptz default now()) returns timestamptz
language sql stable set search_path to 'public' as $$
  select (date_trunc('week', (t at time zone 'Europe/Bratislava') - interval '1 hour') + interval '1 hour')
         at time zone 'Europe/Bratislava'
$$;

create or replace function public.ego_week_end(ws timestamptz) returns timestamptz
language sql stable set search_path to 'public' as $$
  select ((ws at time zone 'Europe/Bratislava') + interval '7 days') at time zone 'Europe/Bratislava'
$$;

create or replace function public.ego_plus28(t timestamptz) returns timestamptz
language sql stable set search_path to 'public' as $$
  select ((t at time zone 'Europe/Bratislava') + interval '28 days') at time zone 'Europe/Bratislava'
$$;

create or replace function public.ego_fee(p_rp integer) returns integer
language sql immutable as $$
  select least(2500, greatest(500, (round(greatest(p_rp, 0) * 0.025 / 50.0) * 50)::integer))
$$;

create or replace function public.ego_key() returns text
language sql stable security definer set search_path to 'public' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'smrtega_key' limit 1
$$;
revoke all on function public.ego_key() from public, anon, authenticated;

-- Pick the next eligible player of a week (not admin, no hard flag, no live/pending prize, not revoked recently).
create or replace function public.ego_pick(p_week timestamptz) returns public.ego_entry
language plpgsql stable security definer set search_path to 'public' as $$
declare
  e public.ego_entry;
  n integer;
begin
  select count(*) into n from ego_entry where week_start = p_week;
  for e in
    select * from ego_entry x
    where x.week_start = p_week
    order by (x.rp_last - x.rp_start) desc, x.reached_at asc, md5(x.week_start::text || x.player_id)
  loop
    continue when exists (select 1 from ego_admin a where a.player_id = e.player_id);
    continue when e.hard_flag;
    continue when exists (select 1 from ego_award w where w.player_id = e.player_id and w.week_start = p_week);
    continue when exists (select 1 from ego_award w where w.player_id = e.player_id and w.status in ('pending', 'awarded'));
    continue when exists (select 1 from ego_award w where w.player_id = e.player_id and w.status = 'revoked'
                          and w.revoked_at > now() - interval '28 days');
    if (e.rp_last - e.rp_start) < 0 then return null; end if;
    if n = 1 and (e.rp_last - e.rp_start) < e.fee then return null; end if;
    return e;
  end loop;
  return null;
end;
$$;

-- Give a fresh award the oldest ready key, else leave it pending.
create or replace function public.ego_fill(p_award bigint, p_at timestamptz) returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  c public.ego_code;
begin
  select * into c from ego_code where status = 'ready' order by entered_at nulls last, slot limit 1 for update;
  if found then
    update ego_award set slot = c.slot, code_enc = c.code_enc, status = 'awarded',
      delivered_at = p_at, expires_at = ego_plus28(p_at)
    where id = p_award and status = 'pending';
    update ego_code set status = 'used', code_enc = null where slot = c.slot;
  end if;
end;
$$;

create or replace function public.ego_settle() returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  w public.ego_week;
  e public.ego_entry;
  aid bigint;
begin
  -- expire delivered keys
  update ego_award set status = 'expired', code_enc = null where status = 'awarded' and expires_at <= now();
  for w in select * from ego_week where status = 'open' and week_end <= now() order by week_start for update skip locked loop
    e := ego_pick(w.week_start);
    if e.player_id is null then
      update ego_week set status = 'void', settled_at = now() where week_start = w.week_start;
    else
      insert into ego_award (week_start, player_id, nick, score, soft_flags)
      values (w.week_start, e.player_id, e.nick, e.rp_last - e.rp_start, e.flags) returning id into aid;
      perform ego_fill(aid, w.week_end);
      update ego_week set status = 'settled', winner_id = e.player_id, settled_at = now() where week_start = w.week_start;
    end if;
  end loop;
  insert into ego_week (week_start, week_end) values (ego_week_start(now()), ego_week_end(ego_week_start(now())))
  on conflict do nothing;
end;
$$;

create or replace function public.ego_current(p_id text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  ws timestamptz;
  we timestamptz;
  me public.ego_entry;
  place integer;
  top jsonb;
  prize jsonb;
  leader jsonb;
  lastw jsonb;
  n integer;
begin
  perform ego_settle();
  ws := ego_week_start(now());
  we := ego_week_end(ws);
  select count(*) into n from ego_entry where week_start = ws;
  select coalesce(jsonb_agg(jsonb_build_object('nick', nick, 'score', score, 'admin', adm) order by score desc, reached_at), '[]'::jsonb)
    into top
    from (select x.nick, x.rp_last - x.rp_start as score, x.reached_at,
                 exists (select 1 from ego_admin a where a.player_id = x.player_id) as adm
          from ego_entry x where x.week_start = ws
          order by x.rp_last - x.rp_start desc, x.reached_at limit 10) t;
  select jsonb_build_object('nick', x.nick, 'score', x.rp_last - x.rp_start) into leader
    from ego_entry x where x.week_start = ws
    and not exists (select 1 from ego_admin a where a.player_id = x.player_id) and not x.hard_flag
    order by x.rp_last - x.rp_start desc, x.reached_at limit 1;
  select * into me from ego_entry where week_start = ws and player_id = p_id;
  if found then
    select count(*) + 1 into place from ego_entry x where x.week_start = ws
      and ((x.rp_last - x.rp_start) > (me.rp_last - me.rp_start)
           or ((x.rp_last - x.rp_start) = (me.rp_last - me.rp_start) and x.reached_at < me.reached_at));
  end if;
  select jsonb_build_object('status', status, 'delivered_at', delivered_at, 'expires_at', expires_at) into prize
    from ego_award where player_id = p_id and status in ('pending', 'awarded', 'revoked')
    and (status <> 'revoked' or revoked_at > now() - interval '7 days')
    order by created_at desc limit 1;
  select jsonb_build_object('nick', nick, 'score', score) into lastw from ego_award order by created_at desc limit 1;
  return jsonb_build_object(
    'week_start', ws, 'week_end', we, 'now', now(), 'players', n, 'top', top, 'leader', leader,
    'me', case when me.player_id is null then null else jsonb_build_object(
      'joined', true, 'score', me.rp_last - me.rp_start, 'place', place, 'fee', me.fee,
      'admin', exists (select 1 from ego_admin a where a.player_id = p_id)) end,
    'prize', prize, 'last_winner', lastw);
end;
$$;

create or replace function public.ego_join(p_id text, p_nick text, p_rp integer, p_spins bigint, p_wagered numeric, p_claim_hash text)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  ws timestamptz;
  f integer;
begin
  if p_id is null or length(p_id) < 8 or length(p_id) > 64 then return jsonb_build_object('ok', false, 'error', 'id'); end if;
  if p_claim_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'error', 'claim'); end if;
  perform ego_settle();
  ws := ego_week_start(now());
  f := ego_fee(p_rp);
  if p_rp < 2700 or p_rp - f < 2700 then return jsonb_build_object('ok', false, 'error', 'rank', 'fee', f); end if;
  if exists (select 1 from ego_entry where week_start = ws and player_id = p_id) then
    return jsonb_build_object('ok', false, 'error', 'joined', 'fee', f);
  end if;
  insert into ego_entry (week_start, player_id, nick, fee, rp_start, rp_last, spins_start, spins_last,
                         wagered_start, wagered_last, claim_hash, best_score, reached_at)
  values (ws, p_id, left(coalesce(nullif(btrim(p_nick), ''), 'Niekto'), 24), f, p_rp, p_rp - f,
          greatest(p_spins, 0), greatest(p_spins, 0), greatest(p_wagered, 0), greatest(p_wagered, 0),
          p_claim_hash, -f, now());
  return jsonb_build_object('ok', true, 'fee', f);
end;
$$;

create or replace function public.ego_report(p_id text, p_rp integer, p_spins bigint, p_wagered numeric) returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  ws timestamptz;
  e public.ego_entry;
  d_spins bigint;
  d_rp integer;
  fl text[];
  hard boolean;
  sc integer;
begin
  ws := ego_week_start(now());
  select * into e from ego_entry where week_start = ws and player_id = p_id for update;
  if not found then return; end if;
  d_spins := p_spins - e.spins_last;
  d_rp := p_rp - e.rp_last;
  fl := e.flags;
  hard := e.hard_flag;
  if d_spins < 0 then hard := true; fl := array_append(fl, 'spins_down'); end if;
  if d_rp > 2000 + 200 * greatest(d_spins, 0) then hard := true; fl := array_append(fl, 'rp_jump'); end if;
  if (p_spins - e.spins_start) >= 200 and (p_rp - e.rp_start)::numeric / greatest(p_spins - e.spins_start, 1) > 60
     and not ('rp_per_spin' = any (fl)) then
    fl := array_append(fl, 'rp_per_spin');
  end if;
  if hard then
    update ego_entry set hard_flag = true, flags = fl, last_at = now(), reports = reports + 1 where week_start = ws and player_id = p_id;
    return;
  end if;
  sc := p_rp - e.rp_start;
  update ego_entry set rp_last = p_rp, spins_last = p_spins, wagered_last = greatest(p_wagered, wagered_last),
    reports = reports + 1, last_at = now(), flags = fl,
    reached_at = case when sc > best_score then now() else reached_at end,
    best_score = greatest(best_score, sc)
  where week_start = ws and player_id = p_id;
end;
$$;

create or replace function public.ego_claim(p_id text, p_secret text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare
  a public.ego_award;
  h text;
begin
  perform ego_settle();
  select * into a from ego_award where player_id = p_id and status = 'awarded' and expires_at > now()
    order by created_at desc limit 1 for update;
  if not found then return jsonb_build_object('error', 'none'); end if;
  select claim_hash into h from ego_entry where week_start = a.week_start and player_id = p_id;
  if h is null or encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex') <> h then
    return jsonb_build_object('error', 'secret');
  end if;
  update ego_award set revealed_at = coalesce(revealed_at, now()) where id = a.id;
  return jsonb_build_object('code', extensions.pgp_sym_decrypt(a.code_enc, ego_key()), 'expires_at', a.expires_at, 'slot', a.slot);
end;
$$;

-- ===== admin (service_role only, called by /api/smrtega-admin after gate identity + ADMIN_EMAILS) =====

create or replace function public.ego_admin_state() returns jsonb
language plpgsql security definer set search_path to 'public' as $$
begin
  perform ego_settle();
  return jsonb_build_object(
    'slots', (select jsonb_agg(jsonb_build_object(
        'slot', c.slot, 'status', c.status, 'entered_at', c.entered_at,
        'award', (select jsonb_build_object('id', w.id, 'nick', w.nick, 'score', w.score, 'status', w.status,
                    'delivered_at', w.delivered_at, 'expires_at', w.expires_at, 'revealed_at', w.revealed_at,
                    'soft_flags', w.soft_flags)
                  from ego_award w where w.slot = c.slot order by w.created_at desc limit 1),
        'needs_removal', c.status = 'used' and not exists (
            select 1 from ego_award w where w.slot = c.slot and w.status = 'awarded')
      ) order by c.slot) from ego_code c),
    'pending', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nick', nick, 'score', score, 'soft_flags', soft_flags,
                  'created_at', created_at) order by created_at), '[]'::jsonb) from ego_award where status = 'pending'),
    'admins', (select coalesce(jsonb_agg(jsonb_build_object('player_id', player_id, 'label', label)), '[]'::jsonb) from ego_admin),
    'week', (select jsonb_build_object('week_start', week_start, 'week_end', week_end,
               'players', (select count(*) from ego_entry x where x.week_start = w.week_start))
             from ego_week w where w.week_start = ego_week_start(now())));
end;
$$;

-- Store a key in a free slot. A waiting winner gets it at once (28 days from now).
create or replace function public.ego_admin_code(p_slot smallint, p_code text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare
  k text := ego_key();
  aid bigint;
begin
  if k is null then return jsonb_build_object('ok', false, 'error', 'vault_key_missing'); end if;
  if p_code is null or length(btrim(p_code)) < 4 or length(p_code) > 64 then return jsonb_build_object('ok', false, 'error', 'code'); end if;
  if not exists (select 1 from ego_code where slot = p_slot and status = 'empty') then
    return jsonb_build_object('ok', false, 'error', 'slot_not_empty');
  end if;
  update ego_code set status = 'ready', code_enc = extensions.pgp_sym_encrypt(btrim(p_code), k), entered_at = now()
    where slot = p_slot;
  select id into aid from ego_award where status = 'pending' order by created_at limit 1 for update;
  if aid is not null then perform ego_fill(aid, now()); end if;
  return jsonb_build_object('ok', true, 'delivered', aid is not null);
end;
$$;

-- Martin removed the device in moja.4ka.tv: slot is free again (only when its key is not live).
create or replace function public.ego_confirm_removed(p_slot smallint) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
begin
  if exists (select 1 from ego_award where slot = p_slot and status = 'awarded') then
    return jsonb_build_object('ok', false, 'error', 'live');
  end if;
  update ego_code set status = 'empty', code_enc = null, removed_confirmed_at = now() where slot = p_slot and status = 'used';
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.ego_revoke(p_award bigint, p_reassign boolean) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  a public.ego_award;
  e public.ego_entry;
  nid bigint;
begin
  select * into a from ego_award where id = p_award and status in ('pending', 'awarded') for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'award'); end if;
  update ego_award set status = 'revoked', code_enc = null, revoked_at = now() where id = a.id;
  if p_reassign then
    e := ego_pick(a.week_start);
    if e.player_id is not null then
      insert into ego_award (week_start, player_id, nick, score, soft_flags)
      values (a.week_start, e.player_id, e.nick, e.rp_last - e.rp_start, e.flags) returning id into nid;
      perform ego_fill(nid, now());
    end if;
  end if;
  return jsonb_build_object('ok', true, 'next', nid);
end;
$$;

create or replace function public.ego_admin_player(p_id text, p_label text, p_on boolean) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
begin
  if p_on then
    insert into ego_admin (player_id, label) values (p_id, p_label) on conflict (player_id) do update set label = excluded.label;
  else
    delete from ego_admin where player_id = p_id;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'ego_week_start(timestamptz)', 'ego_week_end(timestamptz)', 'ego_plus28(timestamptz)', 'ego_fee(integer)',
    'ego_pick(timestamptz)', 'ego_fill(bigint,timestamptz)', 'ego_settle()',
    'ego_current(text)', 'ego_join(text,text,integer,bigint,numeric,text)', 'ego_report(text,integer,bigint,numeric)',
    'ego_claim(text,text)', 'ego_admin_state()', 'ego_admin_code(smallint,text)', 'ego_confirm_removed(smallint)',
    'ego_revoke(bigint,boolean)', 'ego_admin_player(text,text,boolean)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
grant execute on function public.ego_current(text) to anon, authenticated;
grant execute on function public.ego_join(text, text, integer, bigint, numeric, text) to anon, authenticated;
grant execute on function public.ego_report(text, integer, bigint, numeric) to anon, authenticated;
grant execute on function public.ego_claim(text, text) to anon, authenticated;

insert into public.ego_week (week_start, week_end)
values (public.ego_week_start(now()), public.ego_week_end(public.ego_week_start(now())))
on conflict do nothing;

-- Hourly settle (pg_cron 1.6 is available on the project but not enabled). Optional, ego_current settles lazily too:
-- create extension if not exists pg_cron;
-- select cron.schedule('ego_settle_hourly', '0 * * * *', $$select public.ego_settle()$$);
