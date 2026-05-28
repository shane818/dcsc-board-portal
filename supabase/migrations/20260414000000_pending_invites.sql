-- Option A: pending invites become referenceable pre-login.
--
-- When an officer invites someone, an Edge Function pre-creates a Google-less
-- auth user. The handle_new_user trigger then creates a profile immediately —
-- marked invite_pending = true — so the person can be added to committees,
-- tagged in attendance, set as an agenda presenter, and named in minutes
-- BEFORE they ever log in. When they sign in with Google (same verified email),
-- the identity links to the waiting account and invite_pending flips to false.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS invite_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

COMMENT ON COLUMN public.profiles.invite_pending IS
  'True when the profile was pre-created from an invite and the person has not yet logged in. Flips to false on first login.';

-- Update handle_new_user: mark invite_pending = true when created from an invite.
-- (Pre-creation happens at invite time via admin.createUser, so a matching invite
--  means this is a pending pre-provisioned profile, not a direct login.)
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
  v_from_invite     boolean := false;
BEGIN
  -- Safety net: if a profile with this email already exists (e.g. identity
  -- linking edge case), do nothing — never create a duplicate.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE email = NEW.email) THEN
    RETURN NEW;
  END IF;

  -- Check if there's a pending invite for this email
  SELECT id, role, full_name, phone, term_start_date, job_title
    INTO v_invite_id, v_role, v_name, v_phone, v_term_start_date, v_job_title
  FROM public.board_invites
  WHERE email = NEW.email
  LIMIT 1;

  v_from_invite := v_invite_id IS NOT NULL;

  -- Fall back to Google metadata for name if not in invite
  IF v_name IS NULL THEN
    v_name := COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      NEW.email
    );
  END IF;

  INSERT INTO public.profiles (
    id, email, full_name, role, avatar_url, phone, term_start_date, job_title, invite_pending
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_name,
    v_role,
    NEW.raw_user_meta_data ->> 'avatar_url',
    v_phone,
    v_term_start_date,
    v_job_title,
    v_from_invite   -- pending only when pre-created from an invite
  );

  -- Delete the invite after it's been used
  IF v_invite_id IS NOT NULL THEN
    DELETE FROM public.board_invites WHERE id = v_invite_id;
  END IF;

  RETURN NEW;
END;
$$;
