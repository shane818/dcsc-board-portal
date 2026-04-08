-- Allow officers to update ANY profile (role, is_active, etc.)
-- This supplements the existing "Users can update own profile" policy.
-- Postgres OR's multiple policies, so both self-update and officer-update work.
CREATE POLICY "Officers can update any profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_officer())
  WITH CHECK (public.is_officer());
