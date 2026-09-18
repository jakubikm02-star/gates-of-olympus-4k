create table if not exists park_pool (
  id integer primary key,
  pool numeric(14, 2) not null,
  seed numeric(14, 2) not null,
  hits integer not null default 0,
  last_hit numeric(14, 2) not null default 0,
  last_hit_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into park_pool (id, pool, seed)
values (1, 2500.00, 2500.00)
on conflict (id) do nothing;
