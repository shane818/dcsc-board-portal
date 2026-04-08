-- Meeting minutes with draft/approval workflow
CREATE TYPE public.meeting_minutes_status AS ENUM ('draft', 'approved');

CREATE TABLE public.meeting_minutes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id    uuid NOT NULL UNIQUE REFERENCES public.meetings (id) ON DELETE CASCADE,
  content       text NOT NULL DEFAULT '',
  status        public.meeting_minutes_status NOT NULL DEFAULT 'draft',
  drive_file_id text,
  drive_file_url text,
  drafted_by    uuid NOT NULL REFERENCES public.profiles (id) ON DELETE SET NULL,
  approved_by   uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  approved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.meeting_minutes IS 'Draft and approved meeting minutes with optional Google Drive backup';

-- Reuse existing updated_at trigger function
CREATE TRIGGER trg_meeting_minutes_updated_at
  BEFORE UPDATE ON public.meeting_minutes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.meeting_minutes ENABLE ROW LEVEL SECURITY;

-- SELECT: same visibility as the parent meeting
CREATE POLICY "Meeting minutes visible to meeting participants"
  ON public.meeting_minutes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id
        AND (
          m.committee_id IS NULL
          OR public.is_committee_member(m.committee_id)
          OR public.is_officer()
        )
    )
  );

-- INSERT: officers or committee chairs
CREATE POLICY "Officers and committee chairs can draft minutes"
  ON public.meeting_minutes FOR INSERT TO authenticated
  WITH CHECK (
    drafted_by = auth.uid()
    AND (
      public.is_officer()
      OR EXISTS (
        SELECT 1 FROM public.committee_memberships
        WHERE profile_id = auth.uid() AND role = 'chair'
      )
    )
  );

-- UPDATE: drafter/officers while draft; officers only after approved
CREATE POLICY "Minutes updatable by drafter or officers"
  ON public.meeting_minutes FOR UPDATE TO authenticated
  USING (
    (status = 'draft' AND (drafted_by = auth.uid() OR public.is_officer()))
    OR (status = 'approved' AND public.is_officer())
  )
  WITH CHECK (
    (status = 'draft' AND (drafted_by = auth.uid() OR public.is_officer()))
    OR (status = 'approved' AND public.is_officer())
  );

-- DELETE: officers only
CREATE POLICY "Officers can delete minutes"
  ON public.meeting_minutes FOR DELETE TO authenticated
  USING (public.is_officer());
