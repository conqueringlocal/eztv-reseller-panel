BEGIN;
-- Financial records never mint credits or call a provider. USD is the reporting currency.
CREATE TABLE public.business_entries (
 id uuid PRIMARY KEY,
 kind text NOT NULL CHECK (kind IN ('sale','payment_fee','provider_purchase','expense','refund','credit_loss','complimentary','owner_time')),
 occurred_on date NOT NULL,
 amount numeric(12,2) NOT NULL CHECK (amount >= 0 AND amount < 10000000),
 credits integer NOT NULL DEFAULT 0 CHECK (credits BETWEEN 0 AND 1000000),
 unit_cost numeric(18,8) NOT NULL CHECK (unit_cost > 0),
 reseller_id uuid REFERENCES public.profiles(id),
 reference text NOT NULL CHECK (length(reference) BETWEEN 3 AND 200),
 note text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
 related_sale_id uuid REFERENCES public.business_entries(id),
 source_request_id uuid UNIQUE REFERENCES public.manual_credit_requests(id),
 created_by uuid REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now(),
 voided_at timestamptz, voided_by uuid REFERENCES public.profiles(id), void_reason text,
 CHECK ((kind IN ('sale','provider_purchase') AND amount > 0 AND credits > 0)
 OR (kind IN ('credit_loss','complimentary') AND amount = 0 AND credits > 0)
 OR (kind IN ('expense','refund','owner_time') AND amount > 0 AND credits = 0)
 OR (kind = 'payment_fee' AND credits = 0)),
 CHECK ((kind IN ('payment_fee','refund')) = (related_sale_id IS NOT NULL))
);
CREATE INDEX business_entries_month ON public.business_entries(occurred_on);
CREATE INDEX business_entries_reseller ON public.business_entries(reseller_id);
CREATE INDEX business_entries_related_sale ON public.business_entries(related_sale_id);
CREATE UNIQUE INDEX business_entries_reference ON public.business_entries(kind,upper(trim(reference))) WHERE voided_at IS NULL;
CREATE UNIQUE INDEX business_entries_sale_fee ON public.business_entries(related_sale_id) WHERE kind='payment_fee' AND voided_at IS NULL;
ALTER TABLE public.business_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_entries FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.business_entries TO authenticated;
GRANT ALL ON public.business_entries TO service_role;
CREATE POLICY "Administrators read business records" ON public.business_entries FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

CREATE TABLE public.provider_balance_checks (
 id uuid PRIMARY KEY, credits numeric(12,2) NOT NULL CHECK(credits BETWEEN 0 AND 1000000),
 checked_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid NOT NULL REFERENCES public.profiles(id), note text NOT NULL CHECK(length(note)<=500)
);
CREATE INDEX provider_balance_checks_latest ON public.provider_balance_checks(checked_at DESC);
ALTER TABLE public.provider_balance_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_balance_checks FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.provider_balance_checks TO authenticated;
GRANT ALL ON public.provider_balance_checks TO service_role;
CREATE POLICY "Administrators read provider balances" ON public.provider_balance_checks FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

-- Internal cost estimate: latest recorded purchase before the sale; otherwise owner's planning quote.
CREATE FUNCTION public.business_unit_cost(p_date date) RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce((SELECT amount/credits FROM public.business_entries WHERE kind='provider_purchase' AND voided_at IS NULL AND occurred_on<=p_date ORDER BY occurred_on DESC,created_at DESC,id DESC LIMIT 1),100.0/60)
$$;
REVOKE ALL ON FUNCTION public.business_unit_cost(date) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.capture_manual_credit_sale() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
  INSERT INTO public.business_entries(id,kind,occurred_on,amount,credits,unit_cost,reseller_id,reference,note,source_request_id,created_by)
  VALUES(NEW.id,'sale',(NEW.reviewed_at AT TIME ZONE 'UTC')::date,NEW.credits*NEW.unit_price,NEW.credits,
   public.business_unit_cost((NEW.reviewed_at AT TIME ZONE 'UTC')::date),NEW.reseller_id,NEW.verified_reference,
   'Verified manual PayPal credit purchase',NEW.id,NEW.reviewed_by);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_manual_credit_sale() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER capture_manual_credit_sale AFTER UPDATE OF status ON public.manual_credit_requests FOR EACH ROW EXECUTE FUNCTION public.capture_manual_credit_sale();
-- Only verified approvals are imported. Historical credit adjustments are not assumed to be cash sales.
INSERT INTO public.business_entries(id,kind,occurred_on,amount,credits,unit_cost,reseller_id,reference,note,source_request_id,created_by)
SELECT id,'sale',(reviewed_at AT TIME ZONE 'UTC')::date,credits*unit_price,credits,100.0/60,reseller_id,verified_reference,'Verified manual PayPal credit purchase',id,reviewed_by
FROM public.manual_credit_requests WHERE status='approved';

CREATE FUNCTION public.record_business_entry(p_id uuid,p_kind text,p_date date,p_amount numeric,p_credits integer,p_reseller uuid,p_reference text,p_note text,p_sale uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old public.business_entries; sale public.business_entries; cost numeric;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator required'; END IF;
 IF p_id IS NULL OR p_date IS NULL OR p_date > (now() AT TIME ZONE 'UTC')::date OR p_date < DATE '2020-01-01'
 OR p_kind IS NULL OR p_amount IS NULL OR p_credits IS NULL OR p_reference IS NULL OR p_note IS NULL
 OR p_amount<>round(p_amount,2) THEN RAISE EXCEPTION 'Enter a valid date, amount and reference'; END IF;
 -- Serialize retries before checking the idempotency key; different bodies cannot reuse a key.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 SELECT * INTO old FROM public.business_entries WHERE id=p_id;
 IF FOUND THEN
  IF (old.kind,old.occurred_on,old.amount,old.credits,old.reseller_id,old.reference,old.note,old.related_sale_id)
   IS DISTINCT FROM (p_kind,p_date,p_amount,p_credits,p_reseller,upper(trim(p_reference)),trim(p_note),p_sale)
  THEN RAISE EXCEPTION 'Record reference conflict; reload the ledger'; END IF;
  RETURN old.id;
 END IF;
 IF p_kind IN ('sale','complimentary') AND p_reseller IS NULL THEN RAISE EXCEPTION 'Select a reseller'; END IF;
 IF p_kind='sale' AND EXISTS(SELECT 1 FROM public.manual_credit_requests WHERE status='approved' AND verified_reference=upper(trim(p_reference))) THEN RAISE EXCEPTION 'This payment is already recorded'; END IF;
 IF p_sale IS NOT NULL THEN
  SELECT * INTO sale FROM public.business_entries WHERE id=p_sale AND kind='sale' AND voided_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Select an active recorded sale'; END IF;
  IF p_reseller IS DISTINCT FROM sale.reseller_id OR p_date<sale.occurred_on THEN RAISE EXCEPTION 'Use the sale reseller and a date on or after payment'; END IF;
  IF p_kind='payment_fee' AND p_amount>sale.amount THEN RAISE EXCEPTION 'Fee exceeds the payment'; END IF;
  IF p_kind='refund' AND p_amount+coalesce((SELECT sum(amount) FROM public.business_entries WHERE related_sale_id=p_sale AND kind='refund' AND voided_at IS NULL),0)>sale.amount THEN RAISE EXCEPTION 'Refund exceeds remaining payment'; END IF;
 END IF;
 cost:=CASE WHEN p_kind='provider_purchase' AND p_credits>0 THEN p_amount/p_credits ELSE public.business_unit_cost(p_date) END;
 INSERT INTO public.business_entries(id,kind,occurred_on,amount,credits,unit_cost,reseller_id,reference,note,related_sale_id,created_by)
 VALUES(p_id,p_kind,p_date,p_amount,p_credits,cost,p_reseller,upper(trim(p_reference)),trim(p_note),p_sale,auth.uid());
 RETURN p_id;
END $$;

CREATE FUNCTION public.void_business_entry(p_id uuid,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE entry public.business_entries;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator required'; END IF;
 IF length(trim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Enter the correction reason'; END IF;
 SELECT * INTO entry FROM public.business_entries WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Record not found'; END IF;
 IF entry.source_request_id IS NOT NULL THEN RAISE EXCEPTION 'Verified purchases cannot be voided here. Record an actual refund separately'; END IF;
 IF EXISTS(SELECT 1 FROM public.business_entries WHERE related_sale_id=p_id AND voided_at IS NULL) THEN RAISE EXCEPTION 'Correct linked fees or refunds first'; END IF;
 UPDATE public.business_entries SET voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason) WHERE id=p_id AND voided_at IS NULL;
END $$;

CREATE FUNCTION public.record_provider_balance(p_id uuid,p_credits numeric,p_checked_at timestamptz,p_note text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old public.provider_balance_checks;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator required'; END IF;
 IF p_checked_at IS NULL OR p_checked_at>now() OR p_checked_at<now()-interval '7 days' THEN RAISE EXCEPTION 'Use the time you checked Trex, within the past 7 days'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 SELECT * INTO old FROM public.provider_balance_checks WHERE id=p_id;
 IF FOUND THEN
  IF (old.credits,old.checked_at,old.note) IS DISTINCT FROM (p_credits,p_checked_at,trim(p_note)) THEN RAISE EXCEPTION 'Record reference conflict'; END IF;
  RETURN old.id;
 END IF;
 INSERT INTO public.provider_balance_checks(id,credits,checked_at,created_by,note) VALUES(p_id,p_credits,p_checked_at,auth.uid(),trim(p_note));
 RETURN p_id;
END $$;

CREATE FUNCTION public.get_business_dashboard(p_month date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE start_day date; end_day date; balance public.provider_balance_checks; outstanding integer; cost numeric; activity boolean; held integer; summary jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator required'; END IF;
 IF p_month IS NULL THEN RAISE EXCEPTION 'Select a month'; END IF;
 start_day:=date_trunc('month',p_month)::date; end_day:=(start_day+interval '1 month')::date;
 SELECT * INTO balance FROM public.provider_balance_checks ORDER BY checked_at DESC,created_at DESC,id DESC LIMIT 1;
 SELECT coalesce(sum(credits),0) INTO outstanding FROM public.profiles WHERE role='reseller' AND provider='trex' AND NOT public.has_role(id,'admin');
 SELECT coalesce(sum(credits_reserved),0) INTO held FROM public.trex_paid_operations WHERE state IN('processing','review_required');
 cost:=public.business_unit_cost((now() AT TIME ZONE 'UTC')::date);
 activity:=balance.id IS NULL OR EXISTS(SELECT 1 FROM public.trex_paid_operations WHERE updated_at>=balance.checked_at)
 OR EXISTS(SELECT 1 FROM public.trex_provisioning_requests WHERE updated_at>=balance.checked_at)
 OR EXISTS(SELECT 1 FROM public.business_entries WHERE kind IN ('provider_purchase','credit_loss') AND greatest(created_at,voided_at)>=balance.checked_at);
 SELECT jsonb_build_object(
  'sales',coalesce(sum(amount) FILTER(WHERE kind='sale'),0),'credits_sold',coalesce(sum(credits) FILTER(WHERE kind='sale'),0),
  'fulfillment_estimate',coalesce(sum(credits*unit_cost) FILTER(WHERE kind='sale'),0),
  'fees',coalesce(sum(amount) FILTER(WHERE kind='payment_fee'),0),'refunds',coalesce(sum(amount) FILTER(WHERE kind='refund'),0),
  'expenses',coalesce(sum(amount) FILTER(WHERE kind='expense'),0),'owner_time',coalesce(sum(amount) FILTER(WHERE kind='owner_time'),0),
  'provider_purchases',coalesce(sum(amount) FILTER(WHERE kind='provider_purchase'),0),
  'provider_credits',coalesce(sum(credits) FILTER(WHERE kind='provider_purchase'),0),
  'lost_credits',coalesce(sum(credits) FILTER(WHERE kind='credit_loss'),0),
  'complimentary_credits',coalesce(sum(credits) FILTER(WHERE kind='complimentary'),0),
  'loss_estimate',coalesce(sum(credits*unit_cost) FILTER(WHERE kind IN ('credit_loss','complimentary')),0),
  'missing_fees',count(*) FILTER(WHERE kind='sale' AND NOT EXISTS(SELECT 1 FROM public.business_entries fee WHERE fee.kind='payment_fee' AND fee.related_sale_id=e.id AND fee.voided_at IS NULL))
 ) INTO summary FROM public.business_entries e WHERE occurred_on>=start_day AND occurred_on<end_day AND voided_at IS NULL;
 RETURN jsonb_build_object('month',start_day,'summary',summary,'unit_cost',cost,'planning_batch_credits',60,'planning_batch_cost',60*cost,
  'outstanding_credits',outstanding,'held_credits',held,
  'provider_balance',CASE WHEN balance.id IS NULL THEN NULL ELSE jsonb_build_object('credits',balance.credits,'checked_at',balance.checked_at) END,
  'balance_needs_check',balance.id IS NULL OR balance.checked_at<now()-interval '24 hours' OR activity,
  'pending_payments',(SELECT count(*) FROM public.manual_credit_requests WHERE status='pending'),
  'unresolved_operations',(SELECT count(*) FROM public.trex_paid_operations WHERE state IN('processing','review_required'))+(SELECT count(*) FROM public.trex_provisioning_requests WHERE state IN('processing','review_required')),
  'entries',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.occurred_on DESC,e.created_at DESC) FROM public.business_entries e WHERE e.occurred_on>=start_day AND e.occurred_on<end_day),'[]'::jsonb),
  'sales_for_review',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'reference',e.reference,'reseller_id',e.reseller_id,'amount',e.amount,'occurred_on',e.occurred_on,'needs_fee',NOT EXISTS(SELECT 1 FROM public.business_entries f WHERE f.related_sale_id=e.id AND f.kind='payment_fee' AND f.voided_at IS NULL)) ORDER BY e.occurred_on DESC) FROM public.business_entries e WHERE kind='sale' AND voided_at IS NULL),'[]'::jsonb),
  'resellers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'credits',credits)) FROM public.profiles WHERE role='reseller' AND NOT public.has_role(id,'admin')),'[]'::jsonb),
  'by_reseller',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT reseller_id,sum(amount) FILTER(WHERE kind='sale') sales,coalesce(sum(credits) FILTER(WHERE kind='sale'),0) credits_sold,
    coalesce(sum(CASE WHEN kind='sale' THEN amount-credits*unit_cost WHEN kind IN('payment_fee','refund') THEN -amount WHEN kind IN('credit_loss','complimentary') THEN -credits*unit_cost ELSE 0 END),0) contribution
    FROM public.business_entries WHERE occurred_on>=start_day AND occurred_on<end_day AND voided_at IS NULL AND reseller_id IS NOT NULL GROUP BY reseller_id) t),'[]'::jsonb),
  'legacy_unpriced_additions',(SELECT count(*) FROM public.credit_logs WHERE action='addition' AND coalesce(revenue_amount,0)=0 AND date>=start_day AND date<end_day),
  'completed_credits_used',(SELECT coalesce(sum(jsonb_array_length(lines)*months),0) FROM public.trex_paid_operations WHERE state='completed' AND updated_at>=start_day AND updated_at<end_day)
    +(SELECT coalesce(sum((request_data->>'connections')::integer*(request_data->>'planDuration')::integer),0) FROM public.trex_provisioning_requests WHERE state='completed' AND updated_at>=start_day AND updated_at<end_day)
 );
END $$;

-- Group exactly as the paid renewal coordinator does; return no provider credentials.
CREATE FUNCTION public.get_renewal_worklist() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.customers; member public.customers; lines jsonb; members uuid[]; reason text; first_expiry date; last_expiry date; result jsonb:='[]'; today date:=(now() AT TIME ZONE 'UTC')::date; line_count integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 FOR c IN SELECT DISTINCT ON (reseller_id,coalesce(nullif(customer_group,''),id::text)) * FROM public.customers
  WHERE (reseller_id=auth.uid() OR public.is_admin())
  ORDER BY reseller_id,coalesce(nullif(customer_group,''),id::text),id LOOP
  members:='{}'; lines:='[]'; reason:=NULL; first_expiry:=NULL; last_expiry:=NULL;
  -- Do not offer abandoned subscriptions or trials as ordinary renewals.
  IF NOT EXISTS(SELECT 1 FROM public.customers x WHERE x.reseller_id=c.reseller_id AND (x.id=c.id OR (nullif(c.customer_group,'') IS NOT NULL AND x.customer_group=c.customer_group))
    AND NOT coalesce(x.is_trial,false) AND NOT coalesce(x.is_deactivated,false) AND x.cancelled_at IS NULL AND coalesce(x.status,'active') NOT IN ('cancelled','deactivated')) THEN CONTINUE; END IF;
  FOR member IN SELECT * FROM public.customers WHERE reseller_id=c.reseller_id AND (id=c.id OR (nullif(c.customer_group,'') IS NOT NULL AND customer_group=c.customer_group)) LOOP
   members:=array_append(members,member.id);
   IF member.provider IS DISTINCT FROM 'trex' OR member.is_trial OR member.is_deactivated OR member.cancelled_at IS NOT NULL OR member.status IN ('cancelled','deactivated') THEN reason:='Mixed or inactive group requires review'; END IF;
   BEGIN lines:=lines||public.trex_customer_lines(member);
   EXCEPTION WHEN OTHERS THEN reason:='Connection details require review'; END;
   IF EXISTS(SELECT 1 FROM public.provider_reconciliation_checks WHERE customer_id=member.id AND outcome='unverified') THEN reason:='Provider status requires review'; END IF;
  END LOOP;
  line_count:=jsonb_array_length(lines);
  IF line_count NOT BETWEEN 1 AND 25 OR (SELECT count(DISTINCT coalesce(l->>'username',l->>'mac_address')) FROM jsonb_array_elements(lines) l)<>line_count THEN reason:='Connection details require review'; END IF;
  BEGIN
   SELECT min((l->>'expiration_date')::date),max((l->>'expiration_date')::date) INTO first_expiry,last_expiry FROM jsonb_array_elements(lines) l;
  EXCEPTION WHEN OTHERS THEN reason:='Expiry date requires review'; END;
  first_expiry:=coalesce(first_expiry,c.expiration_date); last_expiry:=coalesce(last_expiry,c.expiration_date);
  IF EXISTS(SELECT 1 FROM public.trex_paid_operations WHERE reseller_id=c.reseller_id AND state IN('processing','review_required')) OR EXISTS(SELECT 1 FROM public.trex_provisioning_requests WHERE reseller_id=c.reseller_id AND state IN('processing','review_required')) THEN reason:='An earlier operation needs review'; END IF;
  IF EXISTS(SELECT 1 FROM public.renewal_transactions WHERE customer_id=ANY(members) AND status='pending') THEN reason:='An earlier renewal needs review'; END IF;
  IF EXISTS(SELECT 1 FROM public.trex_paid_operations WHERE customer_id=ANY(members) AND kind<>'add' AND state='completed' AND created_at>now()-interval '24 hours') THEN reason:='Recently renewed; confirm expiry before another renewal'; END IF;
  IF first_expiry>today+30 AND reason IS NULL THEN CONTINUE; END IF;
  IF first_expiry<today-30 AND reason IS NULL THEN CONTINUE; END IF;
  result:=result||jsonb_build_array(jsonb_build_object('customer_id',c.id,'customer_name',c.name,'reseller_id',c.reseller_id,
   'reseller_name',(SELECT name FROM public.profiles WHERE id=c.reseller_id),'first_expiry',first_expiry,'last_expiry',last_expiry,
   'days_until',first_expiry-today,'connections',CASE WHEN reason IS NULL THEN line_count ELSE NULL END,
   'review_reason',reason,'group_rows',cardinality(members)));
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.record_business_entry(uuid,text,date,numeric,integer,uuid,text,text,uuid),public.void_business_entry(uuid,text),public.record_provider_balance(uuid,numeric,timestamptz,text),public.get_business_dashboard(date),public.get_renewal_worklist() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_business_entry(uuid,text,date,numeric,integer,uuid,text,text,uuid),public.void_business_entry(uuid,text),public.record_provider_balance(uuid,numeric,timestamptz,text),public.get_business_dashboard(date),public.get_renewal_worklist() TO authenticated;
COMMIT;
