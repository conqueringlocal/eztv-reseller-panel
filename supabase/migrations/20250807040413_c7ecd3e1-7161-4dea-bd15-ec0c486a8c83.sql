-- Add new fields to profiles table for hybrid API configuration
ALTER TABLE public.profiles 
ADD COLUMN use_admin_api boolean DEFAULT true,
ADD COLUMN api_key text,
ADD COLUMN panel_url text;

-- Add comments for clarity
COMMENT ON COLUMN public.profiles.use_admin_api IS 'Whether this reseller uses admin API keys or their own';
COMMENT ON COLUMN public.profiles.api_key IS 'Resellers own API key when use_admin_api is false';
COMMENT ON COLUMN public.profiles.panel_url IS 'Resellers own panel URL when use_admin_api is false';