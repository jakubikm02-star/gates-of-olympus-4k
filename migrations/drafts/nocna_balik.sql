-- DRAFT. Not applied. migrations/ is scanned non-recursively, and this file
-- lives in drafts/ so `npm run db:migrate` does not run it.
-- Martin has to say yes before this becomes a real migration.
--
-- The night-shift deck name ("balík") is local today (localStorage p4k.nocna.dielna).
-- Showing it next to a board nick needs a column. No backfill: old rows stay null
-- and the board keeps printing the nick alone until a client sends the name.

alter table public.board_player add column if not exists balik text;

alter table public.board_player drop constraint if exists board_player_balik_len;
alter table public.board_player
  add constraint board_player_balik_len check (balik is null or char_length(balik) between 1 and 18);
