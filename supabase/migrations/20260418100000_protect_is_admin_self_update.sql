-- Security: prevent users from granting themselves admin via self-update.
-- The existing self-update policy blocks role changes but not is_admin, which
-- would otherwise let any authenticated user escalate to admin by setting
-- is_admin = true on their own profile. Lock is_admin to its current value in
-- the self-update path; only officers (via their separate policy) may change it.

DROP POLICY IF EXISTS "Users can update their own non-role fields" ON public.profiles;

CREATE POLICY "Users can update their own non-role fields"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    -- role and is_admin must stay the same; only officer policy may change them
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
    AND is_admin = (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
  );
