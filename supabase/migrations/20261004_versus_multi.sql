-- VERSUS: 3-4 seat duel rooms (TRIPLE THREAT, FANTASTIC FOUR) on the existing duel_rooms table.
--
-- NOT applied automatically: this file lives outside migrations/ on purpose (scripts/migrate.mjs and the
-- PGLite preview only read migrations/*.sql). Apply it by hand to the Supabase project that serves
-- duel_rooms (SQL editor / `supabase db push`) after review.
--
-- Backward compatible: every column is added with a default, the 2-seat columns and the
-- host_out / guest_out phases are untouched, so 2-seat rooms (and older clients) keep working
-- before and after this migration. 3-4 seat rooms need it (the client only writes these columns for them).
--
-- Seat columns: seat 0 = host_*, seat 1 = guest_*, seat 2 = p3_*, seat 3 = p4_*.
-- <seat>_name holds "name|ante|net|seen" like host_name / guest_name. <seat>_out marks a forfeited seat
-- (its have is pinned at need); a 3-4 seat room is finished when every seat that is not out has played
-- need spins, or only one seat is left standing.

ALTER TABLE duel_rooms
  ADD COLUMN IF NOT EXISTS players INT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS host_out BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guest_out BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS p3_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS p3_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS p3_have INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS p3_out BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS p4_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS p4_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS p4_have INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS p4_out BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'duel_rooms_players_check') THEN
    ALTER TABLE duel_rooms ADD CONSTRAINT duel_rooms_players_check CHECK (players BETWEEN 2 AND 4);
  END IF;
END $$;

-- Rollback (manual):
-- ALTER TABLE duel_rooms DROP CONSTRAINT IF EXISTS duel_rooms_players_check,
--   DROP COLUMN IF EXISTS players, DROP COLUMN IF EXISTS host_out, DROP COLUMN IF EXISTS guest_out,
--   DROP COLUMN IF EXISTS p3_name, DROP COLUMN IF EXISTS p3_score, DROP COLUMN IF EXISTS p3_have, DROP COLUMN IF EXISTS p3_out,
--   DROP COLUMN IF EXISTS p4_name, DROP COLUMN IF EXISTS p4_score, DROP COLUMN IF EXISTS p4_have, DROP COLUMN IF EXISTS p4_out;
