-- Extend is_officer() to include 'staff' role so that staff users (e.g.
-- Executive Director, portal administrator) have the same database-level
-- permissions as board officers. This aligns the SQL function with the
-- TypeScript hasAdminAccess() helper which already includes 'staff'.
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
      AND role IN ('chair', 'vice_chair', 'secretary', 'treasurer', 'staff')
      AND is_active = true
  );
$$;
