-- Allow uploaders and officers to delete document references.
-- Originally only SELECT/INSERT/UPDATE policies existed; without a DELETE policy,
-- all deletes are denied by RLS, which blocks the Meeting Materials UI.

CREATE POLICY "Uploaders and officers can delete document refs"
  ON public.document_references FOR DELETE
  TO authenticated
  USING (uploaded_by = auth.uid() OR public.is_officer());
