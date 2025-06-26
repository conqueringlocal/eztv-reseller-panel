
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface ResellerHierarchy {
  id: string;
  name: string;
  level: number;
}

export function useResellerLevel() {
  const { user } = useAuth();
  const [canPurchaseCredits, setCanPurchaseCredits] = useState<boolean>(false);
  const [resellerPath, setResellerPath] = useState<ResellerHierarchy[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const checkResellerLevel = async () => {
      if (!user || user.role !== 'reseller') {
        setCanPurchaseCredits(false);
        setIsLoading(false);
        return;
      }

      try {
        // Check if reseller can purchase credits
        const { data: canPurchase, error: purchaseError } = await supabase
          .rpc('can_purchase_credits', { reseller_id: user.id });

        if (purchaseError) {
          console.error('Error checking credit purchase eligibility:', purchaseError);
          setCanPurchaseCredits(false);
        } else {
          setCanPurchaseCredits(canPurchase || false);
        }

        // Get reseller hierarchy path
        const { data: pathData, error: pathError } = await supabase
          .rpc('get_reseller_path', { reseller_id: user.id });

        if (pathError) {
          console.error('Error getting reseller path:', pathError);
          setResellerPath([]);
        } else {
          setResellerPath(pathData || []);
        }

      } catch (error) {
        console.error('Error in reseller level check:', error);
        setCanPurchaseCredits(false);
        setResellerPath([]);
      } finally {
        setIsLoading(false);
      }
    };

    checkResellerLevel();
  }, [user]);

  return {
    canPurchaseCredits,
    resellerPath,
    isLoading,
    resellerLevel: resellerPath.length > 0 ? resellerPath[0].level : null
  };
}
