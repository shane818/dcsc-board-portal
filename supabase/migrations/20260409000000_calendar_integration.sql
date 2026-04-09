-- Add Google Calendar event link column to meetings
-- gcal_event_id already exists (reserved); this adds the human-readable URL
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS gcal_event_link text;

COMMENT ON COLUMN public.meetings.gcal_event_id IS
  'Google Calendar event ID returned by the Calendar API';
COMMENT ON COLUMN public.meetings.gcal_event_link IS
  'Direct link to view the Google Calendar event (htmlLink from Calendar API)';
