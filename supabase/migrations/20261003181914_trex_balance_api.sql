BEGIN;
ALTER TABLE public.provider_balance_checks ADD COLUMN source text NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','api'));
ALTER TABLE public.provider_balance_checks ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.provider_balance_checks ADD CONSTRAINT provider_balance_manual_author CHECK(source='api' OR created_by IS NOT NULL);
CREATE TABLE public.trex_balance_sync_state (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 claim_id uuid, checked_at timestamptz, lease_until timestamptz, last_attempt_at timestamptz,
 last_success_at timestamptz, last_error text
);
INSERT INTO public.trex_balance_sync_state(singleton) VALUES(true);
ALTER TABLE public.trex_balance_sync_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trex_balance_sync_state FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.trex_balance_sync_state TO service_role;

CREATE FUNCTION public.claim_trex_balance_sync() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE state public.trex_balance_sync_state; claim uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO state FROM public.trex_balance_sync_state WHERE singleton FOR UPDATE;
 IF state.lease_until>now() OR state.last_attempt_at>now()-interval '60 seconds' THEN
  RETURN jsonb_build_object('claimed',false,'syncing',state.lease_until>now(),'last_error',state.last_error);
 END IF;
 UPDATE public.trex_balance_sync_state SET claim_id=claim,checked_at=now(),lease_until=now()+interval '30 seconds',last_attempt_at=now() WHERE singleton;
 RETURN jsonb_build_object('claimed',true,'claim_id',claim,'checked_at',now());
END $$;
CREATE FUNCTION public.finish_trex_balance_sync(p_claim uuid,p_credits numeric,p_error text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE state public.trex_balance_sync_state;
BEGIN
 SELECT * INTO state FROM public.trex_balance_sync_state WHERE singleton FOR UPDATE;
 IF state.claim_id IS DISTINCT FROM p_claim OR p_claim IS NULL THEN RETURN false; END IF;
 IF p_error IS NULL THEN
  IF p_credits IS NULL OR p_credits<0 OR p_credits>1000000 OR p_credits<>round(p_credits,2) THEN RAISE EXCEPTION 'Invalid balance'; END IF;
  INSERT INTO public.provider_balance_checks(id,credits,checked_at,source,note) VALUES(p_claim,p_credits,state.checked_at,'api','Trex reseller_info API');
 END IF;
 UPDATE public.trex_balance_sync_state SET claim_id=NULL,lease_until=NULL,
  last_success_at=CASE WHEN p_error IS NULL THEN state.checked_at ELSE last_success_at END,last_error=left(p_error,100) WHERE singleton;
 RETURN true;
END $$;
-- A dedicated random scheduler token is encrypted at rest in Vault, never exposed to browsers.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM vault.secrets WHERE name='trex_balance_sync_token') THEN
  PERFORM vault.create_secret(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),'trex_balance_sync_token','Scheduled read-only Trex balance checks');
 END IF;
END $$;
CREATE FUNCTION public.authorize_trex_balance_sync(p_token text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT length(p_token)=64 AND EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='trex_balance_sync_token' AND decrypted_secret=p_token)
$$;
CREATE FUNCTION public.enqueue_trex_balance_sync() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE token text; request_id bigint;
BEGIN
 SELECT decrypted_secret INTO token FROM vault.decrypted_secrets WHERE name='trex_balance_sync_token';
 IF token IS NULL THEN RAISE EXCEPTION 'Scheduler token missing'; END IF;
 SELECT net.http_post(url:='https://hddnqgggjjlildufirof.supabase.co/functions/v1/sync-trex-balance',
  headers:=jsonb_build_object('Content-Type','application/json','X-Trex-Balance-Token',token),body:='{}'::jsonb,timeout_milliseconds:=20000) INTO request_id;
 RETURN request_id;
END $$;
REVOKE ALL ON FUNCTION public.claim_trex_balance_sync(),public.finish_trex_balance_sync(uuid,numeric,text),public.authorize_trex_balance_sync(text),public.enqueue_trex_balance_sync() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_trex_balance_sync(),public.finish_trex_balance_sync(uuid,numeric,text),public.authorize_trex_balance_sync(text),public.enqueue_trex_balance_sync() TO service_role;
SELECT cron.schedule('trex-balance-sync','*/5 * * * *','SELECT public.enqueue_trex_balance_sync();');

CREATE OR REPLACE FUNCTION public.get_business_dashboard(p_month date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
  'provider_balance',CASE WHEN balance.id IS NULL THEN NULL ELSE jsonb_build_object('credits',balance.credits,'checked_at',balance.checked_at,'source',balance.source) END,
  'balance_needs_check',balance.id IS NULL OR balance.checked_at<now()-CASE WHEN balance.source='api' THEN interval '10 minutes' ELSE interval '24 hours' END OR activity OR EXISTS(SELECT 1 FROM public.trex_balance_sync_state WHERE last_error IS NOT NULL),
  'balance_sync_error',(SELECT last_error FROM public.trex_balance_sync_state WHERE singleton),
  'balance_sync_attempt_at',(SELECT last_attempt_at FROM public.trex_balance_sync_state WHERE singleton),
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


COMMIT;
