-- Delete the two failed NCAAF parsing entries that only have 1 channel
DELETE FROM sports_ppv_updates 
WHERE id IN ('94f835f3-c2b5-4ad1-b218-7c7b3c06b484', '146e783d-7b1a-4a29-a935-75787f790d92');