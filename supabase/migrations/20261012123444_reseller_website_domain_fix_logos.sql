BEGIN;
-- Permit owned apex/www domains while reserving actual platform hosts.
CREATE OR REPLACE FUNCTION public.connect_sales_domain(p_hostname text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner uuid:=auth.uid(); host text:=lower(trim(p_hostname)); current_host text;
BEGIN
 IF owner IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=owner) THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.reseller_website_settings WHERE enabled) THEN RAISE EXCEPTION 'Domain connections are not configured yet'; END IF;
 IF host IS NULL OR length(host)>253 OR host !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
 THEN RAISE EXCEPTION 'Enter a domain name without https, a port or a path'; END IF;
 IF host ~ '(^|\.)(reseller\.eztvclub\.com|supabase\.eztvclub\.com|vpn\.eztvclub\.online|pages\.dev|workers\.dev|hstgr\.cloud|localhost|local|internal|invalid|test|example|home\.arpa)$'
 THEN RAISE EXCEPTION 'This address is reserved for the dashboard or platform services. Use a different website domain'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 IF NOT EXISTS(SELECT 1 FROM public.reseller_sales_pages WHERE reseller_id=owner) THEN RAISE EXCEPTION 'Save your website draft first'; END IF;
 SELECT hostname INTO current_host FROM public.reseller_website_domains WHERE reseller_id=owner;
 IF current_host=host THEN RETURN; END IF;
 IF current_host IS NOT NULL THEN RAISE EXCEPTION 'Disconnect the current domain before connecting another'; END IF;
 INSERT INTO public.reseller_website_domains(reseller_id,hostname) VALUES(owner,host);
 EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'This domain is already connected to an account. Contact support if you own it';
END $$;

-- Small raster logos live with the private page; no public storage object exists before publishing.
CREATE FUNCTION public.valid_sales_page_logo(p_logo text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE image bytea; width bigint; height bigint;
BEGIN
 IF p_logo IS NULL THEN RETURN true; END IF;
 IF length(p_logo)>262144 OR p_logo !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' THEN RETURN false; END IF;
 image:=decode(substr(p_logo,23),'base64');
 IF octet_length(image)<45 OR octet_length(image)>196608
 OR substring(image FROM 1 FOR 8)<>decode('89504e470d0a1a0a','hex')
 OR substring(image FROM 9 FOR 8)<>decode('0000000d49484452','hex')
 OR substring(image FROM octet_length(image)-11 FOR 12)<>decode('0000000049454e44ae426082','hex') THEN RETURN false; END IF;
 width:=get_byte(image,16)::bigint*16777216+get_byte(image,17)*65536+get_byte(image,18)*256+get_byte(image,19);
 height:=get_byte(image,20)::bigint*16777216+get_byte(image,21)*65536+get_byte(image,22)*256+get_byte(image,23);
 RETURN width BETWEEN 1 AND 512 AND height BETWEEN 1 AND 512;
 EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.valid_sales_page_logo(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.valid_sales_page_logo(text) TO authenticated,service_role;
ALTER TABLE public.reseller_sales_pages ADD COLUMN logo_data_url text CHECK(public.valid_sales_page_logo(logo_data_url));
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
 INSERT INTO public.reseller_sales_pages(reseller_id,slug,brand_name,headline,description,contact_email,accent_color,setup_notes,tutorial_url,published,logo_data_url)
 VALUES(owner,lower(trim(p_data->>'slug')),trim(p_data->>'brand_name'),trim(p_data->>'headline'),trim(coalesce(p_data->>'description','')),lower(trim(coalesce(p_data->>'contact_email',''))),coalesce(p_data->>'accent_color','#4f46e5'),trim(coalesce(p_data->>'setup_notes','')),trim(coalesce(p_data->>'tutorial_url','')),coalesce((p_data->>'published')::boolean,false),logo)
 ON CONFLICT(reseller_id) DO UPDATE SET slug=excluded.slug,brand_name=excluded.brand_name,headline=excluded.headline,description=excluded.description,contact_email=excluded.contact_email,accent_color=excluded.accent_color,setup_notes=excluded.setup_notes,tutorial_url=excluded.tutorial_url,published=excluded.published,logo_data_url=excluded.logo_data_url,revision=reseller_sales_pages.revision+1,updated_at=now();
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
 RETURN jsonb_build_object('brand_name',page.brand_name,'headline',page.headline,'description',page.description,'contact_email',page.contact_email,'accent_color',page.accent_color,'logo_data_url',page.logo_data_url);
END $$;
COMMIT;
