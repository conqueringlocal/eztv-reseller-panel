-- Move LIVE EVENT entries back to PPV category, keep only actual UFC events in UFC category
UPDATE sports_ppv_updates 
SET sport_category = 'PPV'
WHERE content ILIKE '%LIVE EVENT%'
AND sport_category = 'UFC';