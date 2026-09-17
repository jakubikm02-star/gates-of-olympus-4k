-- Per-player slot wallet, pity meters, and ranked progression.
create table if not exists slot_saves (
  user_id      text primary key,
  balance      double precision not null,
  bet_index    integer not null default 4,
  muted        boolean not null default false,
  turbo        boolean not null default false,
  quick        boolean not null default false,
  ante         boolean not null default false,
  best_win     double precision not null default 0,
  pity_by_bet  text not null default '{}',
  rp           integer not null default 0,
  rank_peak    integer not null default 0,
  rank_shield  boolean not null default false,
  updated_at   timestamptz not null default now()
);
