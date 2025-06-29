
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Reseller } from '../types';

export const useCredits = (
  resellers: Reseller[],
  setResellers: React.Dispatch<React.SetStateAction<Reseller[]>>,
  refreshData: () => Promise<void>
) => {
  const addCredits = useCallback(async (resellerId: string, credits: number, notes?: string) => {
    try {
      // Use direct update approach since RPC function may not be available
      const { data: currentData, error: fetchError } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', resellerId)
        .single();

      if (fetchError || !currentData) {
        console.error('Error fetching current credits:', fetchError);
        toast.error('Failed to add credits');
        return false;
      }

      const newCredits = currentData.credits + credits;
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ credits: newCredits })
        .eq('id', resellerId);

      if (updateError) {
        console.error('Error updating credits:', updateError);
        toast.error('Failed to add credits');
        return false;
      }

      // Log the credit addition
      const { error: logError } = await supabase
        .from('credit_logs')
        .insert({
          reseller_id: resellerId,
          action: 'addition',
          credits_used: credits,
          notes: notes || 'Manual credit addition'
        });

      if (logError) {
        console.error('Error logging credit addition:', logError);
      }

      // Update local state
      setResellers(resellers.map(r => r.id === resellerId ? { ...r, credits: r.credits + credits } : r));
      await refreshData();
      return true;
    } catch (error) {
      console.error('Error adding credits:', error);
      return false;
    }
  }, [resellers, setResellers, refreshData]);

  const removeCredits = useCallback(async (resellerId: string, credits: number, notes?: string) => {
    try {
      const reseller = resellers.find(r => r.id === resellerId);
      if (!reseller || reseller.credits < credits) {
        return false;
      }

      // Use direct update instead of supabase.sql
      const newCredits = reseller.credits - credits;
      const { data, error } = await supabase
        .from('profiles')
        .update({ credits: newCredits })
        .eq('id', resellerId)
        .select()
        .single();

      if (error) {
        console.error('Error removing credits:', error);
        toast.error('Failed to remove credits');
        return false;
      }

      // Log the credit removal
      const { error: logError } = await supabase
        .from('credit_logs')
        .insert({
          reseller_id: resellerId,
          action: 'deduction',
          credits_used: credits,
          notes: notes || 'Manual credit removal'
        });

      if (logError) {
        console.error('Error logging credit removal:', logError);
      }

      // Update local state
      setResellers(resellers.map(r => r.id === resellerId ? { ...r, credits: r.credits - credits } : r));
      await refreshData();
      return true;
    } catch (error) {
      console.error('Error removing credits:', error);
      return false;
    }
  }, [resellers, setResellers, refreshData]);

  return {
    addCredits,
    removeCredits,
  };
};
