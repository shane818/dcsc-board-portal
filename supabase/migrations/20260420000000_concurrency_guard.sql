-- Concurrent-edit safety for action_items and agenda_items:
--   1. updated_at column (for optimistic-concurrency checks on form edits)
--   2. set_updated_at trigger (auto-maintains the column on every UPDATE)
--   3. realtime publication membership (live refresh on the meeting page)

-- 1. updated_at columns
ALTER TABLE public.action_items
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.agenda_items
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2. Reuse the existing set_updated_at() trigger function
DROP TRIGGER IF EXISTS trg_action_items_updated_at ON public.action_items;
CREATE TRIGGER trg_action_items_updated_at
  BEFORE UPDATE ON public.action_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_agenda_items_updated_at ON public.agenda_items;
CREATE TRIGGER trg_agenda_items_updated_at
  BEFORE UPDATE ON public.agenda_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 3. Add to the realtime publication so the meeting page can live-refresh.
--    Guarded so re-running doesn't error if already a member.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'action_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.action_items;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'agenda_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agenda_items;
  END IF;
END $$;
