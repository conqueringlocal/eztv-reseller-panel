-- Fix the existing WNBA record to properly parse individual games
UPDATE sports_ppv_updates 
SET channel_info = '[
  {"game": "Minnesota Lynx @ New York Liberty", "time": "2025-08-20 00:00:00", "channel": "WNBA 1"},
  {"game": "Atlanta Dream @ Las Vegas Aces", "time": "2025-08-20 03:00:00", "channel": "WNBA 2"},
  {"game": "Connecticut Sun @ Washington Mystics", "time": "2025-08-20 00:30:00", "channel": "WNBA 3"},
  {"game": "Phoenix Mercury @ Golden State Valkyries", "time": "2025-08-20 03:00:00", "channel": "WNBA 4"},
  {"game": "Seattle Storm @ Chicago Sky", "time": "2025-08-20 01:00:00", "channel": "WNBA 5"},
  {"game": "", "time": "", "channel": "US | WNBA PPV"},
  {"game": "", "time": "", "channel": "US | WNBA REAL PPV"},
  {"game": "", "time": "", "channel": "US | PRIME PPV"},
  {"game": "", "time": "", "channel": "US | PRIME PPV ᴿᴬᵂ"}
]'::jsonb
WHERE sport_category = 'WNBA' 
AND id = 'a3bdec9e-90c0-493e-af7a-89140f45e20c';