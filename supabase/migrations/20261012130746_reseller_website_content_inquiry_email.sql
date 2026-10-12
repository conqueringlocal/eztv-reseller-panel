BEGIN;
CREATE FUNCTION public.valid_sales_page_content(c jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE item jsonb; key text;
BEGIN
 IF c IS NULL OR jsonb_typeof(c)<>'object' OR octet_length(c::text)>20000 THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(c) k WHERE k NOT IN('about','services','devices','show_steps','faqs')) THEN RETURN false; END IF;
 FOREACH key IN ARRAY ARRAY['about','services','devices'] LOOP
  IF c ? key AND (jsonb_typeof(c->key)<>'string' OR length(c->>key)>2000) THEN RETURN false; END IF;
 END LOOP;
 IF c ? 'show_steps' AND jsonb_typeof(c->'show_steps')<>'boolean' THEN RETURN false; END IF;
 IF c ? 'faqs' THEN
  IF jsonb_typeof(c->'faqs')<>'array' OR jsonb_array_length(c->'faqs')>6 THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(c->'faqs') LOOP
   IF jsonb_typeof(item)<>'object' OR NOT(item ? 'question' AND item ? 'answer')
    OR jsonb_typeof(item->'question')<>'string' OR jsonb_typeof(item->'answer')<>'string'
    OR length(trim(item->>'question')) NOT BETWEEN 2 AND 160 OR length(trim(item->>'answer')) NOT BETWEEN 2 AND 1000
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN('question','answer')) THEN RETURN false; END IF;
  END LOOP;
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.valid_sales_page_content(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.valid_sales_page_content(jsonb) TO authenticated,service_role;
ALTER TABLE public.reseller_sales_pages ADD COLUMN public_content jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(public.valid_sales_page_content(public_content));
CREATE OR REPLACE FUNCTION public.save_sales_page(p_revision integer,p_data jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE page public.reseller_sales_pages; owner uuid:=auth.uid(); logo text;
BEGIN
 IF owner IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=owner) THEN RAISE EXCEPTION 'Sign in required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO page FROM public.reseller_sales_pages WHERE reseller_id=owner;
 IF (page.reseller_id IS NULL AND p_revision IS DISTINCT FROM 0) OR (page.reseller_id IS NOT NULL AND page.revision IS DISTINCT FROM p_revision) THEN RAISE EXCEPTION 'Page settings changed; reload before saving'; END IF;
 IF coalesce((p_data->>'published')::boolean,false) AND (coalesce((p_data->>'public_details_confirmed')::boolean,false) IS NOT TRUE OR nullif(trim(p_data->>'contact_email'),'') IS NULL) THEN RAISE EXCEPTION 'Confirm the public details and provide a customer contact email before publishing'; END IF;
 logo:=CASE WHEN p_data ? 'logo_data_url' THEN nullif(p_data->>'logo_data_url','') ELSE page.logo_data_url END;
 IF NOT public.valid_sales_page_logo(logo) THEN RAISE EXCEPTION 'Please upload a PNG, JPG or WebP logo using the logo picker'; END IF;
 INSERT INTO public.reseller_sales_pages(reseller_id,slug,brand_name,headline,description,contact_email,accent_color,setup_notes,tutorial_url,published,logo_data_url,public_content)
 VALUES(owner,lower(trim(p_data->>'slug')),trim(p_data->>'brand_name'),trim(p_data->>'headline'),trim(coalesce(p_data->>'description','')),lower(trim(coalesce(p_data->>'contact_email',''))),coalesce(p_data->>'accent_color','#4f46e5'),trim(coalesce(p_data->>'setup_notes','')),trim(coalesce(p_data->>'tutorial_url','')),coalesce((p_data->>'published')::boolean,false),logo,CASE WHEN p_data ? 'public_content' THEN p_data->'public_content' ELSE coalesce(page.public_content,'{}'::jsonb) END)
 ON CONFLICT(reseller_id) DO UPDATE SET slug=excluded.slug,brand_name=excluded.brand_name,headline=excluded.headline,description=excluded.description,contact_email=excluded.contact_email,accent_color=excluded.accent_color,setup_notes=excluded.setup_notes,tutorial_url=excluded.tutorial_url,published=excluded.published,logo_data_url=excluded.logo_data_url,public_content=excluded.public_content,revision=reseller_sales_pages.revision+1,updated_at=now();
END $$;

CREATE OR REPLACE FUNCTION public.sales_website_gateway(p_secret text,p_action text,p_owner uuid DEFAULT NULL,p_hostname text DEFAULT NULL,p_data jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.reseller_website_domains; page public.reseller_sales_pages; next_status text;
BEGIN
 IF p_secret IS NULL OR length(p_secret)<32 OR NOT EXISTS(SELECT 1 FROM public.reseller_website_settings WHERE enabled AND gateway_secret_hash=encode(sha256(convert_to(p_secret,'UTF8')),'hex'))
 THEN RAISE EXCEPTION 'Website gateway unavailable'; END IF;
 IF p_action='list' THEN
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT reseller_id,hostname,verification_token,status,checked_at FROM public.reseller_website_domains WHERE status<>'pending' ORDER BY checked_at NULLS FIRST LIMIT 500)t),'[]'::jsonb);
 END IF;
 IF p_owner IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0)); END IF;
 SELECT * INTO d FROM public.reseller_website_domains WHERE (p_owner IS NULL OR reseller_id=p_owner) AND (p_hostname IS NULL OR hostname=p_hostname);
 IF d.reseller_id IS NULL AND p_action NOT IN('preview') THEN RETURN NULL; END IF;
 IF p_action='lookup' THEN RETURN to_jsonb(d); END IF;
 IF p_action='claim_check' THEN
  IF p_owner IS NULL OR d.last_attempt_at>now()-interval '30 seconds' THEN RETURN NULL; END IF;
  UPDATE public.reseller_website_domains SET last_attempt_at=now() WHERE reseller_id=p_owner;
  RETURN to_jsonb(d);
 END IF;
 IF p_action='status' THEN
  IF p_owner IS NULL OR d.verification_token IS DISTINCT FROM p_data->>'verification_token' THEN RETURN NULL; END IF;
  next_status:=p_data->>'status';
  IF next_status NOT IN('pending','dns_verified','ready') OR next_status IS NULL THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE public.reseller_website_domains SET status=next_status,message=left(coalesce(p_data->>'message',''),300),checked_at=now(),valid_until=CASE WHEN next_status='pending' THEN NULL ELSE now()+interval '24 hours' END WHERE reseller_id=p_owner RETURNING * INTO d;
  RETURN to_jsonb(d);
 END IF;
 IF p_action='preview' THEN
  IF p_owner IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO page FROM public.reseller_sales_pages WHERE reseller_id=p_owner;
 ELSIF p_action IN('page','inquiry') THEN
  IF d.status<>'ready' OR d.valid_until IS NULL OR d.valid_until<=now() THEN RETURN NULL; END IF;
  -- Serialize public inquiry with publish/disconnect so a detached domain cannot still create leads.
  PERFORM pg_advisory_xact_lock(hashtextextended(d.reseller_id::text,0));
  SELECT * INTO d FROM public.reseller_website_domains WHERE hostname=p_hostname AND status='ready' AND valid_until>now();
  IF d.reseller_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO page FROM public.reseller_sales_pages WHERE reseller_id=d.reseller_id AND published;
 ELSE RAISE EXCEPTION 'Unknown website operation'; END IF;
 IF page.reseller_id IS NULL THEN RETURN NULL; END IF;
 IF p_action='inquiry' THEN RETURN to_jsonb(public.submit_domain_sales_inquiry_internal((p_data->>'id')::uuid,page.slug,p_data->'inquiry',p_data->>'ip_hash')); END IF;
 RETURN jsonb_build_object('brand_name',page.brand_name,'headline',page.headline,'description',page.description,'contact_email',page.contact_email,'accent_color',page.accent_color,'logo_data_url',page.logo_data_url,'public_content',page.public_content);
END $$;

-- Each submission is saved atomically with its CRM lead and email delivery job.
CREATE TABLE public.sales_inquiry_deliveries (
 id uuid PRIMARY KEY, lead_id uuid NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
 reseller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 inquiry jsonb NOT NULL, recipient text,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','sending','sent','failed','uncertain')),
 attempts integer NOT NULL DEFAULT 0, claim_id uuid, error_code text,
 created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, finished_at timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sales_inquiry_deliveries_owner ON public.sales_inquiry_deliveries(reseller_id,created_at DESC);
CREATE INDEX sales_inquiry_deliveries_lead ON public.sales_inquiry_deliveries(lead_id);
CREATE INDEX sales_inquiry_deliveries_pending ON public.sales_inquiry_deliveries(next_attempt_at) WHERE status='queued';
ALTER TABLE public.sales_inquiry_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_inquiry_deliveries FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.sales_inquiry_deliveries TO authenticated;
GRANT ALL ON public.sales_inquiry_deliveries TO service_role;
CREATE POLICY sales_inquiry_delivery_owner ON public.sales_inquiry_deliveries FOR SELECT TO authenticated USING(reseller_id=(SELECT auth.uid()));
CREATE TABLE public.sales_inquiry_email_settings(id boolean PRIMARY KEY DEFAULT true CHECK(id),enabled boolean NOT NULL DEFAULT false);
INSERT INTO public.sales_inquiry_email_settings DEFAULT VALUES;
ALTER TABLE public.sales_inquiry_email_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_inquiry_email_settings FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.sales_inquiry_email_settings TO service_role;

CREATE OR REPLACE FUNCTION public.submit_domain_sales_inquiry_internal(p_id uuid,p_slug text,p_data jsonb,p_ip_hash text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE page public.reseller_sales_pages; ref uuid; v_email text:=lower(trim(p_data->>'email')); existing public.sales_leads; delivery public.sales_inquiry_deliveries; lead uuid;
BEGIN
 SELECT * INTO page FROM public.reseller_sales_pages WHERE slug=lower(p_slug) AND published;
 IF NOT FOUND THEN RAISE EXCEPTION 'Page unavailable'; END IF;
 IF p_id IS NULL OR p_ip_hash IS NULL OR length(p_ip_hash)<>64 OR coalesce((p_data->>'contact_consent')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Please confirm your request to be contacted'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sales-ip:'||p_ip_hash,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(page.reseller_id::text,0));
 SELECT * INTO page FROM public.reseller_sales_pages WHERE slug=lower(p_slug) AND published;
 IF NOT FOUND THEN RAISE EXCEPTION 'Page unavailable'; END IF;
 SELECT * INTO delivery FROM public.sales_inquiry_deliveries WHERE id=p_id;
 IF FOUND THEN
  IF delivery.reseller_id<>page.reseller_id OR delivery.inquiry->>'email' IS DISTINCT FROM v_email THEN RAISE EXCEPTION 'Request reference conflict'; END IF;
  RETURN 'received';
 END IF;
 -- Preserve idempotency for requests made before this migration.
 SELECT * INTO existing FROM public.sales_leads WHERE id=p_id;
 IF FOUND THEN
  IF existing.reseller_id<>page.reseller_id OR existing.email IS DISTINCT FROM v_email THEN RAISE EXCEPTION 'Request reference conflict'; END IF;
  RETURN 'received';
 END IF;
 IF (SELECT count(*) FROM public.sales_inquiry_attempts WHERE reseller_id=page.reseller_id AND created_at>now()-interval '1 hour')>=30
 OR (SELECT count(*) FROM public.sales_inquiry_attempts WHERE ip_hash=p_ip_hash AND created_at>now()-interval '1 hour')>=5 THEN RETURN 'rate_limited'; END IF;
 INSERT INTO public.sales_inquiry_attempts(reseller_id,ip_hash) VALUES(page.reseller_id,p_ip_hash);
 SELECT * INTO existing FROM public.sales_leads WHERE reseller_id=page.reseller_id AND lower(email)=v_email AND (stage NOT IN('paid','lost','refunded') OR created_at>now()-interval '1 day') ORDER BY created_at DESC LIMIT 1;
 IF FOUND THEN
  lead:=existing.id;
  UPDATE public.sales_leads SET updated_at=now(),revision=revision+1 WHERE id=lead;
 ELSE
  BEGIN ref:=nullif(p_data->>'referral','')::uuid; EXCEPTION WHEN invalid_text_representation THEN ref:=NULL; END;
  IF ref IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sales_referral_links WHERE id=ref AND reseller_id=page.reseller_id AND enabled) THEN ref:=NULL; END IF;
  lead:=p_id;
  INSERT INTO public.sales_leads(id,reseller_id,name,email,phone,device,source,stage,referral_id,next_action,follow_up_at,notes,contact_requested_at,marketing_opt_in_at)
  VALUES(lead,page.reseller_id,trim(p_data->>'name'),v_email,trim(coalesce(p_data->>'phone','')),trim(coalesce(p_data->>'device','')),CASE WHEN ref IS NULL THEN 'inquiry page' ELSE 'customer referral' END,'new',ref,'Respond to the new inquiry',now(),left(trim(coalesce(p_data->>'message','')),1000),now(),CASE WHEN coalesce((p_data->>'marketing_consent')::boolean,false) THEN now() ELSE NULL END);
 END IF;
 INSERT INTO public.sales_lead_activity(id,lead_id,reseller_id,kind,note) VALUES(gen_random_uuid(),lead,page.reseller_id,'created','Website inquiry received. Read the submission and email status below.');
 INSERT INTO public.sales_inquiry_deliveries(id,lead_id,reseller_id,inquiry) VALUES(p_id,lead,page.reseller_id,jsonb_build_object('name',left(trim(p_data->>'name'),100),'email',v_email,'phone',left(coalesce(p_data->>'phone',''),40),'device',left(coalesce(p_data->>'device',''),100),'message',left(coalesce(p_data->>'message',''),1000),'contact_consent',true,'marketing_consent',coalesce((p_data->>'marketing_consent')::boolean,false)));
 DELETE FROM public.sales_inquiry_attempts WHERE created_at<now()-interval '7 days';
 RETURN 'received';
END $$;

CREATE OR REPLACE FUNCTION public.get_sales_workspace() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 RETURN public.get_sales_workspace_without_domain() || jsonb_build_object(
 'domain',(SELECT to_jsonb(d)-'last_attempt_at' FROM public.reseller_website_domains d WHERE reseller_id=auth.uid()),
 'website_hosting',(SELECT jsonb_build_object('enabled',enabled,'ipv4',host(ipv4),'management_url',management_url) FROM public.reseller_website_settings),
 'inquiry_email',jsonb_build_object('enabled',coalesce((SELECT enabled FROM public.sales_inquiry_email_settings),false),'recipient',(SELECT email FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL)),
 'inquiry_deliveries',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY created_at DESC) FROM (SELECT id,lead_id,inquiry,recipient,status,error_code,created_at,finished_at FROM public.sales_inquiry_deliveries WHERE reseller_id=auth.uid() ORDER BY created_at DESC LIMIT 1000)t),'[]'::jsonb));
END $$;

CREATE FUNCTION public.claim_sales_inquiry_email() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.sales_inquiry_deliveries; address text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.sales_inquiry_email_settings WHERE enabled) THEN RETURN NULL; END IF;
 UPDATE public.sales_inquiry_deliveries SET status='uncertain',error_code='worker_interrupted',finished_at=now() WHERE status='sending' AND started_at<now()-interval '5 minutes';
 UPDATE public.sales_inquiry_deliveries SET status='failed',error_code='delivery_expired',finished_at=now() WHERE status='queued' AND created_at<now()-interval '24 hours';
 SELECT * INTO job FROM public.sales_inquiry_deliveries WHERE status='queued' AND next_attempt_at<=now() ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT email INTO address FROM auth.users WHERE id=job.reseller_id AND email_confirmed_at IS NOT NULL AND (banned_until IS NULL OR banned_until<now());
 IF address IS NULL THEN
  UPDATE public.sales_inquiry_deliveries SET status='failed',error_code='recipient_unavailable',finished_at=now() WHERE id=job.id;
  RETURN NULL;
 END IF;
 UPDATE public.sales_inquiry_deliveries SET status='sending',recipient=address,claim_id=gen_random_uuid(),attempts=attempts+1,started_at=now(),error_code=NULL WHERE id=job.id RETURNING * INTO job;
 RETURN to_jsonb(job);
END $$;
CREATE FUNCTION public.finish_sales_inquiry_email(p_id uuid,p_claim uuid,p_status text,p_error text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_status IS NULL OR p_status NOT IN('sent','retry','failed','uncertain') OR length(coalesce(p_error,''))>80 THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
 UPDATE public.sales_inquiry_deliveries SET status=CASE WHEN p_status='retry' THEN CASE WHEN attempts<5 THEN 'queued' ELSE 'failed' END ELSE p_status END,
 error_code=p_error,finished_at=CASE WHEN p_status='retry' AND attempts<5 THEN NULL ELSE now() END,next_attempt_at=now()+interval '2 minutes'*power(2,least(attempts,5))
 WHERE id=p_id AND claim_id=p_claim AND status='sending';
 RETURN FOUND;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM vault.secrets WHERE name='sales_inquiry_email_worker') THEN
  PERFORM vault.create_secret(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),'sales_inquiry_email_worker','Website inquiry email worker');
 END IF;
END $$;
CREATE FUNCTION public.authorize_sales_inquiry_email_worker(p_token text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT length(p_token)=64 AND EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='sales_inquiry_email_worker' AND decrypted_secret=p_token)
$$;
CREATE FUNCTION public.enqueue_sales_inquiry_email_worker() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE token text; request_id bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.sales_inquiry_email_settings WHERE enabled) OR NOT EXISTS(SELECT 1 FROM public.sales_inquiry_deliveries WHERE (status='queued' AND next_attempt_at<=now()) OR (status='sending' AND started_at<now()-interval '5 minutes')) THEN RETURN NULL; END IF;
 SELECT decrypted_secret INTO token FROM vault.decrypted_secrets WHERE name='sales_inquiry_email_worker';
 SELECT net.http_post(url:='https://hddnqgggjjlildufirof.supabase.co/functions/v1/sales-inquiry-email',headers:=jsonb_build_object('Content-Type','application/json','X-Inquiry-Email-Token',token),body:='{"action":"work"}'::jsonb,timeout_milliseconds:=120000) INTO request_id;
 RETURN request_id;
END $$;
REVOKE ALL ON FUNCTION public.claim_sales_inquiry_email(),public.finish_sales_inquiry_email(uuid,uuid,text,text),public.authorize_sales_inquiry_email_worker(text),public.enqueue_sales_inquiry_email_worker() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_sales_inquiry_email(),public.finish_sales_inquiry_email(uuid,uuid,text,text),public.authorize_sales_inquiry_email_worker(text),public.enqueue_sales_inquiry_email_worker() TO service_role;
SELECT cron.schedule('sales-inquiry-email','* * * * *','SELECT public.enqueue_sales_inquiry_email_worker();');
COMMIT;
