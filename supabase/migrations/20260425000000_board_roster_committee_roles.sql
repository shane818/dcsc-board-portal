-- Board roster: per-committee role notes (Chair, Vice Chair, Representative, etc.).
-- The committees[] array records WHICH committees a member serves on; this jsonb
-- records their ROLE on each, keyed by committee name. Example:
--   {"Finance": "Chair (Treasurer)", "Executive": "Finance Representative"}

ALTER TABLE public.board_roster
  ADD COLUMN IF NOT EXISTS committee_roles jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.board_roster.committee_roles IS
  'Role per committee, keyed by committee name (e.g. {"Finance":"Chair"}). Membership list is in committees[].';
