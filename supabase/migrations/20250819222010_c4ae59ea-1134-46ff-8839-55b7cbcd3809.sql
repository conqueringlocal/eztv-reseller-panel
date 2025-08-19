-- Update existing DIRTVISION events from PPV to DIRTVISION category
UPDATE public.sports_ppv_updates 
SET sport_category = 'DIRTVISION'
WHERE sport_category = 'PPV' 
AND (
  content ILIKE '%DIRTVISION%' 
  OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(channel_info) AS elem
    WHERE elem->>'channel' ILIKE '%DIRTVISION%'
  )
);