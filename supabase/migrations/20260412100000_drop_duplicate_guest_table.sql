-- Correction: the existing meeting_attendees table already supports guests
-- via attendee_category='guest' with guest_name and guest_organization.
-- The new guest_attendees table from the previous migration duplicates this.
-- Drop it and instead extend meeting_attendees with a guest_title column.

DROP TABLE IF EXISTS public.guest_attendees;

ALTER TABLE public.meeting_attendees
  ADD COLUMN IF NOT EXISTS guest_title text;

COMMENT ON COLUMN public.meeting_attendees.guest_title IS
  'Title/role for guest attendees (e.g., "Director of Operations"); only relevant when attendee_category = guest';
