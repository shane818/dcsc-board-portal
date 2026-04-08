-- Agenda item enhancements: Drive file links, board approval flag, and motion/voting

-- Extend agenda_items with new columns
ALTER TABLE public.agenda_items
  ADD COLUMN IF NOT EXISTS drive_file_url text,
  ADD COLUMN IF NOT EXISTS requires_approval boolean NOT NULL DEFAULT false;

-- Enums for voting
CREATE TYPE public.vote_type AS ENUM ('voice', 'roll_call');
CREATE TYPE public.vote_result AS ENUM ('carried', 'failed', 'tabled');
CREATE TYPE public.vote_choice AS ENUM ('yes', 'no', 'abstain');

-- One motion record per agenda item (UNIQUE on agenda_item_id)
CREATE TABLE public.agenda_item_motions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_item_id uuid NOT NULL UNIQUE REFERENCES public.agenda_items(id) ON DELETE CASCADE,
  motion_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  seconded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  vote_type public.vote_type NOT NULL DEFAULT 'voice',
  yes_count integer,
  no_count integer,
  abstain_count integer,
  result public.vote_result,
  notes text,
  recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agenda_item_motions_item ON public.agenda_item_motions(agenda_item_id);

CREATE TRIGGER agenda_item_motions_updated_at
  BEFORE UPDATE ON public.agenda_item_motions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Per-member roll call votes (only populated when vote_type = 'roll_call')
CREATE TABLE public.agenda_item_roll_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_item_id uuid NOT NULL REFERENCES public.agenda_items(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vote public.vote_choice NOT NULL,
  UNIQUE (agenda_item_id, profile_id)
);

CREATE INDEX idx_agenda_item_roll_calls_item ON public.agenda_item_roll_calls(agenda_item_id);

-- RLS for agenda_item_motions
ALTER TABLE public.agenda_item_motions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can read motions"
  ON public.agenda_item_motions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agenda_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = agenda_item_motions.agenda_item_id
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

CREATE POLICY "officers can manage motions"
  ON public.agenda_item_motions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('chair', 'vice_chair', 'secretary', 'treasurer', 'staff')
    )
  );

CREATE POLICY "officers can update motions"
  ON public.agenda_item_motions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('chair', 'vice_chair', 'secretary', 'treasurer', 'staff')
    )
  );

CREATE POLICY "officers can delete motions"
  ON public.agenda_item_motions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('chair', 'vice_chair', 'secretary', 'treasurer', 'staff')
    )
  );

-- RLS for agenda_item_roll_calls
ALTER TABLE public.agenda_item_roll_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can read roll calls"
  ON public.agenda_item_roll_calls FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agenda_items ai
      JOIN public.meetings m ON m.id = ai.meeting_id
      WHERE ai.id = agenda_item_roll_calls.agenda_item_id
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

CREATE POLICY "officers can manage roll calls"
  ON public.agenda_item_roll_calls FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('chair', 'vice_chair', 'secretary', 'treasurer', 'staff')
    )
  );

CREATE POLICY "officers can update roll calls"
  ON public.agenda_item_roll_calls FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('chair', 'vice_chair', 'secretary', 'treasurer', 'staff')
    )
  );

CREATE POLICY "officers can delete roll calls"
  ON public.agenda_item_roll_calls FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('chair', 'vice_chair', 'secretary', 'treasurer', 'staff')
    )
  );
