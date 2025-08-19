-- Fix UFC events to have correct dates and start times for today (2025-08-19)
UPDATE sports_ppv_updates 
SET 
  content = REPLACE(REPLACE(content, 'start:2025-08-20 01:55:00', 'start:2025-08-19 01:55:00'), 'stop:2025-08-20 05:00:00', 'stop:2025-08-19 05:00:00'),
  content = REPLACE(REPLACE(content, 'start:2025-08-20 04:55:00', 'start:2025-08-19 04:55:00'), 'stop:2025-08-20 07:00:00', 'stop:2025-08-19 07:00:00'),
  channel_info = jsonb_set(
    jsonb_set(
      channel_info,
      '{0,time}',
      '"2025-08-19 01:55:00"'
    ),
    '{1,time}',
    '"2025-08-19 04:55:00"'
  )
WHERE id = 'a7bc3eb2-2348-4c44-be25-d5691dc7b2b9';