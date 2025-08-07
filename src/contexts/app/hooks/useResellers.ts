
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Reseller } from '../types';

export const useResellers = (user: any, authLoading: boolean) => {
  const [resellers, setResellers] = useState<Reseller[]>([]);

  const fetchResellers = useCallback(async () => {
    try {
      if (!user || authLoading || user.role !== 'admin') {
        console.log('⚠️ User not admin or not available, skipping fetchResellers');
        return;
      }
      
      console.log('👥 Fetching resellers for admin user');
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*, use_admin_api, api_key, panel_url')
        .eq('role', 'reseller')
        .order('name');

      if (error) {
        console.error('❌ Error fetching resellers:', error);
        
        // Handle auth errors - don't clear data
        if (error.message.includes('JWT') || error.message.includes('token') || error.code === 'PGRST301') {
          console.error('🚨 Authentication error while fetching resellers - keeping existing data');
          toast.error('Authentication error. Please refresh the page.');
          return;
        }
        
        toast.error('Failed to load reseller data');
        setResellers([]);
      } else {
        console.log(`✅ Successfully fetched ${data.length} resellers`);
        setResellers(data || []);
      }
    } catch (error) {
      console.error('💥 Error fetching resellers:', error);
      toast.error('An unexpected error occurred while loading resellers');
    }
  }, [user, authLoading]);

  const getReseller = (resellerId: string) => {
    return resellers.find(r => r.id === resellerId);
  };

  return {
    resellers,
    setResellers,
    fetchResellers,
    getReseller,
  };
};
