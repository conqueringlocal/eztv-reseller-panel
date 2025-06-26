
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useResellerLevel } from '@/hooks/useResellerLevel';

interface CreditPurchaseRouteProps {
  children: React.ReactNode;
}

export const CreditPurchaseRoute: React.FC<CreditPurchaseRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { canPurchaseCredits, isLoading: levelLoading } = useResellerLevel();
  
  if (authLoading || levelLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-eztv-600"></div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  // Admin users can always purchase credits
  if (user?.role === 'admin') {
    return <>{children}</>;
  }
  
  // For resellers, check if they can purchase credits (level 1)
  if (user?.role === 'reseller' && !canPurchaseCredits) {
    return <Navigate to="/reseller/credits" replace />;
  }
  
  return <>{children}</>;
};
