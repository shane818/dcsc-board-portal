-- Fix contradictory constraint on meeting_minutes.drafted_by:
--   drafted_by uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL
-- NOT NULL + ON DELETE SET NULL conflict — deleting a member who had drafted any
-- minutes would fail the NOT NULL check, silently blocking the delete-member flow.
--
-- Preferred behavior: preserve the minutes as a historical record and let the
-- drafter reference clear when that profile is deleted. So we drop NOT NULL and
-- keep ON DELETE SET NULL. New minutes always set drafted_by on creation; this
-- only ever becomes null if the drafter's profile is later removed.
ALTER TABLE public.meeting_minutes ALTER COLUMN drafted_by DROP NOT NULL;
