-- Message reactions (emoji responses to messages)
CREATE TABLE public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, profile_id, emoji)
);

-- Index for fetching all reactions on a message
CREATE INDEX idx_message_reactions_message_id ON public.message_reactions(message_id);

-- Enable RLS
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- SELECT: user can see reactions on messages in conversations they belong to
CREATE POLICY "Members can view reactions"
  ON public.message_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE m.id = message_reactions.message_id
        AND cm.profile_id = auth.uid()
    )
  );

-- INSERT: user can add reactions to messages in their conversations
CREATE POLICY "Members can add reactions"
  ON public.message_reactions FOR INSERT
  WITH CHECK (
    profile_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE m.id = message_reactions.message_id
        AND cm.profile_id = auth.uid()
    )
  );

-- DELETE: user can remove only their own reactions
CREATE POLICY "Members can remove own reactions"
  ON public.message_reactions FOR DELETE
  USING (profile_id = auth.uid());

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
