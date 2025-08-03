import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface RateLimitOptions {
  maxAttempts?: number;
  windowMinutes?: number;
}

export const useRateLimit = () => {
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState<Date | null>(null);

  const checkRateLimit = useCallback(async (
    identifier: string,
    attemptType: string,
    options: RateLimitOptions = {}
  ): Promise<boolean> => {
    try {
      const { maxAttempts = 5, windowMinutes = 15 } = options;
      
      const { data, error } = await supabase.rpc('check_rate_limit', {
        p_identifier: identifier,
        p_attempt_type: attemptType,
        p_max_attempts: maxAttempts,
        p_window_minutes: windowMinutes
      });

      if (error) {
        console.error('Rate limit check failed:', error);
        return true; // Allow on error to prevent blocking legitimate users
      }

      const allowed = data as boolean;
      setIsBlocked(!allowed);
      
      if (!allowed) {
        // Calculate when the block will be lifted
        const blockedUntilTime = new Date();
        blockedUntilTime.setMinutes(blockedUntilTime.getMinutes() + windowMinutes);
        setBlockedUntil(blockedUntilTime);
      } else {
        setBlockedUntil(null);
      }

      return allowed;
    } catch (error) {
      console.error('Rate limit error:', error);
      return true; // Allow on error
    }
  }, []);

  const getRemainingTime = useCallback((): number => {
    if (!blockedUntil) return 0;
    const now = new Date();
    const remaining = Math.max(0, Math.floor((blockedUntil.getTime() - now.getTime()) / 1000));
    return remaining;
  }, [blockedUntil]);

  return {
    checkRateLimit,
    isBlocked,
    blockedUntil,
    getRemainingTime
  };
};