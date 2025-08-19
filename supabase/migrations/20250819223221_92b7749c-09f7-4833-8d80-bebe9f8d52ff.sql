-- Fix UFC events to have correct dates and start times for today (2025-08-19)
UPDATE sports_ppv_updates 
SET 
  content = REPLACE(REPLACE(REPLACE(REPLACE(content, 
    'start:2025-08-20 01:55:00', 'start:2025-08-19 01:55:00'), 
    'stop:2025-08-20 05:00:00', 'stop:2025-08-19 05:00:00'), 
    'start:2025-08-20 04:55:00', 'start:2025-08-19 04:55:00'), 
    'stop:2025-08-20 07:00:00', 'stop:2025-08-19 07:00:00'),
  channel_info = '[
    {"game": "DANA WHITES CONTENDER SERIES: SEASON 9, WEEK 2", "time": "2025-08-19 01:55:00", "channel": "UFC 00"},
    {"game": "DWCS S9W2: POST-FIGHT PRESS CONFERENCE", "time": "2025-08-19 04:55:00", "channel": "UFC 01"},
    {"game": "", "time": "", "channel": "US | UFC PPV"}
  ]'::jsonb
WHERE id = 'a7bc3eb2-2348-4c44-be25-d5691dc7b2b9';