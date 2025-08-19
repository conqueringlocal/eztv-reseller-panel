-- Update existing UEFA events to correct category and parse individual events
UPDATE sports_ppv_updates 
SET 
  sport_category = 'UEFA',
  channel_info = '[
    {"game": "Crvena zvesda vs Pafos", "time": "8:00pm", "channel": "UEFA 01"},
    {"game": "Ferencvaros vs Qarabag", "time": "8:00pm", "channel": "UEFA 02"},
    {"game": "Rangers vs Club Brugge", "time": "8:00pm", "channel": "UEFA 03"},
    {"game": "", "time": "", "channel": "US | UEFA PPV"}
  ]'::jsonb
WHERE content ILIKE '%uefa%' AND id = '08558487-8c40-47c0-be95-6fef6fc82864';