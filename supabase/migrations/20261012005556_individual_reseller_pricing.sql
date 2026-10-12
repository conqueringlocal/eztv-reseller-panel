BEGIN;
-- Direct EZTV purchases only; parent-managed pricing remains in profiles.
CREATE TABLE public.reseller_credit_pricing (
 reseller_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 unit_price_cents integer NOT NULL CHECK(unit_price_cents BETWEEN 1 AND 42949672),
 updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.reseller_credit_price_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reseller_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 old_price_cents integer, new_price_cents integer, changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reseller_credit_pricing_actor ON public.reseller_credit_pricing(updated_by);
CREATE INDEX reseller_credit_price_history_reseller ON public.reseller_credit_price_history(reseller_id);
CREATE INDEX reseller_credit_price_history_actor ON public.reseller_credit_price_history(actor_id);
ALTER TABLE public.reseller_credit_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_credit_price_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reseller_credit_pricing,public.reseller_credit_price_history FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.reseller_credit_pricing,public.reseller_credit_price_history TO authenticated;
GRANT ALL ON public.reseller_credit_pricing,public.reseller_credit_price_history TO service_role;
CREATE POLICY reseller_credit_price_read ON public.reseller_credit_pricing FOR SELECT TO authenticated
 USING(reseller_id=(SELECT auth.uid()) OR (SELECT public.is_admin()));
CREATE POLICY reseller_credit_price_history_read ON public.reseller_credit_price_history FOR SELECT TO authenticated
 USING((SELECT public.is_admin()));

CREATE FUNCTION public.get_my_credit_pricing() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('unit_price_cents',coalesce((SELECT unit_price_cents FROM public.reseller_credit_pricing WHERE reseller_id=auth.uid()),300),
 'purchase_enabled',coalesce((SELECT credit_purchase_enabled FROM public.profiles WHERE id=auth.uid()),false));
$$;
REVOKE ALL ON FUNCTION public.get_my_credit_pricing() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_credit_pricing() TO authenticated;

CREATE FUNCTION public.set_reseller_credit_price(p_reseller uuid,p_price_cents integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_price integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator required'; END IF;
 IF p_price_cents IS NOT NULL AND p_price_cents NOT BETWEEN 1 AND 42949672 THEN RAISE EXCEPTION 'Invalid price'; END IF;
 -- Same row lock as checkout: the order sees one consistent price.
 PERFORM id FROM public.profiles WHERE id=p_reseller AND role='reseller' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reseller not found'; END IF;
 SELECT unit_price_cents INTO old_price FROM public.reseller_credit_pricing WHERE reseller_id=p_reseller;
 IF old_price IS NOT DISTINCT FROM p_price_cents THEN RETURN; END IF;
 IF p_price_cents IS NULL THEN DELETE FROM public.reseller_credit_pricing WHERE reseller_id=p_reseller;
 ELSE INSERT INTO public.reseller_credit_pricing(reseller_id,unit_price_cents,updated_by) VALUES(p_reseller,p_price_cents,auth.uid())
 ON CONFLICT(reseller_id) DO UPDATE SET unit_price_cents=excluded.unit_price_cents,updated_by=excluded.updated_by,updated_at=now(); END IF;
 INSERT INTO public.reseller_credit_price_history(reseller_id,actor_id,old_price_cents,new_price_cents) VALUES(p_reseller,auth.uid(),old_price,p_price_cents);
END $$;
REVOKE ALL ON FUNCTION public.set_reseller_credit_price(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_reseller_credit_price(uuid,integer) TO authenticated;

-- Existing orders retain the original $3 snapshot; future orders snapshot their rate.
ALTER TABLE public.paypal_credit_orders ADD COLUMN unit_price_cents integer NOT NULL DEFAULT 300
 CHECK(unit_price_cents BETWEEN 1 AND 42949672);
ALTER TABLE public.paypal_credit_orders DROP CONSTRAINT paypal_credit_orders_check;
ALTER TABLE public.paypal_credit_orders ADD CONSTRAINT paypal_credit_order_price_matches
 CHECK(amount_cents=credits::bigint*unit_price_cents);
CREATE FUNCTION public.prepare_paypal_credit_order_priced(p_id uuid,p_actor uuid,p_credits integer,p_environment text,p_expected_unit_price_cents integer) RETURNS public.paypal_credit_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old public.paypal_credit_orders; price integer;
BEGIN
 IF p_id IS NULL OR p_actor IS NULL OR p_credits IS NULL OR p_credits NOT IN (5,10,20,50) THEN RAISE EXCEPTION 'Invalid purchase'; END IF;
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


REVOKE ALL ON FUNCTION public.prepare_paypal_credit_order_priced(uuid,uuid,integer,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_paypal_credit_order_priced(uuid,uuid,integer,text,integer) TO service_role;
-- Legacy clients can only create the $3 price they displayed. Custom rates require the new quote.
CREATE OR REPLACE FUNCTION public.prepare_paypal_credit_order(p_id uuid,p_actor uuid,p_credits integer,p_environment text)
RETURNS public.paypal_credit_orders LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT public.prepare_paypal_credit_order_priced(p_id,p_actor,p_credits,p_environment,300);
$$;
CREATE FUNCTION public.request_manual_credits_priced(p_id uuid,p_credits integer,p_reference text,p_expected_unit_price_cents integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.profiles; existing public.manual_credit_requests; price integer;
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
 SELECT coalesce((SELECT unit_price_cents FROM public.reseller_credit_pricing WHERE reseller_id=auth.uid()),300) INTO price;
 IF price IS DISTINCT FROM p_expected_unit_price_cents THEN RAISE EXCEPTION 'price_changed'; END IF;
 INSERT INTO public.manual_credit_requests(id,reseller_id,credits,payment_reference,unit_price) VALUES(p_id,auth.uid(),p_credits,trim(p_reference),price/100.0);
 RETURN p_id;
END $$;

REVOKE ALL ON FUNCTION public.request_manual_credits_priced(uuid,integer,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_manual_credits_priced(uuid,integer,text,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.request_manual_credits(p_id uuid,p_credits integer,p_reference text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT public.request_manual_credits_priced(p_id,p_credits,p_reference,300);
$$;
COMMIT;
