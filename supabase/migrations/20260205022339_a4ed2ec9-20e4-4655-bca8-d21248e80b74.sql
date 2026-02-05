-- Fix: Grant table permissions back to authenticated role
-- RLS policy will restrict access to admins only

-- Grant base table permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_highlevel_settings TO authenticated;

-- RLS is enabled and "Admins only - full access" policy already exists
-- This policy ensures only admins can access any rows