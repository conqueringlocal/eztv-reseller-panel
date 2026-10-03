BEGIN;
CREATE TABLE public.admin_reseller_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 admin_id uuid NOT NULL REFERENCES public.profiles(id),
 reseller_id uuid NOT NULL REFERENCES public.profiles(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','active','failed','ended')),
 auth_session_id uuid UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz,
 ended_at timestamptz,
 CHECK(admin_id<>reseller_id)
);
CREATE INDEX admin_reseller_sessions_actor ON public.admin_reseller_sessions(admin_id,created_at DESC);
CREATE INDEX admin_reseller_sessions_target ON public.admin_reseller_sessions(reseller_id,created_at DESC);
ALTER TABLE public.admin_reseller_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_reseller_sessions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.admin_reseller_sessions TO authenticated;
GRANT ALL ON public.admin_reseller_sessions TO service_role;
CREATE POLICY "Administrators review support sessions" ON public.admin_reseller_sessions FOR SELECT TO authenticated USING((SELECT public.is_admin()));
CREATE FUNCTION public.claim_admin_reseller_session(p_admin uuid,p_reseller uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_admin AND role='admin') THEN RAISE EXCEPTION 'Administrator required'; END IF;
 IF p_admin=p_reseller OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_reseller AND role='reseller') OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_reseller AND role='admin') THEN RAISE EXCEPTION 'Select a reseller account'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('admin-support:'||p_admin::text,0));
 IF (SELECT count(*) FROM public.admin_reseller_sessions WHERE admin_id=p_admin AND created_at>now()-interval '15 minutes')>=12 THEN RAISE EXCEPTION 'Too many support sessions; try later'; END IF;
 INSERT INTO public.admin_reseller_sessions(admin_id,reseller_id) VALUES(p_admin,p_reseller) RETURNING id INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.claim_admin_reseller_session(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_admin_reseller_session(uuid,uuid) TO service_role;
COMMIT;
