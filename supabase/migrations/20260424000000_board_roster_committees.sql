-- Board roster: support membership on MULTIPLE canonical committees.
-- The original `committee` text column kept the raw spreadsheet code (e.g. "G&S",
-- "F&A"), but those codes are combined-committee notations, not single
-- committees. Add a `committees text[]` holding the expanded canonical list so a
-- member can appear under each committee they serve on.

ALTER TABLE public.board_roster
  ADD COLUMN IF NOT EXISTS committees text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.board_roster.committees IS
  'Canonical committee names the member serves on (expanded from codes like G&S, F&A, S&A). Original code kept in `committee`.';
