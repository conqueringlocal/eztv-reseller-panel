-- Update existing WNBA games to WNBA category
UPDATE public.sports_ppv_updates 
SET sport_category = 'WNBA'
WHERE (
  content ILIKE '%WNBA%' 
  OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(channel_info) AS elem
    WHERE elem->>'channel' ILIKE '%WNBA%' OR elem->>'game' ILIKE '%WNBA%'
  )
);