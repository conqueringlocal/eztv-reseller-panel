-- Fix: Create security dashboard as a table instead of view
CREATE TABLE IF NOT EXISTS public.security_dashboard_metrics (
    metric_name text PRIMARY KEY,
    metric_value text NOT NULL,
    description text NOT NULL,
    last_updated timestamp with time zone DEFAULT now()
);

-- Enable RLS on security dashboard metrics
ALTER TABLE public.security_dashboard_metrics ENABLE ROW LEVEL SECURITY;

-- Only admins can view security dashboard metrics
CREATE POLICY "Admins can view security dashboard metrics" ON public.security_dashboard_metrics
FOR SELECT USING (is_admin());

-- Only system can update security dashboard metrics
CREATE POLICY "System can update security dashboard metrics" ON public.security_dashboard_metrics
FOR ALL USING (true);

-- Create function to refresh security dashboard metrics
CREATE OR REPLACE FUNCTION public.refresh_security_dashboard()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
    -- Delete existing metrics
    DELETE FROM public.security_dashboard_metrics;
    
    -- Insert fresh metrics
    INSERT INTO public.security_dashboard_metrics (metric_name, metric_value, description) VALUES
    ('failed_logins_24h', 
     (SELECT COUNT(*)::text FROM public.security_audit_logs 
      WHERE action = 'login_failed' AND created_at > (now() - interval '24 hours')),
     'Failed login attempts in last 24 hours');
    
    INSERT INTO public.security_dashboard_metrics (metric_name, metric_value, description) VALUES
    ('successful_logins_24h', 
     (SELECT COUNT(*)::text FROM public.security_audit_logs 
      WHERE action = 'login_success' AND created_at > (now() - interval '24 hours')),
     'Successful logins in last 24 hours');
    
    INSERT INTO public.security_dashboard_metrics (metric_name, metric_value, description) VALUES
    ('blocked_ips_active', 
     (SELECT COUNT(DISTINCT identifier)::text FROM public.auth_rate_limits 
      WHERE blocked_until > now()),
     'Currently blocked IP addresses/emails');
    
    INSERT INTO public.security_dashboard_metrics (metric_name, metric_value, description) VALUES
    ('password_resets_24h', 
     (SELECT COUNT(*)::text FROM public.security_audit_logs 
      WHERE action = 'password_reset_requested' AND created_at > (now() - interval '24 hours')),
     'Password reset requests in last 24 hours');
    
    INSERT INTO public.security_dashboard_metrics (metric_name, metric_value, description) VALUES
    ('permission_denials_24h', 
     (SELECT COUNT(*)::text FROM public.security_audit_logs 
      WHERE action = 'permission_denied' AND created_at > (now() - interval '24 hours')),
     'Permission denials in last 24 hours');
END;
$function$;

-- Initialize the dashboard with current data
SELECT public.refresh_security_dashboard();