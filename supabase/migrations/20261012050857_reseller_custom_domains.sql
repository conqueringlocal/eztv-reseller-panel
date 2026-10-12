BEGIN;
-- Public sites use reseller-owned hosts only. This installation stays disabled until configured.
CREATE TABLE public.reseller_website_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT false,
 ipv4 inet, management_url text, gateway_secret_hash text CHECK(length(gateway_secret_hash)=64)
);
INSERT INTO public.reseller_website_settings(id) VALUES(true);
ALTER TABLE public.reseller_website_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reseller_website_settings FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.reseller_website_settings TO service_role;
CREATE TABLE public.reseller_website_domains (
 reseller_id uuid PRIMARY KEY REFERENCES public.profiles(id),
 hostname text NOT NULL UNIQUE CHECK(length(hostname)<=253 AND hostname=lower(hostname) AND hostname ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
 verification_token text NOT NULL DEFAULT (replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','dns_verified','ready')),
 message text NOT NULL DEFAULT 'Add both DNS records, then check the connection.',
 checked_at timestamptz, valid_until timestamptz, last_attempt_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status='pending' OR valid_until IS NOT NULL)
);
ALTER TABLE public.reseller_website_domains ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reseller_website_domains FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.reseller_website_domains TO authenticated;
GRANT ALL ON public.reseller_website_domains TO service_role;
CREATE POLICY "Read own website domain" ON public.reseller_website_domains FOR SELECT TO authenticated USING(reseller_id=(SELECT auth.uid()));

CREATE FUNCTION public.connect_sales_domain(p_hostname text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=auth.uid(); host text:=lower(trim(p_hostname)); current_host text;
BEGIN
 IF owner IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=owner) THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.reseller_website_settings WHERE enabled) THEN RAISE EXCEPTION 'Domain connections are not configured yet'; END IF;
 IF host IS NULL OR length(host)>253 OR host !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
 OR host ~ '(^|\.)(eztvclub\.(com|online)|pages\.dev|workers\.dev|hstgr\.cloud|localhost|local|internal|invalid|test|example|home\.arpa)$'
 THEN RAISE EXCEPTION 'Enter your own domain name without https, a port or a path'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 IF NOT EXISTS(SELECT 1 FROM public.reseller_sales_pages WHERE reseller_id=owner) THEN RAISE EXCEPTION 'Save your website draft first'; END IF;
 SELECT hostname INTO current_host FROM public.reseller_website_domains WHERE reseller_id=owner;
 IF current_host=host THEN RETURN; END IF;
 IF current_host IS NOT NULL THEN RAISE EXCEPTION 'Disconnect the current domain before connecting another'; END IF;
 INSERT INTO public.reseller_website_domains(reseller_id,hostname) VALUES(owner,host);
 EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'This domain is already connected to an account. Contact support if you own it';
END $$;
CREATE FUNCTION public.disconnect_sales_domain() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 UPDATE public.reseller_sales_pages SET published=false,revision=revision+1,updated_at=now() WHERE reseller_id=auth.uid() AND published;
 DELETE FROM public.reseller_website_domains WHERE reseller_id=auth.uid();
END $$;

-- Replace the blanket coming-soon constraint with a domain readiness guard, including direct writes.
CREATE FUNCTION public.guard_sales_page_domain() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.reseller_id::text,0));
 IF NEW.published AND NOT EXISTS(SELECT 1 FROM public.reseller_website_domains d, public.reseller_website_settings s
 WHERE d.reseller_id=NEW.reseller_id AND d.status='ready' AND d.valid_until>now() AND s.enabled)
 THEN RAISE EXCEPTION 'Connect and verify your domain before publishing'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sales_page_domain_guard BEFORE INSERT OR UPDATE ON public.reseller_sales_pages FOR EACH ROW EXECUTE FUNCTION public.guard_sales_page_domain();
ALTER TABLE public.reseller_sales_pages DROP CONSTRAINT reseller_websites_coming_soon;
CREATE FUNCTION public.unpublish_disconnected_sales_domain() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' OR NEW.status<>'ready' OR NEW.hostname<>OLD.hostname OR NEW.valid_until<=now() THEN
  UPDATE public.reseller_sales_pages SET published=false,revision=revision+1,updated_at=now() WHERE reseller_id=OLD.reseller_id AND published;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER sales_domain_unpublish AFTER UPDATE OR DELETE ON public.reseller_website_domains FOR EACH ROW EXECUTE FUNCTION public.unpublish_disconnected_sales_domain();
CREATE OR REPLACE FUNCTION public.save_sales_page(p_revision integer,p_data jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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

ALTER FUNCTION public.get_sales_workspace() RENAME TO get_sales_workspace_without_domain;
REVOKE ALL ON FUNCTION public.get_sales_workspace_without_domain() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.get_sales_workspace() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 RETURN public.get_sales_workspace_without_domain() || jsonb_build_object(
 'domain',(SELECT to_jsonb(d)-'last_attempt_at' FROM public.reseller_website_domains d WHERE reseller_id=auth.uid()),
 'website_hosting',(SELECT jsonb_build_object('enabled',enabled,'ipv4',host(ipv4),'management_url',management_url) FROM public.reseller_website_settings));
END $$;
-- Old /r/:slug clients and direct slug APIs remain permanently closed.
CREATE OR REPLACE FUNCTION public.get_public_sales_page(p_slug text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT NULL::jsonb $$;
ALTER FUNCTION public.submit_public_sales_inquiry(uuid,text,jsonb,text) RENAME TO submit_domain_sales_inquiry_internal;
REVOKE ALL ON FUNCTION public.submit_domain_sales_inquiry_internal(uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.submit_public_sales_inquiry(p_id uuid,p_slug text,p_data jsonb,p_ip_hash text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Use the reseller website to send an inquiry'; END $$;
REVOKE ALL ON FUNCTION public.submit_public_sales_inquiry(uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_sales_inquiry(uuid,text,jsonb,text) TO service_role;

-- Narrow gateway: the web server has an anon API key plus this scoped secret, never the service-role key.
CREATE FUNCTION public.sales_website_gateway(p_secret text,p_action text,p_owner uuid DEFAULT NULL,p_hostname text DEFAULT NULL,p_data jsonb DEFAULT '{}'::jsonb)
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
 RETURN jsonb_build_object('brand_name',page.brand_name,'headline',page.headline,'description',page.description,'contact_email',page.contact_email,'accent_color',page.accent_color);
END $$;
REVOKE ALL ON FUNCTION public.connect_sales_domain(text),public.disconnect_sales_domain(),public.get_sales_workspace(),public.guard_sales_page_domain(),public.unpublish_disconnected_sales_domain(),public.sales_website_gateway(text,text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.connect_sales_domain(text),public.disconnect_sales_domain(),public.get_sales_workspace() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_website_gateway(text,text,uuid,text,jsonb) TO anon,service_role;
COMMIT;
