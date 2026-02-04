CREATE OR REPLACE FUNCTION public.calculate_renewal_credits_required(
  customer_id_param uuid, 
  duration_months integer
)
RETURNS TABLE(
  credits_required integer, 
  accounts_count integer, 
  customer_group_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  customer_record RECORD;
  connections_count integer;
BEGIN
  SELECT * INTO customer_record
  FROM public.customers
  WHERE id = customer_id_param;
  
  IF customer_record.id IS NULL THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;
  
  -- Determine actual number of connections
  IF customer_record.total_connections IS NOT NULL 
     AND customer_record.total_connections > 0 THEN
    connections_count := customer_record.total_connections;
    
  ELSIF customer_record.connection_list IS NOT NULL 
        AND jsonb_array_length(customer_record.connection_list) > 0 THEN
    -- Only use connection_list if it has actual entries
    connections_count := jsonb_array_length(customer_record.connection_list);
    
  ELSE
    -- Fall back to counting rows in customer_group
    SELECT COUNT(*) INTO connections_count
    FROM public.customers
    WHERE customer_group = customer_record.customer_group
    AND status != 'cancelled';
  END IF;
  
  RETURN QUERY SELECT 
    (connections_count * duration_months)::integer as credits_required,
    connections_count::integer as accounts_count,
    customer_record.customer_group as customer_group_name;
END;
$$;