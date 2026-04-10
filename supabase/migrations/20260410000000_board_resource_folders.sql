-- Add folder support to board_resources
-- Folders have is_folder = true and drive_url is optional
-- Resources can belong to a folder via parent_id

ALTER TABLE public.board_resources
  ADD COLUMN IF NOT EXISTS is_folder boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.board_resources(id) ON DELETE SET NULL;

-- Allow drive_url to be nullable (folders don't need a URL)
ALTER TABLE public.board_resources ALTER COLUMN drive_url DROP NOT NULL;

-- Index for querying children of a folder
CREATE INDEX IF NOT EXISTS idx_board_resources_parent_id ON public.board_resources(parent_id);
