-- Delete empty UFC and NFL updates that only have generic channel categories without actual events
DELETE FROM sports_ppv_updates 
WHERE sport_category IN ('UFC', 'NFL') 
AND (
  jsonb_array_length(channel_info) = 0 
  OR (
    jsonb_array_length(channel_info) = 1 
    AND channel_info->0->>'game' = '' 
    AND channel_info->0->>'time' = ''
  )
  OR (
    -- Delete updates that only have generic "US | UFC PPV" or "US | NFL PPV" type channels
    NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(channel_info) AS elem
      WHERE elem->>'game' != '' AND elem->>'game' IS NOT NULL
    )
  )
);

-- Delete incomplete DIRTVISION updates (keeping only the most recent complete one)
DELETE FROM sports_ppv_updates 
WHERE sport_category = 'DIRTVISION' 
AND id NOT IN (
  SELECT id FROM sports_ppv_updates 
  WHERE sport_category = 'DIRTVISION' 
  ORDER BY created_at DESC 
  LIMIT 1
);