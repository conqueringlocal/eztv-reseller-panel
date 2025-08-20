import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export interface SubReseller {
  id: string;
  name: string;
  email: string;
  credits: number;
  provider?: string;
  reseller_level?: number;
  created_at: string;
  parent_reseller_id?: string;
}

export const useSubResellers = () => {
  const { user } = useAuth();
  const [subResellers, setSubResellers] = useState<SubReseller[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSubResellers = useCallback(async () => {
    if (!user || user.role !== 'reseller') {
      console.log('⚠️ User not reseller or not available, skipping fetchSubResellers');
      return;
    }

    setIsLoading(true);
    
    try {
      console.log('👥 Fetching sub-resellers for reseller:', user.id);
      
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, credits, provider, reseller_level, created_at, parent_reseller_id')
        .eq('role', 'reseller')
        .eq('parent_reseller_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error fetching sub-resellers:', error);
        
        // Handle auth errors - don't clear data
        if (error.message.includes('JWT') || error.message.includes('token') || error.code === 'PGRST301') {
          console.error('🚨 Authentication error while fetching sub-resellers - keeping existing data');
          toast.error('Authentication error. Please refresh the page.');
          return;
        }
        
        toast.error('Failed to load sub-reseller data');
        setSubResellers([]);
      } else {
        console.log(`✅ Successfully fetched ${data.length} sub-resellers`);
        setSubResellers(data || []);
      }
    } catch (error) {
      console.error('💥 Error fetching sub-resellers:', error);
      toast.error('An unexpected error occurred while loading sub-resellers');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, user?.role]); // Only depend on stable user properties

  // Auto-fetch when user becomes available
  useEffect(() => {
    if (user && user.role === 'reseller') {
      fetchSubResellers();
    }
  }, [user?.id, user?.role]); // Remove fetchSubResellers from dependencies

  return {
    subResellers,
    isLoading,
    fetchSubResellers,
    setSubResellers,
  };
};