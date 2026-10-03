import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { BusinessDashboard } from '@/lib/business';
export function useBusinessDashboard(month: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['business-dashboard', user?.id, month],
    enabled: !!user?.id && /^\d{4}-\d{2}$/.test(month),
    queryFn: async () => {
      const sync = await supabase.functions.invoke('sync-trex-balance');
      const { data, error } = await supabase.rpc('get_business_dashboard', { p_month: `${month}-01` });
      if (error) throw error;
      const result = data as unknown as BusinessDashboard;
      if (sync.error || sync.data?.success === false) {
        result.balance_sync_error = 'refresh_unavailable';
        result.balance_needs_check = true;
      }
      return result;
    },
    refetchInterval: 60_000,
  });
}
