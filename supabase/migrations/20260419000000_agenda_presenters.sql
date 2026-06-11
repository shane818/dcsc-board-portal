-- Multiple presenters per agenda item (portal members + free-text guests).
--
-- Replaces the single agenda_items.presenter_id with a junction table. The old
-- column is KEPT and backfilled so deploys don't break mid-rollout; a later
-- cleanup migration can drop it once nothing reads it.

CREATE TABLE IF NOT EXISTS public.agenda_item_presenters (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_item_id uuid NOT NULL REFERENCES public.agenda_items(id) ON DELETE CASCADE,
  profile_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  guest_name     text,
  order_position integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- exactly one of profile_id / guest_name must be set
  CONSTRAINT presenter_one_of CHECK (
    (profile_id IS NOT NULL AND guest_name IS NULL)
    OR (profile_id IS NULL AND guest_name IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_agenda_item_presenters_item
  ON public.agenda_item_presenters(agenda_item_id);

ALTER TABLE public.agenda_item_presenters ENABLE ROW LEVEL SECURITY;

-- SELECT: anyone who can see the meeting (mirror agenda_item_motions read policy)
CREATE POLICY "members can read agenda presenters"
  ON public.agenda_item_presenters FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agenda_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = agenda_item_presenters.agenda_item_id
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

CREATE POLICY "officers can insert agenda presenters"
  ON public.agenda_item_presenters FOR INSERT
  TO authenticated
  WITH CHECK (public.is_officer());

CREATE POLICY "officers can update agenda presenters"
  ON public.agenda_item_presenters FOR UPDATE
  TO authenticated
  USING (public.is_officer())
  WITH CHECK (public.is_officer());

CREATE POLICY "officers can delete agenda presenters"
  ON public.agenda_item_presenters FOR DELETE
  TO authenticated
  USING (public.is_officer());

-- Backfill: one presenter row per item that currently has a presenter_id
INSERT INTO public.agenda_item_presenters (agenda_item_id, profile_id, order_position)
SELECT id, presenter_id, 0
FROM public.agenda_items
WHERE presenter_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.agenda_item_presenters p
    WHERE p.agenda_item_id = agenda_items.id
  );
