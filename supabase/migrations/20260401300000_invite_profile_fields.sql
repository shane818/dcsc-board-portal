-- Add pre-population fields to board_invites so admins can fill in profile
-- details before a director logs in for the first time.

ALTER TABLE public.board_invites
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS term_start_date date,
  ADD COLUMN IF NOT EXISTS job_title text;

-- Update handle_new_user to copy these fields into the profile on first login
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_role            public.board_role := 'board_member';
  v_name            text;
  v_invite_id       uuid;
  v_phone           text;
  v_term_start_date date;
  v_job_title       text;
BEGIN
  -- Check if there's a pending invite for this email
  SELECT id, role, full_name, phone, term_start_date, job_title
    INTO v_invite_id, v_role, v_name, v_phone, v_term_start_date, v_job_title
  FROM public.board_invites
  WHERE email = NEW.email
  LIMIT 1;

  -- Fall back to Google metadata for name if not in invite
  IF v_name IS NULL THEN
    v_name := COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      NEW.email
    );
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, avatar_url, phone, term_start_date, job_title)
  VALUES (
    NEW.id,
    NEW.email,
    v_name,
    v_role,
    NEW.raw_user_meta_data ->> 'avatar_url',
    v_phone,
    v_term_start_date,
    v_job_title
  );

  -- Delete the invite after it's been used
  IF v_invite_id IS NOT NULL THEN
    DELETE FROM public.board_invites WHERE id = v_invite_id;
  END IF;

  RETURN NEW;
END;
$$;
