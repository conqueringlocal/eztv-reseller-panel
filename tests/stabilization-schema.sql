CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TYPE public.user_role AS ENUM('admin','reseller'); CREATE TYPE public.app_role AS ENUM('admin','reseller'); CREATE TYPE public.credit_action AS ENUM('addition','deduction','account_creation','renewal');
CREATE TABLE public.credit_logs (id uuid NOT NULL DEFAULT gen_random_uuid(), reseller_id uuid NOT NULL, date timestamp with time zone NOT NULL DEFAULT now(), action credit_action NOT NULL, credits_used integer NOT NULL, customer_id uuid, customer_name text, notes text, connections_used integer DEFAULT 1, revenue_amount numeric(10,2) DEFAULT 0.00);
CREATE TABLE public.credit_requests (id uuid NOT NULL DEFAULT gen_random_uuid(), requester_id uuid NOT NULL, parent_reseller_id uuid NOT NULL, credits_requested integer NOT NULL, price_per_credit numeric(10,2) NOT NULL, total_amount numeric(10,2) NOT NULL, status text NOT NULL DEFAULT 'pending'::text, message text, admin_notes text, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(), processed_at timestamp with time zone);
CREATE TABLE public.customers (id uuid NOT NULL DEFAULT gen_random_uuid(), reseller_id uuid NOT NULL, name text NOT NULL, email text NOT NULL, mac_address text, device_type text NOT NULL, plan_duration integer NOT NULL, start_date date NOT NULL, expiration_date date NOT NULL, username text, password text, created_at timestamp with time zone NOT NULL DEFAULT now(), connection_number integer, total_connections integer, customer_group_id text, m3u_url text, is_deactivated boolean DEFAULT false, cancelled_at timestamp with time zone, status text DEFAULT 'active'::text, highlevel_contact_id text, is_trial boolean DEFAULT false, trial_created_at timestamp with time zone, provider text DEFAULT 'trex'::text, max_connections integer DEFAULT 1, current_connections integer DEFAULT 0, connection_details jsonb DEFAULT '[]'::jsonb, customer_group text NOT NULL, connection_sequence integer DEFAULT 1, connection_list jsonb DEFAULT '[]'::jsonb, package_id text);
CREATE TABLE public.daily_trial_limits (id uuid NOT NULL DEFAULT gen_random_uuid(), provider text NOT NULL, date date NOT NULL DEFAULT CURRENT_DATE, trial_count integer NOT NULL DEFAULT 0, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.monthly_revenue_summary (id uuid NOT NULL DEFAULT gen_random_uuid(), month_year date NOT NULL, total_revenue numeric(10,2) NOT NULL DEFAULT 0.00, credit_sales_count integer NOT NULL DEFAULT 0, average_sale_amount numeric(10,2) NOT NULL DEFAULT 0.00, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.profiles (id uuid NOT NULL, name text NOT NULL, email text NOT NULL, role user_role NOT NULL DEFAULT 'reseller'::user_role, credits integer NOT NULL DEFAULT 0, created_at timestamp with time zone NOT NULL DEFAULT now(), provider text DEFAULT 'trex'::text, parent_reseller_id uuid, reseller_level integer DEFAULT 1, use_admin_api boolean DEFAULT true, api_key text, panel_url text, credit_price_per_unit numeric(10,2), credit_purchase_enabled boolean DEFAULT true, low_credit_threshold integer NOT NULL DEFAULT 10, low_credit_alert_cooldown_hours integer NOT NULL DEFAULT 24, last_low_credit_alert_at timestamp with time zone, admin_highlevel_contact_id text);
CREATE TABLE public.renewal_transactions (id uuid NOT NULL DEFAULT gen_random_uuid(), customer_id uuid NOT NULL, reseller_id uuid NOT NULL, plan_duration integer NOT NULL, credits_required integer NOT NULL, transaction_key text NOT NULL, status text NOT NULL DEFAULT 'pending'::text, created_at timestamp with time zone NOT NULL DEFAULT now(), completed_at timestamp with time zone, rollback_reason text, metadata jsonb DEFAULT '{}'::jsonb, api_calls_completed boolean DEFAULT false);
CREATE TABLE public.security_dashboard_metrics (metric_name text NOT NULL, metric_value text NOT NULL, description text NOT NULL, last_updated timestamp with time zone DEFAULT now());
CREATE TABLE public.sso_tokens (id uuid NOT NULL DEFAULT gen_random_uuid(), reseller_id uuid NOT NULL, token_hash text NOT NULL, name text NOT NULL DEFAULT 'Default Token'::text, is_active boolean NOT NULL DEFAULT true, created_at timestamp with time zone NOT NULL DEFAULT now(), last_used_at timestamp with time zone, revoked_at timestamp with time zone, created_by uuid, usage_count integer NOT NULL DEFAULT 0);
CREATE TABLE public.system_settings (id text NOT NULL, value text NOT NULL, description text, updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.user_roles (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, role app_role NOT NULL, created_at timestamp with time zone DEFAULT now());
ALTER TABLE profiles ADD PRIMARY KEY(id); ALTER TABLE customers ADD PRIMARY KEY(id); ALTER TABLE user_roles ADD UNIQUE(user_id,role); ALTER TABLE credit_requests ADD PRIMARY KEY(id); ALTER TABLE renewal_transactions ADD PRIMARY KEY(id); CREATE VIEW reseller_highlevel_status AS SELECT id FROM profiles;
CREATE OR REPLACE FUNCTION public.get_current_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT role::text FROM public.profiles WHERE id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.calculate_mrr_projections()
 RETURNS TABLE(current_month_revenue numeric, projected_mrr numeric, growth_rate numeric, avg_sale_amount numeric, total_sales_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  current_month DATE := DATE_TRUNC('month', CURRENT_DATE);
  last_month DATE := DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month');
  three_months_ago DATE := DATE_TRUNC('month', CURRENT_DATE - INTERVAL '3 months');
  current_revenue DECIMAL(10,2) := 0.00;
  last_month_revenue DECIMAL(10,2) := 0.00;
  three_month_avg DECIMAL(10,2) := 0.00;
  calculated_growth_rate DECIMAL(5,2) := 0.00;
  avg_amount DECIMAL(10,2) := 0.00;
  sales_count INTEGER := 0;
BEGIN
  -- Get current month revenue from credit_logs
  SELECT COALESCE(SUM(revenue_amount), 0.00), COUNT(*)
  INTO current_revenue, sales_count
  FROM public.credit_logs
  WHERE action = 'addition'
  AND DATE_TRUNC('month', date) = current_month
  AND revenue_amount > 0;

  -- Get last month revenue
  SELECT COALESCE(SUM(revenue_amount), 0.00)
  INTO last_month_revenue
  FROM public.credit_logs
  WHERE action = 'addition'
  AND DATE_TRUNC('month', date) = last_month
  AND revenue_amount > 0;

  -- Calculate 3-month average for projection
  SELECT COALESCE(AVG(monthly_total), 0.00)
  INTO three_month_avg
  FROM (
    SELECT SUM(revenue_amount) as monthly_total
    FROM public.credit_logs
    WHERE action = 'addition'
    AND DATE_TRUNC('month', date) >= three_months_ago
    AND revenue_amount > 0
    GROUP BY DATE_TRUNC('month', date)
  ) monthly_totals;

  -- Calculate growth rate
  IF last_month_revenue > 0 THEN
    calculated_growth_rate := ((current_revenue - last_month_revenue) / last_month_revenue * 100);
  END IF;

  -- Calculate average sale amount
  IF sales_count > 0 THEN
    avg_amount := current_revenue / sales_count;
  END IF;

  RETURN QUERY SELECT
    current_revenue,
    three_month_avg,
    calculated_growth_rate,
    avg_amount,
    sales_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_purchase_credits(reseller_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT reseller_level = 1
  FROM public.profiles
  WHERE id = reseller_id AND role = 'reseller';
$function$;

CREATE OR REPLACE FUNCTION public.log_security_event(p_action text, p_resource_type text, p_resource_id text DEFAULT NULL::text, p_success boolean DEFAULT true, p_details jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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

CREATE OR REPLACE FUNCTION public.calculate_renewal_credits_required(customer_id_param uuid, duration_months integer)
 RETURNS TABLE(credits_required integer, accounts_count integer, customer_group_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN (
    SELECT role = 'admin'
    FROM public.profiles
    WHERE id = auth.uid()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.profiles (id, name, email, role, credits)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'reseller'::public.user_role),
    CASE
      WHEN COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'reseller'::public.user_role) = 'admin'::public.user_role THEN 1000
      ELSE 0
    END
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log the error but don't fail the user creation
  RAISE LOG 'Error in handle_new_user: %', SQLERRM;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION get_reseller_path(uuid) RETURNS text LANGUAGE sql AS $$SELECT ''::text$$; CREATE FUNCTION get_highlevel_status(uuid) RETURNS text LANGUAGE sql AS $$SELECT ''::text$$; CREATE FUNCTION calculate_credits_required(integer,integer) RETURNS integer LANGUAGE sql AS $$SELECT $1*$2$$;
 GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;
