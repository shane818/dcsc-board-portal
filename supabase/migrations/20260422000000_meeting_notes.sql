-- Meeting Notes: an informal rich-text (HTML) working space per meeting,
-- separate from the formal minutes. One row per meeting. Edit access reuses the
-- designated-minute-taker lock (can_edit_minutes), so notes and minutes share the
-- same "who can write" rule.

CREATE TABLE IF NOT EXISTS public.meeting_notes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id   uuid NOT NULL UNIQUE REFERENCES public.meetings(id) ON DELETE CASCADE,
  content_html text NOT NULL DEFAULT '',
  updated_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_meeting_notes_updated_at
  BEFORE UPDATE ON public.meeting_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.meeting_notes ENABLE ROW LEVEL SECURITY;

-- SELECT: anyone who can see the parent meeting (mirror meeting_minutes SELECT)
CREATE POLICY "Meeting notes visible to meeting participants"
  ON public.meeting_notes FOR SELECT TO authenticated
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

-- INSERT + UPDATE: the designated minute-taker, Chair, or admins (same lock as minutes)
CREATE POLICY "Notes writable by minute-taker or officers (insert)"
  ON public.meeting_notes FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_minutes(meeting_id));

CREATE POLICY "Notes writable by minute-taker or officers (update)"
  ON public.meeting_notes FOR UPDATE TO authenticated
  USING (public.can_edit_minutes(meeting_id))
  WITH CHECK (public.can_edit_minutes(meeting_id));

-- DELETE: officers only
CREATE POLICY "Officers can delete notes"
  ON public.meeting_notes FOR DELETE TO authenticated
  USING (public.is_officer());
