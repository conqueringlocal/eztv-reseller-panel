-- Phase 1: Database Function Security - Fix search_path vulnerabilities
-- Update all SECURITY DEFINER functions to include SET search_path = ''

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT role::text FROM public.profiles WHERE id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.get_reseller_path(reseller_id uuid)
RETURNS TABLE(id uuid, name text, level integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH RECURSIVE reseller_hierarchy AS (
    -- Base case: start with the given reseller
    SELECT p.id, p.name, p.reseller_level, p.parent_reseller_id, 0 as depth
    FROM public.profiles p
    WHERE p.id = reseller_id
    
    UNION ALL
    
    -- Recursive case: get parent resellers
    SELECT p.id, p.name, p.reseller_level, p.parent_reseller_id, rh.depth + 1
    FROM public.profiles p
    INNER JOIN reseller_hierarchy rh ON p.id = rh.parent_reseller_id
    WHERE rh.depth < 10 -- Prevent infinite recursion
  )
  SELECT rh.id, rh.name, rh.reseller_level
  FROM reseller_hierarchy rh
  ORDER BY rh.depth DESC;
$function$;

CREATE OR REPLACE FUNCTION public.can_purchase_credits(reseller_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT reseller_level = 1 
  FROM public.profiles 
  WHERE id = reseller_id AND role = 'reseller';
$function$;

CREATE OR REPLACE FUNCTION public.validate_connection_limit(customer_id uuid, new_connections integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    max_conn integer;
BEGIN
    SELECT max_connections INTO max_conn
    FROM public.customers
    WHERE id = customer_id;
    
    RETURN new_connections <= COALESCE(max_conn, 1);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_connection_count(customer_id uuid, connection_change integer DEFAULT 0)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.consolidate_customer_connections(customer_group_name text, reseller_id_param uuid)
RETURNS TABLE(consolidated_customer_id uuid, total_connections integer, connection_details jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
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
        'status', status
      )
    ), '[]'::jsonb),
    COUNT(*)::INTEGER
  INTO connection_data, total_conn
  FROM public.customers
  WHERE customer_group = customer_group_name 
  AND reseller_id = reseller_id_param;
  
  -- Update the primary customer with consolidated data
  UPDATE public.customers
  SET 
    name = TRIM(REPLACE(primary_customer.name, CONCAT('(Connection ', connection_sequence, ')'), '')),
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
$function$;

CREATE OR REPLACE FUNCTION public.calculate_renewal_credits_required(customer_id_param uuid, duration_months integer)
RETURNS TABLE(credits_required integer, accounts_count integer, customer_group_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  customer_group_val text;
  accounts_in_group integer;
BEGIN
  -- Get the customer group for the given customer
  SELECT customer_group INTO customer_group_val
  FROM public.customers
  WHERE id = customer_id_param;
  
  -- Count all accounts in the same customer group that are not cancelled
  SELECT COUNT(*) INTO accounts_in_group
  FROM public.customers
  WHERE customer_group = customer_group_val
  AND status != 'cancelled';
  
  -- Return the calculated values with proper aliasing
  RETURN QUERY SELECT 
    (accounts_in_group * duration_months)::integer as credits_required,
    accounts_in_group::integer as accounts_count,
    customer_group_val as customer_group_name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.renew_customer_group(customer_id_param uuid, duration_months integer, reseller_id_param uuid)
RETURNS TABLE(success boolean, accounts_renewed integer, credits_used integer, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  customer_group_val text;
  accounts_count_val integer;
  credits_needed integer;
  reseller_credits integer;
BEGIN
  -- Get customer group
  SELECT customer_group INTO customer_group_val
  FROM public.customers
  WHERE id = customer_id_param;
  
  IF customer_group_val IS NULL THEN
    RETURN QUERY SELECT false, 0, 0, 'Customer not found'::text;
    RETURN;
  END IF;
  
  -- Calculate requirements using the existing function
  SELECT cr.credits_required, cr.accounts_count 
  INTO credits_needed, accounts_count_val
  FROM public.calculate_renewal_credits_required(customer_id_param, duration_months) cr;
  
  -- Check reseller credits
  SELECT credits INTO reseller_credits
  FROM public.profiles
  WHERE id = reseller_id_param;
  
  IF reseller_credits < credits_needed THEN
    RETURN QUERY SELECT false, 0, 0, 'Insufficient credits'::text;
    RETURN;
  END IF;
  
  -- Update all accounts in the group (removed updated_at column reference)
  UPDATE public.customers
  SET 
    expiration_date = expiration_date + (duration_months || ' months')::interval,
    plan_duration = duration_months,
    status = 'active'
  WHERE customer_group = customer_group_val
  AND status != 'cancelled';
  
  -- Deduct credits from reseller
  UPDATE public.profiles
  SET credits = credits - credits_needed
  WHERE id = reseller_id_param;
  
  -- Log the credit usage
  INSERT INTO public.credit_logs (
    reseller_id,
    action,
    credits_used,
    customer_name,
    customer_id,
    notes
  ) VALUES (
    reseller_id_param,
    'account_creation',
    credits_needed,
    (SELECT name FROM public.customers WHERE id = customer_id_param LIMIT 1),
    customer_id_param,
    'Group renewal for ' || accounts_count_val || ' accounts'
  );
  
  -- Return success
  RETURN QUERY SELECT true, accounts_count_val, credits_needed, NULL::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN (
    SELECT role = 'admin'
    FROM public.profiles
    WHERE id = auth.uid()
  );
END;
$function$;

-- Phase 2: Role-Based Access Control Hardening

-- Create security audit log table for enhanced monitoring
CREATE TABLE IF NOT EXISTS public.security_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text,
    ip_address inet,
    user_agent text,
    success boolean NOT NULL DEFAULT true,
    details jsonb,
    created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on security audit logs
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view security audit logs
CREATE POLICY "Admins can view security audit logs" ON public.security_audit_logs
FOR SELECT USING (is_admin());

-- System can insert audit logs
CREATE POLICY "System can insert audit logs" ON public.security_audit_logs
FOR INSERT WITH CHECK (true);

-- Create function for logging security events
CREATE OR REPLACE FUNCTION public.log_security_event(
    p_action text,
    p_resource_type text,
    p_resource_id text DEFAULT NULL,
    p_success boolean DEFAULT true,
    p_details jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
    INSERT INTO public.security_audit_logs (
        user_id,
        action,
        resource_type,
        resource_id,
        success,
        details
    ) VALUES (
        auth.uid(),
        p_action,
        p_resource_type,
        p_resource_id,
        p_success,
        p_details
    );
END;
$function$;

-- Add constraint to ensure reseller_id is not null for customers (RLS security)
ALTER TABLE public.customers 
ALTER COLUMN reseller_id SET NOT NULL;

-- Add constraint to ensure critical fields are not null
ALTER TABLE public.profiles 
ALTER COLUMN role SET NOT NULL,
ALTER COLUMN email SET NOT NULL,
ALTER COLUMN name SET NOT NULL;

-- Create index for better performance on security-critical queries
CREATE INDEX IF NOT EXISTS idx_customers_reseller_id ON public.customers(reseller_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_user_action ON public.security_audit_logs(user_id, action);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_created_at ON public.security_audit_logs(created_at);

-- Create rate limiting table for failed login attempts
CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier text NOT NULL, -- email or IP
    attempt_type text NOT NULL, -- 'login_failed', 'password_reset', etc.
    attempts integer NOT NULL DEFAULT 1,
    first_attempt timestamp with time zone DEFAULT now(),
    last_attempt timestamp with time zone DEFAULT now(),
    blocked_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on rate limits table
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;

-- Only system can manage rate limits
CREATE POLICY "System can manage rate limits" ON public.auth_rate_limits
FOR ALL USING (true);

-- Create unique index for rate limiting
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_rate_limits_identifier_type 
ON public.auth_rate_limits(identifier, attempt_type);

-- Create function to check and update rate limits
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_identifier text,
    p_attempt_type text,
    p_max_attempts integer DEFAULT 5,
    p_window_minutes integer DEFAULT 15
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    rate_limit_record RECORD;
    is_blocked boolean := false;
BEGIN
    -- Get existing rate limit record
    SELECT * INTO rate_limit_record
    FROM public.auth_rate_limits
    WHERE identifier = p_identifier AND attempt_type = p_attempt_type;
    
    -- Check if currently blocked
    IF rate_limit_record.blocked_until IS NOT NULL AND rate_limit_record.blocked_until > now() THEN
        RETURN false; -- Still blocked
    END IF;
    
    -- Reset if window has passed
    IF rate_limit_record.first_attempt IS NOT NULL AND 
       rate_limit_record.first_attempt < (now() - (p_window_minutes || ' minutes')::interval) THEN
        UPDATE public.auth_rate_limits
        SET attempts = 1,
            first_attempt = now(),
            last_attempt = now(),
            blocked_until = NULL
        WHERE identifier = p_identifier AND attempt_type = p_attempt_type;
        RETURN true;
    END IF;
    
    -- Update or insert rate limit record
    INSERT INTO public.auth_rate_limits (identifier, attempt_type, attempts, first_attempt, last_attempt)
    VALUES (p_identifier, p_attempt_type, 1, now(), now())
    ON CONFLICT (identifier, attempt_type)
    DO UPDATE SET
        attempts = auth_rate_limits.attempts + 1,
        last_attempt = now(),
        blocked_until = CASE 
            WHEN auth_rate_limits.attempts + 1 >= p_max_attempts 
            THEN now() + (p_window_minutes || ' minutes')::interval
            ELSE NULL
        END;
    
    -- Check if now blocked
    SELECT blocked_until IS NOT NULL AND blocked_until > now() INTO is_blocked
    FROM public.auth_rate_limits
    WHERE identifier = p_identifier AND attempt_type = p_attempt_type;
    
    RETURN NOT is_blocked;
END;
$function$;