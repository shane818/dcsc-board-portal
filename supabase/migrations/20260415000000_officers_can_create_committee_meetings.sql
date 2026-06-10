-- Officers should be able to create meetings for any committee,
-- not just ones they are personally a member of.
-- Previous policy blocked officers from creating committee meetings
-- unless they were a committee member themselves.

DROP POLICY IF EXISTS "Authenticated users can create meetings" ON public.meetings;

CREATE POLICY "Authenticated users can create meetings"
  ON public.meetings FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_officer()
    OR (committee_id IS NOT NULL AND public.is_committee_member(committee_id))
  );
