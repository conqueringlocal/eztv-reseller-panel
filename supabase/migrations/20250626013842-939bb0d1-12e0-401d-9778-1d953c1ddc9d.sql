
-- Drop the problematic RLS policy that's causing infinite recursion
DROP POLICY IF EXISTS "Resellers can view their sub-resellers" ON public.profiles;

-- Create a security definer function to get the current user's role
-- This prevents infinite recursion by bypassing RLS when called
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT role::text FROM public.profiles WHERE id = auth.uid();
$$;

-- Create a new RLS policy using the security definer function
CREATE POLICY "Users can view allowed profiles" 
ON public.profiles 
FOR SELECT 
USING (
  auth.uid() = id OR 
  parent_reseller_id = auth.uid() OR
  public.get_current_user_role() = 'admin'
);
