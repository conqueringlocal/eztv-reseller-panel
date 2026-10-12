-- Only the signed VPS delivery worker can request fresh notification recipients.
CREATE FUNCTION public.reseller_helpdesk_recipients(p_creator uuid,p_handler uuid,p_audience text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actual_parent uuid; recipients jsonb;
BEGIN
 IF p_audience NOT IN ('handler','requester') THEN RAISE EXCEPTION 'Invalid audience'; END IF;
 SELECT CASE WHEN public.has_role(p.parent_reseller_id,'admin') THEN NULL ELSE p.parent_reseller_id END
 INTO actual_parent FROM public.profiles p JOIN auth.users u ON u.id=p.id
 WHERE p.id=p_creator AND p.role::text='reseller' AND u.deleted_at IS NULL
 AND (u.banned_until IS NULL OR u.banned_until<=now());
 IF NOT FOUND OR actual_parent IS DISTINCT FROM p_handler THEN RETURN '[]'::jsonb; END IF;
 IF p_handler IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id
  WHERE p.id=p_handler AND p.role::text='reseller' AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RETURN '[]'::jsonb; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'email',coalesce(nullif(p.email,''),u.email),'admin',public.has_role(p.id,'admin'))),'[]'::jsonb)
 INTO recipients FROM public.profiles p JOIN auth.users u ON u.id=p.id
 WHERE u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now()) AND
 CASE WHEN p_audience='requester' THEN p.id=p_creator
      WHEN p_handler IS NOT NULL THEN p.id=p_handler
      ELSE public.has_role(p.id,'admin') END;
 RETURN recipients;
END $$;
REVOKE ALL ON FUNCTION public.reseller_helpdesk_recipients(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reseller_helpdesk_recipients(uuid,uuid,text) TO service_role;
CREATE FUNCTION public.reseller_helpdesk_notification_key() RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT v.decrypted_secret FROM public.reseller_helpdesk_settings s
 JOIN vault.decrypted_secrets v ON v.id=s.secret_id WHERE s.id AND s.enabled
$$;
REVOKE ALL ON FUNCTION public.reseller_helpdesk_notification_key() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reseller_helpdesk_notification_key() TO service_role;
