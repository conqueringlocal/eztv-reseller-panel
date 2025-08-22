-- Fix existing miscategorized WNBA updates
UPDATE sports_ppv_updates 
SET sport_category = 'WNBA' 
WHERE sport_category = 'NBA' 
AND content ILIKE '%WNBA%';