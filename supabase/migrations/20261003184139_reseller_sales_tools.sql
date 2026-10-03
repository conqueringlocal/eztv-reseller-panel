BEGIN;
CREATE TABLE public.reseller_sales_pages (
 reseller_id uuid PRIMARY KEY REFERENCES public.profiles(id),
 slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9][a-z0-9-]{2,47}$'),
 brand_name text NOT NULL CHECK(length(brand_name) BETWEEN 2 AND 80),
 headline text NOT NULL CHECK(length(headline) BETWEEN 2 AND 160),
 description text NOT NULL DEFAULT '' CHECK(length(description)<=1200),
 contact_email text NOT NULL DEFAULT '' CHECK(contact_email='' OR contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 accent_color text NOT NULL DEFAULT '#4f46e5' CHECK(accent_color ~ '^#[0-9a-fA-F]{6}$'),
 setup_notes text NOT NULL DEFAULT '' CHECK(length(setup_notes)<=6000),
 tutorial_url text NOT NULL DEFAULT '' CHECK(tutorial_url='' OR tutorial_url ~ '^https://[^[:space:]]+$'),
 published boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.sales_referral_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reseller_id uuid NOT NULL REFERENCES public.profiles(id),
 customer_id uuid NOT NULL REFERENCES public.customers(id), label text NOT NULL CHECK(length(label) BETWEEN 2 AND 100),
 enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(reseller_id,customer_id)
);
CREATE INDEX sales_referrals_customer ON public.sales_referral_links(customer_id);
CREATE TABLE public.sales_leads (
 id uuid PRIMARY KEY, reseller_id uuid NOT NULL REFERENCES public.profiles(id),
 name text NOT NULL CHECK(length(name) BETWEEN 2 AND 100), email text NOT NULL CHECK(length(email)<=254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 phone text NOT NULL DEFAULT '' CHECK(length(phone)<=40), device text NOT NULL DEFAULT '' CHECK(length(device)<=100),
 source text NOT NULL DEFAULT 'manual' CHECK(length(source)<=100),
 stage text NOT NULL DEFAULT 'new' CHECK(stage IN ('new','setup','trial','follow_up','paid','lost','refunded')),
 customer_id uuid REFERENCES public.customers(id), referral_id uuid REFERENCES public.sales_referral_links(id),
 next_action text NOT NULL DEFAULT '' CHECK(length(next_action)<=200), follow_up_at timestamptz CHECK(isfinite(follow_up_at)),
 trial_started_at timestamptz, trial_ends_at timestamptz CHECK(isfinite(trial_ends_at)),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=3000), lost_reason text NOT NULL DEFAULT '' CHECK(length(lost_reason)<=500),
 paid_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK(paid_amount BETWEEN 0 AND 1000000), payment_reference text CHECK(length(payment_reference) BETWEEN 3 AND 200),
 paid_at timestamptz, refund_reference text CHECK(length(refund_reference) BETWEEN 3 AND 200), refunded_at timestamptz,
 do_not_contact boolean NOT NULL DEFAULT false, contact_requested_at timestamptz, marketing_opt_in_at timestamptz,
 revision integer NOT NULL DEFAULT 1, last_command uuid, last_payload jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(stage NOT IN('paid','refunded') OR (paid_amount>0 AND payment_reference IS NOT NULL AND paid_at IS NOT NULL)),
 CHECK(stage<>'refunded' OR refund_reference IS NOT NULL)
);
CREATE INDEX sales_leads_due ON public.sales_leads(reseller_id,follow_up_at);
CREATE INDEX sales_leads_created ON public.sales_leads(reseller_id,created_at DESC);
CREATE INDEX sales_leads_customer ON public.sales_leads(customer_id);
CREATE INDEX sales_leads_referral ON public.sales_leads(referral_id);
CREATE UNIQUE INDEX sales_leads_open_email ON public.sales_leads(reseller_id,lower(email)) WHERE stage NOT IN('paid','lost','refunded');
CREATE UNIQUE INDEX sales_leads_payment ON public.sales_leads(reseller_id,upper(payment_reference)) WHERE payment_reference IS NOT NULL;
CREATE TABLE public.sales_lead_activity (
 id uuid PRIMARY KEY, lead_id uuid NOT NULL REFERENCES public.sales_leads(id), reseller_id uuid NOT NULL REFERENCES public.profiles(id),
 kind text NOT NULL CHECK(kind IN('created','updated','contacted','trial_import','reward')),
 note text NOT NULL CHECK(length(note)<=1000), next_follow_up_at timestamptz, minutes integer NOT NULL DEFAULT 0 CHECK(minutes BETWEEN 0 AND 1440),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sales_activity_owner ON public.sales_lead_activity(reseller_id,created_at DESC);
CREATE INDEX sales_activity_lead ON public.sales_lead_activity(lead_id,created_at DESC);
CREATE TABLE public.sales_referral_rewards (
 lead_id uuid PRIMARY KEY REFERENCES public.sales_leads(id), reseller_id uuid NOT NULL REFERENCES public.profiles(id),
 credits integer NOT NULL CHECK(credits BETWEEN 0 AND 100), cash_amount numeric(12,2) NOT NULL CHECK(cash_amount BETWEEN 0 AND 10000),
 reference text NOT NULL CHECK(length(reference) BETWEEN 3 AND 200), note text NOT NULL CHECK(length(note)<=1000),
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(credits>0 OR cash_amount>0), UNIQUE(reseller_id,reference)
);
CREATE TABLE public.sales_inquiry_attempts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, reseller_id uuid NOT NULL REFERENCES public.profiles(id), ip_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sales_inquiry_limits ON public.sales_inquiry_attempts(reseller_id,created_at);
CREATE INDEX sales_inquiry_ip ON public.sales_inquiry_attempts(ip_hash,created_at);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['reseller_sales_pages','sales_referral_links','sales_leads','sales_lead_activity','sales_referral_rewards'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY "Read own sales records" ON public.%I FOR SELECT TO authenticated USING(reseller_id=(SELECT auth.uid()) OR (SELECT public.is_admin()))',t);
 END LOOP;
END $$;
ALTER TABLE public.sales_inquiry_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_inquiry_attempts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.sales_inquiry_attempts TO service_role;

CREATE FUNCTION public.save_sales_lead(p_id uuid,p_revision integer,p_command uuid,p_data jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old public.sales_leads; owner uuid:=auth.uid(); cust uuid; ref uuid; next_stage text; amount numeric; payref text; refundref text;
BEGIN
 IF owner IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=owner) THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF p_id IS NULL OR p_command IS NULL OR p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION 'Invalid lead'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 SELECT * INTO old FROM public.sales_leads WHERE id=p_id FOR UPDATE;
 IF FOUND AND old.reseller_id<>owner THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF old.last_command=p_command THEN
  IF old.last_payload IS DISTINCT FROM p_data THEN RAISE EXCEPTION 'Save reference conflict'; END IF;
  RETURN old.id;
 END IF;
 IF (old.id IS NULL AND p_revision IS DISTINCT FROM 0) OR (old.id IS NOT NULL AND old.revision IS DISTINCT FROM p_revision) THEN RAISE EXCEPTION 'This lead changed. Reload before saving'; END IF;
 cust:=nullif(p_data->>'customer_id','')::uuid; ref:=coalesce(old.referral_id,nullif(p_data->>'referral_id','')::uuid);
 IF cust IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.customers WHERE id=cust AND reseller_id=owner) THEN RAISE EXCEPTION 'Customer belongs to another reseller'; END IF;
 IF ref IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sales_referral_links WHERE id=ref AND reseller_id=owner) THEN RAISE EXCEPTION 'Invalid referral'; END IF;
 next_stage:=coalesce(p_data->>'stage','new'); amount:=coalesce(nullif(p_data->>'paid_amount','')::numeric,0); payref:=nullif(upper(trim(p_data->>'payment_reference')),''); refundref:=nullif(upper(trim(p_data->>'refund_reference')),'');
 IF amount<>round(amount,2) THEN RAISE EXCEPTION 'Use two decimal places'; END IF;
 IF old.stage IN('paid','refunded') AND (next_stage NOT IN('paid','refunded') OR old.paid_amount<>amount OR old.payment_reference IS DISTINCT FROM payref) THEN RAISE EXCEPTION 'Keep the original payment. Record a full refund separately using Refunded'; END IF;
 IF old.stage='refunded' AND next_stage<>'refunded' THEN RAISE EXCEPTION 'Refunded leads cannot be reopened'; END IF;
 IF next_stage='paid' AND old.paid_at IS NULL AND coalesce((p_data->>'payment_verified')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Verify receipt of payment before recording a sale'; END IF;
 IF next_stage='refunded' AND (old.paid_at IS NULL OR coalesce((p_data->>'refund_verified')::boolean,false) IS NOT TRUE) THEN RAISE EXCEPTION 'Verify the actual full refund first'; END IF;
 IF next_stage='lost' AND length(trim(coalesce(p_data->>'lost_reason','')))<2 THEN RAISE EXCEPTION 'Record why the lead was lost'; END IF;
 IF next_stage='trial' AND nullif(p_data->>'trial_ends_at','') IS NULL THEN RAISE EXCEPTION 'Enter the actual trial end time'; END IF;
 INSERT INTO public.sales_leads(id,reseller_id,name,email,phone,device,source,stage,customer_id,referral_id,next_action,follow_up_at,trial_started_at,trial_ends_at,notes,lost_reason,paid_amount,payment_reference,paid_at,refund_reference,refunded_at,do_not_contact,last_command,last_payload)
 VALUES(p_id,owner,trim(p_data->>'name'),lower(trim(p_data->>'email')),trim(coalesce(p_data->>'phone','')),trim(coalesce(p_data->>'device','')),coalesce(nullif(trim(p_data->>'source'),''),'manual'),next_stage,cust,ref,trim(coalesce(p_data->>'next_action','')),nullif(p_data->>'follow_up_at','')::timestamptz,
 CASE WHEN next_stage='trial' THEN coalesce(old.trial_started_at,now()) ELSE old.trial_started_at END,nullif(p_data->>'trial_ends_at','')::timestamptz,trim(coalesce(p_data->>'notes','')),trim(coalesce(p_data->>'lost_reason','')),amount,payref,CASE WHEN next_stage='paid' THEN coalesce(old.paid_at,now()) ELSE old.paid_at END,refundref,CASE WHEN next_stage='refunded' THEN coalesce(old.refunded_at,now()) ELSE NULL END,coalesce((p_data->>'do_not_contact')::boolean,false),p_command,p_data)
 ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,phone=excluded.phone,device=excluded.device,source=excluded.source,stage=excluded.stage,customer_id=excluded.customer_id,referral_id=excluded.referral_id,next_action=excluded.next_action,follow_up_at=excluded.follow_up_at,trial_started_at=excluded.trial_started_at,trial_ends_at=excluded.trial_ends_at,notes=excluded.notes,lost_reason=excluded.lost_reason,paid_amount=excluded.paid_amount,payment_reference=excluded.payment_reference,paid_at=excluded.paid_at,refund_reference=excluded.refund_reference,refunded_at=excluded.refunded_at,do_not_contact=excluded.do_not_contact,last_command=excluded.last_command,last_payload=excluded.last_payload,revision=sales_leads.revision+1,updated_at=now();
 INSERT INTO public.sales_lead_activity(id,lead_id,reseller_id,kind,note) VALUES(p_command,p_id,owner,CASE WHEN old.id IS NULL THEN 'created' ELSE 'updated' END,'Stage: '||next_stage);
 RETURN p_id;
END $$;

CREATE FUNCTION public.record_sales_contact(p_id uuid,p_lead uuid,p_note text,p_minutes integer,p_next timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE lead public.sales_leads;
BEGIN
 SELECT * INTO lead FROM public.sales_leads WHERE id=p_lead FOR UPDATE;
 IF auth.uid() IS NULL OR lead.reseller_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF lead.do_not_contact THEN RAISE EXCEPTION 'This contact asked not to be contacted'; END IF;
 IF length(trim(coalesce(p_note,''))) NOT BETWEEN 2 AND 1000 THEN RAISE EXCEPTION 'Record the outcome of your conversation'; END IF;
 IF EXISTS(SELECT 1 FROM public.sales_lead_activity WHERE id=p_id) THEN
  IF NOT EXISTS(SELECT 1 FROM public.sales_lead_activity WHERE id=p_id AND lead_id=p_lead AND reseller_id=auth.uid() AND kind='contacted' AND note=trim(p_note) AND minutes=p_minutes AND next_follow_up_at IS NOT DISTINCT FROM p_next) THEN RAISE EXCEPTION 'Contact reference conflict'; END IF;
  RETURN;
 END IF;
 INSERT INTO public.sales_lead_activity(id,lead_id,reseller_id,kind,note,minutes,next_follow_up_at) VALUES(p_id,p_lead,auth.uid(),'contacted',trim(p_note),p_minutes,p_next);
 UPDATE public.sales_leads SET follow_up_at=p_next,updated_at=now(),revision=revision+1 WHERE id=p_lead;
END $$;
CREATE FUNCTION public.import_sales_trial(p_customer uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.customers; existing uuid; lead_id uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO c FROM public.customers WHERE id=p_customer;
 IF auth.uid() IS NULL OR c.reseller_id IS DISTINCT FROM auth.uid() OR NOT coalesce(c.is_trial,false) THEN RAISE EXCEPTION 'Select one of your existing trial customers'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||lower(c.email),0));
 SELECT id INTO existing FROM public.sales_leads WHERE reseller_id=auth.uid() AND (customer_id=c.id OR (lower(email)=lower(c.email) AND stage NOT IN('paid','lost','refunded'))) ORDER BY created_at DESC LIMIT 1;
 IF existing IS NOT NULL THEN RETURN existing; END IF;
 INSERT INTO public.sales_leads(id,reseller_id,name,email,device,source,stage,customer_id,next_action,follow_up_at,trial_started_at,notes)
 VALUES(lead_id,auth.uid(),c.name,lower(c.email),c.device_type,'existing trial','setup',c.id,'Confirm setup and the exact trial end time',now(),coalesce(c.trial_created_at,c.created_at),'Imported an existing trial; confirm the exact end time before starting trial follow-ups.');
 INSERT INTO public.sales_lead_activity(id,lead_id,reseller_id,kind,note) VALUES(gen_random_uuid(),lead_id,auth.uid(),'trial_import','Existing trial linked. No provider account created.');
 RETURN lead_id;
END $$;

CREATE FUNCTION public.save_sales_page(p_revision integer,p_data jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE page public.reseller_sales_pages; owner uuid:=auth.uid();
BEGIN
 IF owner IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=owner) THEN RAISE EXCEPTION 'Sign in required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO page FROM public.reseller_sales_pages WHERE reseller_id=owner;
 IF (page.reseller_id IS NULL AND p_revision IS DISTINCT FROM 0) OR (page.reseller_id IS NOT NULL AND page.revision IS DISTINCT FROM p_revision) THEN RAISE EXCEPTION 'Page settings changed; reload before saving'; END IF;
 IF coalesce((p_data->>'published')::boolean,false) AND (coalesce((p_data->>'public_details_confirmed')::boolean,false) IS NOT TRUE OR nullif(trim(p_data->>'contact_email'),'') IS NULL) THEN RAISE EXCEPTION 'Confirm the public details and provide a customer contact email before publishing'; END IF;
 INSERT INTO public.reseller_sales_pages(reseller_id,slug,brand_name,headline,description,contact_email,accent_color,setup_notes,tutorial_url,published)
 VALUES(owner,lower(trim(p_data->>'slug')),trim(p_data->>'brand_name'),trim(p_data->>'headline'),trim(coalesce(p_data->>'description','')),lower(trim(coalesce(p_data->>'contact_email',''))),coalesce(p_data->>'accent_color','#4f46e5'),trim(coalesce(p_data->>'setup_notes','')),trim(coalesce(p_data->>'tutorial_url','')),coalesce((p_data->>'published')::boolean,false))
 ON CONFLICT(reseller_id) DO UPDATE SET slug=excluded.slug,brand_name=excluded.brand_name,headline=excluded.headline,description=excluded.description,contact_email=excluded.contact_email,accent_color=excluded.accent_color,setup_notes=excluded.setup_notes,tutorial_url=excluded.tutorial_url,published=excluded.published,revision=reseller_sales_pages.revision+1,updated_at=now();
END $$;
CREATE FUNCTION public.create_sales_referral(p_customer uuid,p_label text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.customers WHERE id=p_customer AND reseller_id=auth.uid()) THEN RAISE EXCEPTION 'Select one of your customers'; END IF;
 INSERT INTO public.sales_referral_links(reseller_id,customer_id,label) VALUES(auth.uid(),p_customer,trim(p_label)) ON CONFLICT(reseller_id,customer_id) DO UPDATE SET label=excluded.label RETURNING id INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.set_sales_referral_enabled(p_id uuid,p_enabled boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR p_enabled IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 UPDATE public.sales_referral_links SET enabled=p_enabled WHERE id=p_id AND reseller_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized'; END IF;
END $$;
CREATE FUNCTION public.record_sales_reward(p_lead uuid,p_credits integer,p_cash numeric,p_reference text,p_note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE lead public.sales_leads; ref public.sales_referral_links; existing public.sales_referral_rewards;
BEGIN
 SELECT * INTO lead FROM public.sales_leads WHERE id=p_lead FOR UPDATE;
 IF auth.uid() IS NULL OR lead.reseller_id IS DISTINCT FROM auth.uid() OR lead.stage<>'paid' OR lead.referral_id IS NULL THEN RAISE EXCEPTION 'A paid referred lead is required'; END IF;
 SELECT * INTO ref FROM public.sales_referral_links WHERE id=lead.referral_id;
 IF EXISTS(SELECT 1 FROM public.customers WHERE id=ref.customer_id AND (id=lead.customer_id OR lower(email)=lower(lead.email))) THEN RAISE EXCEPTION 'Self-referrals are not eligible'; END IF;
 SELECT * INTO existing FROM public.sales_referral_rewards WHERE lead_id=p_lead;
 IF FOUND THEN
  IF (existing.credits,existing.cash_amount,existing.reference,existing.note) IS DISTINCT FROM(p_credits,p_cash,upper(trim(p_reference)),trim(p_note)) THEN RAISE EXCEPTION 'A reward is already recorded for this sale'; END IF;
  RETURN;
 END IF;
 IF p_cash<>round(p_cash,2) THEN RAISE EXCEPTION 'Use two decimal places'; END IF;
 INSERT INTO public.sales_referral_rewards(lead_id,reseller_id,credits,cash_amount,reference,note) VALUES(p_lead,auth.uid(),p_credits,p_cash,upper(trim(p_reference)),trim(p_note));
 INSERT INTO public.sales_lead_activity(id,lead_id,reseller_id,kind,note) VALUES(gen_random_uuid(),p_lead,auth.uid(),'reward','Reward recorded as already delivered; no payment or credits issued by this form.');
END $$;

CREATE FUNCTION public.get_sales_workspace() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=auth.uid();
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 RETURN jsonb_build_object(
  'leads',coalesce((SELECT jsonb_agg(to_jsonb(t)-'last_payload'-'last_command' ORDER BY updated_at DESC) FROM (SELECT * FROM public.sales_leads WHERE reseller_id=owner ORDER BY updated_at DESC LIMIT 1000)t),'[]'::jsonb),
  'lead_count',(SELECT count(*) FROM public.sales_leads WHERE reseller_id=owner),
  'activities',coalesce((SELECT jsonb_agg(t ORDER BY created_at DESC) FROM(SELECT * FROM public.sales_lead_activity WHERE reseller_id=owner ORDER BY created_at DESC LIMIT 1000)t),'[]'::jsonb),
  'page',(SELECT to_jsonb(p) FROM public.reseller_sales_pages p WHERE reseller_id=owner),
  'referrals',coalesce((SELECT jsonb_agg(t) FROM public.sales_referral_links t WHERE reseller_id=owner),'[]'::jsonb),
  'rewards',coalesce((SELECT jsonb_agg(t) FROM public.sales_referral_rewards t WHERE reseller_id=owner),'[]'::jsonb),
  'credit_unit_price',coalesce((SELECT credit_price_per_unit FROM public.profiles WHERE id=owner),3),
  'customers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'is_trial',is_trial)) FROM public.customers WHERE reseller_id=owner),'[]'::jsonb),
  'metrics',jsonb_build_object('leads_30d',(SELECT count(*) FROM public.sales_leads WHERE reseller_id=owner AND created_at>=now()-interval '30 days'),
    'trial_cohort_30d',(SELECT count(*) FROM public.sales_leads WHERE reseller_id=owner AND trial_started_at>=now()-interval '30 days'),
    'trial_paid_30d',(SELECT count(*) FROM public.sales_leads WHERE reseller_id=owner AND trial_started_at>=now()-interval '30 days' AND stage='paid'),
    'sales_30d',(SELECT count(*) FROM public.sales_leads WHERE reseller_id=owner AND paid_at>=now()-interval '30 days' AND stage='paid'),
    'paid_revenue_30d',coalesce((SELECT sum(paid_amount) FROM public.sales_leads WHERE reseller_id=owner AND paid_at>=now()-interval '30 days' AND stage='paid'),0),
    'contact_minutes_30d',coalesce((SELECT sum(minutes) FROM public.sales_lead_activity WHERE reseller_id=owner AND created_at>=now()-interval '30 days'),0))
 );
END $$;
CREATE FUNCTION public.get_sales_program_summary() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator required'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('reseller_id',p.id,'name',p.name,
  'leads_30d',(SELECT count(*) FROM public.sales_leads WHERE reseller_id=p.id AND created_at>=now()-interval '30 days'),
  'trials_30d',(SELECT count(*) FROM public.sales_leads WHERE reseller_id=p.id AND trial_started_at>=now()-interval '30 days'),
  'trial_paid_30d',(SELECT count(*) FROM public.sales_leads WHERE reseller_id=p.id AND trial_started_at>=now()-interval '30 days' AND stage='paid'),
  'sales_30d',(SELECT count(*) FROM public.sales_leads WHERE reseller_id=p.id AND paid_at>=now()-interval '30 days' AND stage='paid'),
  'revenue_30d',coalesce((SELECT sum(paid_amount) FROM public.sales_leads WHERE reseller_id=p.id AND paid_at>=now()-interval '30 days' AND stage='paid'),0),
  'minutes_30d',coalesce((SELECT sum(minutes) FROM public.sales_lead_activity WHERE reseller_id=p.id AND created_at>=now()-interval '30 days'),0),
  'page_published',coalesce((SELECT published FROM public.reseller_sales_pages WHERE reseller_id=p.id),false))) FROM public.profiles p WHERE p.role='reseller'),'[]'::jsonb);
END $$;

-- Public read returns explicitly published marketing fields only. No profile, customer or referral identity is exposed.
CREATE FUNCTION public.get_public_sales_page(p_slug text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('slug',slug,'brand_name',brand_name,'headline',headline,'description',description,'contact_email',contact_email,'accent_color',accent_color)
 FROM public.reseller_sales_pages WHERE slug=lower(p_slug) AND published
$$;
CREATE FUNCTION public.submit_public_sales_inquiry(p_id uuid,p_slug text,p_data jsonb,p_ip_hash text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE page public.reseller_sales_pages; ref uuid; v_email text:=lower(trim(p_data->>'email')); existing public.sales_leads;
BEGIN
 SELECT * INTO page FROM public.reseller_sales_pages WHERE slug=lower(p_slug) AND published;
 IF NOT FOUND THEN RAISE EXCEPTION 'Page unavailable'; END IF;
 IF p_id IS NULL OR p_ip_hash IS NULL OR length(p_ip_hash)<>64 OR coalesce((p_data->>'contact_consent')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Please confirm your request to be contacted'; END IF;
 -- Per-page lock keeps rate checks and deduplication atomic under concurrent submissions.
 PERFORM pg_advisory_xact_lock(hashtextextended('sales-ip:'||p_ip_hash,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(page.reseller_id::text,0));
 SELECT * INTO page FROM public.reseller_sales_pages WHERE slug=lower(p_slug) AND published;
 IF NOT FOUND THEN RAISE EXCEPTION 'Page unavailable'; END IF;
 SELECT * INTO existing FROM public.sales_leads WHERE id=p_id;
 IF FOUND THEN
  IF existing.reseller_id<>page.reseller_id OR existing.email IS DISTINCT FROM v_email THEN RAISE EXCEPTION 'Request reference conflict'; END IF;
  RETURN 'received';
 END IF;
 IF (SELECT count(*) FROM public.sales_inquiry_attempts WHERE reseller_id=page.reseller_id AND created_at>now()-interval '1 hour')>=30
 OR (SELECT count(*) FROM public.sales_inquiry_attempts WHERE ip_hash=p_ip_hash AND created_at>now()-interval '1 hour')>=5 THEN RETURN 'rate_limited'; END IF;
 INSERT INTO public.sales_inquiry_attempts(reseller_id,ip_hash) VALUES(page.reseller_id,p_ip_hash);
 IF EXISTS(SELECT 1 FROM public.sales_leads WHERE reseller_id=page.reseller_id AND lower(sales_leads.email)=v_email AND (stage NOT IN('paid','lost','refunded') OR created_at>now()-interval '1 day')) THEN RETURN 'received'; END IF;
 BEGIN ref:=nullif(p_data->>'referral','')::uuid; EXCEPTION WHEN invalid_text_representation THEN ref:=NULL; END;
 IF ref IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sales_referral_links WHERE id=ref AND reseller_id=page.reseller_id AND enabled) THEN ref:=NULL; END IF;
 INSERT INTO public.sales_leads(id,reseller_id,name,email,phone,device,source,stage,referral_id,next_action,follow_up_at,notes,contact_requested_at,marketing_opt_in_at)
 VALUES(p_id,page.reseller_id,trim(p_data->>'name'),v_email,trim(coalesce(p_data->>'phone','')),trim(coalesce(p_data->>'device','')),CASE WHEN ref IS NULL THEN 'inquiry page' ELSE 'customer referral' END,'new',ref,'Respond to the new inquiry',now(),left(trim(coalesce(p_data->>'message','')),1000),now(),CASE WHEN coalesce((p_data->>'marketing_consent')::boolean,false) THEN now() ELSE NULL END);
 INSERT INTO public.sales_lead_activity(id,lead_id,reseller_id,kind,note) VALUES(gen_random_uuid(),p_id,page.reseller_id,'created','Customer submitted an inquiry and requested a response. No trial or payment was created.');
 DELETE FROM public.sales_inquiry_attempts WHERE created_at<now()-interval '7 days';
 RETURN 'received';
END $$;
REVOKE ALL ON FUNCTION public.save_sales_lead(uuid,integer,uuid,jsonb),public.record_sales_contact(uuid,uuid,text,integer,timestamptz),public.import_sales_trial(uuid),public.save_sales_page(integer,jsonb),public.create_sales_referral(uuid,text),public.set_sales_referral_enabled(uuid,boolean),public.record_sales_reward(uuid,integer,numeric,text,text),public.get_sales_workspace(),public.get_sales_program_summary(),public.get_public_sales_page(text),public.submit_public_sales_inquiry(uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_sales_lead(uuid,integer,uuid,jsonb),public.record_sales_contact(uuid,uuid,text,integer,timestamptz),public.import_sales_trial(uuid),public.save_sales_page(integer,jsonb),public.create_sales_referral(uuid,text),public.set_sales_referral_enabled(uuid,boolean),public.record_sales_reward(uuid,integer,numeric,text,text),public.get_sales_workspace(),public.get_sales_program_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_sales_page(text) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.submit_public_sales_inquiry(uuid,text,jsonb,text) TO service_role;
COMMIT;
