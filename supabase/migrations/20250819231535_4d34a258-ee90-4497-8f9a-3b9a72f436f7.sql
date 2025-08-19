-- Update existing MILB events to correct category and parse individual events
UPDATE sports_ppv_updates 
SET 
  sport_category = 'MILB',
  channel_info = '[
    {"game": "Hub City Spartanburgers vs Greenville Drive", "time": "Aug 19 1:35 PM", "channel": "Milb 01"},
    {"game": "Altoona Curve vs Reading Fightin Phils", "time": "Aug 19 6:00 PM", "channel": "Milb 02"},
    {"game": "Portland Sea Dogs vs Binghamton Rumble Ponies", "time": "Aug 19 6:00 PM", "channel": "Milb 03"},
    {"game": "Erie SeaWolves vs Harrisburg Senators", "time": "Aug 19 6:05 PM", "channel": "Milb 04"},
    {"game": "Columbus Clippers vs Omaha Storm Chasers", "time": "Aug 19 6:15 PM", "channel": "Milb 05"},
    {"game": "Palm Beach Cardinals vs St. Lucie Mets", "time": "Aug 19 6:30 PM", "channel": "Milb 06"},
    {"game": "Clearwater Threshers vs Jupiter Hammerheads", "time": "Aug 19 6:30 PM", "channel": "Milb 07"},
    {"game": "Lakeland Flying Tigers vs Dunedin Blue Jays", "time": "Aug 19 6:30 PM", "channel": "Milb 08"},
    {"game": "Winston-Salem Dash vs Wilmington Blue Rocks", "time": "Aug 19 6:30 PM", "channel": "Milb 09"},
    {"game": "Bradenton Marauders vs Daytona Tortugas", "time": "Aug 19 6:30 PM", "channel": "Milb 10"},
    {"game": "Salem Red Sox vs Carolina Mudcats", "time": "Aug 19 6:35 PM", "channel": "Milb 11"},
    {"game": "Akron RubberDucks vs New Hampshire Fisher Cats", "time": "Aug 19 6:35 PM", "channel": "Milb 12"},
    {"game": "Buffalo Bisons vs Scranton-Wilkes-Barre RailRiders", "time": "Aug 19 6:35 PM", "channel": "Milb 13"},
    {"game": "Jersey Shore BlueClaws vs Hudson Valley Renegades", "time": "Aug 19 6:35 PM", "channel": "Milb 14"},
    {"game": "Syracuse Mets vs Indianapolis Indians", "time": "Aug 19 6:35 PM", "channel": "Milb 15"},
    {"game": "Norfolk Tides vs Charlotte Knights", "time": "Aug 19 6:35 PM", "channel": "Milb 16"},
    {"game": "Asheville Tourists vs Rome Emperors", "time": "Aug 19 6:35 PM", "channel": "Milb 17"},
    {"game": "West Michigan Whitecaps vs Lansing Lugnuts", "time": "Aug 19 6:35 PM", "channel": "Milb 18"},
    {"game": "Somerset Patriots vs Hartford Yard Goats", "time": "Aug 19 6:35 PM", "channel": "Milb 19"},
    {"game": "Chesapeake Baysox vs Richmond Flying Squirrels", "time": "Aug 19 6:35 PM", "channel": "Milb 20"},
    {"game": "Fredericksburg Nationals vs Fayetteville Woodpeckers", "time": "Aug 19 6:35 PM", "channel": "Milb 21"},
    {"game": "Rochester Red Wings vs Toledo Mud Hens", "time": "Aug 19 6:45 PM", "channel": "Milb 22"},
    {"game": "Worcester Red Sox vs Jacksonville Jumbo Shrimp", "time": "Aug 19 6:45 PM", "channel": "Milb 23"},
    {"game": "", "time": "", "channel": "US | MILB VIP PPV"}
  ]'::jsonb
WHERE content ILIKE '%milb%' AND id = '1eff74ae-7d0a-4ffc-b405-c778859ff2fd';