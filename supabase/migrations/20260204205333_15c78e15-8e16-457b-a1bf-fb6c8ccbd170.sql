-- Migration: Add Private Integration Token support for HighLevel
-- Security: Admin-only access to reseller_highlevel_settings table

-- 1. Add private_integration_token column
ALTER TABLE public.reseller_highlevel_settings
ADD COLUMN IF NOT EXISTS private_integration_token text;

-- 2. Add custom_field_mappings column (cache for HighLevel field IDs)
ALTER TABLE public.reseller_highlevel_settings
ADD COLUMN IF NOT EXISTS custom_field_mappings jsonb DEFAULT '{}'::jsonb;

-- 3. SECURITY: Drop ALL existing policies on this table
DROP POLICY IF EXISTS "Resellers and admins can view HighLevel settings" ON public.reseller_highlevel_settings;
DROP POLICY IF EXISTS "Resellers and admins can insert HighLevel settings" ON public.reseller_highlevel_settings;
DROP POLICY IF EXISTS "Resellers and admins can update HighLevel settings" ON public.reseller_highlevel_settings;
DROP POLICY IF EXISTS "Resellers and admins can delete HighLevel settings" ON public.reseller_highlevel_settings;
DROP POLICY IF EXISTS "Admins can view all HighLevel settings" ON public.reseller_highlevel_settings;
DROP POLICY IF EXISTS "Admins only - full access to HighLevel settings" ON public.reseller_highlevel_settings;
DROP POLICY IF EXISTS "Admins only - full access" ON public.reseller_highlevel_settings;

-- 4. SECURITY: Revoke ALL table access from non-admin roles
REVOKE ALL ON public.reseller_highlevel_settings FROM anon;
REVOKE ALL ON public.reseller_highlevel_settings FROM authenticated;

-- 5. Create admin-only policy (using profiles.role check)
CREATE POLICY "Admins only - full access"
ON public.reseller_highlevel_settings
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- 6. Create reseller-safe view (no token or mappings exposed)
DROP VIEW IF EXISTS public.reseller_highlevel_status;

CREATE VIEW public.reseller_highlevel_status 
WITH (security_invoker = false)
AS
SELECT 
  reseller_id,
  location_id,
  is_active,
  (private_integration_token IS NOT NULL AND private_integration_token != '') AS is_connected,
  created_at,
  updated_at
FROM public.reseller_highlevel_settings;

-- 7. Grant SELECT on view to authenticated users (resellers can see their status)
GRANT SELECT ON public.reseller_highlevel_status TO authenticated;

-- 8. Create function to get reseller's HighLevel status (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_highlevel_status(p_reseller_id uuid)
RETURNS TABLE (
  reseller_id uuid,
  location_id text,
  is_active boolean,
  is_connected boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    reseller_highlevel_settings.reseller_id,
    reseller_highlevel_settings.location_id,
    reseller_highlevel_settings.is_active,
    (reseller_highlevel_settings.private_integration_token IS NOT NULL AND reseller_highlevel_settings.private_integration_token != '') AS is_connected
  FROM public.reseller_highlevel_settings
  WHERE reseller_highlevel_settings.reseller_id = p_reseller_id
  LIMIT 1;
$$;

-- 9. Add comments for documentation
COMMENT ON COLUMN public.reseller_highlevel_settings.private_integration_token 
IS 'HighLevel Private Integration Token. Admin-only access.';

COMMENT ON COLUMN public.reseller_highlevel_settings.custom_field_mappings 
IS 'Cached HighLevel custom field key->id mappings. Reset on token/location change.';

COMMENT ON VIEW public.reseller_highlevel_status 
IS 'Read-only view for resellers. Does not expose token or mappings.';

COMMENT ON FUNCTION public.get_highlevel_status 
IS 'Security definer function for resellers to check their HL connection status.';