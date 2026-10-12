-- Retire CRM automation without removing customers, balances, or historical IDs.
DO $$
DECLARE retired_job bigint;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    FOR retired_job IN SELECT jobid FROM cron.job WHERE jobname = 'reseller-credit-monitor'
    LOOP
      PERFORM cron.unschedule(retired_job);
    END LOOP;
  END IF;
END;
$$;

UPDATE public.reseller_highlevel_settings
SET is_active = false, location_api_key = '', private_integration_token = '';
UPDATE public.admin_highlevel_settings
SET is_active = false, private_integration_token = '';
DELETE FROM public.system_settings WHERE id = 'highlevel_agency_api_key';

-- Prevent stale dashboard clients from restoring or reading the retired integration.
ALTER TABLE public.reseller_highlevel_settings
  ADD CONSTRAINT reseller_highlevel_retired CHECK (
    is_active IS FALSE AND coalesce(location_api_key, '') = ''
    AND coalesce(private_integration_token, '') = ''
  );
ALTER TABLE public.admin_highlevel_settings
  ADD CONSTRAINT admin_highlevel_retired CHECK (
    is_active IS FALSE AND coalesce(private_integration_token, '') = ''
  );
ALTER TABLE public.system_settings
  ADD CONSTRAINT highlevel_agency_key_retired CHECK (id <> 'highlevel_agency_api_key');
REVOKE ALL ON public.reseller_highlevel_settings, public.admin_highlevel_settings,
  public.reseller_highlevel_status FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_highlevel_status(uuid) FROM PUBLIC, anon, authenticated;
