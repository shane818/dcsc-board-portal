-- Restricted committees (e.g. Compensation Committee).
--
-- For a restricted committee:
--   * Staff CANNOT add/remove/modify memberships (prevents staff from granting
--     themselves access via the Admin panel).
--   * Only true board officers (chair, vice_chair, secretary, treasurer) can
--     manage its memberships.
--   * Document access (enforced in the drive Edge Function) requires explicit
--     membership — the officer/staff bypass does not apply.

-- 1. Flag
ALTER TABLE public.committees
  ADD COLUMN IF NOT EXISTS is_restricted boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.committees.is_restricted IS
  'When true, only explicit members may access docs; staff cannot self-add and cannot view unless a member.';

-- 2. Helper: board officer EXCLUDING staff
CREATE OR REPLACE FUNCTION public.is_board_officer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('chair', 'vice_chair', 'secretary', 'treasurer')
      AND is_active = true
  );
$$;

-- Helper: is a given committee restricted?
CREATE OR REPLACE FUNCTION public.committee_is_restricted(p_committee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_restricted FROM public.committees WHERE id = p_committee_id),
    false
  );
$$;

-- Helper: is the current user a member of a committee? (SECURITY DEFINER avoids
-- RLS recursion when used inside committee_memberships policies)
CREATE OR REPLACE FUNCTION public.is_member_of_committee(p_committee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.committee_memberships
    WHERE committee_id = p_committee_id
      AND profile_id = auth.uid()
  );
$$;

-- 3. Rewrite committee_memberships write policies to honor restriction.
DROP POLICY IF EXISTS "Officers can insert memberships" ON public.committee_memberships;
DROP POLICY IF EXISTS "Officers can update memberships" ON public.committee_memberships;
DROP POLICY IF EXISTS "Officers can delete memberships" ON public.committee_memberships;

-- INSERT: restricted committees require a non-staff board officer; others allow any officer (incl staff)
CREATE POLICY "Officers can insert memberships"
  ON public.committee_memberships FOR INSERT
  TO authenticated
  WITH CHECK (
    CASE
      WHEN public.committee_is_restricted(committee_id) THEN public.is_board_officer()
      ELSE public.is_officer()
    END
  );

CREATE POLICY "Officers can update memberships"
  ON public.committee_memberships FOR UPDATE
  TO authenticated
  USING (
    CASE
      WHEN public.committee_is_restricted(committee_id) THEN public.is_board_officer()
      ELSE public.is_officer()
    END
  )
  WITH CHECK (
    CASE
      WHEN public.committee_is_restricted(committee_id) THEN public.is_board_officer()
      ELSE public.is_officer()
    END
  );

CREATE POLICY "Officers can delete memberships"
  ON public.committee_memberships FOR DELETE
  TO authenticated
  USING (
    CASE
      WHEN public.committee_is_restricted(committee_id) THEN public.is_board_officer()
      ELSE public.is_officer()
    END
  );

-- 4. SELECT visibility on memberships: for restricted committees, only members
--    (or non-staff board officers) may see the member list. Others see nothing
--    for that committee. Non-restricted committees stay readable by all
--    authenticated users (preserves existing behavior).
DROP POLICY IF EXISTS "Authenticated users can read memberships" ON public.committee_memberships;

CREATE POLICY "Read memberships (restricted-aware)"
  ON public.committee_memberships FOR SELECT
  TO authenticated
  USING (
    NOT public.committee_is_restricted(committee_id)
    OR public.is_board_officer()
    OR public.is_member_of_committee(committee_id)
  );
