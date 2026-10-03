BEGIN;
-- Roles are authoritative in user_roles. Signup metadata never grants privilege.
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT public.has_role(auth.uid(), 'admin'::public.app_role) $$;
CREATE OR REPLACE FUNCTION public.get_current_user_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT CASE WHEN public.is_admin() THEN 'admin' ELSE 'reseller' END $$;
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.profiles(id,name,email,role,credits) VALUES(NEW.id,coalesce(NEW.raw_user_meta_data->>'name',split_part(NEW.email,'@',1)),NEW.email,'reseller',0);
 INSERT INTO public.user_roles(user_id,role) VALUES(NEW.id,'reseller') ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
-- Invoker trigger distinguishes browser writes from checked definer commands.
CREATE FUNCTION public.protect_profile_fields() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_user IN ('anon','authenticated') THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.credits IS DISTINCT FROM OLD.credits OR NEW.role IS DISTINCT FROM OLD.role THEN RAISE EXCEPTION 'Use authorized account commands'; END IF;
  IF NOT public.is_admin() AND (to_jsonb(NEW) - ARRAY['name','email','low_credit_threshold','low_credit_alert_cooldown_hours']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['name','email','low_credit_threshold','low_credit_alert_cooldown_hours']) THEN RAISE EXCEPTION 'Protected profile fields'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_profile_fields BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();
REVOKE INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.profiles FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.user_roles FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
DROP POLICY IF EXISTS "Only admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins read roles" ON public.user_roles FOR SELECT TO authenticated USING (public.is_admin());
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.credit_logs,public.renewal_transactions,public.daily_trial_limits,public.security_dashboard_metrics FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.security_dashboard_metrics FROM anon;
DROP POLICY IF EXISTS "System can update security dashboard metrics" ON public.security_dashboard_metrics;
REVOKE ALL ON public.reseller_highlevel_status FROM PUBLIC,anon,authenticated;
-- Remove default browser access to privileged helpers. Explicit safe APIs follow.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef LOOP
  EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.is_admin(),public.get_current_user_role(),public.has_role(uuid,public.app_role) TO authenticated;
-- Read helpers run with the caller's existing row policies.
ALTER FUNCTION public.calculate_mrr_projections() SECURITY INVOKER;
ALTER FUNCTION public.get_reseller_path(uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_highlevel_status(uuid) SECURITY INVOKER;
GRANT EXECUTE ON FUNCTION public.calculate_mrr_projections(),public.get_reseller_path(uuid),public.get_highlevel_status(uuid),public.can_purchase_credits(uuid),public.calculate_renewal_credits_required(uuid,integer),public.log_security_event(text,text,text,boolean,jsonb) TO authenticated;

CREATE TABLE public.credit_adjustments (
 id uuid PRIMARY KEY, reseller_id uuid NOT NULL REFERENCES public.profiles, actor_id uuid NOT NULL REFERENCES public.profiles,
 delta integer NOT NULL CHECK(delta<>0), notes text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.credit_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.credit_adjustments FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.adjust_reseller_credits(p_id uuid,p_reseller uuid,p_delta integer,p_notes text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE existing public.credit_adjustments; balance integer;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator required'; END IF;
 IF p_id IS NULL OR p_delta IS NULL OR p_delta=0 OR abs(p_delta::bigint)>100000 OR nullif(trim(p_notes),'') IS NULL THEN RAISE EXCEPTION 'Invalid adjustment'; END IF;
 SELECT credits INTO balance FROM public.profiles WHERE id=p_reseller FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
 SELECT * INTO existing FROM public.credit_adjustments WHERE id=p_id;
 IF FOUND THEN
  IF existing.reseller_id<>p_reseller OR existing.delta<>p_delta OR existing.actor_id<>auth.uid() THEN RAISE EXCEPTION 'Adjustment reference conflict'; END IF;
  RETURN balance;
 END IF;
 IF balance+p_delta<0 THEN RAISE EXCEPTION 'Insufficient credits'; END IF;
 IF p_delta<0 AND EXISTS(SELECT 1 FROM public.trex_provisioning_requests WHERE reseller_id=p_reseller AND state IN ('processing','review_required')) THEN RAISE EXCEPTION 'Resolve the pending provider operation first'; END IF;
 INSERT INTO public.credit_adjustments VALUES(p_id,p_reseller,auth.uid(),p_delta,trim(p_notes),now());
 UPDATE public.profiles SET credits=credits+p_delta WHERE id=p_reseller RETURNING credits INTO balance;
 INSERT INTO public.credit_logs(reseller_id,action,credits_used,notes) VALUES(p_reseller,CASE WHEN p_delta>0 THEN 'addition'::public.credit_action ELSE 'deduction'::public.credit_action END,abs(p_delta),'Adjustment '||p_id||': '||trim(p_notes));
 RETURN balance;
END $$;

CREATE TABLE public.manual_credit_requests (
 id uuid PRIMARY KEY, reseller_id uuid NOT NULL REFERENCES public.profiles, credits integer NOT NULL CHECK(credits IN (5,10,20,50)),
 unit_price numeric(10,2) NOT NULL DEFAULT 3 CHECK(unit_price>0), currency text NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
 payment_reference text NOT NULL CHECK(length(payment_reference) BETWEEN 3 AND 200),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','denied')),
 verified_reference text, reviewed_by uuid REFERENCES public.profiles, review_note text,
 created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz,
 UNIQUE(verified_reference)
);
CREATE UNIQUE INDEX manual_credit_pending_reseller ON public.manual_credit_requests(reseller_id) WHERE status='pending';
CREATE UNIQUE INDEX manual_credit_payment_reference ON public.manual_credit_requests(lower(trim(payment_reference))) WHERE status<>'denied';
ALTER TABLE public.manual_credit_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manual_credit_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.manual_credit_requests TO authenticated;
GRANT ALL ON public.manual_credit_requests,public.credit_adjustments TO service_role;
CREATE POLICY "Read own credit requests or admin" ON public.manual_credit_requests FOR SELECT TO authenticated USING(reseller_id=(SELECT auth.uid()) OR (SELECT public.is_admin()));
CREATE FUNCTION public.request_manual_credits(p_id uuid,p_credits integer,p_reference text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.profiles; existing public.manual_credit_requests;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 SELECT * INTO p FROM public.profiles WHERE id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR NOT coalesce(p.credit_purchase_enabled,false) THEN RAISE EXCEPTION 'Direct credit purchasing is not enabled'; END IF;
 IF p_id IS NULL OR p_credits IS NULL OR p_credits NOT IN (5,10,20,50) OR length(trim(coalesce(p_reference,''))) NOT BETWEEN 3 AND 200 THEN RAISE EXCEPTION 'Choose a package and enter the PayPal transaction reference'; END IF;
 SELECT * INTO existing FROM public.manual_credit_requests WHERE id=p_id;
 IF FOUND THEN
  IF existing.reseller_id<>auth.uid() OR existing.credits<>p_credits OR existing.payment_reference<>trim(p_reference) THEN RAISE EXCEPTION 'Request reference conflict'; END IF;
  RETURN existing.id;
 END IF;
 IF EXISTS(SELECT 1 FROM public.manual_credit_requests WHERE reseller_id=auth.uid() AND status='pending') THEN RAISE EXCEPTION 'You already have a request awaiting review'; END IF;
 INSERT INTO public.manual_credit_requests(id,reseller_id,credits,payment_reference) VALUES(p_id,auth.uid(),p_credits,trim(p_reference));
 RETURN p_id;
END $$;
CREATE FUNCTION public.review_manual_credits(p_id uuid,p_approve boolean,p_verified_reference text,p_note text DEFAULT '') RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.manual_credit_requests; ref text;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator required'; END IF;
 SELECT * INTO r FROM public.manual_credit_requests WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
 IF r.status<>'pending' THEN RETURN r.status; END IF;
 IF p_approve IS NULL THEN RAISE EXCEPTION 'Choose approval or denial'; END IF;
 IF p_approve THEN
  ref:=upper(trim(coalesce(p_verified_reference,'')));
  IF length(ref) NOT BETWEEN 3 AND 200 THEN RAISE EXCEPTION 'Enter the verified PayPal transaction reference'; END IF;
  UPDATE public.manual_credit_requests SET verified_reference=ref WHERE id=r.id;
  UPDATE public.profiles SET credits=credits+r.credits WHERE id=r.reseller_id;
  INSERT INTO public.credit_logs(reseller_id,action,credits_used,revenue_amount,notes) VALUES(r.reseller_id,'addition',r.credits,r.credits*r.unit_price,'Manual PayPal credit request '||r.id||'; verified payment '||ref);
 END IF;
 UPDATE public.manual_credit_requests SET status=CASE WHEN p_approve THEN 'approved' ELSE 'denied' END,reviewed_by=auth.uid(),review_note=left(p_note,500),reviewed_at=now() WHERE id=r.id RETURNING status INTO r.status;
 RETURN r.status;
END $$;
REVOKE ALL ON FUNCTION public.adjust_reseller_credits(uuid,uuid,integer,text),public.request_manual_credits(uuid,integer,text),public.review_manual_credits(uuid,boolean,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.adjust_reseller_credits(uuid,uuid,integer,text),public.request_manual_credits(uuid,integer,text),public.review_manual_credits(uuid,boolean,text,text) TO authenticated;
-- Parent requests are approved in the same transaction as the transfer.
REVOKE INSERT,UPDATE,DELETE ON public.credit_requests FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.request_parent_credits(p_credits integer,p_message text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.profiles; result uuid;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE id=auth.uid();
 IF p.parent_reseller_id IS NULL OR p_credits IS NULL OR p_credits NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'Invalid child credit request'; END IF;
 INSERT INTO public.credit_requests(requester_id,parent_reseller_id,credits_requested,price_per_credit,total_amount,message) VALUES(p.id,p.parent_reseller_id,p_credits,coalesce(p.credit_price_per_unit,3),p_credits*coalesce(p.credit_price_per_unit,3),left(p_message,500)) RETURNING id INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.review_parent_credits(p_id uuid,p_approve boolean) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.credit_requests; balance integer;
BEGIN
 SELECT * INTO r FROM public.credit_requests WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR r.parent_reseller_id IS DISTINCT FROM auth.uid() OR p_approve IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF r.status<>'pending' THEN RETURN r.status; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=r.requester_id AND parent_reseller_id=auth.uid()) OR r.credits_requested<=0 THEN RAISE EXCEPTION 'Invalid relationship or amount'; END IF;
 IF p_approve THEN
  PERFORM id FROM public.profiles WHERE id IN(r.parent_reseller_id,r.requester_id) ORDER BY id FOR UPDATE;
  SELECT credits INTO balance FROM public.profiles WHERE id=r.parent_reseller_id;
  IF balance<r.credits_requested THEN RAISE EXCEPTION 'Insufficient credits'; END IF;
  IF EXISTS(SELECT 1 FROM public.trex_provisioning_requests WHERE reseller_id=r.parent_reseller_id AND state IN ('processing','review_required')) THEN RAISE EXCEPTION 'Resolve the pending provider operation first'; END IF;
  UPDATE public.profiles SET credits=credits-r.credits_requested WHERE id=r.parent_reseller_id;
  UPDATE public.profiles SET credits=credits+r.credits_requested WHERE id=r.requester_id;
  INSERT INTO public.credit_logs(reseller_id,action,credits_used,notes) VALUES(r.parent_reseller_id,'deduction',r.credits_requested,'Parent transfer request '||r.id),(r.requester_id,'addition',r.credits_requested,'Parent transfer request '||r.id);
 END IF;
 UPDATE public.credit_requests SET status=CASE WHEN p_approve THEN 'approved' ELSE 'denied' END,processed_at=now() WHERE id=r.id RETURNING status INTO r.status;
 RETURN r.status;
END $$;
REVOKE ALL ON FUNCTION public.request_parent_credits(integer,text),public.review_parent_credits(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_parent_credits(integer,text),public.review_parent_credits(uuid,boolean) TO authenticated;
-- Allocation is committed with the profile, not after creating a funded account.
CREATE FUNCTION public.initialize_reseller(p_actor uuid,p_new uuid,p_data jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE admin boolean; parent uuid; amount integer; parent_profile public.profiles; target public.profiles;
BEGIN
 admin:=public.has_role(p_actor,'admin');
 amount:=coalesce((p_data->>'credits')::integer,0);
 IF amount<0 OR amount>100000 THEN RAISE EXCEPTION 'Invalid credits'; END IF;
 parent:=CASE WHEN admin THEN nullif(p_data->>'parent_reseller_id','')::uuid ELSE p_actor END;
 IF NOT admin AND amount<100 THEN RAISE EXCEPTION 'Child reseller allocation requires at least 100 credits'; END IF;
 PERFORM id FROM public.profiles WHERE id IN(p_new,parent) ORDER BY id FOR UPDATE;
 SELECT * INTO target FROM public.profiles WHERE id=p_new;
 IF NOT FOUND OR target.credits<>0 OR target.parent_reseller_id IS NOT NULL OR target.role<>'reseller' THEN RAISE EXCEPTION 'Account already initialized or missing'; END IF;
 IF parent IS NOT NULL THEN
  SELECT * INTO parent_profile FROM public.profiles WHERE id=parent;
  IF NOT FOUND OR parent_profile.reseller_level>=3 THEN RAISE EXCEPTION 'Invalid parent'; END IF;
  IF NOT admin THEN
   IF parent_profile.credits<amount THEN RAISE EXCEPTION 'Insufficient credits'; END IF;
   IF EXISTS(SELECT 1 FROM public.trex_provisioning_requests WHERE reseller_id=parent AND state IN ('processing','review_required')) THEN RAISE EXCEPTION 'Resolve pending provider operation'; END IF;
   UPDATE public.profiles SET credits=credits-amount WHERE id=parent;
   INSERT INTO public.credit_logs(reseller_id,action,credits_used,notes) VALUES(parent,'deduction',amount,'Initial allocation to reseller '||p_new);
  END IF;
 END IF;
 UPDATE public.profiles SET credits=amount,provider='trex',parent_reseller_id=parent,reseller_level=coalesce(parent_profile.reseller_level+1,1),credit_purchase_enabled=parent IS NULL,use_admin_api=true,api_key=NULL,panel_url=NULL,credit_price_per_unit=CASE WHEN parent IS NULL THEN NULL ELSE coalesce((p_data->>'credit_price_per_unit')::numeric,3) END WHERE id=p_new;
 IF amount>0 THEN INSERT INTO public.credit_logs(reseller_id,action,credits_used,notes) VALUES(p_new,'addition',amount,'Initial reseller allocation by '||p_actor); END IF;
END $$;
REVOKE ALL ON FUNCTION public.initialize_reseller(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_reseller(uuid,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.detect_duplicate_renewals(p_hours_back integer DEFAULT 24)
 RETURNS TABLE(customer_id uuid, customer_name text, reseller_id uuid, duplicate_count integer, total_excess_credits integer, log_ids uuid[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator required'; END IF;
  RETURN QUERY
  WITH duplicate_logs AS (
    SELECT 
      cl.customer_id,
      cl.reseller_id,
      cl.credits_used,
      COUNT(*) as occurrence_count,
      ARRAY_AGG(cl.id) as log_ids,
      -- Get customer name from first matching record
      (SELECT name FROM public.customers WHERE id = cl.customer_id LIMIT 1) as customer_name
    FROM public.credit_logs cl
    WHERE 
      cl.action = 'account_creation'
      AND cl.notes LIKE 'Group renewal for%'
      AND cl.date > (NOW() - (p_hours_back || ' hours')::INTERVAL)
      AND cl.customer_id IS NOT NULL
    GROUP BY 
      cl.customer_id, 
      cl.reseller_id, 
      cl.credits_used,
      DATE_TRUNC('minute', cl.date) -- Group by minute to catch rapid duplicates
    HAVING COUNT(*) > 1
  )
  SELECT 
    dl.customer_id,
    dl.customer_name,
    dl.reseller_id,
    (dl.occurrence_count - 1)::INTEGER as duplicate_count,
    ((dl.occurrence_count - 1) * dl.credits_used)::INTEGER as total_excess_credits,
    dl.log_ids
  FROM duplicate_logs dl;
END;
$function$
;
REVOKE ALL ON FUNCTION public.detect_duplicate_renewals(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.detect_duplicate_renewals(integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.detect_duplicate_customers(p_reseller_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(customer1_id uuid, customer1_name text, customer1_email text, customer2_id uuid, customer2_name text, customer2_email text, match_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator required'; END IF;
  RETURN QUERY
  WITH normalized_customers AS (
    SELECT 
      id,
      name,
      email,
      LOWER(TRIM(email)) as normalized_email,
      LOWER(TRIM(REGEXP_REPLACE(name, '[^a-zA-Z0-9\s]', '', 'g'))) as normalized_name,
      customer_group,
      reseller_id
    FROM public.customers
    WHERE status != 'cancelled'
    AND (p_reseller_id IS NULL OR reseller_id = p_reseller_id)
  )
  SELECT DISTINCT
    c1.id as customer1_id,
    c1.name as customer1_name,
    c1.email as customer1_email,
    c2.id as customer2_id,
    c2.name as customer2_name,
    c2.email as customer2_email,
    CASE 
      WHEN c1.normalized_email = c2.normalized_email THEN 'exact_email_match'
      WHEN c1.normalized_name = c2.normalized_name THEN 'exact_name_match'
      ELSE 'similar'
    END as match_type
  FROM normalized_customers c1
  INNER JOIN normalized_customers c2 
    ON c1.reseller_id = c2.reseller_id
    AND c1.id < c2.id  -- Avoid duplicate pairs and self-matches
    AND (c1.customer_group IS NULL OR c2.customer_group IS NULL OR c1.customer_group != c2.customer_group)  -- Exclude already consolidated customers
    AND (
      c1.normalized_email = c2.normalized_email  -- Same email
      OR c1.normalized_name = c2.normalized_name  -- Same name (normalized)
    )
  ORDER BY customer1_name, customer2_name;
END;
$function$
;
REVOKE ALL ON FUNCTION public.detect_duplicate_customers(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.detect_duplicate_customers(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.refresh_security_dashboard()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator required'; END IF;
    -- Delete existing metrics
    DELETE FROM public.security_dashboard_metrics;
    
    -- Insert fresh metrics
    INSERT INTO public.security_dashboard_metrics (metric_name, metric_value, description) VALUES
    ('failed_logins_24h', 
     (SELECT COUNT(*)::text FROM public.security_audit_logs 
      WHERE action = 'login_failed' AND created_at > (now() - interval '24 hours')),
     'Failed login attempts in last 24 hours');
    
    INSERT INTO public.security_dashboard_metrics (metric_name, metric_value, description) VALUES
    ('successful_logins_24h', 
     (SELECT COUNT(*)::text FROM public.security_audit_logs 
      WHERE action = 'login_success' AND created_at > (now() - interval '24 hours')),
     'Successful logins in last 24 hours');
    
    INSERT INTO public.security_dashboard_metrics (metric_name, metric_value, description) VALUES
    ('blocked_ips_active', 
     (SELECT COUNT(DISTINCT identifier)::text FROM public.auth_rate_limits 
      WHERE blocked_until > now()),
     'Currently blocked IP addresses/emails');
    
    INSERT INTO public.security_dashboard_metrics (metric_name, metric_value, description) VALUES
    ('password_resets_24h', 
     (SELECT COUNT(*)::text FROM public.security_audit_logs 
      WHERE action = 'password_reset_requested' AND created_at > (now() - interval '24 hours')),
     'Password reset requests in last 24 hours');
    
    INSERT INTO public.security_dashboard_metrics (metric_name, metric_value, description) VALUES
    ('permission_denials_24h', 
     (SELECT COUNT(*)::text FROM public.security_audit_logs 
      WHERE action = 'permission_denied' AND created_at > (now() - interval '24 hours')),
     'Permission denials in last 24 hours');
END;
$function$
;
REVOKE ALL ON FUNCTION public.refresh_security_dashboard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.refresh_security_dashboard() TO authenticated;
CREATE OR REPLACE FUNCTION public.consolidate_customer_connections(customer_group_name text, reseller_id_param uuid)
 RETURNS TABLE(consolidated_customer_id uuid, total_connections integer, connection_details jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  primary_customer RECORD;
  connection_data JSONB := '[]'::jsonb;
  total_conn INTEGER := 0;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator required'; END IF;
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
$function$
;
REVOKE ALL ON FUNCTION public.consolidate_customer_connections(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.consolidate_customer_connections(text,uuid) TO authenticated;
COMMIT;
