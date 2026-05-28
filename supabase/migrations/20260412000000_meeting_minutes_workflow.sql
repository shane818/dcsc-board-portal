-- Phase 1 of the structured minutes workflow:
--   1. Meeting format (in_person / virtual / hybrid)
--   2. Adjournment timestamp
--   3. Guest attendees (presenters who aren't registered users)
--   4. Junction table for linking pending draft minutes to a future meeting

-- 1. Meeting format enum
CREATE TYPE public.meeting_format AS ENUM ('in_person', 'virtual', 'hybrid');

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS meeting_format public.meeting_format,
  ADD COLUMN IF NOT EXISTS adjourned_at timestamptz;

COMMENT ON COLUMN public.meetings.meeting_format IS
  'How the meeting was conducted; used in minutes header';
COMMENT ON COLUMN public.meetings.adjourned_at IS
  'Timestamp when meeting was adjourned; used in minutes footer';

-- 2. Guest attendees: one-off presenters/staff who are not registered portal users
CREATE TABLE IF NOT EXISTS public.guest_attendees (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id      uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  full_name       text NOT NULL,
  title           text,
  organization    text,
  attendance_mode public.attendance_mode NOT NULL DEFAULT 'in_person',
  added_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guest_attendees_meeting_id
  ON public.guest_attendees(meeting_id);

ALTER TABLE public.guest_attendees ENABLE ROW LEVEL SECURITY;

-- SELECT: any signed-in board member can see guest attendees
CREATE POLICY "Members can view guest attendees"
  ON public.guest_attendees FOR SELECT
  TO authenticated
  USING (true);

-- INSERT/UPDATE/DELETE: only officers can manage guest attendees
CREATE POLICY "Officers can manage guest attendees"
  ON public.guest_attendees FOR ALL
  TO authenticated
  USING (public.is_officer())
  WITH CHECK (public.is_officer());

COMMENT ON TABLE public.guest_attendees IS
  'Non-portal-user presenters/staff who attended a meeting; appear in minutes attendance section';

-- 3. Junction: link draft minutes from past meetings to a future meeting for review
CREATE TABLE IF NOT EXISTS public.meeting_minutes_for_review (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewing_meeting_id  uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  minutes_id            uuid NOT NULL REFERENCES public.meeting_minutes(id) ON DELETE CASCADE,
  added_by              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reviewing_meeting_id, minutes_id)
);

CREATE INDEX IF NOT EXISTS idx_minutes_review_reviewing
  ON public.meeting_minutes_for_review(reviewing_meeting_id);
CREATE INDEX IF NOT EXISTS idx_minutes_review_minutes
  ON public.meeting_minutes_for_review(minutes_id);

ALTER TABLE public.meeting_minutes_for_review ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view minutes-for-review links"
  ON public.meeting_minutes_for_review FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Officers can manage minutes-for-review links"
  ON public.meeting_minutes_for_review FOR ALL
  TO authenticated
  USING (public.is_officer())
  WITH CHECK (public.is_officer());

COMMENT ON TABLE public.meeting_minutes_for_review IS
  'Links pending draft minutes from past meetings to a future meeting (e.g., July meeting reviews May+June drafts)';

-- 4. Approved Minutes folder placeholder in board_resources
-- Inserted only if not already present. parent_id is NULL (root level).
-- Officers can rename or move it later.
INSERT INTO public.board_resources (title, description, drive_url, category, is_folder, parent_id)
SELECT
  'Approved Minutes',
  'PDF archive of all approved board meeting minutes',
  NULL,
  'Governance',
  true,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.board_resources
  WHERE title = 'Approved Minutes' AND is_folder = true AND parent_id IS NULL
);
