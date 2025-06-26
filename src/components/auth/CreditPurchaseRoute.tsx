
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useResellerLevel } from '@/hooks/useResellerLevel';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

interface CreditPurchaseRouteProps {
  children: React.ReactNode;
}

export const CreditPurchaseRoute: React.FC<CreditPurchaseRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { canPurchaseCredits, isLoading: levelLoading, error } = useResellerLevel();
  
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
  
  // Show error if there was an issue checking permissions
  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error}. Please try refreshing the page or contact support.
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  // For resellers, check if they can purchase credits (level 1)
  if (user?.role === 'reseller' && !canPurchaseCredits) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Only level 1 resellers can purchase credits directly. Please contact your parent reseller to add credits to your account.
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  return <>{children}</>;
};
