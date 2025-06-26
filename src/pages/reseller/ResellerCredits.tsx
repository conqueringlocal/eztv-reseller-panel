
import React, { useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useResellerLevel } from '@/hooks/useResellerLevel';
import { CreditsBadge } from '@/components/dashboard/CreditsBadge';
import { CreditLogTable } from '@/components/credits/CreditLogTable';
import { Button } from '@/components/ui/button';
import { CreditCard, RefreshCw, AlertTriangle } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export default function ResellerCredits() {
  const { user } = useAuth();
  const { creditLogs, refreshData, isLoading } = useApp();
  const { canPurchaseCredits, resellerPath, resellerLevel } = useResellerLevel();
  const [searchParams] = useSearchParams();
  
  // Filter logs for this reseller
  const resellerLogs = creditLogs.filter(log => log.resellerId === user?.id);
  
  // Handle successful credit purchase
  useEffect(() => {
    const success = searchParams.get('success');
    const sessionId = searchParams.get('session_id');
    const credits = searchParams.get('credits');
    
    if (success === 'true' && sessionId && credits) {
      // Verify the purchase with Supabase
      const verifyPurchase = async () => {
        try {
          const { error } = await supabase.functions.invoke('verify-checkout', {
            body: { sessionId }
          });
          
          if (error) throw error;
          
          toast.success(`Successfully added ${credits} credits to your account!`);
          refreshData();
        } catch (error) {
          console.error('Error verifying purchase:', error);
          toast.error('There was an error verifying your purchase. Please contact support.');
        }
      };
      
      verifyPurchase();
    } else if (searchParams.get('canceled') === 'true') {
      toast.error('Credit purchase was canceled. No charges were made.');
    }
  }, [searchParams, refreshData]);

  // Get parent reseller info for sub-resellers
  const parentReseller = resellerPath.length > 1 ? resellerPath[resellerPath.length - 1] : null;
  
  return (
    <DashboardLayout>
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
          <h1 className="text-2xl font-bold mb-2">Credit History</h1>
          <p className="text-gray-500">Track your credit usage and history</p>
        </div>
        <Button 
          onClick={() => refreshData()} 
          variant="outline" 
          size="sm"
          className="mt-4 sm:mt-0"
          disabled={isLoading}
        >
          <RefreshCw size={16} className={`mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Reseller Level Info for Sub-resellers */}
      {resellerLevel && resellerLevel > 1 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="font-medium text-blue-900">Sub-Reseller Account</h3>
              <p className="text-sm text-blue-700 mt-1">
                You are a Level {resellerLevel} reseller under {parentReseller?.name}. 
                Credit purchases are managed by your parent reseller.
              </p>
            </div>
          </div>
        </div>
      )}
      
      <div className="bg-white p-6 rounded-lg shadow-sm border mb-6">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center">
          <div>
            <h2 className="text-lg font-medium mb-2">Current Credit Balance</h2>
            <div className="flex items-center">
              <CreditsBadge credits={user?.credits || 0} size="lg" />
              <span className="ml-3 text-gray-500">
                1 credit = 1 month of IPTV service
              </span>
            </div>
          </div>
          
          {/* Only show purchase button for level 1 resellers */}
          {canPurchaseCredits && (
            <Button 
              asChild
              className="mt-4 md:mt-0"
            >
              <Link to="/reseller/credits/purchase">
                <CreditCard className="mr-2" size={16} />
                Purchase Credits
              </Link>
            </Button>
          )}
          
          {/* Show message for sub-resellers */}
          {resellerLevel && resellerLevel > 1 && (
            <div className="mt-4 md:mt-0">
              <p className="text-sm text-gray-600">
                Contact {parentReseller?.name} to add credits
              </p>
            </div>
          )}
        </div>
      </div>
      
      <DashboardCard
        title="Credit History"
        description="Complete history of your credit activity"
      >
        <CreditLogTable logs={resellerLogs} />
      </DashboardCard>
    </DashboardLayout>
  );
}
