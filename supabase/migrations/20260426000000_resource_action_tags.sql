-- Action tags on board resources, and a link from action items back to the
-- source resource. Lets officers tag a board document "To Do" / "To Vote" /
-- "To Review"; to-do/review docs can spawn an action item (manual flow), and
-- to-vote docs surface in a "Needs a Vote" list.

CREATE TYPE public.resource_action_tag AS ENUM ('to_do', 'to_vote', 'to_review');

ALTER TABLE public.board_resources
  ADD COLUMN IF NOT EXISTS action_tag public.resource_action_tag;

COMMENT ON COLUMN public.board_resources.action_tag IS
  'Optional action label on a document: to_do / to_vote / to_review. Null = untagged.';

-- Link an action item back to the board resource it was created from.
ALTER TABLE public.action_items
  ADD COLUMN IF NOT EXISTS source_resource_id uuid
    REFERENCES public.board_resources(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.action_items.source_resource_id IS
  'If this action item was created from a tagged board resource, points back to it.';
