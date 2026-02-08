-- Add low credit alert columns to profiles table
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS low_credit_threshold integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS low_credit_alert_cooldown_hours integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS last_low_credit_alert_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS admin_highlevel_contact_id text NULL;

-- Create admin_highlevel_settings table (single-row, nullable credentials)
CREATE TABLE IF NOT EXISTS public.admin_highlevel_settings (
  id text PRIMARY KEY DEFAULT 'admin',
  private_integration_token text NULL,
  location_id text NULL,
  is_active boolean NOT NULL DEFAULT false,
  custom_field_mappings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS using is_admin() function
ALTER TABLE public.admin_highlevel_settings ENABLE ROW LEVEL SECURITY;

-- Admin-only full access policy
CREATE POLICY "Admins only - full access" 
  ON public.admin_highlevel_settings
  FOR ALL 
  USING (is_admin());