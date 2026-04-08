-- Allow officers and meeting creators to delete meetings
CREATE POLICY "Officers and creators can delete meetings"
  ON public.meetings FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('chair', 'vice_chair', 'secretary', 'treasurer', 'staff')
    )
  );
