
-- Add provider column to customers table
ALTER TABLE public.customers 
ADD COLUMN provider text DEFAULT '8k' CHECK (provider IN ('8k', 'trex'));

-- Create index for provider column for better query performance
CREATE INDEX idx_customers_provider ON public.customers(provider);

-- Insert system settings for Trex provider
INSERT INTO public.system_settings (id, value, description) VALUES
('trex_api_key', '', 'Trex IPTV API key for user provisioning'),
('trex_panel_url', 'https://trex.example.com/api/api.php', 'Trex IPTV panel URL for API calls'),
('trex_default_package_id', '14826', 'Default Trex IPTV package ID for new accounts'),
('trex_trial_daily_limit', '10', 'Daily trial limit for Trex provider'),
('8k_trial_daily_limit', '50', 'Daily trial limit for 8K provider (existing default)');

-- Create table to track daily trial limits per provider
CREATE TABLE public.daily_trial_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('8k', 'trex')),
  date date NOT NULL DEFAULT CURRENT_DATE,
  trial_count integer NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(provider, date)
);

-- Add RLS policies for daily_trial_limits
ALTER TABLE public.daily_trial_limits ENABLE ROW LEVEL SECURITY;

-- Policy to allow reading trial limits (for checking limits)
CREATE POLICY "Allow reading daily trial limits" 
  ON public.daily_trial_limits 
  FOR SELECT 
  USING (true);

-- Policy to allow inserting/updating trial limits (for tracking)
CREATE POLICY "Allow managing daily trial limits" 
  ON public.daily_trial_limits 
  FOR ALL 
  USING (true);

-- Create trigger to update updated_at column
CREATE TRIGGER update_daily_trial_limits_updated_at
  BEFORE UPDATE ON public.daily_trial_limits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
