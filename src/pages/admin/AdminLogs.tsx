
import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { useApp } from '@/contexts/AppContext';
import { CreditLogTable } from '@/components/credits/CreditLogTable';

export default function AdminLogs() {
  const { creditLogs } = useApp();
  
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">System Logs</h1>
        <p className="text-gray-500">View all activity in your system</p>
      </div>
      
      <DashboardCard
        title="Activity Logs"
        description="Complete history of all system activity"
      >
        <CreditLogTable logs={creditLogs} />
      </DashboardCard>
    </DashboardLayout>
  );
}
