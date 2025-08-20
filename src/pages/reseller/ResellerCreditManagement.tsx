import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ParentCreditManagement } from '@/components/credits/ParentCreditManagement';
import { CreditsBadge } from '@/components/dashboard/CreditsBadge';
import { useAuth } from '@/contexts/AuthContext';

export default function ResellerCreditManagement() {
  const { user } = useAuth();

  return (
    <DashboardLayout>
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold mb-2">Credit Management</h1>
            <p className="text-gray-500">Manage credit requests and sub-reseller accounts</p>
          </div>
          <CreditsBadge credits={user?.credits || 0} />
        </div>
      </div>

      <ParentCreditManagement />
    </DashboardLayout>
  );
}