-- Fix RLS policy for credit_logs to allow resellers to insert their own logs
DROP POLICY "Admins can insert credit logs" ON credit_logs;

-- Allow resellers to insert credit logs for themselves and their sub-resellers
CREATE POLICY "Resellers can insert credit logs for themselves and sub-resellers" 
ON credit_logs 
FOR INSERT 
WITH CHECK (
  -- Reseller can insert logs for themselves
  reseller_id = auth.uid() 
  OR 
  -- Or for their sub-resellers
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = credit_logs.reseller_id 
    AND profiles.parent_reseller_id = auth.uid()
  )
  OR
  -- Or admins can insert any logs
  is_admin()
);