-- VERSUS odveta: the same room code plays another match. Ticks from the finished match
-- carry the old round and no longer land on the reset row.

alter table public.duel_rooms
  add column if not exists round int not null default 1;
