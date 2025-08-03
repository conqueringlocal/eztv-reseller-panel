-- Phase 4: Authentication Configuration Optimization

-- Insert system settings for authentication configuration
INSERT INTO public.system_settings (id, value, description) VALUES
('auth_otp_expiry_seconds', '600', 'OTP token expiry time in seconds (default: 10 minutes)')
ON CONFLICT (id) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description;

INSERT INTO public.system_settings (id, value, description) VALUES
('auth_password_strength_enabled', 'true', 'Enable password strength requirements')
ON CONFLICT (id) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description;

INSERT INTO public.system_settings (id, value, description) VALUES
('auth_leaked_password_protection', 'true', 'Enable leaked password protection via HaveIBeenPwned')
ON CONFLICT (id) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description;

INSERT INTO public.system_settings (id, value, description) VALUES
('auth_session_timeout_hours', '24', 'Session timeout in hours (default: 24 hours)')
ON CONFLICT (id) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description;

INSERT INTO public.system_settings (id, value, description) VALUES
('auth_max_password_length', '72', 'Maximum password length (default: 72 characters)')
ON CONFLICT (id) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description;

-- Create table for tracking security configuration changes
CREATE TABLE IF NOT EXISTS public.security_config_changes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    setting_name text NOT NULL,
    old_value text,
    new_value text NOT NULL,
    change_reason text,
    created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on security config changes
ALTER TABLE public.security_config_changes ENABLE ROW LEVEL SECURITY;

-- Only admins can view security config changes
CREATE POLICY "Admins can view security config changes" ON public.security_config_changes
FOR SELECT USING (is_admin());

-- Only system can insert security config changes
CREATE POLICY "System can insert security config changes" ON public.security_config_changes
FOR INSERT WITH CHECK (true);

-- Create function to log security configuration changes
CREATE OR REPLACE FUNCTION public.log_security_config_change(
    p_setting_name text,
    p_old_value text,
    p_new_value text,
    p_change_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
    INSERT INTO public.security_config_changes (
        admin_user_id,
        setting_name,
        old_value,
        new_value,
        change_reason
    ) VALUES (
        auth.uid(),
        p_setting_name,
        p_old_value,
        p_new_value,
        p_change_reason
    );
END;
$function$;

-- Create comprehensive security monitoring view for admins
CREATE OR REPLACE VIEW public.security_dashboard AS
SELECT 
    'failed_logins_24h' as metric_name,
    COUNT(*)::text as metric_value,
    'Failed login attempts in last 24 hours' as description
FROM public.security_audit_logs 
WHERE action = 'login_failed' 
AND created_at > (now() - interval '24 hours')

UNION ALL

SELECT 
    'successful_logins_24h' as metric_name,
    COUNT(*)::text as metric_value,
    'Successful logins in last 24 hours' as description
FROM public.security_audit_logs 
WHERE action = 'login_success' 
AND created_at > (now() - interval '24 hours')

UNION ALL

SELECT 
    'blocked_ips_active' as metric_name,
    COUNT(DISTINCT identifier)::text as metric_value,
    'Currently blocked IP addresses/emails' as description
FROM public.auth_rate_limits 
WHERE blocked_until > now()

UNION ALL

SELECT 
    'password_resets_24h' as metric_name,
    COUNT(*)::text as metric_value,
    'Password reset requests in last 24 hours' as description
FROM public.security_audit_logs 
WHERE action = 'password_reset_requested' 
AND created_at > (now() - interval '24 hours')

UNION ALL

SELECT 
    'permission_denials_24h' as metric_name,
    COUNT(*)::text as metric_value,
    'Permission denials in last 24 hours' as description
FROM public.security_audit_logs 
WHERE action = 'permission_denied' 
AND created_at > (now() - interval '24 hours');

-- Grant access to security dashboard view for admins
CREATE POLICY "Admins can view security dashboard" ON public.security_dashboard
FOR SELECT USING (is_admin());

-- Create index for better performance on security dashboard queries
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_action_created_at 
ON public.security_audit_logs(action, created_at);

-- Phase 5: Security Monitoring & Logging Enhancement Complete