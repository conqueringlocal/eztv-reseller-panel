-- Update existing UFC events to be categorized as UFC instead of PPV
UPDATE sports_ppv_updates 
SET sport_category = 'UFC'
WHERE (content ILIKE '%UFC%' OR content ILIKE '%DANA WHITE%' OR content ILIKE '%CONTENDER SERIES%')
AND sport_category = 'PPV';