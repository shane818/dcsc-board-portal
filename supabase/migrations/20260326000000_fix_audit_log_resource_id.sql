-- Fix: resource_id must be text, not uuid.
-- Google Drive file IDs and other external resource IDs are strings, not UUIDs.
ALTER TABLE public.audit_log ALTER COLUMN resource_id TYPE text;
