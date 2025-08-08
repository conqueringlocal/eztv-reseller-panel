import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface MrrData {
  current_month_revenue: number;
  projected_mrr: number;
  growth_rate: number;
  avg_sale_amount: number;
  total_sales_count: number;
}

export interface HistoricalData {
  id: string;
  month_year: string;
  total_revenue: number;
  credit_sales_count: number;
  average_sale_amount: number;
}

export interface MrrResponse {
  mrr: MrrData;
  historical: HistoricalData[];
  timestamp: string;
}

export const useMrrData = () => {
  const [mrrData, setMrrData] = useState<MrrData | null>(null);
  const [historicalData, setHistoricalData] = useState<HistoricalData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMrrData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: functionError } = await supabase.functions.invoke('calculate-mrr-projections');

      if (functionError) {
        console.error('Error calling MRR function:', functionError);
        throw new Error(functionError.message || 'Failed to fetch MRR data');
      }

      const response: MrrResponse = data;
      setMrrData(response.mrr);
      setHistoricalData(response.historical);
      
      console.log('MRR data fetched successfully:', response);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch MRR data';
      setError(errorMessage);
      toast.error(errorMessage);
      console.error('Error fetching MRR data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    mrrData,
    historicalData,
    isLoading,
    error,
    fetchMrrData,
  };
};