import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { SalesWorkspace } from "@/lib/sales";
export function useSalesWorkspace() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["sales-workspace", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_sales_workspace");
      if (error) throw error;
      return data as unknown as SalesWorkspace;
    },
    refetchInterval: 60000,
  });
}
export function useRefreshSales() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ["sales-workspace"] });
}
