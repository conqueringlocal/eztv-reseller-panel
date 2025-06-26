
import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CreditLogTable } from '@/components/credits/CreditLogTable';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditsBadge } from '@/components/dashboard/CreditsBadge';

export default function ResellerCredits() {
  const { user } = useAuth();
  const { creditLogs } = useApp();

  // Filter credit logs for current reseller
  const userCreditLogs = creditLogs.filter(log => log.reseller_id === user?.id);

  return (
    <DashboardLayout>
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold mb-2">Credits & Usage</h1>
            <p className="text-gray-500">Monitor your credit usage and EZTV streaming service transaction history</p>
          </div>
          <CreditsBadge credits={user?.credits || 0} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Credit History</CardTitle>
          <CardDescription>
            All credit transactions and account creations for your EZTV streaming service
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreditLogTable logs={userCreditLogs} />
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
