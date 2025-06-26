
-- Add multi-connection support to customers table
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS max_connections integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS current_connections integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS connection_details jsonb DEFAULT '[]'::jsonb;

-- Update existing customers to have proper default values
UPDATE public.customers 
SET max_connections = 1, current_connections = 0, connection_details = '[]'::jsonb
WHERE max_connections IS NULL OR current_connections IS NULL OR connection_details IS NULL;

-- Create function to calculate required credits based on connections and duration
CREATE OR REPLACE FUNCTION public.calculate_credits_required(
    connections integer DEFAULT 1,
    duration_months integer DEFAULT 1
) RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT connections * duration_months;
$$;

-- Create function to validate connection limit
CREATE OR REPLACE FUNCTION public.validate_connection_limit(
    customer_id uuid,
    new_connections integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    max_conn integer;
BEGIN
    SELECT max_connections INTO max_conn
    FROM public.customers
    WHERE id = customer_id;
    
    RETURN new_connections <= COALESCE(max_conn, 1);
END;
$$;

-- Create function to update connection count
CREATE OR REPLACE FUNCTION public.update_connection_count(
    customer_id uuid,
    connection_change integer DEFAULT 0
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_count integer;
    max_count integer;
    new_count integer;
BEGIN
    SELECT current_connections, max_connections 
    INTO current_count, max_count
    FROM public.customers
    WHERE id = customer_id;
    
    new_count := COALESCE(current_count, 0) + connection_change;
    
    -- Ensure we don't exceed max or go below 0
    IF new_count > COALESCE(max_count, 1) OR new_count < 0 THEN
        RETURN false;
    END IF;
    
    UPDATE public.customers
    SET current_connections = new_count,
        updated_at = now()
    WHERE id = customer_id;
    
    RETURN true;
END;
$$;

-- Add connection management to credit_logs
ALTER TABLE public.credit_logs 
ADD COLUMN IF NOT EXISTS connections_used integer DEFAULT 1;

-- Update existing credit logs to have proper default values
UPDATE public.credit_logs 
SET connections_used = 1
WHERE connections_used IS NULL;

-- Create index for better performance on connection queries
CREATE INDEX IF NOT EXISTS idx_customers_connections 
ON public.customers(max_connections, current_connections);

-- Create index for better performance on reseller queries
CREATE INDEX IF NOT EXISTS idx_customers_reseller_status 
ON public.customers(reseller_id, status) WHERE status = 'active';
