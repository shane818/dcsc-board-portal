-- Fix: full admins (is_admin = true) could not edit staff or officer profiles.
--
-- The "Officers can update profiles with hierarchy" policy (security_hardening,
-- 20260407000000) restricts non-chair/staff officers to editing only
-- board_member/guest profiles. This was meant to stop a Vice Chair / Secretary /
-- Treasurer from changing *other officers' roles* — but it also blocks benign
-- edits (e.g. toggling is_admin or is_active) on staff profiles, and a blocked
-- RLS update returns no error, so the Admin page's admin-access checkbox silently
-- reverted with no feedback.
--
-- This adds is_admin holders to the elevated actor set, mirroring the app's
-- hasAdminAccess() helper (officer role OR is_admin). A full admin can now edit
-- any profile; role-change protection for regular officers is unchanged.

DROP POLICY IF EXISTS "Officers can update profiles with hierarchy" ON public.profiles;

CREATE POLICY "Officers can update profiles with hierarchy"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_officer())
  WITH CHECK (
    public.is_officer()
    AND (
      -- Any officer can manage regular members and guests
      role IN ('board_member', 'guest')
      -- Chair / staff can manage any profile (incl. officer-level roles)
      OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('chair', 'staff')
      -- Explicitly-granted full admins can manage any profile
      OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid())
    )
  );
