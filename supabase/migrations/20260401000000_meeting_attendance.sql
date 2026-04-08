-- Meeting attendance tracking

CREATE TYPE public.attendance_mode AS ENUM ('in_person', 'virtual', 'absent');
CREATE TYPE public.attendee_category AS ENUM ('board_member', 'staff', 'guest');

-- Flag for staff members who regularly attend board meetings
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_standard_attendee boolean NOT NULL DEFAULT false;

-- Meeting attendees: board members (by profile), staff, and guests
CREATE TABLE public.meeting_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  attendance_mode public.attendance_mode NOT NULL DEFAULT 'absent',
  attendee_category public.attendee_category NOT NULL,
  guest_name text,           -- only for category = 'guest'
  guest_organization text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- one record per profile per meeting; guests (profile_id IS NULL) have no unique constraint
  CONSTRAINT meeting_attendees_profile_unique UNIQUE (meeting_id, profile_id)
);

CREATE INDEX idx_meeting_attendees_meeting ON public.meeting_attendees(meeting_id);

-- Auto-update updated_at
CREATE TRIGGER meeting_attendees_updated_at
  BEFORE UPDATE ON public.meeting_attendees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.meeting_attendees ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read attendance for meetings they can see
CREATE POLICY "members can read attendance"
  ON public.meeting_attendees FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_attendees.meeting_id
        AND (
          m.committee_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.committee_memberships cm
            WHERE cm.committee_id = m.committee_id
              AND cm.profile_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('chair', 'vice_chair', 'secretary', 'treasurer', 'staff')
          )
        )
    )
  );

-- Officers and committee chairs can insert/update attendance
CREATE POLICY "officers can manage attendance"
  ON public.meeting_attendees FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('chair', 'vice_chair', 'secretary', 'treasurer', 'staff')
    )
  );

CREATE POLICY "officers can update attendance"
  ON public.meeting_attendees FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('chair', 'vice_chair', 'secretary', 'treasurer', 'staff')
    )
  );

CREATE POLICY "officers can delete attendance"
  ON public.meeting_attendees FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('chair', 'vice_chair', 'secretary', 'treasurer', 'staff')
    )
  );
