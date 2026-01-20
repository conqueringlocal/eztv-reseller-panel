-- Clean up orphaned Rinda Bentley record (6f67b1c2-4446-4e23-9c49-ccf596750d72)
-- First delete renewal_transactions
DELETE FROM renewal_transactions 
WHERE customer_id = '6f67b1c2-4446-4e23-9c49-ccf596750d72';

-- Update credit_logs to reference the correct target consolidated customer
UPDATE credit_logs 
SET customer_id = 'c6205997-c75d-4921-8a1d-9f14dc34ac33',
    customer_name = 'Rinda2 Bentley has 3 connections',
    notes = COALESCE(notes, '') || ' (Merged from Rinda Bentley)'
WHERE customer_id = '6f67b1c2-4446-4e23-9c49-ccf596750d72';

-- Now delete the orphaned customer record
DELETE FROM customers 
WHERE id = '6f67b1c2-4446-4e23-9c49-ccf596750d72';