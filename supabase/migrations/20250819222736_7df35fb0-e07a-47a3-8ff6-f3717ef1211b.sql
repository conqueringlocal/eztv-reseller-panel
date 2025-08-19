-- Update WNBA games from 8/20 to 8/19
UPDATE sports_ppv_updates 
SET game_date = '2025-08-19'
WHERE sport_category = 'WNBA' 
AND game_date = '2025-08-20';