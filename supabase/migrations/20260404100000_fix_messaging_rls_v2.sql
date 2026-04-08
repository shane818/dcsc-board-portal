-- Fix circular RLS dependency in messaging tables.
--
-- Problem 1: conversations INSERT checked is_active (could be false for some users).
-- Problem 2: conversation_members INSERT policy does SELECT on conversations,
--   which is blocked by conversations SELECT RLS (requires is_conversation_member),
--   creating a chicken-and-egg: creator can't prove they own the conversation
--   before they are added as a member.
--
-- Solution: simplify both policies to avoid cross-table lookups.

-- 1. conversations INSERT: any authenticated user can create, as long as they are the creator.
DROP POLICY IF EXISTS "Active members can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Authenticated members can create conversations" ON public.conversations;

CREATE POLICY "Authenticated users can create conversations"
  ON public.conversations FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- 2. conversation_members INSERT: allow creator to add themselves (and others).
--   Use SECURITY DEFINER helper to bypass conversations SELECT RLS.
DROP POLICY IF EXISTS "Conversation creator or officer can add members" ON public.conversation_members;

CREATE OR REPLACE FUNCTION public.can_add_conversation_member(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = p_conversation_id
      AND (created_by = auth.uid() OR public.is_officer())
  );
$$;

CREATE POLICY "Creator or officer can add members"
  ON public.conversation_members FOR INSERT
  TO authenticated
  WITH CHECK (public.can_add_conversation_member(conversation_id));
