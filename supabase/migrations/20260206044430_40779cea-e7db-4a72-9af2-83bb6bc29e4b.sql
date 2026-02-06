-- Sunset 8K/IPTV Panel: Migrate all providers to Trex

-- Update profiles table default
ALTER TABLE profiles ALTER COLUMN provider SET DEFAULT 'trex';

-- Migrate existing profiles from 8k or iptv to trex
UPDATE profiles SET provider = 'trex' WHERE provider = '8k' OR provider = 'iptv' OR provider IS NULL;

-- Update customers table default
ALTER TABLE customers ALTER COLUMN provider SET DEFAULT 'trex';

-- Migrate existing customers from 8k or iptv to trex
UPDATE customers SET provider = 'trex' WHERE provider = '8k' OR provider = 'iptv' OR provider IS NULL;