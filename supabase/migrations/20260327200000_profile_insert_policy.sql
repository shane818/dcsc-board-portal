-- Allow officers to manually add profiles (pre-register board members)
CREATE POLICY "Officers can insert profiles"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (public.is_officer());
