import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
export const pricingDb: SupabaseClient = supabase;
export type CreditPricing = { unit_price_cents: number; purchase_enabled: boolean };
export const priceLabel = (cents: number) => `$${(cents / 100).toFixed(2)}`;
export function useCreditPricing(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['credit-pricing', user?.id], enabled: enabled && !!user?.id,
    staleTime: 0, refetchOnWindowFocus: true, refetchInterval: 30000,
    queryFn: async (): Promise<CreditPricing> => {
      const { data, error } = await pricingDb.rpc('get_my_credit_pricing');
      if (error || !Number.isInteger(data?.unit_price_cents) || data.unit_price_cents <= 0) throw new Error('Unable to load your credit price.');
      return data;
    },
  });
}
