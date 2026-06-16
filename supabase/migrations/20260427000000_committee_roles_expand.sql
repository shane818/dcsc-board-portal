-- Expand committee_role enum with vice_chair / at_large / other, plus a free-text
-- override column for "Other…" custom labels.
-- Note: Postgres requires new enum values to commit before they can be used, so
-- keep these ALTER TYPE statements free of any same-file DML that references them.
ALTER TYPE public.committee_role ADD VALUE IF NOT EXISTS 'vice_chair';
ALTER TYPE public.committee_role ADD VALUE IF NOT EXISTS 'at_large';
ALTER TYPE public.committee_role ADD VALUE IF NOT EXISTS 'other';

-- Free-text label used when role = 'other' (null for preset roles).
ALTER TABLE public.committee_memberships ADD COLUMN IF NOT EXISTS role_label text;
