
-- Fix customer data inconsistencies - Corrected Version
-- This migration addresses:
-- 1. Customers with expirationDate before startDate
-- 2. Customers with planDuration that doesn't match the actual duration
-- 3. Customers with invalid or missing timestamps

BEGIN;

-- Step 1: Fix customers where expirationDate is before startDate
-- We'll recalculate expirationDate based on startDate + planDuration
UPDATE customers 
SET expiration_date = (start_date + INTERVAL '1 month' * plan_duration)::date
WHERE expiration_date < start_date
  AND start_date IS NOT NULL 
  AND plan_duration IS NOT NULL
  AND plan_duration > 0;

-- Step 2: Fix customers where planDuration doesn't match actual duration
-- Calculate the actual duration and update planDuration accordingly
UPDATE customers 
SET plan_duration = GREATEST(1, 
  ROUND(
    EXTRACT(EPOCH FROM (expiration_date::timestamp - start_date::timestamp)) / (30.44 * 24 * 3600)
  )::INTEGER
)
WHERE start_date IS NOT NULL 
  AND expiration_date IS NOT NULL
  AND expiration_date > start_date
  AND plan_duration IS NOT NULL
  AND ABS(
    EXTRACT(EPOCH FROM (expiration_date::timestamp - start_date::timestamp)) / (30.44 * 24 * 3600) - plan_duration::numeric
  ) > 0.5; -- Only update if difference is more than 0.5 months

-- Step 3: Fix customers with NULL or invalid start_date
-- Set start_date to created_at for customers with NULL start_date
UPDATE customers 
SET start_date = created_at::date
WHERE start_date IS NULL 
  AND created_at IS NOT NULL;

-- Step 4: Fix customers with NULL expiration_date
-- Calculate expiration_date based on start_date + planDuration
UPDATE customers 
SET expiration_date = (start_date + INTERVAL '1 month' * COALESCE(plan_duration, 1))::date
WHERE expiration_date IS NULL 
  AND start_date IS NOT NULL
  AND plan_duration IS NOT NULL;

-- Step 5: Set default planDuration for customers with NULL planDuration
UPDATE customers 
SET plan_duration = 1
WHERE plan_duration IS NULL;

-- Step 6: Fix edge case where both start_date and expiration_date are NULL
-- Use created_at as start_date and add 1 month for expiration_date
UPDATE customers 
SET 
  start_date = created_at::date,
  expiration_date = (created_at + INTERVAL '1 month')::date,
  plan_duration = 1
WHERE start_date IS NULL 
  AND expiration_date IS NULL 
  AND created_at IS NOT NULL;

-- Step 7: Update customer status based on corrected expiration dates
UPDATE customers 
SET status = CASE 
  WHEN expiration_date < CURRENT_DATE THEN 'expired'
  WHEN expiration_date >= CURRENT_DATE THEN 'active'
  ELSE status
END
WHERE expiration_date IS NOT NULL
  AND status IN ('active', 'expired');

COMMIT;
