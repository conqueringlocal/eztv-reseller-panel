
import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { useApp } from '@/contexts/AppContext';
import { CreditLogTable } from '@/components/credits/CreditLogTable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function AdminCredits() {
  const { creditLogs } = useApp();
  
  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Credit Management</h1>
        <p className="text-gray-500">View and manage credits across all resellers</p>
      </div>
      
      <Tabs defaultValue="all">
        <TabsList className="mb-6">
          <TabsTrigger value="all">All Transactions</TabsTrigger>
          <TabsTrigger value="additions">Credit Additions</TabsTrigger>
          <TabsTrigger value="deductions">Credit Deductions</TabsTrigger>
        </TabsList>
        
        <TabsContent value="all">
          <DashboardCard
            title="All Credit Transactions"
            description="Complete history of credit activity"
          >
            <CreditLogTable logs={creditLogs} filter="all" />
          </DashboardCard>
        </TabsContent>
        
        <TabsContent value="additions">
          <DashboardCard
            title="Credit Additions"
            description="History of all credit additions"
          >
            <CreditLogTable logs={creditLogs} filter="additions" />
          </DashboardCard>
        </TabsContent>
        
        <TabsContent value="deductions">
          <DashboardCard
            title="Credit Deductions"
            description="History of all credit deductions and usage"
          >
            <CreditLogTable logs={creditLogs} filter="deductions" />
          </DashboardCard>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
