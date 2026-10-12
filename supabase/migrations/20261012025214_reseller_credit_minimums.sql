-- New purchases: 10 credits. Initial sub-reseller allocation: 20 credits.
-- Retain historical records, fulfillment rules, and existing function grants.
BEGIN;

CREATE OR REPLACE FUNCTION public.prepare_paypal_credit_order_priced(p_id uuid,p_actor uuid,p_credits integer,p_environment text,p_expected_unit_price_cents integer) RETURNS public.paypal_credit_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old public.paypal_credit_orders; price integer;
BEGIN
 IF p_id IS NULL OR p_actor IS NULL OR p_credits IS NULL OR p_credits NOT IN (10,20,50) THEN RAISE EXCEPTION 'Invalid purchase'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.paypal_credit_settings WHERE enabled AND environment=p_environment) THEN RAISE EXCEPTION 'Checkout unavailable'; END IF;
 PERFORM id FROM public.profiles WHERE id=p_actor AND credit_purchase_enabled FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Purchasing not enabled'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 SELECT * INTO old FROM public.paypal_credit_orders WHERE id=p_id;
 IF FOUND THEN
  IF old.reseller_id<>p_actor OR old.credits<>p_credits OR old.environment<>p_environment THEN RAISE EXCEPTION 'Request conflict'; END IF;
  IF p_expected_unit_price_cents IS NULL OR old.amount_cents<>old.credits::bigint*p_expected_unit_price_cents THEN RAISE EXCEPTION 'existing_order_price_changed'; END IF;
  RETURN old;
 END IF;
 IF EXISTS(SELECT 1 FROM public.paypal_credit_orders WHERE reseller_id=p_actor AND status='review_required') THEN RAISE EXCEPTION 'Payment review required'; END IF;
 IF (SELECT count(*) FROM public.paypal_credit_orders WHERE reseller_id=p_actor AND created_at>now()-interval '15 minutes')>=5 THEN RAISE EXCEPTION 'Too many checkout attempts'; END IF;
 SELECT coalesce((SELECT unit_price_cents FROM public.reseller_credit_pricing WHERE reseller_id=p_actor),300) INTO price;
 IF price IS DISTINCT FROM p_expected_unit_price_cents THEN RAISE EXCEPTION 'price_changed'; END IF;
 INSERT INTO public.paypal_credit_orders(id,reseller_id,credits,amount_cents,environment,unit_price_cents) VALUES(p_id,p_actor,p_credits,p_credits*price,p_environment,price) RETURNING * INTO old;
 RETURN old;
END $$;

CREATE OR REPLACE FUNCTION public.request_manual_credits_priced(p_id uuid,p_credits integer,p_reference text,p_expected_unit_price_cents integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.profiles; existing public.manual_credit_requests; price integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 SELECT * INTO p FROM public.profiles WHERE id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR NOT coalesce(p.credit_purchase_enabled,false) THEN RAISE EXCEPTION 'Direct credit purchasing is not enabled'; END IF;
 IF p_id IS NULL OR p_credits IS NULL OR p_credits NOT IN (10,20,50) OR length(trim(coalesce(p_reference,''))) NOT BETWEEN 3 AND 200 THEN RAISE EXCEPTION 'Choose a package and enter the PayPal transaction reference'; END IF;
 SELECT * INTO existing FROM public.manual_credit_requests WHERE id=p_id;
 IF FOUND THEN
  IF existing.reseller_id<>auth.uid() OR existing.credits<>p_credits OR existing.payment_reference<>trim(p_reference) THEN RAISE EXCEPTION 'Request reference conflict'; END IF;
  RETURN existing.id;
 END IF;
 IF EXISTS(SELECT 1 FROM public.manual_credit_requests WHERE reseller_id=auth.uid() AND status='pending') THEN RAISE EXCEPTION 'You already have a request awaiting review'; END IF;
 SELECT coalesce((SELECT unit_price_cents FROM public.reseller_credit_pricing WHERE reseller_id=auth.uid()),300) INTO price;
 IF price IS DISTINCT FROM p_expected_unit_price_cents THEN RAISE EXCEPTION 'price_changed'; END IF;
 INSERT INTO public.manual_credit_requests(id,reseller_id,credits,payment_reference,unit_price) VALUES(p_id,auth.uid(),p_credits,trim(p_reference),price/100.0);
 RETURN p_id;
END $$;

CREATE OR REPLACE FUNCTION public.request_parent_credits(p_credits integer,p_message text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.profiles; result uuid;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE id=auth.uid();
 IF p.parent_reseller_id IS NULL OR p_credits IS NULL OR p_credits NOT BETWEEN 10 AND 100000 THEN RAISE EXCEPTION 'Request at least 10 credits from your parent reseller'; END IF;
 INSERT INTO public.credit_requests(requester_id,parent_reseller_id,credits_requested,price_per_credit,total_amount,message) VALUES(p.id,p.parent_reseller_id,p_credits,coalesce(p.credit_price_per_unit,3),p_credits*coalesce(p.credit_price_per_unit,3),left(p_message,500)) RETURNING id INTO result;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.initialize_reseller(p_actor uuid,p_new uuid,p_data jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE admin boolean; parent uuid; amount integer; parent_profile public.profiles; target public.profiles;
BEGIN
 admin:=public.has_role(p_actor,'admin');
 amount:=coalesce((p_data->>'credits')::integer,0);
 IF amount<0 OR amount>100000 THEN RAISE EXCEPTION 'Invalid credits'; END IF;
 parent:=CASE WHEN admin THEN nullif(p_data->>'parent_reseller_id','')::uuid ELSE p_actor END;
 IF parent IS NOT NULL AND amount<20 THEN RAISE EXCEPTION 'Child reseller allocation requires at least 20 credits'; END IF;
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

COMMIT;
