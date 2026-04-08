-- Fix conversations INSERT policy to not require is_active.
-- Any authenticated user with a profile can create a conversation.
-- is_active is a roster display flag, not an auth gate for messaging.

DROP POLICY IF EXISTS "Active members can create conversations" ON public.conversations;

CREATE POLICY "Authenticated members can create conversations"
  ON public.conversations FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
    )
  );
