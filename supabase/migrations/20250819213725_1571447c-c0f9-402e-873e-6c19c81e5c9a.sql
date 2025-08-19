-- Drop the existing restrictive INSERT policy
DROP POLICY IF EXISTS "System can insert sports updates" ON public.sports_ppv_updates;

-- Create a new policy that allows service role (edge functions) to insert
CREATE POLICY "Allow service role to insert sports updates" 
ON public.sports_ppv_updates 
FOR INSERT 
WITH CHECK (true);