
import { useState, useEffect, useRef } from 'react';
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
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    const checkResellerLevel = async () => {
      if (!user || loadingRef.current) {
        if (!user) {
          setCanPurchaseCredits(false);
          setIsLoading(false);
        }
        return;
      }

      loadingRef.current = true;

      // Admin users can always purchase credits
      if (user.role === 'admin') {
        setCanPurchaseCredits(true);
        setResellerPath([]);
        setIsLoading(false);
        return;
      }

      if (user.role !== 'reseller') {
        setCanPurchaseCredits(false);
        setIsLoading(false);
        return;
      }

      try {
        console.log('Checking reseller level for user:', user.id);
        
        // Check if reseller can purchase credits
        const { data: canPurchase, error: purchaseError } = await supabase
          .rpc('can_purchase_credits', { reseller_id: user.id });

        if (purchaseError) {
          console.error('Error checking credit purchase eligibility:', purchaseError);
          setError('Failed to check credit purchase eligibility');
          setCanPurchaseCredits(false);
        } else {
          console.log('Can purchase credits:', canPurchase);
          setCanPurchaseCredits(canPurchase || false);
        }

        // Get reseller hierarchy path
        const { data: pathData, error: pathError } = await supabase
          .rpc('get_reseller_path', { reseller_id: user.id });

        if (pathError) {
          console.error('Error getting reseller path:', pathError);
          setError('Failed to get reseller hierarchy');
          setResellerPath([]);
        } else {
          console.log('Reseller path:', pathData);
          setResellerPath(pathData || []);
        }

        setError(null);
      } catch (error) {
        console.error('Error in reseller level check:', error);
        setError('An unexpected error occurred');
        setCanPurchaseCredits(false);
        setResellerPath([]);
      } finally {
        setIsLoading(false);
        loadingRef.current = false;
      }
    };

    checkResellerLevel();
  }, [user?.id]);

  return {
    canPurchaseCredits,
    resellerPath,
    isLoading,
    error,
    resellerLevel: resellerPath.length > 0 ? resellerPath[0].level : null
  };
}
