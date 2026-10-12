BEGIN;
CREATE TABLE public.customer_email_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT false,
 last_batch_at timestamptz
);
INSERT INTO public.customer_email_settings DEFAULT VALUES;
CREATE TABLE public.customer_email_jobs (
 id uuid PRIMARY KEY, customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
 reseller_id uuid NOT NULL REFERENCES public.profiles(id), requested_by uuid REFERENCES public.profiles(id),
 source_request uuid UNIQUE REFERENCES public.trex_provisioning_requests(id),
 source text NOT NULL CHECK(source IN ('automatic','manual')),
 recipient text NOT NULL, content_version text,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','failed','uncertain','cancelled')),
 error_code text, claim_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz, finished_at timestamptz
);
CREATE INDEX customer_email_jobs_customer ON public.customer_email_jobs(customer_id,created_at DESC);
CREATE INDEX customer_email_jobs_reseller ON public.customer_email_jobs(reseller_id,created_at DESC);
CREATE INDEX customer_email_jobs_actor ON public.customer_email_jobs(requested_by);
CREATE INDEX customer_email_jobs_pending ON public.customer_email_jobs(created_at) WHERE status='queued';
CREATE UNIQUE INDEX customer_email_jobs_one_pending ON public.customer_email_jobs(customer_id) WHERE status IN ('queued','sending');
CREATE INDEX trex_email_intents ON public.trex_provisioning_requests(created_at) WHERE state='completed' AND request_data->>'sendSetupEmail'='true';
ALTER TABLE public.customer_email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_email_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_email_settings,public.customer_email_jobs FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.customer_email_settings,public.customer_email_jobs TO service_role;

-- Service-only payload: ownership is checked against an Auth-verified actor.
-- No credentials or message body are duplicated into the delivery queue.
CREATE FUNCTION public.customer_setup_email_data(p_customer uuid,p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.customers; lines jsonb; reply_to text; reseller_name text; payload jsonb;
BEGIN
 SELECT * INTO c FROM public.customers WHERE id=p_customer;
 IF NOT FOUND OR p_actor IS NULL OR (c.reseller_id<>p_actor AND NOT public.has_role(p_actor,'admin')) THEN RAISE EXCEPTION 'Customer unavailable'; END IF;
 IF c.is_deactivated OR c.status IN ('cancelled','deactivated','inactive') THEN RAISE EXCEPTION 'Customer inactive'; END IF;
 IF c.email !~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$' OR length(c.email)>254 THEN RAISE EXCEPTION 'Customer email needs correction'; END IF;
 IF EXISTS(SELECT 1 FROM public.trex_provisioning_requests WHERE response->>'customerId'=c.id::text AND state IN ('processing','review_required')) THEN RAISE EXCEPTION 'Creation needs review'; END IF;
 SELECT jsonb_agg(l ORDER BY (l->>'connection_number')::integer) INTO lines
 FROM jsonb_array_elements(public.trex_customer_lines(c)) l
 WHERE coalesce(l->>'status',c.status,'active')='active'
 AND coalesce(l->>'is_deactivated','false')<>'true'
 AND (l->>'expiration_date')::date>=current_date;
 IF lines IS NULL OR jsonb_array_length(lines)>20 THEN RAISE EXCEPTION 'No current connections available'; END IF;
 SELECT coalesce(nullif(trim(s.contact_email),''),p.email),p.name INTO reply_to,reseller_name
 FROM public.profiles p LEFT JOIN public.reseller_sales_pages s ON s.reseller_id=p.id WHERE p.id=c.reseller_id;
 IF reply_to !~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$' OR length(reply_to)>254 THEN RAISE EXCEPTION 'Reseller support email needs correction'; END IF;
 payload:=jsonb_build_object('customer_id',c.id,'reseller_id',c.reseller_id,'name',c.name,'recipient',trim(c.email),'reply_to',reply_to,'reseller_name',reseller_name,'lines',lines);
 RETURN payload||jsonb_build_object('version',md5(payload::text));
END $$;

CREATE FUNCTION public.request_customer_setup_email(p_customer uuid,p_actor uuid,p_id uuid,p_version text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE payload jsonb; job public.customer_email_jobs;
BEGIN
 IF p_id IS NULL THEN RAISE EXCEPTION 'Request reference required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('customer-email:'||p_customer::text,0));
 payload:=public.customer_setup_email_data(p_customer,p_actor);
 PERFORM pg_advisory_xact_lock(hashtextextended('reseller-email:'||(payload->>'reseller_id'),0));
 SELECT * INTO job FROM public.customer_email_jobs WHERE id=p_id;
 IF FOUND THEN
  IF job.customer_id IS DISTINCT FROM p_customer OR job.requested_by IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Request reference conflict'; END IF;
  RETURN jsonb_build_object('id',job.id,'status',job.status,'replayed',true);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.customer_email_settings WHERE enabled) THEN RAISE EXCEPTION 'Email sending is temporarily unavailable'; END IF;
 IF p_version IS DISTINCT FROM payload->>'version' THEN RAISE EXCEPTION 'Details changed; reload preview'; END IF;
 SELECT * INTO job FROM public.customer_email_jobs WHERE customer_id=p_customer AND status IN ('queued','sending') ORDER BY created_at DESC LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('id',job.id,'status',job.status,'replayed',true); END IF;
 IF EXISTS(SELECT 1 FROM public.customer_email_jobs WHERE customer_id=p_customer AND created_at>now()-interval '1 minute') THEN RAISE EXCEPTION 'Please wait one minute before sending again'; END IF;
 IF (SELECT count(*) FROM public.customer_email_jobs WHERE reseller_id=(payload->>'reseller_id')::uuid AND source='manual' AND created_at>now()-interval '1 hour')>=100 THEN RAISE EXCEPTION 'Hourly email limit reached'; END IF;
 INSERT INTO public.customer_email_jobs(id,customer_id,reseller_id,requested_by,source,recipient,content_version)
 VALUES(p_id,p_customer,(payload->>'reseller_id')::uuid,p_actor,'manual',payload->>'recipient',payload->>'version') RETURNING * INTO job;
 RETURN jsonb_build_object('id',job.id,'status',job.status,'replayed',false);
END $$;

-- The original provisioning request stores the opt-in before any provider call.
-- Collecting completed intents is independent of provisioning and safe to repeat.
CREATE FUNCTION public.collect_customer_setup_emails() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.trex_provisioning_requests; c public.customers; count_added integer:=0; reason text;
BEGIN
 FOR r IN SELECT t.* FROM public.trex_provisioning_requests t
 WHERE t.state='completed' AND t.request_data->>'sendSetupEmail'='true'
 AND NOT EXISTS(SELECT 1 FROM public.customer_email_jobs j WHERE j.source_request=t.id)
 ORDER BY t.created_at LIMIT 50 LOOP
  SELECT * INTO c FROM public.customers WHERE id::text=r.response->>'customerId' AND reseller_id=r.reseller_id;
  IF NOT FOUND THEN
   INSERT INTO public.customer_email_jobs(id,customer_id,reseller_id,source_request,source,recipient,status,error_code,finished_at)
   VALUES(gen_random_uuid(),NULL,r.reseller_id,r.id,'automatic',coalesce(r.request_data->>'email',''),'cancelled','customer_unavailable',now()) ON CONFLICT DO NOTHING;
   CONTINUE;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('customer-email:'||c.id::text,0));
  reason:=NULL;
  IF r.created_at<now()-interval '24 hours' THEN reason:='request_expired'; END IF;
  IF EXISTS(SELECT 1 FROM public.customer_email_jobs WHERE customer_id=c.id AND (status IN ('queued','sending') OR (source='manual' AND status IN ('sent','uncertain') AND created_at>=r.created_at))) THEN reason:='existing_delivery'; END IF;
  INSERT INTO public.customer_email_jobs(id,customer_id,reseller_id,source_request,source,recipient,status,error_code,finished_at)
  VALUES(gen_random_uuid(),c.id,c.reseller_id,r.id,'automatic',coalesce(r.request_data->>'email',c.email),CASE WHEN reason IS NULL THEN 'queued' ELSE 'cancelled' END,reason,CASE WHEN reason IS NULL THEN NULL ELSE now() END)
  ON CONFLICT DO NOTHING;
  IF FOUND THEN count_added:=count_added+1; END IF;
 END LOOP;
 RETURN count_added;
END $$;

CREATE FUNCTION public.claim_customer_setup_emails() RETURNS SETOF public.customer_email_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.customer_email_settings;
BEGIN
 SELECT * INTO s FROM public.customer_email_settings WHERE id=true FOR UPDATE;
 IF NOT s.enabled OR s.last_batch_at>now()-interval '60 seconds' THEN RETURN; END IF;
 UPDATE public.customer_email_settings SET last_batch_at=now() WHERE id=true;
 UPDATE public.customer_email_jobs SET status='uncertain',error_code='worker_interrupted',finished_at=now()
 WHERE status='sending' AND started_at<now()-interval '5 minutes';
 UPDATE public.customer_email_jobs SET status='cancelled',error_code='request_expired',finished_at=now()
 WHERE status='queued' AND created_at<now()-interval '24 hours';
 RETURN QUERY UPDATE public.customer_email_jobs SET status='sending',claim_id=gen_random_uuid(),started_at=now()
 WHERE id IN (SELECT id FROM public.customer_email_jobs WHERE status='queued' ORDER BY created_at LIMIT 4 FOR UPDATE SKIP LOCKED)
 RETURNING *;
END $$;
CREATE FUNCTION public.finish_customer_setup_email(p_id uuid,p_claim uuid,p_status text,p_error text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_status NOT IN ('sent','failed','uncertain','cancelled') OR length(coalesce(p_error,''))>80 THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
 UPDATE public.customer_email_jobs SET status=p_status,error_code=p_error,finished_at=now()
 WHERE id=p_id AND claim_id=p_claim AND status='sending';
 RETURN FOUND;
END $$;

DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM vault.secrets WHERE name='customer_setup_email_worker') THEN
  PERFORM vault.create_secret(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),'customer_setup_email_worker','Customer setup email worker');
 END IF;
END $$;
CREATE FUNCTION public.authorize_customer_email_worker(p_token text) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT length(p_token)=64 AND EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='customer_setup_email_worker' AND decrypted_secret=p_token)
$$;
CREATE FUNCTION public.enqueue_customer_email_worker() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE token text; request_id bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.customer_email_settings WHERE enabled) THEN RETURN NULL; END IF;
 PERFORM public.collect_customer_setup_emails();
 IF NOT EXISTS(SELECT 1 FROM public.customer_email_jobs WHERE status IN ('queued','sending')) THEN RETURN NULL; END IF;
 SELECT decrypted_secret INTO token FROM vault.decrypted_secrets WHERE name='customer_setup_email_worker';
 SELECT net.http_post(url:='https://hddnqgggjjlildufirof.supabase.co/functions/v1/customer-setup-email',
 headers:=jsonb_build_object('Content-Type','application/json','X-Customer-Email-Token',token),body:='{"action":"work"}'::jsonb,timeout_milliseconds:=120000) INTO request_id;
 RETURN request_id;
END $$;

REVOKE ALL ON FUNCTION public.customer_setup_email_data(uuid,uuid),public.request_customer_setup_email(uuid,uuid,uuid,text),public.collect_customer_setup_emails(),public.claim_customer_setup_emails(),public.finish_customer_setup_email(uuid,uuid,text,text),public.authorize_customer_email_worker(text),public.enqueue_customer_email_worker() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.customer_setup_email_data(uuid,uuid),public.request_customer_setup_email(uuid,uuid,uuid,text),public.collect_customer_setup_emails(),public.claim_customer_setup_emails(),public.finish_customer_setup_email(uuid,uuid,text,text),public.authorize_customer_email_worker(text),public.enqueue_customer_email_worker() TO service_role;
SELECT cron.schedule('customer-setup-email','* * * * *','SELECT public.enqueue_customer_email_worker();');
COMMIT;
