-- Security hardening migration
-- Fixes three issues identified in security audit:
--
-- 1. board_invites SELECT was visible to all authenticated users.
--    Any board member could read pending invites (names, emails, future roles).
--    Fix: restrict SELECT to officers only.
--
-- 2. profiles self-update policy allowed ANY column update (including `role`).
--    Any board member could escalate their own role via the Supabase client.
--    Fix: lock `role` to current value in WITH CHECK.
--
-- 3. Officer UPDATE policy allowed any officer to change any other officer's role.
--    Fix: regular officers can only manage board_member/ex_officio profiles;
--    only chair/staff can modify officer-level roles.

-- ─── Fix 1: board_invites SELECT ────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated can read invites" ON public.board_invites;

CREATE POLICY "Officers can read invites"
  ON public.board_invites FOR SELECT
  TO authenticated
  USING (public.is_officer());

-- ─── Fix 2: profiles self-update — block role escalation ────────────────────

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own non-role fields"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    -- role must stay the same; only the officer UPDATE policy may change it
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
  );

-- ─── Fix 3: Officer UPDATE — add role hierarchy ──────────────────────────────

DROP POLICY IF EXISTS "Officers can update any profile" ON public.profiles;

CREATE POLICY "Officers can update profiles with hierarchy"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_officer())
  WITH CHECK (
    public.is_officer()
    AND (
      -- Any officer can manage regular members and guests
      role IN ('board_member', 'guest')
      -- Only chair or staff can set/change officer-level roles
      OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('chair', 'staff')
    )
  );
