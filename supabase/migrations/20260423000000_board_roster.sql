-- Board roster: the authoritative governance record of every board seat.
-- Decoupled from login `profiles` (no email/login required) so the full board
-- can be tracked even before members have portal accounts. `committee` and
-- `leadership` are stored as free text exactly as the governance spreadsheet
-- records them. An optional `profile_id` links a roster seat to a login account
-- when one exists.

CREATE TABLE public.board_roster (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name      text NOT NULL,
  last_name       text NOT NULL,
  joined_date     date,
  term_expiration date,
  term_number     integer,                 -- 1 / 2 / 3 (max 3 terms, 3 yrs each)
  committee       text,                     -- free text (e.g. "F&A", "Governance")
  leadership      text,                     -- free text (e.g. "Board Chair", "Executive")
  profile_id      uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  sort_order      integer NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_board_roster_sort ON public.board_roster (sort_order);

CREATE TRIGGER trg_board_roster_updated_at
  BEFORE UPDATE ON public.board_roster
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.board_roster ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read the roster
CREATE POLICY "Authenticated users can read board roster"
  ON public.board_roster FOR SELECT
  TO authenticated
  USING (true);

-- Officers can manage roster rows
CREATE POLICY "Officers can insert board roster"
  ON public.board_roster FOR INSERT
  TO authenticated
  WITH CHECK (public.is_officer());

CREATE POLICY "Officers can update board roster"
  ON public.board_roster FOR UPDATE
  TO authenticated
  USING (public.is_officer())
  WITH CHECK (public.is_officer());

CREATE POLICY "Officers can delete board roster"
  ON public.board_roster FOR DELETE
  TO authenticated
  USING (public.is_officer());
