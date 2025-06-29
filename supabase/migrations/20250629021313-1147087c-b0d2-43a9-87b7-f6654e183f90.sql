
-- Update the INSERT policy to allow admins to insert HighLevel settings for any reseller
DROP POLICY IF EXISTS "Resellers can insert their own HighLevel settings" ON public.reseller_highlevel_settings;

CREATE POLICY "Resellers and admins can insert HighLevel settings" 
ON public.reseller_highlevel_settings 
FOR INSERT 
WITH CHECK (
  reseller_id = auth.uid() OR 
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- Update the UPDATE policy to allow admins to update HighLevel settings for any reseller
DROP POLICY IF EXISTS "Resellers can update their own HighLevel settings" ON public.reseller_highlevel_settings;

CREATE POLICY "Resellers and admins can update HighLevel settings" 
ON public.reseller_highlevel_settings 
FOR UPDATE 
USING (
  reseller_id = auth.uid() OR 
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- Update the SELECT policy to allow admins to view HighLevel settings for any reseller
DROP POLICY IF EXISTS "Resellers can view their own HighLevel settings" ON public.reseller_highlevel_settings;

CREATE POLICY "Resellers and admins can view HighLevel settings" 
ON public.reseller_highlevel_settings 
FOR SELECT 
USING (
  reseller_id = auth.uid() OR 
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- Update the DELETE policy to allow admins to delete HighLevel settings for any reseller
DROP POLICY IF EXISTS "Resellers can delete their own HighLevel settings" ON public.reseller_highlevel_settings;

CREATE POLICY "Resellers and admins can delete HighLevel settings" 
ON public.reseller_highlevel_settings 
FOR DELETE 
USING (
  reseller_id = auth.uid() OR 
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);
