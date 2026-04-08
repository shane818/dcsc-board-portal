-- Add term start date to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS term_start_date date;

-- Board service history: one row per role per fiscal year per person
CREATE TABLE IF NOT EXISTS public.board_service_history (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fiscal_year     text NOT NULL,                        -- e.g. "2025-26"
  entry_type      text NOT NULL DEFAULT 'committee'
                    CHECK (entry_type IN ('board_officer', 'committee')),
  board_role      public.board_role,                    -- filled when entry_type = 'board_officer'
  committee_id    uuid REFERENCES public.committees(id) ON DELETE SET NULL,
  committee_role  public.committee_role,                -- filled when entry_type = 'committee'
  notes           text,
  created_at      timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.board_service_history ENABLE ROW LEVEL SECURITY;

-- All authenticated board members can read
CREATE POLICY "service_history_select"
  ON public.board_service_history FOR SELECT
  TO authenticated USING (true);

-- Officers + staff can write
CREATE POLICY "service_history_insert"
  ON public.board_service_history FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('chair','vice_chair','secretary','treasurer','staff')
    )
  );

CREATE POLICY "service_history_update"
  ON public.board_service_history FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('chair','vice_chair','secretary','treasurer','staff')
    )
  );

CREATE POLICY "service_history_delete"
  ON public.board_service_history FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('chair','vice_chair','secretary','treasurer','staff')
    )
  );

CREATE INDEX idx_service_history_profile ON public.board_service_history(profile_id);
CREATE INDEX idx_service_history_fiscal_year ON public.board_service_history(fiscal_year);
