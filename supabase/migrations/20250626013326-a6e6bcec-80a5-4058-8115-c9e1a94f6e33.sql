
-- Add parent_reseller_id column to profiles table to establish hierarchy
ALTER TABLE public.profiles 
ADD COLUMN parent_reseller_id UUID REFERENCES public.profiles(id);

-- Add reseller_level column to track the level in hierarchy
ALTER TABLE public.profiles 
ADD COLUMN reseller_level INTEGER DEFAULT 1 CHECK (reseller_level >= 1);

-- Create index for better performance on hierarchy queries
CREATE INDEX idx_profiles_parent_reseller_id ON public.profiles(parent_reseller_id);
CREATE INDEX idx_profiles_reseller_level ON public.profiles(reseller_level);

-- Update existing resellers to be level 1 (direct admin-created resellers)
UPDATE public.profiles 
SET reseller_level = 1 
WHERE role = 'reseller' AND parent_reseller_id IS NULL;

-- Add RLS policy to ensure resellers can only see their own sub-resellers
CREATE POLICY "Resellers can view their sub-resellers" 
ON public.profiles 
FOR SELECT 
USING (
  auth.uid() = id OR 
  parent_reseller_id = auth.uid() OR
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- Function to check if a reseller is level 1 (can purchase credits)
CREATE OR REPLACE FUNCTION public.can_purchase_credits(reseller_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT reseller_level = 1 
  FROM public.profiles 
  WHERE id = reseller_id AND role = 'reseller';
$$;

-- Function to get reseller hierarchy path
CREATE OR REPLACE FUNCTION public.get_reseller_path(reseller_id UUID)
RETURNS TABLE(id UUID, name TEXT, level INTEGER)
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  WITH RECURSIVE reseller_hierarchy AS (
    -- Base case: start with the given reseller
    SELECT p.id, p.name, p.reseller_level, p.parent_reseller_id, 0 as depth
    FROM public.profiles p
    WHERE p.id = reseller_id
    
    UNION ALL
    
    -- Recursive case: get parent resellers
    SELECT p.id, p.name, p.reseller_level, p.parent_reseller_id, rh.depth + 1
    FROM public.profiles p
    INNER JOIN reseller_hierarchy rh ON p.id = rh.parent_reseller_id
    WHERE rh.depth < 10 -- Prevent infinite recursion
  )
  SELECT rh.id, rh.name, rh.reseller_level
  FROM reseller_hierarchy rh
  ORDER BY rh.depth DESC;
$$;
