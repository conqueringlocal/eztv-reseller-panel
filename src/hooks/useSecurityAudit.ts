import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SecurityEvent {
  action: string;
  resourceType: string;
  resourceId?: string;
  success?: boolean;
  details?: Record<string, any>;
}

export const useSecurityAudit = () => {
  const [isLogging, setIsLogging] = useState(false);

  const logSecurityEvent = useCallback(async (event: SecurityEvent) => {
    try {
      setIsLogging(true);
      
      const { error } = await supabase.rpc('log_security_event', {
        p_action: event.action,
        p_resource_type: event.resourceType,
        p_resource_id: event.resourceId || null,
        p_success: event.success ?? true,
        p_details: event.details ? JSON.stringify(event.details) : null
      });

      if (error) {
        console.error('Failed to log security event:', error);
        // Don't show user-facing error for audit logging failures
      }
    } catch (error) {
      console.error('Security audit logging error:', error);
    } finally {
      setIsLogging(false);
    }
  }, []);

  const logFailedLogin = useCallback((email: string, reason: string) => {
    logSecurityEvent({
      action: 'login_failed',
      resourceType: 'authentication',
      resourceId: email,
      success: false,
      details: { reason, timestamp: new Date().toISOString() }
    });
  }, [logSecurityEvent]);

  const logSuccessfulLogin = useCallback((email: string) => {
    logSecurityEvent({
      action: 'login_success',
      resourceType: 'authentication',
      resourceId: email,
      success: true,
      details: { timestamp: new Date().toISOString() }
    });
  }, [logSecurityEvent]);

  const logPasswordReset = useCallback((email: string) => {
    logSecurityEvent({
      action: 'password_reset_requested',
      resourceType: 'authentication',
      resourceId: email,
      success: true,
      details: { timestamp: new Date().toISOString() }
    });
  }, [logSecurityEvent]);

  const logDataAccess = useCallback((resourceType: string, resourceId: string, action: string) => {
    logSecurityEvent({
      action: `${action}_${resourceType}`,
      resourceType,
      resourceId,
      success: true,
      details: { 
        access_type: action,
        timestamp: new Date().toISOString() 
      }
    });
  }, [logSecurityEvent]);

  const logPermissionDenied = useCallback((resourceType: string, action: string, reason: string) => {
    logSecurityEvent({
      action: 'permission_denied',
      resourceType,
      success: false,
      details: { 
        attempted_action: action,
        reason,
        timestamp: new Date().toISOString() 
      }
    });
  }, [logSecurityEvent]);

  return {
    logSecurityEvent,
    logFailedLogin,
    logSuccessfulLogin,
    logPasswordReset,
    logDataAccess,
    logPermissionDenied,
    isLogging
  };
};