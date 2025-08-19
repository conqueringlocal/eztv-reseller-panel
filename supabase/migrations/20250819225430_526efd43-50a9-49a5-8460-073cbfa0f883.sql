-- Update existing Paramount+ events to correct category and parse individual events
UPDATE sports_ppv_updates 
SET 
  sport_category = 'PARAMOUNT+',
  channel_info = '[
    {"game": "English Football League: Luton Town vs Wigan Athletic", "time": "Aug 19 2:35 PM", "channel": "Paramount+ 01"},
    {"game": "English Football League: AFC Wimbledon vs Cardiff City", "time": "Aug 19 2:35 PM", "channel": "Paramount+ 02"},
    {"game": "UEFA Champions League: Rangers vs Club Brugge", "time": "Aug 19 2:50 PM", "channel": "Paramount+ 03"},
    {"game": "UEFA Champions League: Ferencváros vs Qarabağ FK", "time": "Aug 19 2:50 PM", "channel": "Paramount+ 04"},
    {"game": "UEFA Champions League: Crvena Zvezda vs Pafos", "time": "Aug 19 2:50 PM", "channel": "Paramount+ 05"},
    {"game": "English Football League: Walsall vs Grimsby Town", "time": "Aug 19 2:50 PM", "channel": "Paramount+ 06"},
    {"game": "Concacaf W Champions Cup: Alianza Women FC vs Washington Spirit", "time": "Aug 19 7:50 PM", "channel": "Paramount+ 07"},
    {"game": "Concacaf W Champions Cup: CF Pachuca vs Chorrillo FC", "time": "Aug 19 9:50 PM", "channel": "Paramount+ 08"},
    {"game": "", "time": "", "channel": "US | PARAMOUNT+ PPV"}
  ]'::jsonb
WHERE id = '6baa366b-4896-4f2e-9f3e-57baaa2cf7fe';