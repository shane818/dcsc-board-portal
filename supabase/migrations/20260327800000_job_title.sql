-- Optional position/title for any member, most useful for staff roles
-- e.g. "Executive Director", "Chief Operating Officer"
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS job_title text;
