
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CreditLog } from '../types';

export const useCreditLogs = (user: any, authLoading: boolean) => {
  const [creditLogs, setCreditLogs] = useState<CreditLog[]>([]);

  const fetchCreditLogs = useCallback(async () => {
    try {
      if (!user || authLoading) {
        console.log('⚠️ User not available or auth loading, skipping fetchCreditLogs');
        return;
      }
      
      console.log('📈 Fetching credit logs for user:', user.id, 'role:', user.role);
      
      let query = supabase
        .from('credit_logs')
        .select('*')
        .order('date', { ascending: false });

      // If user is not admin, filter by their reseller_id
      if (user.role !== 'admin') {
        query = query.eq('reseller_id', user.id);
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ Error fetching credit logs:', error);
        
        // Handle auth errors - don't clear data
        if (error.message.includes('JWT') || error.message.includes('token') || error.code === 'PGRST301') {
          console.error('🚨 Authentication error while fetching credit logs - keeping existing data');
          toast.error('Authentication error. Please refresh the page.');
          return;
        }
        
        toast.error('Failed to load credit logs');
        setCreditLogs([]);
      } else {
        console.log(`✅ Successfully fetched ${data.length} credit logs`);
        setCreditLogs(data || []);
      }
    } catch (error) {
      console.error('💥 Error fetching credit logs:', error);
      toast.error('An unexpected error occurred while loading credit logs');
    }
  }, [user, authLoading]);

  return {
    creditLogs,
    setCreditLogs,
    fetchCreditLogs,
  };
};
