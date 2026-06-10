-- Decouple admin access from the 'staff' role.
--
-- Previously, role = 'staff' automatically granted full officer/admin access.
-- Now admin access is: board officer role OR an explicit is_admin = true flag.
-- This lets you add a staff member WITHOUT automatically making them an admin.
--
-- Board officers (chair, vice_chair, secretary, treasurer) are always admins by
-- virtue of their role. The is_admin flag is what elevates anyone else (staff,
-- board_member, etc.) to admin.

-- 1. Flag
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_admin IS
  'Grants admin/officer-level access independent of role. Board officer roles are always admin regardless of this flag.';

-- 2. Preserve current behavior: existing staff keep their admin access.
UPDATE public.profiles
SET is_admin = true
WHERE role = 'staff';

-- 3. Update is_officer() to honor the flag (officer role OR is_admin).
--    Staff is no longer hardcoded — staff get access only via is_admin.
CREATE OR REPLACE FUNCTION public.is_officer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND is_active = true
      AND (
        role IN ('chair', 'vice_chair', 'secretary', 'treasurer')
        OR is_admin = true
      )
  );
$$;

-- Note: is_board_officer() (restricted committees) intentionally stays
-- role-only — being granted is_admin does NOT let staff into a restricted
-- committee. Only true board officer roles manage restricted committees.
