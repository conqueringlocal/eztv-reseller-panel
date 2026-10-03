BEGIN;
ALTER TABLE public.sso_tokens ADD COLUMN expires_at timestamptz NOT NULL DEFAULT (now()+interval '30 days');
-- Existing links receive 30 days to rotate; newly generated links also expire.
DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='sso_tokens' LOOP EXECUTE format('DROP POLICY %I ON public.sso_tokens',p.policyname); END LOOP; END $$;
CREATE POLICY "Administrators manage SSO links" ON public.sso_tokens FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
COMMIT;
