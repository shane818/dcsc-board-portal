-- "Requires committee approval" — a second, independent approval/vote on an
-- agenda item, distinct from the existing board vote (requires_approval).

-- 1. Flag on agenda_items
ALTER TABLE public.agenda_items
  ADD COLUMN IF NOT EXISTS requires_committee_approval boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.agenda_items.requires_committee_approval IS
  'When true, the item needs a committee-level approval vote (separate from the board vote flagged by requires_approval).';

-- 2. Scope motions so an item can hold one board motion AND one committee motion.
ALTER TABLE public.agenda_item_motions
  ADD COLUMN IF NOT EXISTS vote_scope text NOT NULL DEFAULT 'board';

-- Replace the single-motion-per-item constraint with one-per-(item,scope).
-- The original UNIQUE was created inline on agenda_item_id; drop by its
-- auto-generated name, then add the scoped unique.
ALTER TABLE public.agenda_item_motions
  DROP CONSTRAINT IF EXISTS agenda_item_motions_agenda_item_id_key;
ALTER TABLE public.agenda_item_motions
  ADD CONSTRAINT agenda_item_motions_item_scope_key UNIQUE (agenda_item_id, vote_scope);

-- 3. Scope roll calls the same way.
ALTER TABLE public.agenda_item_roll_calls
  ADD COLUMN IF NOT EXISTS vote_scope text NOT NULL DEFAULT 'board';

ALTER TABLE public.agenda_item_roll_calls
  DROP CONSTRAINT IF EXISTS agenda_item_roll_calls_agenda_item_id_profile_id_key;
ALTER TABLE public.agenda_item_roll_calls
  ADD CONSTRAINT agenda_item_roll_calls_item_profile_scope_key
  UNIQUE (agenda_item_id, profile_id, vote_scope);
