-- =============================================================================
-- DCSC Board Portal — Group Messaging
-- Adds: conversations, conversation_members, messages tables
-- Supports: 1:1 DMs, named group threads, auto-created committee threads
-- Realtime: enabled on messages + conversations for live delivery
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------------

CREATE TABLE public.conversations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text,
  committee_id uuid REFERENCES public.committees (id) ON DELETE SET NULL,
  auto_created boolean NOT NULL DEFAULT false,
  created_by   uuid NOT NULL REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.conversations IS 'Thread headers for DMs, named groups, and committee threads';
COMMENT ON COLUMN public.conversations.name IS 'NULL for 1:1 DMs; set for groups and committee threads';
COMMENT ON COLUMN public.conversations.auto_created IS 'true = synced automatically from committee_memberships';

CREATE TABLE public.conversation_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  profile_id      uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  last_read_at    timestamptz NOT NULL DEFAULT now(),
  joined_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_conversation_member UNIQUE (conversation_id, profile_id)
);

COMMENT ON TABLE public.conversation_members IS 'Members per conversation; last_read_at drives unread badge';

CREATE TABLE public.messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES public.profiles (id) ON DELETE SET NULL,
  body            text NOT NULL CHECK (length(trim(body)) > 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.messages IS 'Individual messages; immutable (no UPDATE/DELETE allowed by RLS)';

-- ---------------------------------------------------------------------------
-- 2. INDEXES
-- ---------------------------------------------------------------------------

CREATE INDEX idx_conversations_committee
  ON public.conversations (committee_id)
  WHERE committee_id IS NOT NULL;

CREATE INDEX idx_conversations_updated
  ON public.conversations (updated_at DESC);

CREATE INDEX idx_conversation_members_profile
  ON public.conversation_members (profile_id);

CREATE INDEX idx_conversation_members_conversation
  ON public.conversation_members (conversation_id);

CREATE INDEX idx_messages_conversation_created
  ON public.messages (conversation_id, created_at ASC);

-- ---------------------------------------------------------------------------
-- 3. TRIGGERS
-- ---------------------------------------------------------------------------

-- Reuse existing set_updated_at() for conversations
CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Bump conversations.updated_at on every new message so the list stays sorted
CREATE OR REPLACE FUNCTION public.bump_conversation_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_messages_bump_conversation
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_conversation_updated_at();

-- Auto-create a committee conversation when a member is added to a committee.
-- Idempotent: checks for an existing conversation before inserting.
CREATE OR REPLACE FUNCTION public.sync_committee_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id        uuid;
  v_committee_name text;
BEGIN
  SELECT id INTO v_conv_id
  FROM public.conversations
  WHERE committee_id = NEW.committee_id AND auto_created = true
  LIMIT 1;

  IF v_conv_id IS NULL THEN
    SELECT name INTO v_committee_name
    FROM public.committees
    WHERE id = NEW.committee_id;

    INSERT INTO public.conversations (name, committee_id, auto_created, created_by)
    VALUES (v_committee_name, NEW.committee_id, true, NEW.profile_id)
    RETURNING id INTO v_conv_id;
  END IF;

  INSERT INTO public.conversation_members (conversation_id, profile_id)
  VALUES (v_conv_id, NEW.profile_id)
  ON CONFLICT (conversation_id, profile_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_committee_membership_sync_conversation
  AFTER INSERT ON public.committee_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_committee_conversation();

-- Remove member from committee conversation when they leave the committee
CREATE OR REPLACE FUNCTION public.remove_from_committee_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.conversation_members
  WHERE profile_id = OLD.profile_id
    AND conversation_id IN (
      SELECT id FROM public.conversations
      WHERE committee_id = OLD.committee_id AND auto_created = true
    );
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_committee_membership_remove_from_conversation
  AFTER DELETE ON public.committee_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.remove_from_committee_conversation();

-- ---------------------------------------------------------------------------
-- 4. HELPER FUNCTION
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_conversation_member(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = p_conversation_id
      AND profile_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. ENABLE RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.conversations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages             ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 6. RLS POLICIES
-- ---------------------------------------------------------------------------

-- conversations --------------------------------------------------------------

CREATE POLICY "Members can see their conversations"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (public.is_conversation_member(id));

CREATE POLICY "Active members can create conversations"
  ON public.conversations FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Members can update their conversations"
  ON public.conversations FOR UPDATE
  TO authenticated
  USING (public.is_conversation_member(id))
  WITH CHECK (public.is_conversation_member(id));

-- conversation_members -------------------------------------------------------

CREATE POLICY "Members can see conversation membership"
  ON public.conversation_members FOR SELECT
  TO authenticated
  USING (public.is_conversation_member(conversation_id));

CREATE POLICY "Conversation creator or officer can add members"
  ON public.conversation_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.created_by = auth.uid() OR public.is_officer())
    )
  );

CREATE POLICY "Members can update their own membership row"
  ON public.conversation_members FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- messages -------------------------------------------------------------------

CREATE POLICY "Members can read messages in their conversations"
  ON public.messages FOR SELECT
  TO authenticated
  USING (public.is_conversation_member(conversation_id));

CREATE POLICY "Members can send messages"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_conversation_member(conversation_id)
  );

-- No UPDATE or DELETE on messages — messages are immutable.

-- ---------------------------------------------------------------------------
-- 7. ENABLE REALTIME
-- ---------------------------------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
