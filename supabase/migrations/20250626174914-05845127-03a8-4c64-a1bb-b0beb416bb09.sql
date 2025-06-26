
-- First, let's identify and fix the customers with swapped device_type and plan_duration values
-- We'll look for customers where device_type contains numeric values (plan durations)
-- and plan_duration is 1 (which should be device types)

-- Step 1: Update customers where device_type contains numeric plan duration values
-- and plan_duration is 1 (indicating they were swapped)
UPDATE customers 
SET 
  device_type = CASE 
    WHEN plan_duration = 1 AND device_type ~ '^[0-9]+$' THEN 'Smart TV'
    ELSE device_type
  END,
  plan_duration = CASE 
    WHEN plan_duration = 1 AND device_type ~ '^[0-9]+$' THEN CAST(device_type AS INTEGER)
    ELSE plan_duration
  END
WHERE 
  plan_duration = 1 
  AND device_type ~ '^[0-9]+$'  -- device_type contains only numbers
  AND CAST(device_type AS INTEGER) BETWEEN 1 AND 60;  -- reasonable plan duration range

-- Step 2: Handle any remaining edge cases where device_type might contain other numeric values
-- but plan_duration is not 1 (less common scenario)
UPDATE customers 
SET 
  device_type = 'Smart TV',
  plan_duration = CASE 
    WHEN device_type ~ '^[0-9]+$' AND CAST(device_type AS INTEGER) BETWEEN 1 AND 60 
    THEN CAST(device_type AS INTEGER)
    ELSE plan_duration
  END
WHERE 
  device_type ~ '^[0-9]+$'  -- device_type contains only numbers
  AND CAST(device_type AS INTEGER) BETWEEN 1 AND 60  -- reasonable plan duration
  AND device_type != CAST(plan_duration AS TEXT);  -- avoid unnecessary updates

-- Step 3: Verify the corrections by showing a summary of the changes
-- This is just for verification, no actual changes
SELECT 
  'Summary of corrections' as description,
  COUNT(*) as total_affected_customers
FROM customers 
WHERE 
  device_type = 'Smart TV' 
  AND plan_duration BETWEEN 1 AND 60
  AND created_at >= CURRENT_DATE - INTERVAL '30 days';  -- Recent customers likely affected by bulk import
