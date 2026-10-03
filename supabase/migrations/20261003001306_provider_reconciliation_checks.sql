BEGIN;
CREATE TABLE public.provider_reconciliation_checks(
 customer_id uuid NOT NULL REFERENCES public.customers ON DELETE CASCADE,
 connection_number integer NOT NULL, outcome text NOT NULL CHECK(outcome IN('verified','unverified')),
 provider_expiry date, checked_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(customer_id,connection_number)
);
ALTER TABLE public.provider_reconciliation_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_reconciliation_checks FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.provider_reconciliation_checks TO authenticated;
GRANT ALL ON public.provider_reconciliation_checks TO service_role;
CREATE POLICY "Admins view provider reconciliation" ON public.provider_reconciliation_checks FOR SELECT TO authenticated USING((SELECT public.is_admin()));
CREATE OR REPLACE FUNCTION public.get_operation_review_queue() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator required'; END IF;
 RETURN coalesce((SELECT jsonb_agg(x ORDER BY x->>'created_at') FROM (
 SELECT jsonb_build_object('id',id,'reseller_id',reseller_id,'customer_id',customer_id,'kind',kind,'state',state,'created_at',created_at,'reserved_credits',credits_reserved,'confirmed_lines',jsonb_array_length(receipts)) x FROM public.trex_paid_operations WHERE state IN('processing','review_required')
 UNION ALL SELECT jsonb_build_object('id',id,'reseller_id',reseller_id,'kind','creation','state',state,'created_at',created_at,'confirmed_lines',jsonb_array_length(receipts)) FROM public.trex_provisioning_requests WHERE state IN('processing','review_required')
 UNION ALL SELECT jsonb_build_object('id',id,'reseller_id',reseller_id,'customer_id',customer_id,'kind','historical renewal','state','review_required','created_at',created_at,'reserved_credits',NULL,'confirmed_lines',NULL) FROM public.renewal_transactions WHERE status='pending'
 UNION ALL SELECT jsonb_build_object('id',c.id,'reseller_id',c.reseller_id,'customer_id',c.id,'kind','provider status','state','unverified','created_at',min(r.checked_at),'unverified_lines',count(*)) FROM public.provider_reconciliation_checks r JOIN public.customers c ON c.id=r.customer_id WHERE r.outcome='unverified' GROUP BY c.id,c.reseller_id
 UNION ALL SELECT jsonb_build_object('id',id,'reseller_id',reseller_id,'kind','historical duplicate accounts','state','review_required','created_at',created_at,'unverified_lines',jsonb_array_length(request_data->'historicalDuplicateAccountRefs')) FROM public.trex_provisioning_requests WHERE jsonb_typeof(request_data->'historicalDuplicateAccountRefs')='array' AND jsonb_array_length(request_data->'historicalDuplicateAccountRefs')>0
 ) q),'[]'::jsonb);
END $$;

COMMIT;
