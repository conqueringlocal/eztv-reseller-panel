-- Add DELETE policies for the customers table
CREATE POLICY "Admins can delete any customer" 
ON public.customers 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Resellers can delete own customers" 
ON public.customers 
FOR DELETE 
USING (reseller_id = auth.uid());