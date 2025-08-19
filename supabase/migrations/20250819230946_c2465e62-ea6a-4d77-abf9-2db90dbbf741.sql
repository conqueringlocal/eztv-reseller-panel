-- Update existing FloRacing events to correct category and parse individual events
UPDATE sports_ppv_updates 
SET 
  sport_category = 'FLO RACING',
  channel_info = '[
    {"game": "PBR RidePass", "time": "Aug 19 5:00 PM", "channel": "Flo Racing 01"},
    {"game": "FloRacing 24 7", "time": "Aug 19 4:00 AM", "channel": "Flo Racing 02"},
    {"game": "", "time": "", "channel": "US | FLO RACING PPV"}
  ]'::jsonb
WHERE content ILIKE '%flo racing%' AND id = '0cfe71bb-02d3-4c2e-b01e-4742f0ad8aef';