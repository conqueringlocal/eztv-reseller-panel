
import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { CreditsBadge } from '@/components/dashboard/CreditsBadge';
import { CreditLogTable } from '@/components/credits/CreditLogTable';
import { Button } from '@/components/ui/button';
import { CreditCard, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ResellerCredits() {
  const { user } = useAuth();
  const { creditLogs, refreshData, isLoading } = useApp();
  
  // Filter logs for this reseller
  const resellerLogs = creditLogs.filter(log => log.resellerId === user?.id);
  
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
          <Button 
            asChild
            className="mt-4 md:mt-0"
          >
            <Link to="/reseller/credits/purchase">
              <CreditCard className="mr-2" size={16} />
              Purchase Credits
            </Link>
          </Button>
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
