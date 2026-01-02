-- Fix existing Trex trial accounts that are missing package_id
UPDATE customers 
SET package_id = '27228'
WHERE is_trial = true 
  AND provider = 'trex'
  AND (package_id IS NULL OR package_id = '');