
import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { CreditsBadge } from '@/components/dashboard/CreditsBadge';
import { CreditLogTable } from '@/components/credits/CreditLogTable';

export default function ResellerCredits() {
  const { user } = useAuth();
  const { creditLogs } = useApp();
  
  // Filter logs for this reseller
  const resellerLogs = creditLogs.filter(log => log.resellerId === user?.id);
  
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Credit History</h1>
        <p className="text-gray-500">Track your credit usage and history</p>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow-sm border mb-6">
        <h2 className="text-lg font-medium mb-2">Current Credit Balance</h2>
        <div className="flex items-center">
          <CreditsBadge credits={user?.credits || 0} size="lg" />
          <span className="ml-3 text-gray-500">
            1 credit = 1 month of IPTV service
          </span>
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
