-- VERSUS odveta: the same room code plays another match. Ticks from the finished match
-- carry the old round and no longer land on the reset row.

alter table public.duel_rooms
  add column if not exists round int not null default 1;

alter table public.duel_rooms
  add column if not exists host_vote text,
  add column if not exists guest_vote text,
  add column if not exists p3_vote text,
  add column if not exists p4_vote text;

