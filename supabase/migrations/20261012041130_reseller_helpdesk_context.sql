BEGIN;
-- Only identity/routing/config lives here; conversations and attachments stay in Zammad.
CREATE TABLE public.reseller_helpdesk_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT false,
 endpoint text NOT NULL DEFAULT 'https://srv1781264.hstgr.cloud/eztv-support/v1',
 secret_id uuid REFERENCES vault.secrets(id)
);
ALTER TABLE public.reseller_helpdesk_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reseller_helpdesk_settings FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.reseller_helpdesk_settings TO service_role;
INSERT INTO public.reseller_helpdesk_settings(id) VALUES(true);
CREATE FUNCTION public.reseller_helpdesk_context(p_actor uuid,p_session uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.profiles; a boolean; config public.reseller_helpdesk_settings; key text; children jsonb; parent_name text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
   WHERE s.id=p_session AND s.user_id=p_actor AND u.deleted_at IS NULL
     AND (u.banned_until IS NULL OR u.banned_until<=now())
     AND (s.not_after IS NULL OR s.not_after>now())) THEN RAISE EXCEPTION 'Sign in again'; END IF;
 IF EXISTS(SELECT 1 FROM public.admin_reseller_sessions s WHERE s.auth_session_id=p_session AND
    (s.reseller_id<>p_actor OR s.status<>'active' OR s.expires_at IS NULL OR s.expires_at<=now())) THEN RAISE EXCEPTION 'Sign in again'; END IF;
 SELECT * INTO p FROM public.profiles WHERE id=p_actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account unavailable'; END IF;
 a:=public.has_role(p_actor,'admin');
 IF NOT a AND p.role::text<>'reseller' THEN RAISE EXCEPTION 'Account unavailable'; END IF;
 IF EXISTS(WITH RECURSIVE chain AS (
   SELECT p.id AS id,p.parent_reseller_id AS parent,ARRAY[p.id] AS path,false AS cycle,1 AS depth
   UNION ALL SELECT pp.id,pp.parent_reseller_id,c.path||pp.id,pp.id=ANY(c.path),c.depth+1
   FROM chain c JOIN public.profiles pp ON pp.id=c.parent WHERE NOT c.cycle AND c.depth<64
  ) SELECT 1 FROM chain WHERE cycle OR depth>=64) THEN RAISE EXCEPTION 'Support routing needs review'; END IF;
 IF p.parent_reseller_id IS NOT NULL THEN
  SELECT pp.name INTO parent_name FROM public.profiles pp JOIN auth.users u ON u.id=pp.id
   WHERE pp.id=p.parent_reseller_id AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now());
  IF NOT FOUND THEN RAISE EXCEPTION 'Support routing needs review'; END IF;
 END IF;
 SELECT coalesce(jsonb_agg(pp.id),'[]'::jsonb) INTO children FROM public.profiles pp JOIN auth.users u ON u.id=pp.id
  WHERE pp.parent_reseller_id=p_actor AND pp.role::text='reseller' AND u.deleted_at IS NULL
   AND (u.banned_until IS NULL OR u.banned_until<=now());
 SELECT * INTO config FROM public.reseller_helpdesk_settings WHERE id;
 IF config.secret_id IS NOT NULL THEN SELECT decrypted_secret INTO key FROM vault.decrypted_secrets WHERE id=config.secret_id; END IF;
 RETURN jsonb_build_object('enabled',config.enabled AND key IS NOT NULL,'endpoint',config.endpoint,'key',key,
  'actor',jsonb_build_object('id',p.id,'name',left(p.name,120),'admin',a,'parent_id',CASE WHEN public.has_role(p.parent_reseller_id,'admin') THEN NULL ELSE p.parent_reseller_id END),
  'children',children,'support_name',coalesce(nullif(parent_name,''),'EZTV Support'));
END $$;
REVOKE ALL ON FUNCTION public.reseller_helpdesk_context(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reseller_helpdesk_context(uuid,uuid) TO service_role;
COMMIT;
