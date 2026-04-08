-- Clear any drive_folder_id values that are not valid Google Drive IDs.
-- Valid IDs are 10+ characters of alphanumeric, dash, or underscore only.
UPDATE public.committees
SET drive_folder_id = NULL
WHERE drive_folder_id IS NOT NULL
  AND (
    length(trim(drive_folder_id)) < 10
    OR trim(drive_folder_id) !~ '^[A-Za-z0-9_\-]+$'
  );
