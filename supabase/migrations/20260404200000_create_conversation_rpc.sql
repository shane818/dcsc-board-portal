-- RPC to create a conversation + add members atomically.
-- SECURITY DEFINER bypasses RLS so the creator can always insert.
-- Auth check is manual: created_by must equal auth.uid().

CREATE OR REPLACE FUNCTION public.create_conversation(
  p_name        text,
  p_member_ids  uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id uuid;
  v_uid     uuid := auth.uid();
  v_member  uuid;
BEGIN
  -- Enforce auth
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Insert the conversation
  INSERT INTO public.conversations (name, created_by)
  VALUES (p_name, v_uid)
  RETURNING id INTO v_conv_id;

  -- Add all members (creator + selected)
  FOREACH v_member IN ARRAY p_member_ids LOOP
    INSERT INTO public.conversation_members (conversation_id, profile_id)
    VALUES (v_conv_id, v_member)
    ON CONFLICT (conversation_id, profile_id) DO NOTHING;
  END LOOP;

  RETURN v_conv_id;
END;
$$;

-- Allow authenticated users to call this function
GRANT EXECUTE ON FUNCTION public.create_conversation(text, uuid[]) TO authenticated;
