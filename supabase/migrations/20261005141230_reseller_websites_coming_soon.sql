BEGIN;
-- Owner requested no public reseller pages on the dashboard domain.
-- Preserve all drafts/setup content; prevent old clients and direct writes from publishing.
LOCK TABLE public.reseller_sales_pages IN ACCESS EXCLUSIVE MODE;
UPDATE public.reseller_sales_pages SET published=false,revision=revision+1,updated_at=now() WHERE published;
ALTER TABLE public.reseller_sales_pages ADD CONSTRAINT reseller_websites_coming_soon CHECK (NOT published);
CREATE OR REPLACE FUNCTION public.save_sales_page(p_revision integer,p_data jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE page public.reseller_sales_pages; owner uuid:=auth.uid();
BEGIN
 IF owner IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=owner) THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF coalesce((p_data->>'published')::boolean,false) THEN RAISE EXCEPTION 'Website publishing and custom domains are coming soon. Save a private draft instead'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,0));
 SELECT * INTO page FROM public.reseller_sales_pages WHERE reseller_id=owner;
 IF (page.reseller_id IS NULL AND p_revision IS DISTINCT FROM 0) OR (page.reseller_id IS NOT NULL AND page.revision IS DISTINCT FROM p_revision) THEN RAISE EXCEPTION 'Page settings changed; reload before saving'; END IF;
 IF coalesce((p_data->>'published')::boolean,false) AND (coalesce((p_data->>'public_details_confirmed')::boolean,false) IS NOT TRUE OR nullif(trim(p_data->>'contact_email'),'') IS NULL) THEN RAISE EXCEPTION 'Confirm the public details and provide a customer contact email before publishing'; END IF;
 INSERT INTO public.reseller_sales_pages(reseller_id,slug,brand_name,headline,description,contact_email,accent_color,setup_notes,tutorial_url,published)
 VALUES(owner,lower(trim(p_data->>'slug')),trim(p_data->>'brand_name'),trim(p_data->>'headline'),trim(coalesce(p_data->>'description','')),lower(trim(coalesce(p_data->>'contact_email',''))),coalesce(p_data->>'accent_color','#4f46e5'),trim(coalesce(p_data->>'setup_notes','')),trim(coalesce(p_data->>'tutorial_url','')),coalesce((p_data->>'published')::boolean,false))
 ON CONFLICT(reseller_id) DO UPDATE SET slug=excluded.slug,brand_name=excluded.brand_name,headline=excluded.headline,description=excluded.description,contact_email=excluded.contact_email,accent_color=excluded.accent_color,setup_notes=excluded.setup_notes,tutorial_url=excluded.tutorial_url,published=excluded.published,revision=reseller_sales_pages.revision+1,updated_at=now();
END $$;
-- Public reads and inquiry intake both require published=true, now impossible.
-- Existing ownership checks and function grants are unchanged.
COMMIT;
