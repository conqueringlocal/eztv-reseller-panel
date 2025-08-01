-- First, update all existing resellers to use 'trex' provider
UPDATE public.profiles 
SET provider = 'trex' 
WHERE role = 'reseller' AND (provider = '8k' OR provider IS NULL);

-- Update system default to trex
INSERT INTO public.system_settings (id, value, description) 
VALUES ('default_provider', 'trex', 'Default IPTV provider for new resellers') 
ON CONFLICT (id) DO UPDATE SET value = 'trex';