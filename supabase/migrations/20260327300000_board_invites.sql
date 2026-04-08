-- Pending invites: officers pre-register members with a role before they sign in.
-- When the user signs in via Google, the handle_new_user trigger checks this table.

CREATE TABLE public.board_invites (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text UNIQUE NOT NULL,
  full_name  text NOT NULL,
  role       public.board_role NOT NULL DEFAULT 'board_member',
  invited_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.board_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Officers can manage invites"
  ON public.board_invites FOR ALL
  TO authenticated
  USING (public.is_officer())
  WITH CHECK (public.is_officer());

CREATE POLICY "Authenticated can read invites"
  ON public.board_invites FOR SELECT
  TO authenticated
  USING (true);

-- Update the handle_new_user trigger to check invites for pre-assigned role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_role public.board_role := 'board_member';
  v_name text;
  v_invite_id uuid;
BEGIN
  -- Check if there's a pending invite for this email
  SELECT id, role, full_name INTO v_invite_id, v_role, v_name
  FROM public.board_invites
  WHERE email = NEW.email
  LIMIT 1;

  -- Use invite name if available, otherwise fall back to Google metadata
  IF v_name IS NULL THEN
    v_name := COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      NEW.email
    );
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    v_name,
    v_role,
    NEW.raw_user_meta_data ->> 'avatar_url'
  );

  -- Delete the invite after it's been used
  IF v_invite_id IS NOT NULL THEN
    DELETE FROM public.board_invites WHERE id = v_invite_id;
  END IF;

  RETURN NEW;
END;
$$;
