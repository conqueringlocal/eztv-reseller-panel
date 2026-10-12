BEGIN;
CREATE TABLE public.paypal_credit_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT false,
 environment text NOT NULL DEFAULT 'live' CHECK(environment IN ('live','sandbox'))
);
INSERT INTO public.paypal_credit_settings DEFAULT VALUES;
CREATE TABLE public.paypal_credit_orders (
 id uuid PRIMARY KEY, reseller_id uuid NOT NULL REFERENCES public.profiles(id),
 environment text NOT NULL CHECK(environment IN ('live','sandbox')),
 credits integer NOT NULL CHECK(credits IN (5,10,20,50)), amount_cents integer NOT NULL,
 currency text NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
 status text NOT NULL DEFAULT 'created' CHECK(status IN ('created','credited','review_required','reviewed')),
 paypal_order_id text UNIQUE, capture_id text UNIQUE, fee_cents integer,
 review_reason text, review_note text, reviewed_by uuid REFERENCES public.profiles(id), reviewed_at timestamptz, credited_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(amount_cents=credits*300), CHECK(fee_cents IS NULL OR fee_cents BETWEEN 0 AND amount_cents)
);
CREATE INDEX paypal_credit_orders_reseller ON public.paypal_credit_orders(reseller_id,created_at DESC);
CREATE TABLE public.paypal_credit_events (
 event_id text PRIMARY KEY, event_type text NOT NULL, order_id uuid REFERENCES public.paypal_credit_orders(id),
 capture_id text, received_at timestamptz NOT NULL DEFAULT now(), outcome text NOT NULL
);
CREATE INDEX paypal_credit_events_order ON public.paypal_credit_events(order_id);
-- Shared registry prevents a payment being granted manually and automatically.
CREATE TABLE public.paypal_credit_receipts (
 reference text PRIMARY KEY, source_id uuid NOT NULL, source_kind text NOT NULL CHECK(source_kind IN ('manual','automatic')),
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.paypal_credit_receipts(reference,source_id,source_kind)
 SELECT upper(trim(verified_reference)),id,'manual' FROM public.manual_credit_requests WHERE status='approved' AND verified_reference IS NOT NULL;
ALTER TABLE public.paypal_credit_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paypal_credit_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paypal_credit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paypal_credit_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.paypal_credit_settings,public.paypal_credit_orders,public.paypal_credit_events,public.paypal_credit_receipts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.paypal_credit_settings,public.paypal_credit_orders,public.paypal_credit_events,public.paypal_credit_receipts TO service_role;
GRANT SELECT ON public.paypal_credit_orders TO authenticated;
CREATE POLICY paypal_orders_read ON public.paypal_credit_orders FOR SELECT TO authenticated USING(reseller_id=(SELECT auth.uid()) OR (SELECT public.is_admin()));
GRANT SELECT ON public.paypal_credit_events TO authenticated;
CREATE POLICY paypal_events_admin ON public.paypal_credit_events FOR SELECT TO authenticated USING((SELECT public.is_admin()));

CREATE FUNCTION public.guard_manual_paypal_receipt() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
  INSERT INTO public.paypal_credit_receipts(reference,source_id,source_kind) VALUES(upper(trim(NEW.verified_reference)),NEW.id,'manual');
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_manual_paypal_receipt() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_manual_paypal_receipt BEFORE UPDATE OF status ON public.manual_credit_requests FOR EACH ROW EXECUTE FUNCTION public.guard_manual_paypal_receipt();

CREATE FUNCTION public.prepare_paypal_credit_order(p_id uuid,p_actor uuid,p_credits integer,p_environment text) RETURNS public.paypal_credit_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old public.paypal_credit_orders;
BEGIN
 IF p_id IS NULL OR p_actor IS NULL OR p_credits IS NULL OR p_credits NOT IN (5,10,20,50) THEN RAISE EXCEPTION 'Invalid purchase'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.paypal_credit_settings WHERE enabled AND environment=p_environment) THEN RAISE EXCEPTION 'Checkout unavailable'; END IF;
 PERFORM id FROM public.profiles WHERE id=p_actor AND credit_purchase_enabled FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Purchasing not enabled'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 SELECT * INTO old FROM public.paypal_credit_orders WHERE id=p_id;
 IF FOUND THEN
  IF old.reseller_id<>p_actor OR old.credits<>p_credits OR old.environment<>p_environment THEN RAISE EXCEPTION 'Request conflict'; END IF;
  RETURN old;
 END IF;
 IF EXISTS(SELECT 1 FROM public.paypal_credit_orders WHERE reseller_id=p_actor AND status='review_required') THEN RAISE EXCEPTION 'Payment review required'; END IF;
 IF (SELECT count(*) FROM public.paypal_credit_orders WHERE reseller_id=p_actor AND created_at>now()-interval '15 minutes')>=5 THEN RAISE EXCEPTION 'Too many checkout attempts'; END IF;
 INSERT INTO public.paypal_credit_orders(id,reseller_id,credits,amount_cents,environment) VALUES(p_id,p_actor,p_credits,p_credits*300,p_environment) RETURNING * INTO old;
 RETURN old;
END $$;

-- Durable state transition, balance, ledger, sale, fee and event commit together.
CREATE FUNCTION public.fulfill_paypal_credit_order(p_id uuid,p_environment text,p_order text,p_capture text,p_amount integer,p_fee integer,p_event text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.paypal_credit_orders; receipt public.paypal_credit_receipts; cost numeric; day date;
BEGIN
 SELECT * INTO r FROM public.paypal_credit_orders WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR r.environment IS DISTINCT FROM p_environment OR r.paypal_order_id IS DISTINCT FROM p_order
 OR r.amount_cents IS DISTINCT FROM p_amount OR p_capture IS NULL OR p_capture !~ '^[A-Z0-9]{8,64}$'
 OR (p_fee IS NOT NULL AND (p_fee<0 OR p_fee>p_amount)) THEN RAISE EXCEPTION 'Payment mismatch'; END IF;
 IF r.capture_id IS NOT NULL AND r.capture_id<>p_capture THEN RAISE EXCEPTION 'Capture mismatch'; END IF;
 IF p_event IS NOT NULL THEN
  INSERT INTO public.paypal_credit_events(event_id,event_type,order_id,capture_id,outcome)
  VALUES(p_event,'PAYMENT.CAPTURE.COMPLETED',r.id,p_capture,'verified') ON CONFLICT DO NOTHING;
 END IF;
 IF r.status<>'created' THEN RETURN r.status; END IF;
 INSERT INTO public.paypal_credit_receipts(reference,source_id,source_kind) VALUES(p_capture,r.id,'automatic') ON CONFLICT DO NOTHING;
 SELECT * INTO receipt FROM public.paypal_credit_receipts WHERE reference=p_capture;
 IF receipt.source_id<>r.id OR receipt.source_kind<>'automatic' THEN
  UPDATE public.paypal_credit_orders SET status='review_required',capture_id=p_capture,review_reason='Payment reference already used; reconcile manual credit approval' WHERE id=r.id;
  RETURN 'review_required';
 END IF;
 UPDATE public.profiles SET credits=credits+r.credits WHERE id=r.reseller_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Missing reseller'; END IF;
 INSERT INTO public.credit_logs(reseller_id,action,credits_used,revenue_amount,notes)
 VALUES(r.reseller_id,'addition',r.credits,r.amount_cents/100.0,'PayPal checkout '||r.id||'; capture '||p_capture);
 day:=(now() AT TIME ZONE 'UTC')::date; cost:=public.business_unit_cost(day);
 INSERT INTO public.business_entries(id,kind,occurred_on,amount,credits,unit_cost,reseller_id,reference,note)
 VALUES(r.id,'sale',day,r.amount_cents/100.0,r.credits,cost,r.reseller_id,p_capture,'Automatic verified PayPal credit purchase');
 IF p_fee IS NOT NULL THEN
  INSERT INTO public.business_entries(id,kind,occurred_on,amount,credits,unit_cost,reseller_id,reference,note,related_sale_id)
  VALUES(gen_random_uuid(),'payment_fee',day,p_fee/100.0,0,cost,r.reseller_id,p_capture,'PayPal reported processing fee',r.id);
 END IF;
 UPDATE public.paypal_credit_orders SET status='credited',capture_id=p_capture,fee_cents=p_fee,credited_at=now() WHERE id=r.id;
 RETURN 'credited';
END $$;

-- V1 has whole-credit balances. Refunds/reversals/disputes go to explicit review;
-- never apply V2 fractional-unit refund arithmetic to the legacy integer wallet.
CREATE FUNCTION public.review_paypal_credit_event(p_event text,p_type text,p_capture text,p_order text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.paypal_credit_orders;
BEGIN
 IF p_type NOT IN ('PAYMENT.CAPTURE.REFUNDED','PAYMENT.CAPTURE.REVERSED','CUSTOMER.DISPUTE.CREATED','PAYMENT.CAPTURE.DENIED','PAYMENT.CAPTURE.DECLINED') THEN RAISE EXCEPTION 'Unexpected event'; END IF;
 SELECT * INTO r FROM public.paypal_credit_orders WHERE capture_id=p_capture OR (p_order IS NOT NULL AND paypal_order_id=p_order) ORDER BY created_at LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not yet linked; retry event'; END IF;
 INSERT INTO public.paypal_credit_events(event_id,event_type,order_id,capture_id,outcome) VALUES(p_event,p_type,r.id,p_capture,'review_required') ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN 'duplicate'; END IF;
 UPDATE public.paypal_credit_orders SET status='review_required',review_reason=p_type WHERE id=r.id;
 RETURN 'review_required';
END $$;
REVOKE ALL ON FUNCTION public.prepare_paypal_credit_order(uuid,uuid,integer,text),public.fulfill_paypal_credit_order(uuid,text,text,text,integer,integer,text),public.review_paypal_credit_event(text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_paypal_credit_order(uuid,uuid,integer,text),public.fulfill_paypal_credit_order(uuid,text,text,text,integer,integer,text),public.review_paypal_credit_event(text,text,text,text) TO service_role;
CREATE FUNCTION public.resolve_paypal_credit_review(p_id uuid,p_note text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator required'; END IF;
 IF length(trim(coalesce(p_note,''))) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'Record the payment, refund and credit adjustment outcome'; END IF;
 UPDATE public.paypal_credit_orders SET status='reviewed',review_note=trim(p_note),reviewed_by=auth.uid(),reviewed_at=now() WHERE id=p_id AND status='review_required';
 IF NOT FOUND THEN RAISE EXCEPTION 'No open review'; END IF;
 RETURN 'reviewed';
END $$;
CREATE INDEX paypal_credit_orders_reviewer ON public.paypal_credit_orders(reviewed_by);
REVOKE ALL ON FUNCTION public.resolve_paypal_credit_review(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resolve_paypal_credit_review(uuid,text) TO authenticated;
COMMIT;
