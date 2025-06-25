
-- Add provider column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN provider text DEFAULT '8k' CHECK (provider IN ('8k', 'trex'));

-- Create index for provider column for better query performance
CREATE INDEX idx_profiles_provider ON public.profiles(provider);

-- Update existing profiles to have the default provider
UPDATE public.profiles SET provider = '8k' WHERE provider IS NULL;
