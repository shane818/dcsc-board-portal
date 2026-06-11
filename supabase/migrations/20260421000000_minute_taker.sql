-- Designated minute-taker (secretary) lock on minutes.
--
-- A meeting can have a designated minute_taker_id. Only that person, plus the
-- board Chair and admins (override), may edit the draft minutes. This both
-- implements the feature and closes a hole where any meeting-viewer could edit
-- the draft content.

-- 1. Designated minute-taker on the meeting
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS minute_taker_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.meetings.minute_taker_id IS
  'Designated minute-taker for this meeting. Only this person (plus Chair/admins) can edit the draft minutes.';

-- 2. Helper: may the current user edit this meeting's minutes?
--    True if: board Chair OR admin (override), OR the designated minute-taker.
CREATE OR REPLACE FUNCTION public.can_edit_minutes(p_meeting_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND is_active = true
        AND (role = 'chair' OR is_admin = true)
    )
    OR EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = p_meeting_id
        AND m.minute_taker_id = auth.uid()
    );
$$;

-- 3. Backfill: existing meetings that already have draft minutes get their
--    drafter set as the minute-taker, so current drafters keep edit access.
UPDATE public.meetings m
SET minute_taker_id = mm.drafted_by
FROM public.meeting_minutes mm
WHERE mm.meeting_id = m.id
  AND m.minute_taker_id IS NULL
  AND mm.drafted_by IS NOT NULL;

-- 4. Replace the minutes UPDATE policy: draft edits require can_edit_minutes;
--    approved edits remain officer-only.
DROP POLICY IF EXISTS "Minutes updatable by drafter or officers" ON public.meeting_minutes;

CREATE POLICY "Minutes updatable by minute-taker or officers"
  ON public.meeting_minutes FOR UPDATE TO authenticated
  USING (
    (status = 'draft' AND public.can_edit_minutes(meeting_id))
    OR (status = 'approved' AND public.is_officer())
  )
  WITH CHECK (
    (status = 'draft' AND public.can_edit_minutes(meeting_id))
    OR (status = 'approved' AND public.is_officer())
  );
