-- Refresh committee_memberships write policies to guarantee they reference the
-- current is_officer() (which includes chair, vice_chair, secretary, treasurer,
-- staff). This is a safety re-apply: earlier migration-history repair on the
-- DC SCORES project left some policy SQL un-run, so we recreate them explicitly.

DROP POLICY IF EXISTS "Officers can insert memberships" ON public.committee_memberships;
DROP POLICY IF EXISTS "Officers can update memberships" ON public.committee_memberships;
DROP POLICY IF EXISTS "Officers can delete memberships" ON public.committee_memberships;

CREATE POLICY "Officers can insert memberships"
  ON public.committee_memberships FOR INSERT
  TO authenticated
  WITH CHECK (public.is_officer());

CREATE POLICY "Officers can update memberships"
  ON public.committee_memberships FOR UPDATE
  TO authenticated
  USING (public.is_officer())
  WITH CHECK (public.is_officer());

CREATE POLICY "Officers can delete memberships"
  ON public.committee_memberships FOR DELETE
  TO authenticated
  USING (public.is_officer());
