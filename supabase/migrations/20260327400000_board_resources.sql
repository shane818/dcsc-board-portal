-- Board resources: reference links to important Drive files (bylaws, roster, orientation, etc.)
CREATE TABLE public.board_resources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text,
  drive_url   text NOT NULL,
  category    text NOT NULL DEFAULT 'General',
  sort_order  integer NOT NULL DEFAULT 0,
  created_by  uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_board_resources_updated_at
  BEFORE UPDATE ON public.board_resources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.board_resources ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "Authenticated users can read board resources"
  ON public.board_resources FOR SELECT
  TO authenticated
  USING (true);

-- Officers can manage
CREATE POLICY "Officers can insert board resources"
  ON public.board_resources FOR INSERT
  TO authenticated
  WITH CHECK (public.is_officer());

CREATE POLICY "Officers can update board resources"
  ON public.board_resources FOR UPDATE
  TO authenticated
  USING (public.is_officer())
  WITH CHECK (public.is_officer());

CREATE POLICY "Officers can delete board resources"
  ON public.board_resources FOR DELETE
  TO authenticated
  USING (public.is_officer());
