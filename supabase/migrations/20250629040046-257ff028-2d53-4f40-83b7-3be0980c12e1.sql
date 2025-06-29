
-- Update customers table to support consolidated multi-connection records
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS total_connections INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS connection_list JSONB DEFAULT '[]'::jsonb;

-- Update existing customers to have proper total_connections value
UPDATE public.customers 
SET total_connections = max_connections 
WHERE total_connections IS NULL;

-- Create an index for better performance on customer groups
CREATE INDEX IF NOT EXISTS idx_customers_group_consolidated ON public.customers(customer_group, reseller_id, total_connections);

-- Add a function to consolidate customer connections - ENHANCED VERSION
CREATE OR REPLACE FUNCTION public.consolidate_customer_connections(
  customer_group_name TEXT,
  reseller_id_param UUID
) RETURNS TABLE(
  consolidated_customer_id UUID,
  total_connections INTEGER,
  connection_details JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  primary_customer RECORD;
  connection_data JSONB := '[]'::jsonb;
  total_conn INTEGER := 0;
BEGIN
  -- Get the primary customer (first one created in the group)
  SELECT * INTO primary_customer
  FROM public.customers
  WHERE customer_group = customer_group_name 
  AND reseller_id = reseller_id_param
  ORDER BY connection_sequence ASC
  LIMIT 1;
  
  IF primary_customer.id IS NULL THEN
    RETURN;
  END IF;
  
  -- Build connection details from all customers in the group
  SELECT 
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'connection_number', connection_sequence,
        'username', username,
        'password', password,
        'm3u_url', m3u_url,
        'status', status,
        'device_type', device_type,
        'mac_address', mac_address
      ) ORDER BY connection_sequence
    ), '[]'::jsonb),
    COUNT(*)::INTEGER
  INTO connection_data, total_conn
  FROM public.customers
  WHERE customer_group = customer_group_name 
  AND reseller_id = reseller_id_param;
  
  -- Update the primary customer with consolidated data
  UPDATE public.customers
  SET 
    name = REGEXP_REPLACE(primary_customer.name, '\s*\(Connection\s+\d+\)\s*', '', 'g'),
    total_connections = total_conn,
    connection_list = connection_data,
    max_connections = total_conn
  WHERE id = primary_customer.id;
  
  -- Delete the other connection records (keep only the primary)
  DELETE FROM public.customers
  WHERE customer_group = customer_group_name 
  AND reseller_id = reseller_id_param
  AND id != primary_customer.id;
  
  RETURN QUERY SELECT primary_customer.id, total_conn, connection_data;
END;
$$;

-- Add a function to clean up duplicate customers by name and email
CREATE OR REPLACE FUNCTION public.consolidate_duplicate_customers(
  reseller_id_param UUID,
  customer_name_param TEXT,
  customer_email_param TEXT
) RETURNS TABLE(
  consolidated_customer_id UUID,
  total_connections INTEGER,
  connection_details JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  primary_customer RECORD;
  connection_data JSONB := '[]'::jsonb;
  total_conn INTEGER := 0;
  connection_counter INTEGER := 1;
BEGIN
  -- Get the primary customer (first one created)
  SELECT * INTO primary_customer
  FROM public.customers
  WHERE reseller_id = reseller_id_param 
  AND LOWER(TRIM(name)) = LOWER(TRIM(customer_name_param))
  AND LOWER(TRIM(email)) = LOWER(TRIM(customer_email_param))
  ORDER BY created_at ASC
  LIMIT 1;
  
  IF primary_customer.id IS NULL THEN
    RETURN;
  END IF;
  
  -- Build connection details from all customers with same name/email
  SELECT 
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'connection_number', ROW_NUMBER() OVER (ORDER BY created_at),
        'username', username,
        'password', password,
        'm3u_url', m3u_url,
        'status', status,
        'device_type', device_type,
        'mac_address', mac_address
      )
    ), '[]'::jsonb),
    COUNT(*)::INTEGER
  INTO connection_data, total_conn
  FROM public.customers
  WHERE reseller_id = reseller_id_param 
  AND LOWER(TRIM(name)) = LOWER(TRIM(customer_name_param))
  AND LOWER(TRIM(email)) = LOWER(TRIM(customer_email_param));
  
  -- Update the primary customer with consolidated data
  UPDATE public.customers
  SET 
    total_connections = total_conn,
    connection_list = connection_data,
    max_connections = total_conn,
    customer_group = COALESCE(customer_group, LOWER(TRIM(name)) || '_' || reseller_id_param::text)
  WHERE id = primary_customer.id;
  
  -- Delete the other duplicate records (keep only the primary)
  DELETE FROM public.customers
  WHERE reseller_id = reseller_id_param 
  AND LOWER(TRIM(name)) = LOWER(TRIM(customer_name_param))
  AND LOWER(TRIM(email)) = LOWER(TRIM(customer_email_param))
  AND id != primary_customer.id;
  
  RETURN QUERY SELECT primary_customer.id, total_conn, connection_data;
END;
$$;
